"""
Roteador de compartilhamento de imagens anotadas ("Compartilhadas comigo").

Endpoints (sempre em cima do usuario logado):
- POST   /shares/{curation_id}                  -> compartilha a imagem com o dono de um e-mail
- GET    /shares/enviadas?curation_id=          -> com quem EU compartilhei (para desfazer)
- DELETE /shares/enviadas/{id}                  -> desfaz um compartilhamento meu
- GET    /shares/recebidas                      -> "Compartilhadas comigo"
- GET    /shares/recebidas/novas                -> quantas chegaram e ainda nao vi
- POST   /shares/recebidas/vistas               -> marca todas como vistas
- DELETE /shares/recebidas/{id}                 -> tiro uma imagem do meu espaco
- GET    /shares/recebidas/{id}/anotacoes       -> anotacoes ATUAIS do remetente (so leitura)
- POST   /shares/recebidas/{id}/anotacoes/ocultar   -> "apaga" anotacoes do remetente SO da minha visao
- POST   /shares/recebidas/{id}/anotacoes/reexibir  -> volta a mostrar todas

Seguranca / LGPD:
- RESPOSTA NEUTRA: o POST responde sempre a mesma mensagem, exista ou nao
  um usuario com aquele e-mail - assim o formulario nao serve para
  descobrir quem tem conta no sistema (enumeracao de usuarios);
- o e-mail digitado nao e gravado; so o id do usuario encontrado;
- limite de 20 compartilhamentos por minuto (dificulta abuso/varredura);
- cada compartilhamento e cada desfazer ficam na auditoria (so ids);
- so imagens aprovadas e ativas; remetente desativado/excluido some da
  lista de quem recebeu;
- quem recebe NUNCA apaga dados de quem enviou: "apagar" uma anotacao
  recebida so a esconde da visao de quem recebeu (anotacoes_ocultas).
"""

import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, aliased

from app.core.config import settings
from app.modules.achados import erros_por_ficha
from app.core.database import get_db
from app.core.rate_limit import limiter
from app.modules.anotacoes import AnotacaoImagem
from app.modules.audit_logs import AuditLog
from app.modules.auth import obter_usuario_atual
from app.modules.compartilhamentos import CompartilhamentoImagem
from app.modules.curations import Curation, StatusCuradoria
from app.modules.orthanc_references import OrthancReference
from app.modules.users import User

router = APIRouter(prefix="/shares", tags=["Compartilhamentos"])

MENSAGEM_NEUTRA = "Se o e-mail pertencer a um usuário do sistema, a imagem foi compartilhada com ele."
AVISO_CADASTRO = (
    "Se a pessoa ainda não tem cadastro no Rádix Imago, envie a ela o link abaixo para se cadastrar; "
    "depois que o cadastro for aprovado, compartilhe a imagem de novo."
)


def _resposta_neutra() -> dict:
    """Mesma resposta em todos os casos (exista ou nao o usuario), com o
    convite para cadastro - quem compartilha repassa o link a pessoa."""
    return {
        "mensagem": MENSAGEM_NEUTRA,
        "aviso_cadastro": AVISO_CADASTRO,
        "link_cadastro": f"{settings.FRONTEND_URL}/solicitar-acesso",
    }
_EMAIL_VALIDO = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class CompartilharEntrada(BaseModel):
    email: str = Field(min_length=3, max_length=150)
    mensagem: Optional[str] = Field(default=None, max_length=500)


def _ficha_compartilhavel(db: Session, curation_id: int) -> Curation:
    ficha = (
        db.query(Curation)
        .join(OrthancReference, Curation.orthanc_reference_id == OrthancReference.id)
        .filter(Curation.id == curation_id)
        .filter(Curation.status == StatusCuradoria.APROVADA.value)
        .filter(OrthancReference.ativo.is_(True))
        .first()
    )
    if not ficha:
        raise HTTPException(status_code=404, detail="Imagem não encontrada.")
    return ficha


def _auditar(db: Session, usuario_id: int, acao: str, curation_id: int, detalhes: str) -> None:
    db.add(AuditLog(
        usuario_id=usuario_id,
        acao=acao,
        entidade="curation",
        entidade_id=curation_id,
        resultado="sucesso",
        detalhes=detalhes,
    ))


