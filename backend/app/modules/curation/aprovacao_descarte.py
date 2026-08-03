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
