"""Aprovacao e descarte de fichas ja criadas (fora da segunda opiniao)."""

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth import exigir_perfis, PERFIS_CURADORIA
from app.modules.users import User

from .common import (
    STATUS_FINAIS,
    _buscar_ficha,
    _exigir_fora_de_segunda_opiniao,
    _executar_aprovacao,
    _executar_descarte,
)
from .router import router
from .schemas import CurationApprove, CurationDiscard


# ---------------------------------------------------------------------
# POST /curation/{curation_id}/approve  -> aprova (libera)
# ---------------------------------------------------------------------
@router.post("/{curation_id}/approve")
def aprovar_curadoria(
    curation_id: int,
    dados: CurationApprove,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    """Aprova a ficha. Regra LGPD: so libera com anonimizacao validada."""
    ficha = _buscar_ficha(db, curation_id)

    if ficha.status in STATUS_FINAIS:
        raise HTTPException(
            status_code=409,
            detail=f"A ficha {curation_id} ja esta '{ficha.status}' e nao pode ser reprocessada.",
        )
    _exigir_fora_de_segunda_opiniao(ficha, curation_id)

    _executar_aprovacao(db, ficha, usuario, dados.anonimizacao_validada, dados.observacoes)
    db.commit()
    db.refresh(ficha)

    return {
        "mensagem": "Ficha aprovada com sucesso.",
        "curation_id": ficha.id,
        "status": ficha.status,
        "anonimizacao_validada": ficha.anonimizacao_validada,
    }


# ---------------------------------------------------------------------
# POST /curation/{curation_id}/discard  -> descarta (com motivo)
# ---------------------------------------------------------------------
@router.post("/{curation_id}/discard")
def descartar_curadoria(
    curation_id: int,
    dados: CurationDiscard,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    """Descarta a ficha (a imagem nao sera usada). Exige justificativa."""
    ficha = _buscar_ficha(db, curation_id)

    if ficha.status in STATUS_FINAIS:
        raise HTTPException(
            status_code=409,
            detail=f"A ficha {curation_id} ja esta '{ficha.status}' e nao pode ser reprocessada.",
        )
    _exigir_fora_de_segunda_opiniao(ficha, curation_id)

    motivo = _executar_descarte(db, ficha, usuario, dados.motivo)
    db.commit()
    db.refresh(ficha)

    return {
        "mensagem": "Ficha descartada com sucesso.",
        "curation_id": ficha.id,
        "status": ficha.status,
        "motivo": motivo,
    }


# ---------------------------------------------------------------------
# POST /curation/{curation_id}/reabrir  -> "editar depois do envio" (31/10/2026)
# ---------------------------------------------------------------------
@router.post("/{curation_id}/reabrir")
def reabrir_para_edicao(
    curation_id: int,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    """
    Reabre uma ficha ja APROVADA (ou descartada) para o curador corrigir:
    volta para 'em_analise' e, ao aprovar de novo, a versao corrigida e a que
    vale. Enquanto estiver reaberta ela SAI da busca dos usuarios (so ficha
    aprovada aparece) - nada fica publicado pela metade. O historico da
    ficha guarda quem reabriu e quando; a anterior continua no historico.
    """
    from app.modules.audit_logs import AuditLog
    from app.modules.curations import StatusCuradoria

    from .common import _registrar_historico

    ficha = _buscar_ficha(db, curation_id)
    if ficha.status not in STATUS_FINAIS:
        raise HTTPException(status_code=409, detail="Esta ficha já está em edição.")
    anterior = ficha.status
    ficha.status = StatusCuradoria.EM_ANALISE.value
    _registrar_historico(db, ficha.id, usuario.id, "reabertura_edicao", anterior,
                         ficha.status, "Reaberta para edição depois do envio")
    db.add(AuditLog(usuario_id=usuario.id, acao="curadoria_reaberta", entidade="curation", entidade_id=ficha.id,
                    resultado="sucesso", detalhes=f"{anterior} -> em_analise"))
    db.commit()
    return {"curation_id": ficha.id, "orthanc_reference_id": ficha.orthanc_reference_id, "status": ficha.status}