@router.post("/{curation_id}")
@limiter.limit("20/minute")
def compartilhar(
    request: Request,
    curation_id: int,
    dados: CompartilharEntrada,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    email = dados.email.strip().lower()
    if not _EMAIL_VALIDO.match(email):
        raise HTTPException(status_code=422, detail="Digite um e-mail válido.")
    if email == (usuario.email or "").strip().lower():
        raise HTTPException(status_code=400, detail="Você não pode compartilhar uma imagem com você mesmo.")

    _ficha_compartilhavel(db, curation_id)
    mensagem = (dados.mensagem or "").strip() or None

    destinatario = (
        db.query(User)
        .filter(func.lower(User.email) == email)
        .filter(User.ativo.is_(True), User.bloqueado.is_(False), User.excluido.is_(False))
        .first()
    )

    if destinatario is None:
        # Mesma resposta de quando da certo (ver RESPOSTA NEUTRA no topo).
        _auditar(db, usuario.id, "compartilhamento_imagem", curation_id, "destinatario nao encontrado")
        db.commit()
        return _resposta_neutra()

    existente = (
        db.query(CompartilhamentoImagem)
        .filter(
            CompartilhamentoImagem.remetente_id == usuario.id,
            CompartilhamentoImagem.destinatario_id == destinatario.id,
            CompartilhamentoImagem.curation_id == curation_id,
        )
        .first()
    )
    if existente:
        # compartilhar de novo atualiza o recado e volta a aparecer como novo
        existente.mensagem = mensagem or existente.mensagem
        existente.visto_em = None
    else:
        db.add(CompartilhamentoImagem(
            remetente_id=usuario.id,
            destinatario_id=destinatario.id,
            curation_id=curation_id,
            mensagem=mensagem,
        ))
    _auditar(db, usuario.id, "compartilhamento_imagem", curation_id, f"destinatario_id={destinatario.id}")
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
    return _resposta_neutra()


@router.get("/enviadas")
def listar_enviadas(
    curation_id: Optional[int] = None,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    consulta = (
        db.query(CompartilhamentoImagem, User)
        .join(User, CompartilhamentoImagem.destinatario_id == User.id)
        .filter(CompartilhamentoImagem.remetente_id == usuario.id)
    )
    if curation_id is not None:
        consulta = consulta.filter(CompartilhamentoImagem.curation_id == curation_id)
    itens = [
        {
            "id": comp.id,
            "curation_id": comp.curation_id,
            "destinatario_nome": dest.nome,
            "destinatario_email": dest.email,
            "compartilhado_em": comp.criado_em.isoformat() if comp.criado_em else None,
        }
        for comp, dest in consulta.order_by(CompartilhamentoImagem.criado_em.desc()).all()
    ]
    return {"quantidade": len(itens), "itens": itens}


@router.delete("/enviadas/{compartilhamento_id}")
def desfazer_compartilhamento(
    compartilhamento_id: int,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    comp = (
        db.query(CompartilhamentoImagem)
        .filter(CompartilhamentoImagem.id == compartilhamento_id, CompartilhamentoImagem.remetente_id == usuario.id)
        .first()
    )
    if not comp:
        raise HTTPException(status_code=404, detail="Compartilhamento não encontrado.")
    _auditar(db, usuario.id, "compartilhamento_desfeito", comp.curation_id, f"destinatario_id={comp.destinatario_id}")
    db.delete(comp)
    db.commit()
    return {"mensagem": "Compartilhamento desfeito."}


def _recebidas_query(db: Session, usuario: User):
    remetente = aliased(User)
    return (
        db.query(CompartilhamentoImagem, Curation, OrthancReference, remetente)
        .join(Curation, CompartilhamentoImagem.curation_id == Curation.id)
        .join(OrthancReference, Curation.orthanc_reference_id == OrthancReference.id)
        .join(remetente, CompartilhamentoImagem.remetente_id == remetente.id)
        .filter(CompartilhamentoImagem.destinatario_id == usuario.id)
        .filter(Curation.status == StatusCuradoria.APROVADA.value)
        .filter(OrthancReference.ativo.is_(True))
        .filter(remetente.ativo.is_(True), remetente.excluido.is_(False))
    )


@router.get("/recebidas")
def listar_recebidas(
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    resultados = _recebidas_query(db, usuario).order_by(CompartilhamentoImagem.criado_em.desc()).all()
    # quantas anotacoes cada remetente tem em cada imagem (uma consulta so)
    pares = {(comp.remetente_id, comp.curation_id) for comp, _, _, _ in resultados}
    ids_por_par: dict[tuple[int, int], set[int]] = {}
    if pares:
        linhas = (
            db.query(AnotacaoImagem.usuario_id, AnotacaoImagem.curation_id, AnotacaoImagem.id)
            .filter(AnotacaoImagem.usuario_id.in_({p[0] for p in pares}))
            .filter(AnotacaoImagem.curation_id.in_({p[1] for p in pares}))
            .all()
        )
        for u, c, i in linhas:
            ids_por_par.setdefault((u, c), set()).add(i)

    erros = erros_por_ficha(db, [r[1].id for r in resultados])
    itens = []
    for comp, ficha, ref, remetente in resultados:
        viewer_url = (
            f"{settings.OHIF_BASE_URL}/viewer?StudyInstanceUIDs={ref.study_instance_uid}"
            if ref.study_instance_uid
            else None
        )
        itens.append({
            "id": comp.id,
            "curation_id": ficha.id,
            "remetente_nome": remetente.nome,
            "mensagem": comp.mensagem,
            "compartilhado_em": comp.criado_em.isoformat() if comp.criado_em else None,
            "novo": comp.visto_em is None,
            # so as que quem recebeu ainda ve (sem as que ele "apagou")
            "quantidade_anotacoes": len(ids_por_par.get((comp.remetente_id, ficha.id), set()) - set(comp.anotacoes_ocultas or [])),
            "tipo_radiografia": ficha.tipo_radiografia,
            "dentes": ficha.dentes,
            "achado_principal": ficha.achado_principal,
            "achados_detalhe": ficha.achados_detalhe,
            "alteracoes_observadas": ficha.alteracoes_observadas,
            "marcacoes": ficha.marcacoes,
            "qualidade_tecnica": ficha.qualidade_tecnica,
            "descricao_didatica": ficha.descricao_didatica,
            "erros_tecnicos": erros.get(ficha.id, []),
            "viewer_url": viewer_url,
        })
    return {"quantidade": len(itens), "itens": itens}


@router.get("/recebidas/novas")
def contar_novas(
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    quantidade = _recebidas_query(db, usuario).filter(CompartilhamentoImagem.visto_em.is_(None)).count()
    return {"quantidade": quantidade}


@router.post("/recebidas/vistas")
def marcar_vistas(
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    (
        db.query(CompartilhamentoImagem)
        .filter(CompartilhamentoImagem.destinatario_id == usuario.id, CompartilhamentoImagem.visto_em.is_(None))
        .update({"visto_em": datetime.now(timezone.utc)}, synchronize_session=False)
    )
    db.commit()
    return {"mensagem": "ok"}


@router.delete("/recebidas/{compartilhamento_id}")
def remover_recebida(
    compartilhamento_id: int,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    comp = (
        db.query(CompartilhamentoImagem)
        .filter(CompartilhamentoImagem.id == compartilhamento_id, CompartilhamentoImagem.destinatario_id == usuario.id)
        .first()
    )
    if not comp:
        raise HTTPException(status_code=404, detail="Compartilhamento não encontrado.")
    db.delete(comp)
    db.commit()
    return {"mensagem": "Imagem removida de Compartilhadas comigo."}


def _compartilhamento_recebido(db: Session, usuario: User, compartilhamento_id: int):
    resultado = (
        _recebidas_query(db, usuario).filter(CompartilhamentoImagem.id == compartilhamento_id).first()
    )
    if not resultado:
        raise HTTPException(status_code=404, detail="Compartilhamento não encontrado.")
    return resultado


def _anotacoes_remetente(db: Session, comp: CompartilhamentoImagem):
    return (
        db.query(AnotacaoImagem)
        .filter(AnotacaoImagem.curation_id == comp.curation_id, AnotacaoImagem.usuario_id == comp.remetente_id)
        .order_by(AnotacaoImagem.criado_em)
        .all()
    )


@router.get("/recebidas/{compartilhamento_id}/anotacoes")
def anotacoes_do_remetente(
    compartilhamento_id: int,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    comp, _, _, remetente = _compartilhamento_recebido(db, usuario, compartilhamento_id)
    ocultas = set(comp.anotacoes_ocultas or [])
    todas = _anotacoes_remetente(db, comp)
    visiveis = [a for a in todas if a.id not in ocultas]
    return {
        "remetente_nome": remetente.nome,
        # quantas o usuario "apagou" da propria visao (e ainda existem)
        "ocultas": len(todas) - len(visiveis),
        "itens": [
            {
                "id": a.id,
                "texto": a.texto,
                "cor": a.cor,
                "pos_x": a.pos_x,
                "pos_y": a.pos_y,
                "criado_em": a.criado_em.isoformat() if a.criado_em else None,
                "atualizado_em": a.atualizado_em.isoformat() if a.atualizado_em else None,
            }
            for a in visiveis
        ],
    }


class OcultarAnotacoesPayload(BaseModel):
    # ids das anotacoes a esconder; vazio/ausente = TODAS as atuais
    ids: Optional[list[int]] = Field(default=None, max_length=500)


@router.post("/recebidas/{compartilhamento_id}/anotacoes/ocultar")
def ocultar_anotacoes(
    compartilhamento_id: int,
    payload: OcultarAnotacoesPayload,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """'Apagar' anotacoes recebidas: some SO da visao de quem recebeu.
    A anotacao continua existindo para quem a escreveu."""
    comp, _, _, _ = _compartilhamento_recebido(db, usuario, compartilhamento_id)
    do_remetente = {a.id for a in _anotacoes_remetente(db, comp)}
    alvo = do_remetente if not payload.ids else set(payload.ids)
    # so ids que sao mesmo do remetente nesta imagem (ignora o resto)
    alvo &= do_remetente
    comp.anotacoes_ocultas = sorted(set(comp.anotacoes_ocultas or []) | alvo)
    db.commit()
    return {"ocultas": len(set(comp.anotacoes_ocultas) & do_remetente)}


@router.post("/recebidas/{compartilhamento_id}/anotacoes/reexibir")
def reexibir_anotacoes(
    compartilhamento_id: int,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    comp, _, _, _ = _compartilhamento_recebido(db, usuario, compartilhamento_id)
    comp.anotacoes_ocultas = []
    db.commit()
    return {"ocultas": 0}
