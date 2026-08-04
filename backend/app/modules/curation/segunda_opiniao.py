"""Fluxo de segunda opiniao: solicitar, responder e aplicar a decisao final."""

from fastapi import Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from app.core.database import get_db
from app.modules.auth import exigir_perfis, PERFIS_CURADORIA
from app.modules.users import User
from app.modules.curations import CurationReview, StatusCuradoria, StatusRevisao, DecisaoFinalRevisao

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

    # Parecer escrito e opcional (a tela hoje so manda "concorda"/"discorda"
    # pelos botoes) - guarda None em vez de string vazia quando ausente.
    parecer = (dados.parecer_revisor or "").strip() or None

    concordancia = (dados.concordancia or "").strip().lower()
    if concordancia not in ("concorda", "discorda"):
        raise HTTPException(
            status_code=422,
            detail="concordancia deve ser 'concorda' ou 'discorda'.",
        )

    review.revisor_id = usuario.id
    review.parecer_revisor = parecer
    review.concordancia = concordancia
    review.decisao_final = _valor(dados.decisao_final)
    review.observacoes = dados.observacoes
    review.status = StatusRevisao.RESPONDIDA.value
    review.respondido_em = func.now()

    _registrar_historico(
        db, review.curation_id, usuario.id, "resposta_segunda_opiniao",
        None, None,
        f"Parecer: {concordancia}." + (f" {parecer}" if parecer else ""),
    )
    _registrar_auditoria(
        db, usuario.id, "resposta_segunda_opiniao", review.curation_id, "sucesso",
        f"Segunda opiniao respondida por usuario {usuario.id} ({concordancia}).",
    )
    db.commit()
    db.refresh(review)

    return {
        "mensagem": "Segunda opiniao respondida com sucesso.",
        "review_id": review.id,
        "curation_id": review.curation_id,
        "concordancia": review.concordancia,
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
