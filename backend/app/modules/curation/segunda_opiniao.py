"""
Fluxo de segunda opiniao: solicitar, responder e aplicar a decisao final.

Desde out/2026 o revisor nao da so um "concordo/discordo" para a ficha
inteira: ele avalia a ficha ITEM POR ITEM (tipo de radiografia, dentes, cada
achado, descricao didatica...), como nos sistemas de revisao por pares em
radiologia, e da uma avaliacao geral numa escala inspirada no RADPEER
(concordo / discordancia menor / discordancia importante). Quando a segunda
opiniao volta, quem pediu ve cada anotacao no item e escolhe ACRESCENTAR a
curadoria ou DISPENSAR - tudo registrado no historico e na auditoria.
"""

import re
from datetime import datetime

from fastapi import Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from app.core.database import get_db
from app.core.limites import MAX_ACHADOS, TEXTO_LONGO_MAX
from app.modules.auth import exigir_perfis, PERFIS_CURADORIA
from app.modules.users import User, UserRole
from app.modules.curations import (
    AchadoPrincipal,
    AvaliacaoItem,
    ClassificacaoRevisao,
    Curation,
    CurationReview,
    CurationReviewNote,
    DENTES_PERMANENTES,
    DecisaoFinalRevisao,
    Genero,
    QualidadeTecnica,
    SituacaoAnotacao,
    StatusCuradoria,
    StatusRevisao,
    TipoRadiografia,
)

from .common import (
    STATUS_FINAIS,
    _buscar_ficha,
    _executar_aprovacao,
    _executar_descarte,
    _registrar_auditoria,
    _registrar_historico,
    _valor,
)
from .router import router
from .schemas import AplicarDecisaoRevisao, ReviewRequest, ReviewRespond


# ---------------------------------------------------------------------
# Itens da ficha que o revisor pode anotar
#   "valor": o revisor pode propor um valor da lista (acrescentar = trocar)
#   "dentes": o revisor pode propor a lista de dentes (FDI)
#   "texto": acrescentar = juntar a sugestao ao proprio texto do item
#   "nota":  acrescentar = registrar a anotacao nas observacoes internas
# ---------------------------------------------------------------------
ITENS_REVISAVEIS: dict[str, tuple[str, str, type | None]] = {
    "tipo_radiografia": ("Tipo de radiografia", "valor", TipoRadiografia),
    "qualidade_tecnica": ("Qualidade técnica", "valor", QualidadeTecnica),
    "dentes": ("Dentes", "dentes", None),
    "faixa_etaria": ("Faixa etária", "nota", None),
    "genero": ("Gênero", "valor", Genero),
    "achado_principal": ("Achado principal", "valor", AchadoPrincipal),
    "alteracoes_observadas": ("Alterações observadas", "nota", None),
    "erros_tecnicos": ("Erros técnicos", "nota", None),
    "marcacoes": ("Marcações na imagem", "nota", None),
    "achados_detalhe": ("Achados detalhados", "texto", None),
    "descricao_didatica": ("Descrição didática", "texto", None),
    "observacoes_internas": ("Observações internas", "texto", None),
}
_ITEM_ACHADO = re.compile(r"^achado_(\d{1,3})$")  # cada achado da secao "Achados" (achado_1, achado_2...)


def definicao_item(chave: str) -> tuple[str, str, type | None] | None:
    if chave in ITENS_REVISAVEIS:
        return ITENS_REVISAVEIS[chave]
    m = _ITEM_ACHADO.match(chave)
    if m and 1 <= int(m.group(1)) <= MAX_ACHADOS:
        return (f"Achado {int(m.group(1))}", "nota", None)
    return None


def _validar_sugestao(chave: str, tipo: str, enum_valores: type | None, valor):
    """Valor proposto pelo revisor: so nos itens com lista de valores ou dentes."""
    if valor is None or valor == "" or valor == []:
        return None
    if tipo == "valor":
        if not isinstance(valor, str) or valor not in {e.value for e in enum_valores}:
            raise HTTPException(status_code=422, detail=f"Valor sugerido inválido para '{chave}'.")
        return valor
    if tipo == "dentes":
        if not isinstance(valor, list) or any(not isinstance(d, int) or d not in DENTES_PERMANENTES for d in valor):
            raise HTTPException(status_code=422, detail="Dentes sugeridos inválidos (use a notação FDI, 11 a 48).")
        return sorted(set(valor))
    raise HTTPException(status_code=422, detail=f"O item '{chave}' não aceita valor sugerido, só anotação.")


