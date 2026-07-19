"""
Roteador de Curadoria - endpoints da Fase 4.

Endpoints:
- GET  /curation/pending                       -> fila de imagens sem ficha
- GET  /curation/reviews/pending                -> fila de segundas opinioes aguardando resposta
- POST /curation/{orthanc_reference_id}         -> cria a ficha de curadoria
- PATCH /curation/{curation_id}                 -> edita os campos de classificacao (nao altera status)
- POST /curation/{curation_id}/approve          -> aprova a ficha (libera)
- POST /curation/{curation_id}/discard          -> descarta a ficha (com motivo)
- POST /curation/{curation_id}/request-review   -> solicita segunda opiniao
- POST /curation/reviews/{review_id}/respond    -> revisor responde
- POST /curation/{curation_id}/apply-review-decision -> aplica a decisao final apos a segunda opiniao respondida
- GET  /curation/{orthanc_reference_id}/viewer-url -> link do OHIF para abrir a imagem

Acesso: administrador, suporte e curador podem operar todos os endpoints
deste modulo (criar ficha, aprovar, descartar, solicitar/responder segunda
opiniao e aplicar a decisao final) - Bloco 4, Secao 16.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.config import settings
from app.modules.auth import exigir_perfis, PERFIS_CURADORIA
from app.modules.users import User
from app.modules.orthanc_references import OrthancReference
from app.modules.audit_logs import AuditLog
from app.modules.curations import (
    Curation,
    CurationHistory,
    CurationReview,
    Modalidade,
    TipoRadiografia,
    Genero,
    AchadoPrincipal,
    QualidadeTecnica,
    Dificuldade,
    Finalidade,
    StatusCuradoria,
    StatusRevisao,
    DecisaoRevisao,
    DecisaoFinalRevisao,
    DENTES_PERMANENTES,
)

router = APIRouter(prefix="/curation", tags=["Curadoria"])

STATUS_FINAIS = [
    StatusCuradoria.APROVADA.value,
    StatusCuradoria.DESCARTADA.value,
]

# Só se edita uma ficha enquanto ela ainda nao passou por uma decisao
# (aprovacao/descarte) nem esta em segunda opiniao.
STATUS_EDITAVEIS = [
    StatusCuradoria.PENDENTE.value,
    StatusCuradoria.EM_ANALISE.value,
]


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


def _exigir_fora_de_segunda_opiniao(ficha: Curation, curation_id: int) -> None:
    """
    Bloqueia aprovar/descartar diretamente enquanto a ficha esta em
    segunda_opiniao - o unico caminho para sair desse status e
    /apply-review-decision. Compartilhado por aprovar_curadoria e
    descartar_curadoria.
    """
    if ficha.status == StatusCuradoria.SEGUNDA_OPINIAO.value:
        raise HTTPException(
            status_code=409,
            detail=(
                f"A ficha {curation_id} esta em segunda opiniao. Use "
                f"POST /curation/{curation_id}/apply-review-decision para aplicar a decisao final."
            ),
        )


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


class CurationUpdate(BaseModel):
    """
    Atualizacao parcial dos campos de classificacao de uma ficha.
    Nao inclui `status` de proposito - a troca de status continua exclusiva
    de approve/discard/request-review/apply-review-decision.
    """
    modalidade: Optional[Modalidade] = None
    tipo_radiografia: Optional[TipoRadiografia] = None
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
    anonimizacao_validada: Optional[bool] = None


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
    decisao_final: Optional[DecisaoRevisao] = None
    observacoes: Optional[str] = None


class AplicarDecisaoRevisao(BaseModel):
    decisao: DecisaoFinalRevisao
    anonimizacao_validada: Optional[bool] = None  # obrigatorio de fato so se decisao == aprovar
    motivo: Optional[str] = None                   # obrigatorio de fato so se decisao == descartar
    observacoes: Optional[str] = None


# ---------------------------------------------------------------------
# GET /curation/pending
# ---------------------------------------------------------------------
@router.get("/pending")
def listar_pendentes(
    skip: int = Query(0, ge=0, description="Quantos registros pular (paginacao)"),
    limit: int = Query(50, ge=1, le=200, description="Maximo de registros a retornar"),
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    """Lista as imagens ainda sem ficha de curadoria."""

    consulta_base = (
        db.query(OrthancReference)
        .outerjoin(Curation, Curation.orthanc_reference_id == OrthancReference.id)
        .filter(Curation.id.is_(None))
        .filter(OrthancReference.ativo.is_(True))
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
# GET /curation/reviews/pending  -> fila de segundas opinioes aguardando resposta
# ---------------------------------------------------------------------
@router.get("/reviews/pending")
def listar_reviews_pendentes(
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    """
    Lista as solicitacoes de segunda opiniao com status 'solicitada'
    (ainda sem resposta do revisor), com o contexto da ficha e da imagem
    vinculadas para dar visao de qual imagem e qual e o caso.
    """
    resultados = (
        db.query(CurationReview, Curation, OrthancReference)
        .join(Curation, Curation.id == CurationReview.curation_id)
        .join(OrthancReference, OrthancReference.id == Curation.orthanc_reference_id)
        .filter(CurationReview.status == StatusRevisao.SOLICITADA.value)
        .order_by(CurationReview.id)
        .all()
    )

    itens = [
        {
            "id": review.id,
            "motivo": review.motivo,
            "primeiro_parecer": review.primeiro_parecer,
            "criado_em": review.criado_em.isoformat() if review.criado_em else None,
            "curation": {
                "id": curation.id,
                "achado_principal": curation.achado_principal,
                "tipo_radiografia": curation.tipo_radiografia,
            },
            "orthanc_reference": {
                "id": imagem.id,
                "orthanc_id": imagem.orthanc_id,
            },
        }
        for review, curation, imagem in resultados
    ]

    return {
        "quantidade": len(itens),
        "itens": itens,
    }


# ---------------------------------------------------------------------
# GET /curation/{orthanc_reference_id}/viewer-url  -> link do OHIF
# ---------------------------------------------------------------------
@router.get("/{orthanc_reference_id}/viewer-url")
def obter_link_visualizador(
    orthanc_reference_id: int,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    """
    Devolve o link para abrir a imagem no visualizador OHIF.

    Se a imagem tiver StudyInstanceUID, retorna o link pronto do OHIF.
    Caso contrario (ex.: imagem sintetica sem metadados), informa que
    a abertura por link direto nao e possivel para esta imagem.
    """

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
# GET /curation/{curation_id}  -> ficha de curadoria completa
# ---------------------------------------------------------------------
@router.get("/{curation_id}")
def obter_ficha(
    curation_id: int,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    """Busca uma ficha de curadoria especifica, com todos os campos."""
    ficha = _buscar_ficha(db, curation_id)

    return {
        "id": ficha.id,
        "orthanc_reference_id": ficha.orthanc_reference_id,
        "modalidade": ficha.modalidade,
        "tipo_radiografia": ficha.tipo_radiografia,
        "dentes": ficha.dentes,
        "idade_min": ficha.idade_min,
        "idade_max": ficha.idade_max,
        "genero": ficha.genero,
        "achado_principal": ficha.achado_principal,
        "achados_detalhe": ficha.achados_detalhe,
        "qualidade_tecnica": ficha.qualidade_tecnica,
        "dificuldade": ficha.dificuldade,
        "descricao_didatica": ficha.descricao_didatica,
        "observacoes_internas": ficha.observacoes_internas,
        "finalidade": ficha.finalidade,
        "status": ficha.status,
        "anonimizacao_validada": ficha.anonimizacao_validada,
        "curador_id": ficha.curador_id,
        "criado_em": ficha.criado_em.isoformat() if ficha.criado_em else None,
        "atualizado_em": ficha.atualizado_em.isoformat() if ficha.atualizado_em else None,
    }


# ---------------------------------------------------------------------
# PATCH /curation/{curation_id}  -> edita os campos de classificacao
# ---------------------------------------------------------------------
@router.patch("/{curation_id}")
def editar_curadoria(
    curation_id: int,
    dados: CurationUpdate,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    """
    Atualiza parcialmente os campos de classificacao de uma ficha (so os
    campos enviados). Nao altera `status` - isso continua exclusivo de
    approve/discard/request-review/apply-review-decision. So permite editar
    fichas ainda 'pendente' ou 'em_analise'.
    """
    ficha = _buscar_ficha(db, curation_id)

    if ficha.status not in STATUS_EDITAVEIS:
        raise HTTPException(
            status_code=409,
            detail=(
                f"A ficha {curation_id} esta '{ficha.status}' (ja finalizada ou em "
                f"revisao) e nao pode mais ser editada."
            ),
        )

    if dados.dentes:
        invalidos = [d for d in dados.dentes if d not in DENTES_PERMANENTES]
        if invalidos:
            raise HTTPException(
                status_code=422,
                detail=f"Dentes invalidos (use apenas 11-48, notacao FDI): {invalidos}",
            )

    idade_min_final = dados.idade_min if dados.idade_min is not None else ficha.idade_min
    idade_max_final = dados.idade_max if dados.idade_max is not None else ficha.idade_max
    for rotulo, valor in (("idade_min", idade_min_final), ("idade_max", idade_max_final)):
        if valor is not None and not (0 <= valor <= 120):
            raise HTTPException(status_code=422, detail=f"{rotulo} deve estar entre 0 e 120.")
    if (
        idade_min_final is not None
        and idade_max_final is not None
        and idade_min_final > idade_max_final
    ):
        raise HTTPException(status_code=422, detail="idade_min nao pode ser maior que idade_max.")

    if dados.modalidade is not None:
        ficha.modalidade = dados.modalidade.value
    if dados.tipo_radiografia is not None:
        ficha.tipo_radiografia = dados.tipo_radiografia.value
    if dados.dentes is not None:
        ficha.dentes = dados.dentes
    if dados.idade_min is not None:
        ficha.idade_min = dados.idade_min
    if dados.idade_max is not None:
        ficha.idade_max = dados.idade_max
    if dados.genero is not None:
        ficha.genero = dados.genero.value
    if dados.achado_principal is not None:
        ficha.achado_principal = dados.achado_principal.value
    if dados.achados_detalhe is not None:
        ficha.achados_detalhe = dados.achados_detalhe
    if dados.qualidade_tecnica is not None:
        ficha.qualidade_tecnica = dados.qualidade_tecnica.value
    if dados.dificuldade is not None:
        ficha.dificuldade = dados.dificuldade.value
    if dados.descricao_didatica is not None:
        ficha.descricao_didatica = dados.descricao_didatica
    if dados.observacoes_internas is not None:
        ficha.observacoes_internas = dados.observacoes_internas
    if dados.finalidade is not None:
        ficha.finalidade = dados.finalidade.value
    if dados.anonimizacao_validada is not None:
        ficha.anonimizacao_validada = dados.anonimizacao_validada

    _registrar_historico(
        db, ficha.id, usuario.id, "edicao",
        ficha.status, ficha.status, "Campos de classificacao da ficha editados.",
    )
    _registrar_auditoria(
        db, usuario.id, "edicao_curadoria", ficha.id, "sucesso",
        f"Ficha {ficha.id} editada por usuario {usuario.id}.",
    )
    db.commit()
    db.refresh(ficha)

    return {
        "mensagem": "Ficha atualizada com sucesso.",
        "id": ficha.id,
        "orthanc_reference_id": ficha.orthanc_reference_id,
        "modalidade": ficha.modalidade,
        "tipo_radiografia": ficha.tipo_radiografia,
        "dentes": ficha.dentes,
        "idade_min": ficha.idade_min,
        "idade_max": ficha.idade_max,
        "genero": ficha.genero,
        "achado_principal": ficha.achado_principal,
        "achados_detalhe": ficha.achados_detalhe,
        "qualidade_tecnica": ficha.qualidade_tecnica,
        "dificuldade": ficha.dificuldade,
        "descricao_didatica": ficha.descricao_didatica,
        "observacoes_internas": ficha.observacoes_internas,
        "finalidade": ficha.finalidade,
        "status": ficha.status,
        "anonimizacao_validada": ficha.anonimizacao_validada,
        "atualizado_em": ficha.atualizado_em.isoformat() if ficha.atualizado_em else None,
    }


# ---------------------------------------------------------------------
# GET /curation/{curation_id}/reviews  -> historico de segundas opinioes
# ---------------------------------------------------------------------
@router.get("/{curation_id}/reviews")
def listar_reviews_da_ficha(
    curation_id: int,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    """Lista o historico de segundas opinioes (CurationReview) de uma ficha."""
    _buscar_ficha(db, curation_id)

    reviews = (
        db.query(CurationReview)
        .filter(CurationReview.curation_id == curation_id)
        .order_by(CurationReview.id)
        .all()
    )

    itens = [
        {
            "id": r.id,
            "solicitante_id": r.solicitante_id,
            "motivo": r.motivo,
            "primeiro_parecer": r.primeiro_parecer,
            "revisor_id": r.revisor_id,
            "parecer_revisor": r.parecer_revisor,
            "concordancia": r.concordancia,
            "decisao_final": r.decisao_final,
            "observacoes": r.observacoes,
            "status": r.status,
            "criado_em": r.criado_em.isoformat() if r.criado_em else None,
            "respondido_em": r.respondido_em.isoformat() if r.respondido_em else None,
        }
        for r in reviews
    ]

    return {
        "curation_id": curation_id,
        "quantidade": len(itens),
        "itens": itens,
    }


# ---------------------------------------------------------------------
# POST /curation/{orthanc_reference_id}  -> cria a ficha
# ---------------------------------------------------------------------
@router.post("/{orthanc_reference_id}")
def criar_curadoria(
    orthanc_reference_id: int,
    dados: CurationCreate,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    """Cria a ficha de curadoria de uma imagem (status inicial: em_analise)."""

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
    if not imagem.ativo:
        raise HTTPException(
            status_code=409,
            detail=f"Imagem {orthanc_reference_id} esta desativada e nao pode receber uma nova ficha.",
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


def _executar_aprovacao(db, ficha, usuario, anonimizacao_validada, observacoes, acao="aprovacao", origem=""):
    """
    Aplica a aprovacao a uma ficha. Regra LGPD: so libera com anonimizacao validada.
    Compartilhado por /approve e /apply-review-decision.
    """
    if not anonimizacao_validada:
        _registrar_auditoria(
            db, usuario.id, acao, ficha.id, "negado",
            f"Tentativa de aprovar sem anonimizacao validada.{origem}",
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
        db, ficha.id, usuario.id, acao,
        status_anterior, StatusCuradoria.APROVADA.value,
        (observacoes or "Ficha aprovada.") + origem,
    )
    _registrar_auditoria(
        db, usuario.id, acao, ficha.id, "sucesso",
        f"Ficha aprovada por usuario {usuario.id}.{origem}",
    )


def _executar_descarte(db, ficha, usuario, motivo, acao="descarte", origem=""):
    """
    Aplica o descarte a uma ficha. Exige justificativa.
    Compartilhado por /discard e /apply-review-decision.
    """
    motivo_limpo = (motivo or "").strip()
    if not motivo_limpo:
        raise HTTPException(status_code=422, detail="O descarte exige uma justificativa (motivo).")

    status_anterior = ficha.status
    ficha.status = StatusCuradoria.DESCARTADA.value

    _registrar_historico(
        db, ficha.id, usuario.id, acao,
        status_anterior, StatusCuradoria.DESCARTADA.value, motivo_limpo + origem,
    )
    _registrar_auditoria(
        db, usuario.id, acao, ficha.id, "sucesso",
        f"Ficha descartada por usuario {usuario.id}. Motivo: {motivo_limpo}{origem}",
    )
    return motivo_limpo


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
    review.decisao_final = _valor(dados.decisao_final)
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