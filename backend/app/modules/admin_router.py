"""
Roteador Administrativo - Fase 6 (backend).

Endpoints (somente administrador):
- GET /admin/stats       -> indicadores para o dashboard
- GET /admin/audit-logs  -> consulta da auditoria (com filtros)

Fornece a "materia-prima" numerica para os paineis do frontend.
"""

from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth import exigir_perfis, PERFIS_ADMIN
from app.modules.users import User, UserRole
from app.modules.orthanc_references import OrthancReference
from app.modules.audit_logs import AuditLog
from app.modules.curations import Curation

router = APIRouter(prefix="/admin", tags=["Administracao"])


def _contar_por(db, coluna):
    """Conta fichas de curadoria agrupadas por uma coluna. Retorna dict {valor: total}."""
    linhas = (
        db.query(coluna, func.count(Curation.id))
        .group_by(coluna)
        .all()
    )
    return {(valor if valor is not None else "nao_informado"): total for valor, total in linhas}


@router.get("/stats")
def obter_indicadores(
    usuario: User = Depends(exigir_perfis(*PERFIS_ADMIN)),
    db: Session = Depends(get_db),
):
    """
    Indicadores gerais para o dashboard administrativo.
    Total de imagens e de fichas, e contagens por status, tipo, achado e dificuldade.
    """
    total_imagens = db.query(func.count(OrthancReference.id)).scalar()
    total_fichas = db.query(func.count(Curation.id)).scalar()

    return {
        "total_imagens_orthanc": total_imagens,
        "total_fichas_curadoria": total_fichas,
        "por_status": _contar_por(db, Curation.status),
        "por_tipo_radiografia": _contar_por(db, Curation.tipo_radiografia),
        "por_achado_principal": _contar_por(db, Curation.achado_principal),
        "por_dificuldade": _contar_por(db, Curation.dificuldade),
    }


@router.get("/audit-logs")
def consultar_auditoria(
    usuario_id: Optional[int] = Query(None, description="Filtrar por id de usuario"),
    acao: Optional[str] = Query(None, description="Filtrar por acao (ex.: aprovacao)"),
    resultado: Optional[str] = Query(None, description="sucesso, negado ou erro"),
    data_de: Optional[datetime] = Query(None, description="A partir desta data/hora (ISO)"),
    data_ate: Optional[datetime] = Query(None, description="Ate esta data/hora (ISO)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    usuario: User = Depends(exigir_perfis(*PERFIS_ADMIN)),
    db: Session = Depends(get_db),
):
    """
    Consulta os registros de auditoria com filtros opcionais.
    Base para a tela de auditoria (Bloco 4, Tela 12).
    """
    consulta = db.query(AuditLog)

    if usuario_id is not None:
        consulta = consulta.filter(AuditLog.usuario_id == usuario_id)
    if acao is not None:
        consulta = consulta.filter(AuditLog.acao == acao)
    if resultado is not None:
        consulta = consulta.filter(AuditLog.resultado == resultado)
    if data_de is not None:
        consulta = consulta.filter(AuditLog.criado_em >= data_de)
    if data_ate is not None:
        consulta = consulta.filter(AuditLog.criado_em <= data_ate)

    consulta = consulta.order_by(AuditLog.id.desc())
    total = consulta.count()
    registros = consulta.offset(skip).limit(limit).all()

    itens = [
        {
            "id": r.id,
            "usuario_id": r.usuario_id,
            "acao": r.acao,
            "entidade": r.entidade,
            "entidade_id": r.entidade_id,
            "resultado": r.resultado,
            "detalhes": r.detalhes,
            "criado_em": r.criado_em.isoformat() if r.criado_em else None,
        }
        for r in registros
    ]

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "quantidade_retornada": len(itens),
        "itens": itens,
    }