def _nome(db: Session, usuario_id: int | None) -> dict | None:
    if not usuario_id:
        return None
    u = db.query(User).filter(User.id == usuario_id).first()
    return {"id": usuario_id, "nome": u.nome if u else f"Usuário {usuario_id}"}


def _anotacao_para_json(n: CurationReviewNote) -> dict:
    definicao = definicao_item(n.item)
    return {
        "id": n.id,
        "item": n.item,
        "rotulo": definicao[0] if definicao else n.item,
        "tipo_item": definicao[1] if definicao else "nota",
        "avaliacao": n.avaliacao,
        "nota": n.nota,
        "valor_sugerido": n.valor_sugerido,
        "situacao": n.situacao,
        "resolvido_em": n.resolvido_em.isoformat() if n.resolvido_em else None,
    }


# ---------------------------------------------------------------------
# POST /curation/{curation_id}/request-review  -> solicita segunda opiniao
# ---------------------------------------------------------------------
@router.post("/{curation_id}/request-review")
def solicitar_segunda_opiniao(
    curation_id: int,
    dados: ReviewRequest,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    """Solicita segunda opiniao para uma ficha. Exige justificativa."""
    ficha = _buscar_ficha(db, curation_id)

    if ficha.status in STATUS_FINAIS:
        raise HTTPException(
            status_code=409,
            detail=f"Nao e possivel solicitar segunda opiniao: a ficha ja esta '{ficha.status}'.",
        )

    motivo = (dados.motivo or "").strip()
    if not motivo:
        raise HTTPException(
            status_code=422,
            detail="A segunda opiniao exige uma justificativa (motivo).",
        )

    aberta = (
        db.query(CurationReview)
        .filter(
            CurationReview.curation_id == curation_id,
            CurationReview.status.in_([
                StatusRevisao.SOLICITADA.value,
                StatusRevisao.RESPONDIDA.value,
            ]),
        )
        .first()
    )
    if aberta:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Ja existe uma solicitacao de segunda opiniao em aberto "
                f"(review {aberta.id}, status '{aberta.status}')."
            ),
        )

    review = CurationReview(
        curation_id=curation_id,
        solicitante_id=usuario.id,
        motivo=motivo,
        primeiro_parecer=dados.primeiro_parecer,
        status=StatusRevisao.SOLICITADA.value,
    )
    db.add(review)

    status_anterior = ficha.status
    ficha.status = StatusCuradoria.SEGUNDA_OPINIAO.value

    try:
        db.flush()
    except IntegrityError:
        # Indice unico parcial (uq_curation_reviews_aberta) barrou: uma
        # solicitacao concorrente ja criou uma review aberta para esta
        # ficha entre a checagem acima e este flush.
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Ja existe uma solicitacao de segunda opiniao em aberto para esta ficha.",
        )

    _registrar_historico(
        db, ficha.id, usuario.id, "solicitacao_segunda_opiniao",
        status_anterior, StatusCuradoria.SEGUNDA_OPINIAO.value, motivo,
    )
    _registrar_auditoria(
        db, usuario.id, "solicitacao_segunda_opiniao", ficha.id, "sucesso",
        f"Segunda opiniao solicitada por usuario {usuario.id}.",
    )
    db.commit()
    db.refresh(review)

    return {
        "mensagem": "Segunda opiniao solicitada com sucesso.",
        "review_id": review.id,
        "curation_id": curation_id,
        "status_ficha": StatusCuradoria.SEGUNDA_OPINIAO.value,
        "status_review": review.status,
    }


