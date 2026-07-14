"""
Roteador de Pesquisa - Fase 5.

Endpoint:
- GET /search  -> lista as imagens APROVADAS (curadas e liberadas), com filtros.

Regra de ouro (Bloco 4): so retorna imagens com status 'aprovada'.
Acesso: qualquer usuario logado (a pesquisa so expoe o que ja foi liberado).
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.config import settings
from app.modules.auth import obter_usuario_atual
from app.modules.users import User
from app.modules.orthanc_references import OrthancReference
from app.modules.curations import (
    Curation,
    TipoRadiografia,
    Genero,
    AchadoPrincipal,
    QualidadeTecnica,
    Dificuldade,
    Finalidade,
    StatusCuradoria,
)

router = APIRouter(prefix="/search", tags=["Pesquisa"])

# Faixas de dentes (FDI) por arcada e por lado, para os filtros derivados.
DENTES_SUPERIORES = list(range(11, 29))   # 11-28
DENTES_INFERIORES = list(range(31, 49))   # 31-48
DENTES_DIREITA = list(range(11, 19)) + list(range(41, 49))   # quadrantes 1 e 4
DENTES_ESQUERDA = list(range(21, 29)) + list(range(31, 39))  # quadrantes 2 e 3


@router.get("")
def pesquisar_imagens(
    tipo_radiografia: Optional[TipoRadiografia] = Query(None),
    dente: Optional[int] = Query(None, description="Numero FDI (11-48)"),
    arcada: Optional[str] = Query(None, description="'superior' ou 'inferior'"),
    lado: Optional[str] = Query(None, description="'direito' ou 'esquerdo'"),
    achado_principal: Optional[AchadoPrincipal] = Query(None),
    genero: Optional[Genero] = Query(None),
    qualidade_tecnica: Optional[QualidadeTecnica] = Query(None),
    dificuldade: Optional[Dificuldade] = Query(None),
    finalidade: Optional[Finalidade] = Query(None),
    idade_min: Optional[int] = Query(None, ge=0, le=120),
    idade_max: Optional[int] = Query(None, ge=0, le=120),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """
    Pesquisa imagens aprovadas com filtros opcionais.

    Todos os filtros sao combinados com E (todos precisam bater).
    Retorna dados no formato de card para o frontend.
    """
    # REGRA DE OURO: apenas fichas aprovadas.
    consulta = (
        db.query(Curation, OrthancReference)
        .join(OrthancReference, Curation.orthanc_reference_id == OrthancReference.id)
        .filter(Curation.status == StatusCuradoria.APROVADA.value)
    )

    # Filtros diretos (so aplicam se o usuario informou).
    if tipo_radiografia is not None:
        consulta = consulta.filter(Curation.tipo_radiografia == tipo_radiografia.value)
    if achado_principal is not None:
        consulta = consulta.filter(Curation.achado_principal == achado_principal.value)
    if genero is not None:
        consulta = consulta.filter(Curation.genero == genero.value)
    if qualidade_tecnica is not None:
        consulta = consulta.filter(Curation.qualidade_tecnica == qualidade_tecnica.value)
    if dificuldade is not None:
        consulta = consulta.filter(Curation.dificuldade == dificuldade.value)
    if finalidade is not None:
        consulta = consulta.filter(Curation.finalidade == finalidade.value)

    # Filtro por dente especifico (o array de dentes contem aquele numero).
    if dente is not None:
        consulta = consulta.filter(Curation.dentes.any(dente))

    # Filtros derivados do dente: arcada e lado.
    if arcada == "superior":
        consulta = consulta.filter(Curation.dentes.overlap(DENTES_SUPERIORES))
    elif arcada == "inferior":
        consulta = consulta.filter(Curation.dentes.overlap(DENTES_INFERIORES))
    if lado == "direito":
        consulta = consulta.filter(Curation.dentes.overlap(DENTES_DIREITA))
    elif lado == "esquerdo":
        consulta = consulta.filter(Curation.dentes.overlap(DENTES_ESQUERDA))

    # Filtros de idade (sobreposicao de faixas).
    if idade_min is not None:
        consulta = consulta.filter(
            (Curation.idade_max.is_(None)) | (Curation.idade_max >= idade_min)
        )
    if idade_max is not None:
        consulta = consulta.filter(
            (Curation.idade_min.is_(None)) | (Curation.idade_min <= idade_max)
        )

    consulta = consulta.order_by(Curation.id)
    total = consulta.count()
    resultados = consulta.offset(skip).limit(limit).all()

    itens = []
    for ficha, ref in resultados:
        if ref.study_instance_uid:
            viewer_url = f"{settings.OHIF_BASE_URL}/viewer?StudyInstanceUIDs={ref.study_instance_uid}"
        else:
            viewer_url = None
        itens.append({
            "curation_id": ficha.id,
            "orthanc_reference_id": ref.id,
            "orthanc_id": ref.orthanc_id,
            "modalidade": ficha.modalidade,
            "tipo_radiografia": ficha.tipo_radiografia,
            "dentes": ficha.dentes,
            "achado_principal": ficha.achado_principal,
            "qualidade_tecnica": ficha.qualidade_tecnica,
            "dificuldade": ficha.dificuldade,
            "finalidade": ficha.finalidade,
            "descricao_didatica": ficha.descricao_didatica,
            "viewer_url": viewer_url,
        })

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "quantidade_retornada": len(itens),
        "itens": itens,
    }