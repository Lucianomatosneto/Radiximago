"""
Roteador Administrativo - Fase 6 (backend).

Endpoints (somente administrador):
- GET /admin/stats       -> indicadores para o dashboard
- GET /admin/audit-logs  -> consulta da auditoria (com filtros)
- GET /admin/settings    -> configuracoes NAO sensiveis do backend

Fornece a "materia-prima" numerica para os paineis do frontend.
"""

from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.modules.auth import exigir_perfis, PERFIS_ADMIN, PERFIS_CURADORIA
from app.modules.users import User, UserRole
from app.modules.orthanc_references import OrthancReference
from app.modules.audit_logs import AuditLog
from app.modules.curations import Curation, StatusCuradoria

router = APIRouter(prefix="/admin", tags=["Administracao"])


def _contar_por(db, coluna):
    """Conta fichas de curadoria agrupadas por uma coluna. Retorna dict {valor: total}."""
    linhas = (
        db.query(coluna, func.count(Curation.id))
        .group_by(coluna)
        .all()
    )
    return {(valor if valor is not None else "nao_informado"): total for valor, total in linhas}


# Situacoes de uma imagem ATIVA, sem sobreposicao: cada imagem cai em
# exatamente UMA delas, entao a soma de todas = total de imagens ativas.
SITUACOES_IMAGEM = ("sem_ficha", "pendente", "em_analise", "segunda_opiniao", "aprovada", "descartada", "baixa_qualidade")


def contar_imagens_por_situacao(db: Session) -> dict:
    """CONTAGEM UNICA de imagens, usada por todos os paineis (Inicio, Painel
    administrativo, Relatorios) para que os numeros sempre batam:

    - conta IMAGENS ativas (orthanc_references.ativo), nao fichas;
    - imagem sem ficha = "sem_ficha" (esta na fila da Curadoria);
    - "aguardando_curadoria" = sem_ficha + pendente + em_analise;
    - total = soma de todas as situacoes (conferido aqui mesmo);
    - imagens desativadas ficam fora do total e sao informadas a parte.
    Cada imagem tem no maximo uma ficha (regra garantida ao criar a ficha).
    """
    linhas = (
        db.query(Curation.status, func.count(OrthancReference.id))
        .select_from(OrthancReference)
        .outerjoin(Curation, Curation.orthanc_reference_id == OrthancReference.id)
        .filter(OrthancReference.ativo.is_(True))
        .group_by(Curation.status)
        .all()
    )
    por_situacao = {s: 0 for s in SITUACOES_IMAGEM}
    for status, total in linhas:
        chave = status if status is not None else "sem_ficha"
        por_situacao[chave] = por_situacao.get(chave, 0) + total
    total = sum(por_situacao.values())
    desativadas = db.query(func.count(OrthancReference.id)).filter(OrthancReference.ativo.is_(False)).scalar() or 0
    return {
        "total": total,
        "aguardando_curadoria": por_situacao["sem_ficha"] + por_situacao["pendente"] + por_situacao["em_analise"],
        "por_situacao": por_situacao,
        "desativadas": desativadas,
    }


@router.get("/stats")
def obter_indicadores(
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    """
    Indicadores gerais para o dashboard administrativo e para a tela de
    Relatórios. Sao contagens agregadas (sem PII individual), por isso
    tambem liberado pra curador - nao so admin/suporte.
    """
    imagens = contar_imagens_por_situacao(db)
    total_imagens = imagens["total"]
    total_fichas = db.query(func.count(Curation.id)).scalar()
    usuarios_ativos = (
        db.query(func.count(User.id))
        .filter(User.ativo == True, User.bloqueado == False)
        .scalar()
    )
    usuarios_bloqueados = (
        db.query(func.count(User.id))
        .filter(User.bloqueado == True)
        .scalar()
    )
    alunos_ativos = (
        db.query(func.count(User.id))
        .filter(User.perfil == UserRole.estudante, User.ativo == True, User.bloqueado == False)
        .scalar()
    )
    # mesmos numeros da contagem unica (imagens ativas) - antes vinham de
    # consultas separadas sobre fichas e nao batiam com o total
    aguardando_laudo = imagens["aguardando_curadoria"]
    divergencias_abertas = imagens["por_situacao"]["segunda_opiniao"]

    # Atividade recente: ultimas fichas movimentadas. Sem dado de paciente
    # (removido na ingestao, conforme LGPD) - mostra o que de fato existe:
    # tipo de exame, curador responsavel, status e data da ultima mudanca.
    atividade_recente = (
        db.query(Curation, User.nome)
        .outerjoin(User, Curation.curador_id == User.id)
        .order_by(func.coalesce(Curation.atualizado_em, Curation.criado_em).desc())
        .limit(8)
        .all()
    )

    return {
        # total de imagens ATIVAS = soma exata de imagens.por_situacao
        "total_imagens_orthanc": total_imagens,
        "imagens": imagens,
        "total_fichas_curadoria": total_fichas,
        "usuarios_ativos": usuarios_ativos,
        "usuarios_bloqueados": usuarios_bloqueados,
        "alunos_ativos": alunos_ativos,
        "aguardando_laudo": aguardando_laudo,
        "divergencias_abertas": divergencias_abertas,
        "atividade_recente": [
            {
                "id": ficha.id,
                "tipo_radiografia": ficha.tipo_radiografia,
                "curador_nome": curador_nome,
                "status": ficha.status,
                "data": (ficha.atualizado_em or ficha.criado_em),
            }
            for ficha, curador_nome in atividade_recente
        ],
        "por_status": _contar_por(db, Curation.status),
        "por_tipo_radiografia": _contar_por(db, Curation.tipo_radiografia),
        "por_achado_principal": _contar_por(db, Curation.achado_principal),
        "por_dificuldade": _contar_por(db, Curation.dificuldade),
        "por_qualidade_tecnica": _contar_por(db, Curation.qualidade_tecnica),
        "por_curador": _contar_por(db, Curation.curador_id),
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


@router.get("/settings")
def obter_configuracoes(
    usuario: User = Depends(exigir_perfis(*PERFIS_ADMIN)),
):
    """
    Configuracoes NAO sensiveis do backend, para a tela de Configuracoes.

    NUNCA inclui aqui: DATABASE_URL, JWT_SECRET_KEY, ORTHANC_USERNAME ou
    ORTHANC_PASSWORD - essas continuam apenas no ambiente do servidor.
    """
    return {
        "orthanc_url": settings.ORTHANC_URL,
        "dicomweb_url": settings.DICOMWEB_URL,
        "ohif_base_url": settings.OHIF_BASE_URL,
        "max_upload_size_mb": settings.MAX_UPLOAD_SIZE_MB,
        "environment": settings.ENVIRONMENT,
        "jwt_algorithm": settings.JWT_ALGORITHM,
        "jwt_expire_minutes": settings.JWT_EXPIRE_MINUTES,
    }