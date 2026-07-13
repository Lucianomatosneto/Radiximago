"""
Roteador de Curadoria - endpoints da Fase 4.

Endpoints:
- GET  /curation/pending                  -> fila de imagens sem ficha
- POST /curation/{orthanc_reference_id}   -> cria a ficha de curadoria

Acesso restrito a administrador e suporte (Bloco 4, Secao 16). O perfil
"curador" podera ser acrescentado a lista quando for criado.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth import obter_usuario_atual
from app.modules.users import User, UserRole
from app.modules.orthanc_references import OrthancReference
from app.modules.curations import (
    Curation,
    CurationHistory,
    TipoRadiografia,
    Genero,
    AchadoPrincipal,
    QualidadeTecnica,
    Dificuldade,
    Finalidade,
    StatusCuradoria,
    DENTES_PERMANENTES,
)

router = APIRouter(prefix="/curation", tags=["Curadoria"])


def _exigir_admin_ou_suporte(usuario: User) -> None:
    """
    Guardiao de permissao: so administrador ou suporte podem acessar a curadoria.
    Se o perfil nao for permitido, barra com HTTP 403 (acesso negado).
    """
    perfis_permitidos = [UserRole.administrador, UserRole.suporte]
    if usuario.perfil not in perfis_permitidos:
        raise HTTPException(
            status_code=403,
            detail="Acesso negado: apenas administrador ou suporte podem acessar a curadoria.",
        )


def _valor(campo) -> Optional[str]:
    """Converte um Enum opcional no texto guardado no banco (ou None)."""
    return campo.value if campo is not None else None


# ---------------------------------------------------------------------
# Formato de entrada do formulario (validado automaticamente pelo Pydantic).
# So 'tipo_radiografia' e obrigatorio; o restante e opcional.
# ---------------------------------------------------------------------
class CurationCreate(BaseModel):
    tipo_radiografia: TipoRadiografia
    dentes: Optional[List[int]] = None
    idade_min: Optional[int] = None
    idade_max: Optional[int] = None
    genero: Optional[Genero] = None
    achado_principal: Optional[AchadoPrincipal] = None
    achados_detalhe: Optional[str] = None
    qualidade_tecnica: Optional[QualidadeTecnica] = None
    dificuldade: Optional[Dificuldade] = None
    descricao_didatica: Optional[str] = None
    observacoes_internas: Optional[str] = None
    finalidade: Optional[Finalidade] = None


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
    """
    _exigir_admin_ou_suporte(usuario)

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


@router.post("/{orthanc_reference_id}")
def criar_curadoria(
    orthanc_reference_id: int,
    dados: CurationCreate,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """
    Cria a ficha de curadoria de uma imagem.

    Regras:
    - A imagem precisa existir em orthanc_references.
    - A imagem nao pode ja ter ficha (uma ficha por imagem nesta versao).
    - Dentes, se informados, precisam ser codigos FDI validos (11-48).
    - Idade minima nao pode ser maior que a maxima.
    - A ficha nasce com status 'em_analise' e gera registro no historico.
    """
    _exigir_admin_ou_suporte(usuario)

    # 1) A imagem existe?
    imagem = (
        db.query(OrthancReference)
        .filter(OrthancReference.id == orthanc_reference_id)
        .first()
    )
    if not imagem:
        raise HTTPException(
            status_code=404,
            detail=f"Imagem {orthanc_reference_id} nao encontrada em orthanc_references.",
        )

    # 2) Ja existe ficha para esta imagem?
    ja_existe = (
        db.query(Curation)
        .filter(Curation.orthanc_reference_id == orthanc_reference_id)
        .first()
    )
    if ja_existe:
        raise HTTPException(
            status_code=409,
            detail=f"A imagem {orthanc_reference_id} ja possui ficha de curadoria (id {ja_existe.id}).",
        )

    # 3) Validacao dos dentes (codigos FDI permanentes 11-48).
    if dados.dentes:
        invalidos = [d for d in dados.dentes if d not in DENTES_PERMANENTES]
        if invalidos:
            raise HTTPException(
                status_code=422,
                detail=f"Dentes invalidos (use apenas 11-48, notacao FDI): {invalidos}",
            )

    # 4) Validacao das idades.
    for rotulo, valor in (("idade_min", dados.idade_min), ("idade_max", dados.idade_max)):
        if valor is not None and not (0 <= valor <= 120):
            raise HTTPException(
                status_code=422,
                detail=f"{rotulo} deve estar entre 0 e 120.",
            )
    if (
        dados.idade_min is not None
        and dados.idade_max is not None
        and dados.idade_min > dados.idade_max
    ):
        raise HTTPException(
            status_code=422,
            detail="idade_min nao pode ser maior que idade_max.",
        )

    # 5) Cria a ficha (status inicial: em_analise).
    ficha = Curation(
        orthanc_reference_id=orthanc_reference_id,
        modalidade="RX",
        tipo_radiografia=dados.tipo_radiografia.value,
        dentes=dados.dentes,
        idade_min=dados.idade_min,
        idade_max=dados.idade_max,
        genero=_valor(dados.genero),
        achado_principal=_valor(dados.achado_principal),
        achados_detalhe=dados.achados_detalhe,
        qualidade_tecnica=_valor(dados.qualidade_tecnica),
        dificuldade=_valor(dados.dificuldade),
        descricao_didatica=dados.descricao_didatica,
        observacoes_internas=dados.observacoes_internas,
        finalidade=_valor(dados.finalidade),
        status=StatusCuradoria.EM_ANALISE.value,
        anonimizacao_validada=False,
        curador_id=usuario.id,
    )
    db.add(ficha)
    db.flush()  # garante o id da ficha antes de gravar o historico

    # 6) Registra no historico (rastreabilidade - Bloco 4).
    historico = CurationHistory(
        curation_id=ficha.id,
        usuario_id=usuario.id,
        acao="criacao",
        status_anterior=None,
        status_novo=StatusCuradoria.EM_ANALISE.value,
        justificativa="Ficha de curadoria criada.",
    )
    db.add(historico)
    db.commit()
    db.refresh(ficha)

    return {
        "mensagem": "Ficha de curadoria criada com sucesso.",
        "curation_id": ficha.id,
        "orthanc_reference_id": ficha.orthanc_reference_id,
        "status": ficha.status,
        "tipo_radiografia": ficha.tipo_radiografia,
        "dentes": ficha.dentes,
    }