# ---------------------------------------------------------------------
# POST /curation/reviews/{review_id}/respond  -> revisor responde
# ---------------------------------------------------------------------
@router.post("/reviews/{review_id}/respond")
def responder_segunda_opiniao(
    review_id: int,
    dados: ReviewRespond,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    """
    Revisor responde a segunda opiniao. Regra de imparcialidade:
    quem solicitou NAO pode responder.
    """

    review = db.query(CurationReview).filter(CurationReview.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail=f"Solicitacao {review_id} nao encontrada.")

    if review.status != StatusRevisao.SOLICITADA.value:
        raise HTTPException(
            status_code=409,
            detail=f"A solicitacao {review_id} ja foi respondida (status '{review.status}').",
        )

    if review.solicitante_id == usuario.id:
        _registrar_auditoria(
            db, usuario.id, "resposta_segunda_opiniao", review.curation_id, "negado",
            "Solicitante tentou responder a propria segunda opiniao.",
        )
        db.commit()
        raise HTTPException(
            status_code=403,
            detail="Quem solicitou a segunda opiniao nao pode responde-la.",
        )

    # Parecer escrito e opcional - guarda None em vez de string vazia.
    parecer = (dados.parecer_revisor or "").strip() or None

    classificacao = dados.classificacao.value if dados.classificacao else None
    if classificacao:
        # escala geral (tipo RADPEER) -> concorda/discorda (campo antigo)
        concordancia = "concorda" if classificacao == ClassificacaoRevisao.CONCORDO.value else "discorda"
    else:
        concordancia = (dados.concordancia or "").strip().lower()
    if concordancia not in ("concorda", "discorda"):
        raise HTTPException(
            status_code=422,
            detail="Informe a avaliação geral (classificacao) ou concordancia ('concorda'/'discorda').",
        )

    # anotacoes item a item (uma por item; "concordo" sem texto nao precisa ser guardada)
    notas: list[CurationReviewNote] = []
    vistos: set[str] = set()
    for anotacao in dados.anotacoes:
        definicao = definicao_item(anotacao.item)
        if not definicao:
            raise HTTPException(status_code=422, detail=f"Item da ficha desconhecido: '{anotacao.item}'.")
        if anotacao.item in vistos:
            raise HTTPException(status_code=422, detail=f"O item '{anotacao.item}' foi anotado duas vezes.")
        vistos.add(anotacao.item)
        nota = (anotacao.nota or "").strip() or None
        sugerido = _validar_sugestao(anotacao.item, definicao[1], definicao[2], anotacao.valor_sugerido)
        if anotacao.avaliacao != AvaliacaoItem.CONCORDO and not nota and sugerido is None:
            raise HTTPException(
                status_code=422,
                detail=f"Explique a anotação do item '{definicao[0]}' (escreva a sugestão ou proponha um valor).",
            )
        if anotacao.avaliacao == AvaliacaoItem.CONCORDO and not nota:
            continue
        notas.append(CurationReviewNote(
            review_id=review.id, item=anotacao.item, avaliacao=anotacao.avaliacao.value,
            nota=nota, valor_sugerido=sugerido, situacao=SituacaoAnotacao.PENDENTE.value,
        ))

    review.revisor_id = usuario.id
    review.parecer_revisor = parecer
    review.concordancia = concordancia
    review.classificacao = classificacao
    for n in notas:
        db.add(n)
    review.decisao_final = _valor(dados.decisao_final)
    review.observacoes = dados.observacoes
    review.status = StatusRevisao.RESPONDIDA.value
    review.respondido_em = func.now()

    _registrar_historico(
        db, review.curation_id, usuario.id, "resposta_segunda_opiniao",
        None, None,
        f"Parecer: {classificacao or concordancia}; {len(notas)} anotacao(oes) por item."
        + (f" {parecer}" if parecer else ""),
    )
    _registrar_auditoria(
        db, usuario.id, "resposta_segunda_opiniao", review.curation_id, "sucesso",
        f"Segunda opiniao respondida por usuario {usuario.id} ({classificacao or concordancia}, "
        f"{len(notas)} anotacao(oes) por item).",
    )
    db.commit()
    db.refresh(review)

    return {
        "mensagem": "Segunda opiniao respondida com sucesso.",
        "review_id": review.id,
        "curation_id": review.curation_id,
        "concordancia": review.concordancia,
        "classificacao": review.classificacao,
        "anotacoes": len(notas),
        "status_review": review.status,
    }


# ---------------------------------------------------------------------
# POST /curation/{curation_id}/apply-review-decision  -> fecha o ciclo
# ---------------------------------------------------------------------
@router.post("/{curation_id}/apply-review-decision")
def aplicar_decisao_revisao(
    curation_id: int,
    dados: AplicarDecisaoRevisao,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    """
    Fecha o ciclo da segunda opiniao: aplica a decisao final (aprovar ou
    descartar) a ficha, depois que a review mais recente ja foi respondida.
    """
    ficha = _buscar_ficha(db, curation_id)

    if ficha.status in STATUS_FINAIS:
        raise HTTPException(
            status_code=409,
            detail=f"A ficha {curation_id} ja esta '{ficha.status}' e nao pode ser reprocessada.",
        )

    review = (
        db.query(CurationReview)
        .filter(CurationReview.curation_id == curation_id)
        .order_by(CurationReview.id.desc())
        .first()
    )
    if not review:
        raise HTTPException(
            status_code=409,
            detail="Esta ficha nao possui nenhuma solicitacao de segunda opiniao.",
        )
    if review.status != StatusRevisao.RESPONDIDA.value:
        raise HTTPException(
            status_code=409,
            detail=(
                f"A segunda opiniao mais recente (review {review.id}) "
                f"ainda nao foi respondida (status '{review.status}')."
            ),
        )
    if review.decisao_final in (DecisaoFinalRevisao.APROVAR.value, DecisaoFinalRevisao.DESCARTAR.value):
        if review.decisao_final != dados.decisao.value:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"A decisao enviada ('{dados.decisao.value}') diverge do parecer do "
                    f"revisor ('{review.decisao_final}') registrado na review {review.id}."
                ),
            )

    origem = f" (decisao aplicada via review {review.id})."

    if dados.decisao == DecisaoFinalRevisao.APROVAR:
        _executar_aprovacao(
            db, ficha, usuario, dados.anonimizacao_validada, dados.observacoes,
            acao="aprovacao_pos_segunda_opiniao", origem=origem,
        )
    else:
        _executar_descarte(
            db, ficha, usuario, dados.motivo,
            acao="descarte_pos_segunda_opiniao", origem=origem,
        )

    review.status = StatusRevisao.FINALIZADA.value
    db.commit()
    db.refresh(ficha)

    return {
        "mensagem": "Decisao da segunda opiniao aplicada com sucesso.",
        "curation_id": ficha.id,
        "status": ficha.status,
        "review_id": review.id,
        "status_review": review.status,
    }


