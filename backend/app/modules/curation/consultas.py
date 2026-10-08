"""
Consultas/leitura de curadoria: fila de imagens pendentes, fila de
segundas opinioes pendentes, link do OHIF, series/preview de uma imagem
ainda sem ficha, ficha completa e historico de segundas opinioes de uma
ficha.
"""

from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Query, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.modules.auth import exigir_perfis, PERFIS_CURADORIA
from app.modules.users import User
from app.modules.orthanc_references import OrthancReference
from app.modules import orthanc_client
from app.modules.curations import Curation, CurationHistory, CurationReview, StatusCuradoria, StatusRevisao

from .common import _buscar_ficha
from .router import router


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
# GET /curation/reviews/answered  -> fila de segundas opinioes ja
# respondidas, aguardando a decisao final de quem solicitou
# ---------------------------------------------------------------------
@router.get("/reviews/answered")
def listar_reviews_respondidas(
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    """
    Lista as solicitacoes de segunda opiniao com status 'respondida' (o
    revisor ja deu o parecer, falta aplicar a decisao final via
    POST /{curation_id}/apply-review-decision) - somente as que o usuario
    autenticado solicitou, pra cada curador so ver o que ele mesmo pediu.
    Mesmo formato de contexto (ficha + imagem) de GET /reviews/pending; o
    parecer do revisor (concordancia/parecer_revisor/decisao_final) fica
    fora daqui de proposito - ja existe em GET /{curation_id}/reviews.
    """
    resultados = (
        db.query(CurationReview, Curation, OrthancReference)
        .join(Curation, Curation.id == CurationReview.curation_id)
        .join(OrthancReference, OrthancReference.id == Curation.orthanc_reference_id)
        .filter(
            CurationReview.status == StatusRevisao.RESPONDIDA.value,
            CurationReview.solicitante_id == usuario.id,
        )
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

    # O nome da data source ('dicomweb') precisa ir no PATH da rota do OHIF v3,
    # nao so configurado no app-config.js - sem isso /viewer sozinho cai numa
    # rota generica diferente (a de "abrir por URL direta"), que reclama
    # "No URL was specified. Use ?url=$yourURL" mesmo com StudyInstanceUIDs
    # presente na query string.
    viewer_url = (
        f"{settings.OHIF_BASE_URL}/viewer/dicomweb"
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
# GET /curation/{orthanc_reference_id}/series  -> series do estudo (fila de curadoria)
# ---------------------------------------------------------------------
@router.get("/{orthanc_reference_id}/series")
def obter_series_do_estudo_pendente(
    orthanc_reference_id: int,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    """
    Lista as series ("pastas" de imagens) do estudo dessa imagem - mesma
    logica de /search/{curation_id}/series, mas sem exigir ficha aprovada
    (usada na coluna de series da tela de Curadoria, onde a imagem ainda
    esta sendo analisada).
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

    detalhes_instancia = orthanc_client.obter_detalhes_instancia(imagem.orthanc_id)
    detalhes_serie = orthanc_client.obter_detalhes_serie(detalhes_instancia["ParentSeries"])
    orthanc_study_id = detalhes_serie["ParentStudy"]
    series = orthanc_client.listar_series_do_estudo(orthanc_study_id)
    return {"series": series}


# ---------------------------------------------------------------------
# GET /curation/{orthanc_reference_id}/preview  -> miniatura PNG (fila de curadoria)
# ---------------------------------------------------------------------
@router.get("/{orthanc_reference_id}/preview")
def obter_preview_pendente(
    orthanc_reference_id: int,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    """
    Renderizacao PNG (mesmo janelamento automatico do Orthanc usado em
    /search/{curation_id}/preview) para uma imagem ainda sem ficha
    aprovada - usada como miniatura na fila lateral da tela de Curadoria.
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

    conteudo = orthanc_client.obter_preview_instancia(imagem.orthanc_id)
    return Response(content=conteudo, media_type="image/png")


# ---------------------------------------------------------------------
# GET /curation/minhas-estatisticas -> resumo pessoal do curador (mes atual)
#
# Precisa vir ANTES de GET /{curation_id} abaixo: como "minhas-estatisticas"
# tambem tem 1 segmento de path, se essa rota literal fosse registrada
# DEPOIS da rota dinamica {curation_id}, o FastAPI tentaria converter
# "minhas-estatisticas" pra int (curation_id) e devolveria 422 antes mesmo
# de considerar esta rota - Starlette resolve por ordem de registro, nao
# por especificidade.
# ---------------------------------------------------------------------
@router.get("/minhas-estatisticas")
def obter_minhas_estatisticas(
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    """
    Resumo pessoal do curador autenticado, referente ao mes corrente:
    quantas fichas ele aprovou e sua posicao no ranking de volume de
    curadorias (fichas que passaram pelas maos dele, em qualquer status -
    mesmo criterio do "por_curador" de GET /admin/stats). Devolve so a
    POSICAO e o TOTAL de curadores no mes - nunca nome, id ou contagem de
    outro curador - pra dar uma nocao de classificacao sem expor
    desempenho individual de colegas.
    """
    agora = datetime.now(timezone.utc)
    inicio_mes = datetime(agora.year, agora.month, 1, tzinfo=timezone.utc)

    # CurationHistory (nao Curation.status) porque guarda o momento exato
    # de CADA aprovacao (status_novo == aprovada), inclusive as vindas de
    # segunda opiniao (acao "aprovacao_pos_segunda_opiniao") - Curation so
    # tem o status ATUAL, sem historico de quando cada transicao ocorreu.
    aprovadas_no_mes = (
        db.query(func.count(CurationHistory.id))
        .filter(
            CurationHistory.usuario_id == usuario.id,
            CurationHistory.status_novo == StatusCuradoria.APROVADA.value,
            CurationHistory.criado_em >= inicio_mes,
        )
        .scalar()
    ) or 0

    contagem_por_curador = dict(
        db.query(Curation.curador_id, func.count(Curation.id))
        .filter(Curation.curador_id.isnot(None), Curation.criado_em >= inicio_mes)
        .group_by(Curation.curador_id)
        .all()
    )

    curadorias_no_mes = contagem_por_curador.get(usuario.id, 0)
    total_curadores = len(contagem_por_curador)
    # So entra no ranking quem tem pelo menos 1 curadoria no mes - sem
    # isso, um curador com 0 curadorias (fora do dict acima) contaria
    # como "pior que todo mundo" e sairia com posicao = total_curadores + 1
    # (ex.: "4a de 3"), o que nao faz sentido pra exibir.
    posicao_ranking = (
        1 + sum(1 for total in contagem_por_curador.values() if total > curadorias_no_mes)
        if usuario.id in contagem_por_curador
        else None
    )

    return {
        "aprovadas_no_mes": aprovadas_no_mes,
        "curadorias_no_mes": curadorias_no_mes,
        "posicao_ranking": posicao_ranking,
        "total_curadores": total_curadores,
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
        "marcacoes": ficha.marcacoes,
        "achados_detalhe": ficha.achados_detalhe,
        "alteracoes_observadas": ficha.alteracoes_observadas,
        "qualidade_tecnica": ficha.qualidade_tecnica,
        "dificuldade": ficha.dificuldade,
        "descricao_didatica": ficha.descricao_didatica,
        "observacoes_internas": ficha.observacoes_internas,
        "status": ficha.status,
        "anonimizacao_validada": ficha.anonimizacao_validada,
        "curador_id": ficha.curador_id,
        "criado_em": ficha.criado_em.isoformat() if ficha.criado_em else None,
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
