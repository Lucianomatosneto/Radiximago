"""
Roteador de Curadoria - endpoints da Fase 4.

Primeiro endpoint: GET /curation/pending
Lista as imagens ja registradas (orthanc_references) que ainda NAO possuem
ficha de curadoria (tabela curations). Ou seja, a "caixa de entrada" do curador.

Acesso restrito a administrador e suporte (Bloco 4, Secao 16). O perfil
"curador" podera ser acrescentado a lista quando for criado.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth import obter_usuario_atual
from app.modules.users import User, UserRole
from app.modules.orthanc_references import OrthancReference
from app.modules.curations import Curation

router = APIRouter(prefix="/curation", tags=["Curadoria"])


def _exigir_admin_ou_suporte(usuario: User) -> None:
    """
    Guardiao de permissao: so administrador ou suporte podem acessar a fila.
    Se o perfil nao for permitido, barra com HTTP 403 (acesso negado).
    """
    perfis_permitidos = [UserRole.administrador, UserRole.suporte]
    if usuario.perfil not in perfis_permitidos:
        raise HTTPException(
            status_code=403,
            detail="Acesso negado: apenas administrador ou suporte podem acessar a curadoria.",
        )


@router.get("/pending")
def listar_pendentes(
    skip: int = Query(0, ge=0, description="Quantos registros pular (paginacao)"),
    limit: int = Query(50, ge=1, le=200, description="Maximo de registros a retornar"),
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """
    Lista as imagens pendentes de curadoria.

    Pendente = imagem registrada em orthanc_references que ainda NAO tem
    ficha correspondente em curations.

    Retorna a contagem total de pendentes e a pagina solicitada.
    """
    _exigir_admin_ou_suporte(usuario)

    # Imagens (orthanc_references) que NAO aparecem em curations.
    # outerjoin + filtro "Curation.id is None" = "ainda nao curadas".
    consulta_base = (
        db.query(OrthancReference)
        .outerjoin(Curation, Curation.orthanc_reference_id == OrthancReference.id)
        .filter(Curation.id.is_(None))
        .order_by(OrthancReference.id)
    )

    total_pendentes = consulta_base.count()
    registros = consulta_base.offset(skip).limit(limit).all()

    itens = [
        {
            "orthanc_reference_id": ref.id,
            "orthanc_id": ref.orthanc_id,
            "study_instance_uid": ref.study_instance_uid,
            "series_instance_uid": ref.series_instance_uid,
            "sop_instance_uid": ref.sop_instance_uid,
            "resource_type": ref.resource_type,
            "dicomweb_url": ref.dicomweb_url,
        }
        for ref in registros
    ]

    return {
        "total_pendentes": total_pendentes,
        "skip": skip,
        "limit": limit,
        "quantidade_retornada": len(itens),
        "itens": itens,
    }