# ---------------------------------------------------------------------
# GET /curation/reviews/{review_id}/detalhe  -> tudo da segunda opiniao
# ---------------------------------------------------------------------
@router.get("/reviews/{review_id}/detalhe")
def detalhar_segunda_opiniao(
    review_id: int,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    """
    Pedido (quem pediu, quando, motivo, primeiro parecer), resposta do
    revisor (avaliacao geral e anotacoes item a item) e o que cada pessoa
    pode fazer agora. A ficha em si vem de GET /curation/{curation_id}.
    """
    review = db.query(CurationReview).filter(CurationReview.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada.")
    ficha = db.query(Curation).filter(Curation.id == review.curation_id).first()
    notas = (
        db.query(CurationReviewNote)
        .filter(CurationReviewNote.review_id == review.id)
        .order_by(CurationReviewNote.id)
        .all()
    )
    return {
        "id": review.id,
        "curation_id": review.curation_id,
        "orthanc_reference_id": ficha.orthanc_reference_id if ficha else None,
        "status": review.status,
        "status_ficha": ficha.status if ficha else None,
        "motivo": review.motivo,
        "primeiro_parecer": review.primeiro_parecer,
        "criado_em": review.criado_em.isoformat() if review.criado_em else None,
        "respondido_em": review.respondido_em.isoformat() if review.respondido_em else None,
        "solicitante": _nome(db, review.solicitante_id),
        "curador_da_ficha": _nome(db, ficha.curador_id) if ficha else None,
        "revisor": _nome(db, review.revisor_id),
        "classificacao": review.classificacao,
        "concordancia": review.concordancia,
        "parecer_revisor": review.parecer_revisor,
        "decisao_final": review.decisao_final,
        "anotacoes": [_anotacao_para_json(n) for n in notas],
        "pode_responder": review.status == StatusRevisao.SOLICITADA.value and review.solicitante_id != usuario.id,
        "pode_incorporar": _pode_incorporar(review, ficha, usuario),
    }


def _eh_admin(usuario: User) -> bool:
    return getattr(usuario.perfil, "value", usuario.perfil) == UserRole.administrador.value


def _pode_incorporar(review: CurationReview, ficha: Curation | None, usuario: User) -> bool:
    return (
        ficha is not None
        and review.status == StatusRevisao.RESPONDIDA.value
        and ficha.status == StatusCuradoria.SEGUNDA_OPINIAO.value
        and (review.solicitante_id == usuario.id or _eh_admin(usuario))
    )


def _carregar_para_resolver(db: Session, review_id: int, nota_id: int, usuario: User):
    review = db.query(CurationReview).filter(CurationReview.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada.")
    nota = (
        db.query(CurationReviewNote)
        .filter(CurationReviewNote.id == nota_id, CurationReviewNote.review_id == review_id)
        .with_for_update()
        .first()
    )
    if not nota:
        raise HTTPException(status_code=404, detail="Anotação não encontrada.")
    ficha = db.query(Curation).filter(Curation.id == review.curation_id).with_for_update().first()
    if not _pode_incorporar(review, ficha, usuario):
        if review.solicitante_id != usuario.id and not _eh_admin(usuario):
            raise HTTPException(status_code=403, detail="Só quem pediu a segunda opinião decide sobre as anotações.")
        raise HTTPException(status_code=409, detail="Esta segunda opinião não está mais aguardando decisão.")
    if nota.situacao == SituacaoAnotacao.INCORPORADA.value:
        raise HTTPException(status_code=409, detail="Esta anotação já foi acrescentada à curadoria.")
    return review, nota, ficha


def _juntar_texto(atual: str | None, acrescimo: str) -> str:
    novo = f"{atual.rstrip()}\n\n{acrescimo}" if atual and atual.strip() else acrescimo
    if len(novo) > TEXTO_LONGO_MAX:
        raise HTTPException(status_code=422, detail="O texto ficaria grande demais. Edite o item na Curadoria.")
    return novo


# ---------------------------------------------------------------------
# POST /curation/reviews/{review_id}/anotacoes/{nota_id}/incorporar
#   -> acrescenta a sugestao do revisor a ficha
# ---------------------------------------------------------------------
@router.post("/reviews/{review_id}/anotacoes/{nota_id}/incorporar")
def incorporar_anotacao(
    review_id: int,
    nota_id: int,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    review, nota, ficha = _carregar_para_resolver(db, review_id, nota_id, usuario)
    rotulo, tipo, _ = definicao_item(nota.item) or (nota.item, "nota", None)
    data = datetime.now().strftime("%d/%m/%Y")

    if tipo in ("valor", "dentes") and nota.valor_sugerido is not None:
        anterior = getattr(ficha, nota.item)
        setattr(ficha, nota.item, nota.valor_sugerido)
        if nota.nota:
            ficha.observacoes_internas = _juntar_texto(
                ficha.observacoes_internas, f"[Segunda opinião, {data} - {rotulo}] {nota.nota}",
            )
        efeito = f"{rotulo}: {anterior!r} -> {nota.valor_sugerido!r}"
    elif tipo == "texto":
        texto = nota.nota or (nota.valor_sugerido if isinstance(nota.valor_sugerido, str) else None)
        if not texto:
            raise HTTPException(status_code=422, detail="A anotação não tem texto para acrescentar.")
        setattr(ficha, nota.item, _juntar_texto(getattr(ficha, nota.item), f"[Segunda opinião, {data}] {texto}"))
        efeito = f"{rotulo}: texto acrescentado"
    else:
        if not nota.nota:
            raise HTTPException(status_code=422, detail="A anotação não tem texto para acrescentar.")
        ficha.observacoes_internas = _juntar_texto(
            ficha.observacoes_internas, f"[Segunda opinião, {data} - {rotulo}] {nota.nota}",
        )
        efeito = f"{rotulo}: anotação registrada nas observações internas"

    nota.situacao = SituacaoAnotacao.INCORPORADA.value
    nota.resolvido_por = usuario.id
    nota.resolvido_em = func.now()
    _registrar_historico(db, ficha.id, usuario.id, "incorporacao_segunda_opiniao", None, None, efeito[:500])
    _registrar_auditoria(
        db, usuario.id, "anotacao_segunda_opiniao_incorporada", ficha.id, "sucesso",
        f"Anotacao {nota.id} da review {review.id} acrescentada a ficha ({nota.item}).",
    )
    db.commit()
    db.refresh(nota)
    return {"mensagem": "Acrescentado à curadoria.", "anotacao": _anotacao_para_json(nota)}


# ---------------------------------------------------------------------
# POST /curation/reviews/{review_id}/anotacoes/{nota_id}/dispensar
# ---------------------------------------------------------------------
@router.post("/reviews/{review_id}/anotacoes/{nota_id}/dispensar")
def dispensar_anotacao(
    review_id: int,
    nota_id: int,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    review, nota, ficha = _carregar_para_resolver(db, review_id, nota_id, usuario)
    nota.situacao = SituacaoAnotacao.DISPENSADA.value
    nota.resolvido_por = usuario.id
    nota.resolvido_em = func.now()
    _registrar_auditoria(
        db, usuario.id, "anotacao_segunda_opiniao_dispensada", ficha.id, "sucesso",
        f"Anotacao {nota.id} da review {review.id} dispensada ({nota.item}).",
    )
    db.commit()
    db.refresh(nota)
    return {"mensagem": "Anotação dispensada.", "anotacao": _anotacao_para_json(nota)}
