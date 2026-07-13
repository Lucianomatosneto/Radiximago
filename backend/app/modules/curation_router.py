"""
Roteador de Curadoria - endpoints da Fase 4.

Endpoints:
- GET  /curation/pending                       -> fila de imagens sem ficha
- POST /curation/{orthanc_reference_id}         -> cria a ficha de curadoria
- POST /curation/{curation_id}/approve          -> aprova a ficha (libera)
- POST /curation/{curation_id}/discard          -> descarta a ficha (com motivo)
- POST /curation/{curation_id}/request-review   -> solicita segunda opiniao
- POST /curation/reviews/{review_id}/respond    -> revisor responde
- GET  /curation/{orthanc_reference_id}/viewer-url -> link do OHIF para abrir a imagem

Acesso restrito a administrador e suporte (Bloco 4, Secao 16).
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.config import settings
from app.modules.auth import obter_usuario_atual
from app.modules.users import User, UserRole
from app.modules.orthanc_references import OrthancReference
from app.modules.audit_logs import AuditLog
from app.modules.curations import (
    Curation,
    CurationHistory,
    CurationReview,
    TipoRadiografia,
    Genero,
    AchadoPrincipal,
    QualidadeTecnica,
    Dificuldade,
    Finalidade,
    StatusCuradoria,
    StatusRevisao,
    DENTES_PERMANENTES,
)

router = APIRouter(prefix="/curation", tags=["Curadoria"])

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


class ReviewRequest(BaseModel):
    motivo: str
    primeiro_parecer: Optional[str] = None


class ReviewRespond(BaseModel):
    parecer_revisor: str
    concordancia: str  # "concorda" ou "discorda"
    decisao_final: Optional[str] = None
    observacoes: Optional[str] = None


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
# GET /curation/{orthanc_reference_id}/viewer-url  -> link do OHIF
# ---------------------------------------------------------------------
@router.get("/{orthanc_reference_id}/viewer-url")
def obter_link_visualizador(
    orthanc_reference_id: int,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """
    Devolve o link para abrir a imagem no visualizador OHIF.

    Se a imagem tiver StudyInstanceUID, retorna o link pronto do OHIF.
    Caso contrario (ex.: imagem sintetica sem metadados), informa que
    a abertura por link direto nao e possivel para esta imagem.
    """
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

    if not imagem.study_instance_uid:
        return {
            "abrivel": False,
            "motivo": "A imagem nao possui StudyInstanceUID; nao pode ser aberta por link direto no OHIF.",
            "orthanc_reference_id": imagem.id,
            "orthanc_id": imagem.orthanc_id,
            "dicomweb_url": imagem.dicomweb_url,
            "viewer_url": None,
        }

    viewer_url = (
        f"{settings.OHIF_BASE_URL}/viewer"
        f"?StudyInstanceUIDs={imagem.study_instance_uid}"
    )

    return {
        "abrivel": True,
        "orthanc_reference_id": imagem.id,
        "orthanc_id": imagem.orthanc_id,
        "study_instance_uid": imagem.study_instance_uid,
        "viewer_url": viewer_url,
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
    """Aprova a ficha. Regra LGPD: so libera com anonimizacao validada."""
    _exigir_admin_ou_suporte(usuario)
    ficha = _buscar_ficha(db, curation_id)

    if ficha.status in STATUS_FINAIS:
        raise HTTPException(
            status_code=409,
            detail=f"A ficha {curation_id} ja esta '{ficha.status}' e nao pode ser reprocessada.",
        )

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
        raise HTTPException(status_code=422, detail="O descarte exige uma justificativa (motivo).")

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


# ---------------------------------------------------------------------
# POST /curation/{curation_id}/request-review  -> solicita segunda opiniao
# ---------------------------------------------------------------------
@router.post("/{curation_id}/request-review")
def solicitar_segunda_opiniao(
    curation_id: int,
    dados: ReviewRequest,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """Solicita segunda opiniao para uma ficha. Exige justificativa."""
    _exigir_admin_ou_suporte(usuario)
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
            CurationReview.status == StatusRevisao.SOLICITADA.value,
        )
        .first()
    )
    if aberta:
        raise HTTPException(
            status_code=409,
            detail=f"Ja existe uma solicitacao de segunda opiniao aberta (review {aberta.id}).",
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
    db.flush()

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
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """
    Revisor responde a segunda opiniao. Regra de imparcialidade:
    quem solicitou NAO pode responder.
    """
    _exigir_admin_ou_suporte(usuario)

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

    parecer = (dados.parecer_revisor or "").strip()
    if not parecer:
        raise HTTPException(status_code=422, detail="O parecer do revisor e obrigatorio.")

    concordancia = (dados.concordancia or "").strip().lower()
    if concordancia not in ("concorda", "discorda"):
        raise HTTPException(
            status_code=422,
            detail="concordancia deve ser 'concorda' ou 'discorda'.",
        )

    from sqlalchemy.sql import func as _func
    review.revisor_id = usuario.id
    review.parecer_revisor = parecer
    review.concordancia = concordancia
    review.decisao_final = dados.decisao_final
    review.observacoes = dados.observacoes
    review.status = StatusRevisao.RESPONDIDA.value
    review.respondido_em = _func.now()

    _registrar_historico(
        db, review.curation_id, usuario.id, "resposta_segunda_opiniao",
        None, None, f"Parecer: {concordancia}. {parecer}",
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