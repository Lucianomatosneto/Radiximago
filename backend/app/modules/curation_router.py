"""
Roteador de Curadoria - endpoints da Fase 4.

Endpoints:
- GET  /curation/pending                    -> fila de imagens sem ficha
- POST /curation/{orthanc_reference_id}     -> cria a ficha de curadoria
- POST /curation/{curation_id}/approve      -> aprova a ficha (libera)
- POST /curation/{curation_id}/discard      -> descarta a ficha (com motivo)

Acesso restrito a administrador e suporte (Bloco 4, Secao 16).
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth import obter_usuario_atual
from app.modules.users import User, UserRole
from app.modules.orthanc_references import OrthancReference
from app.modules.audit_logs import AuditLog
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

# Status que ja representam uma decisao final tomada.
STATUS_FINAIS = [
    StatusCuradoria.APROVADA.value,
    StatusCuradoria.DESCARTADA.value,
]


def _exigir_admin_ou_suporte(usuario: User) -> None:
    """Guardiao de permissao: so administrador ou suporte."""
    perfis_permitidos = [UserRole.administrador, UserRole.suporte]
    if usuario.perfil not in perfis_permitidos:
        raise HTTPException(
            status_code=403,
            detail="Acesso negado: apenas administrador ou suporte podem acessar a curadoria.",
        )


def _valor(campo) -> Optional[str]:
    """Converte um Enum opcional no texto guardado no banco (ou None)."""
    return campo.value if campo is not None else None


def _registrar_historico(db, curation_id, usuario_id, acao, status_ant, status_novo, justificativa):
    """Grava um registro no historico de curadoria (rastreabilidade)."""
    db.add(CurationHistory(
        curation_id=curation_id,
        usuario_id=usuario_id,
        acao=acao,
        status_anterior=status_ant,
        status_novo=status_novo,
        justificativa=justificativa,
    ))


def _registrar_auditoria(db, usuario_id, acao, entidade_id, resultado, detalhes):
    """Grava um registro na auditoria (Bloco 4)."""
    db.add(AuditLog(
        usuario_id=usuario_id,
        acao=acao,
        entidade="curation",
        entidade_id=entidade_id,
        resultado=resultado,
        detalhes=detalhes,
    ))


def _buscar_ficha(db, curation_id) -> Curation:
    """Busca a ficha ou levanta 404."""
    ficha = db.query(Curation).filter(Curation.id == curation_id).first()
    if not ficha:
        raise HTTPException(
            status_code=404,
            detail=f"Ficha de curadoria {curation_id} nao encontrada.",
        )
    return ficha


# ---------------------------------------------------------------------
# Formatos de entrada (validados pelo Pydantic).
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


class CurationApprove(BaseModel):
    anonimizacao_validada: bool
    observacoes: Optional[str] = None


class CurationDiscard(BaseModel):
    motivo: str


# ---------------------------------------------------------------------
# GET /curation/pending
# ---------------------------------------------------------------------
@router.get("/pending")
def listar_pendentes(
    skip: int = Query(0, ge=0, description="Quantos registros pular (paginacao)"),
    limit: int = Query(50, ge=1, le=200, description="Maximo de registros a retornar"),
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """Lista as imagens ainda sem ficha de curadoria."""
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


# ---------------------------------------------------------------------
# POST /curation/{orthanc_reference_id}  -> cria a ficha
# ---------------------------------------------------------------------
@router.post("/{orthanc_reference_id}")
def criar_curadoria(
    orthanc_reference_id: int,
    dados: CurationCreate,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """Cria a ficha de curadoria de uma imagem (status inicial: em_analise)."""
    _exigir_admin_ou_suporte(usuario)

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

    ja_existe = (
        db.query(Curation)
        .filter(Curation.orthanc_reference_id == orthanc_reference_id)
        .first()
    )
    if ja_existe:
        raise HTTPException(
            status_code=409,
            detail=f"A imagem {orthanc_reference_id} ja possui ficha (id {ja_existe.id}).",
        )

    if dados.dentes:
        invalidos = [d for d in dados.dentes if d not in DENTES_PERMANENTES]
        if invalidos:
            raise HTTPException(
                status_code=422,
                detail=f"Dentes invalidos (use apenas 11-48, notacao FDI): {invalidos}",
            )

    for rotulo, valor in (("idade_min", dados.idade_min), ("idade_max", dados.idade_max)):
        if valor is not None and not (0 <= valor <= 120):
            raise HTTPException(status_code=422, detail=f"{rotulo} deve estar entre 0 e 120.")
    if (
        dados.idade_min is not None
        and dados.idade_max is not None
        and dados.idade_min > dados.idade_max
    ):
        raise HTTPException(status_code=422, detail="idade_min nao pode ser maior que idade_max.")

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
    db.flush()

    _registrar_historico(
        db, ficha.id, usuario.id, "criacao",
        None, StatusCuradoria.EM_ANALISE.value, "Ficha de curadoria criada.",
    )
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


# ---------------------------------------------------------------------
# POST /curation/{curation_id}/approve  -> aprova (libera)
# ---------------------------------------------------------------------
@router.post("/{curation_id}/approve")
def aprovar_curadoria(
    curation_id: int,
    dados: CurationApprove,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """
    Aprova a ficha, liberando a imagem para uso.

    Regra LGPD (Bloco 4): so libera se a anonimizacao estiver validada.
    Nesta versao, o curador confirma a validacao no momento de aprovar.
    """
    _exigir_admin_ou_suporte(usuario)
    ficha = _buscar_ficha(db, curation_id)

    # Nao reprocessar decisao ja tomada.
    if ficha.status in STATUS_FINAIS:
        raise HTTPException(
            status_code=409,
            detail=f"A ficha {curation_id} ja esta '{ficha.status}' e nao pode ser reprocessada.",
        )

    # Regra LGPD: bloquear liberacao sem anonimizacao validada.
    if not dados.anonimizacao_validada:
        _registrar_auditoria(
            db, usuario.id, "aprovacao", curation_id, "negado",
            "Tentativa de aprovar sem anonimizacao validada.",
        )
        db.commit()
        raise HTTPException(
            status_code=422,
            detail="Aprovacao bloqueada: a anonimizacao precisa estar validada para liberar a imagem.",
        )

    status_anterior = ficha.status
    ficha.status = StatusCuradoria.APROVADA.value
    ficha.anonimizacao_validada = True

    _registrar_historico(
        db, ficha.id, usuario.id, "aprovacao",
        status_anterior, StatusCuradoria.APROVADA.value,
        dados.observacoes or "Ficha aprovada.",
    )
    _registrar_auditoria(
        db, usuario.id, "aprovacao", ficha.id, "sucesso",
        f"Ficha aprovada por usuario {usuario.id}.",
    )
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
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """Descarta a ficha (a imagem nao sera usada). Exige justificativa."""
    _exigir_admin_ou_suporte(usuario)
    ficha = _buscar_ficha(db, curation_id)

    if ficha.status in STATUS_FINAIS:
        raise HTTPException(
            status_code=409,
            detail=f"A ficha {curation_id} ja esta '{ficha.status}' e nao pode ser reprocessada.",
        )

    motivo = (dados.motivo or "").strip()
    if not motivo:
        raise HTTPException(
            status_code=422,
            detail="O descarte exige uma justificativa (motivo).",
        )

    status_anterior = ficha.status
    ficha.status = StatusCuradoria.DESCARTADA.value

    _registrar_historico(
        db, ficha.id, usuario.id, "descarte",
        status_anterior, StatusCuradoria.DESCARTADA.value, motivo,
    )
    _registrar_auditoria(
        db, usuario.id, "descarte", ficha.id, "sucesso",
        f"Ficha descartada por usuario {usuario.id}. Motivo: {motivo}",
    )
    db.commit()
    db.refresh(ficha)

    return {
        "mensagem": "Ficha descartada com sucesso.",
        "curation_id": ficha.id,
        "status": ficha.status,
        "motivo": motivo,
    }