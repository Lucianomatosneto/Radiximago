"""
Consultas/leitura de curadoria: fila de imagens pendentes, fila de
segundas opinioes pendentes, link do OHIF, series/preview de uma imagem
ainda sem ficha, ficha completa e historico de segundas opinioes de uma
ficha.
"""

from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Query, Response
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.core.cabecalhos import disposicao_de_arquivo
from app.core.config import settings
from app.core.database import get_db
from app.modules.auth import exigir_perfis, PERFIS_CURADORIA, PERFIS_FICHA_LEITURA
from app.modules.users import User
from app.modules.orthanc_references import (
    DestinoImagem, OrthancReference, contar_cortes, cortes_da_serie, filtro_exame_unico, texto_do_exame,
    visivel_para,
)
from app.modules import orthanc_client
from app.modules.geometria_imagem import RECORTADA, SEM_BORDA
from app.modules.curations import (
    so_fichas_ativas,
    Curation, CurationHistory, CurationReview, CurationReviewNote, SituacaoAnotacao, StatusCuradoria, StatusRevisao,
    TipoRadiografia,
)

from app.modules.vocabulario import CurationTermo
from app.modules.achados import Achado, ErroTecnico
from .common import STATUS_EDITAVEIS, _buscar_ficha
from .router import router


# imagens que podem ser curadas: sem moldura (ver listar_pendentes)
ENQUADRAMENTOS_PRONTOS_PARA_CURADORIA = (RECORTADA, SEM_BORDA)


def _nomes_usuarios(db: Session, ids: set[int]) -> dict[int, str]:
    """Nome de cada usuario (quem pediu / quem revisou a segunda opiniao)."""
    if not ids:
        return {}
    return dict(db.query(User.id, User.nome).filter(User.id.in_(ids)).all())



def _perfil(usuario: User) -> str:
    return usuario.perfil.value if hasattr(usuario.perfil, "value") else str(usuario.perfil)


# ---------------------------------------------------------------------
# GET /curation/pending
# ---------------------------------------------------------------------
# Filtro da fila por modalidade (23/11/2026): os tipos de radiografia, o
# "intraoral" do reconhecimento automatico e as imagens sem tipo conhecido
NAO_INFORMADO = "nao_informado"
FILTROS_TIPO = [t.value for t in TipoRadiografia] + ["intraoral", NAO_INFORMADO]


@router.get("/pending")
def listar_pendentes(
    skip: int = Query(0, ge=0, description="Quantos registros pular (paginacao)"),
    limit: int = Query(50, ge=1, le=200, description="Maximo de registros a retornar"),
    tipo: str | None = Query(None, max_length=20, description="Modalidade preliminar (ver FILTROS_TIPO)"),
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    """
    Lista as imagens ainda sem ficha de curadoria.

    So entram imagens SEM MOLDURA (pedido de 20/10/2026, inicio da curadoria
    profissional): a moldura ja foi recortada ("recortada") ou nunca existiu
    ("sem_borda"). As "incertas", as nao verificadas e as recebidas antes do
    recorte automatico (enquadramento vazio) ficam fora da fila ate passarem
    pelo recorte (roteiro recortar_molduras.py) - ver geometria_imagem.py.
    """

    # etapa C (08/11/2026): entram tambem as SUGESTOES de professor ja
    # enviadas e ainda nao assumidas por um curador (ficha ja preenchida)
    sugestao_aguardando = and_(
        Curation.sugestao_enviada_em.isnot(None),
        Curation.status == StatusCuradoria.EM_ANALISE.value,
        Curation.curador_id.is_(None),
    )
    # Tomografia (18/11/2026): um exame em volume entra na fila como UM item -
    # o primeiro corte que chegou (os demais cortes da mesma serie ficam fora
    # da fila; a ficha dele vale para o exame inteiro e o visualizador abre
    # o estudo completo). Radiografias nao sao afetadas (em_volume = falso).
    nao_e_corte_seguinte = filtro_exame_unico()
    # 23/11/2026 (pedido do Luciano): abrir uma imagem ja cria a ficha; quem
    # saia sem aprovar perdia a imagem de vista. As fichas EM ANDAMENTO do
    # PROPRIO curador voltam para a fila, para continuar (as de outro
    # curador continuam fora - cada um cuida das suas).
    minha_em_andamento = and_(
        Curation.curador_id == usuario.id,
        Curation.status.in_(STATUS_EDITAVEIS),
    )
    # 24/11/2026 (pedido do Luciano, opcao A): o ADMINISTRADOR ve tambem as
    # fichas em andamento de QUALQUER curador (ex.: as 2 tomografias abertas
    # pelo "Curador Demonstracao"); ao abrir, ele assume a ficha (ficha.py).
    if _perfil(usuario) == "administrador":
        minha_em_andamento = and_(
            Curation.curador_id.isnot(None),
            Curation.status.in_(STATUS_EDITAVEIS),
        )
    if tipo is not None and tipo not in FILTROS_TIPO:
        raise HTTPException(status_code=422, detail="Modalidade desconhecida.")
    # modalidade preliminar (23/11/2026): a sugestao de professor ja tem o
    # tipo na ficha; as demais usam o tipo conhecido na entrada da imagem
    tipo_da_fila = func.coalesce(Curation.tipo_radiografia, OrthancReference.tipo_preliminar, NAO_INFORMADO)
    consulta_toda = (
        db.query(OrthancReference, Curation.id, Curation.sugerida_por_id, tipo_da_fila, Curation.curador_id)
        .outerjoin(Curation, Curation.orthanc_reference_id == OrthancReference.id)
        .filter(or_(Curation.id.is_(None), sugestao_aguardando, minha_em_andamento))
        .filter(OrthancReference.ativo.is_(True))
        # etapa B (08/11/2026): imagens "so para mim" e em analise nao entram
        .filter(OrthancReference.destino == DestinoImagem.FILA.value)
        .filter(OrthancReference.enquadramento.in_(ENQUADRAMENTOS_PRONTOS_PARA_CURADORIA))
        .filter(nao_e_corte_seguinte)
        .order_by(OrthancReference.id)
    )
    # contagem de CADA modalidade na fila inteira (para o curador escolher)
    por_tipo = {
        valor: total
        for valor, total in consulta_toda.order_by(None)
        .with_entities(tipo_da_fila, func.count(OrthancReference.id))
        .group_by(tipo_da_fila)
        .all()
    }
    consulta_base = consulta_toda.filter(tipo_da_fila == tipo) if tipo else consulta_toda

    total_pendentes = consulta_base.count()
    # 01/11/2026 (QA item 9): imagens sem ficha que AINDA nao entram na fila
    # (moldura incerta / nao recortada) - a tela explica a diferenca entre a
    # fila e o "Aguardando curadoria" de Imagens recebidas
    aguardando_recorte = (
        db.query(OrthancReference.id)
        .outerjoin(Curation, Curation.orthanc_reference_id == OrthancReference.id)
        .filter(Curation.id.is_(None), OrthancReference.ativo.is_(True),
                OrthancReference.destino == DestinoImagem.FILA.value)
        .filter(or_(OrthancReference.enquadramento.is_(None),
                    OrthancReference.enquadramento.notin_(ENQUADRAMENTOS_PRONTOS_PARA_CURADORIA)))
        .filter(nao_e_corte_seguinte)
        .count()
    )
    registros = consulta_base.offset(skip).limit(limit).all()
    cortes = contar_cortes(db, [ref for ref, *_ in registros])

    ids_nomes = {sid for _, _, sid, *_ in registros if sid} | {
        cid for *_, cid in registros if cid is not None and cid != usuario.id}
    nomes = {u.id: u.nome for u in db.query(User).filter(User.id.in_(ids_nomes))} if ids_nomes else {}
    itens = [
        {
            "curation_id": curation_id,
            "sugerida_por": nomes.get(sugerida_por_id),
            "orthanc_reference_id": ref.id,
            "orthanc_id": ref.orthanc_id,
            "study_instance_uid": ref.study_instance_uid,
            "series_instance_uid": ref.series_instance_uid,
            "sop_instance_uid": ref.sop_instance_uid,
            "resource_type": ref.resource_type,
            "dicomweb_url": ref.dicomweb_url,
            # exame em volume: quantos cortes a ficha vai cobrir (1 = radiografia)
            "em_volume": ref.em_volume,
            "cortes": cortes[ref.id],
            # modalidade preliminar (23/11/2026); None = nao informado
            "tipo_preliminar": None if tipo_item == NAO_INFORMADO else tipo_item,
            # ficha que ESTE curador ja abriu e nao terminou (continuar)
            "em_andamento": curation_id is not None and curador_id == usuario.id,
            # ficha em andamento de OUTRO curador (so o administrador ve):
            # nome de quem esta com ela; abrir = assumir (24/11/2026)
            "em_andamento_de": nomes.get(curador_id) if curation_id is not None and curador_id not in (None, usuario.id) else None,
        }
        for ref, curation_id, sugerida_por_id, tipo_item, curador_id in registros
    ]

    return {
        "total_pendentes": total_pendentes,
        "por_tipo": por_tipo,
        "aguardando_recorte": aguardando_recorte,
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

    nomes = _nomes_usuarios(db, {r.solicitante_id for r, _, _ in resultados})
    itens = [
        {
            "id": review.id,
            "motivo": review.motivo,
            "primeiro_parecer": review.primeiro_parecer,
            "criado_em": review.criado_em.isoformat() if review.criado_em else None,
            # quem pediu (nome) e se ESTE usuario pode responder (nao pode a propria)
            "solicitante": {"id": review.solicitante_id, "nome": nomes.get(review.solicitante_id)},
            "pode_responder": review.solicitante_id != usuario.id,
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

    nomes = _nomes_usuarios(db, {r.revisor_id for r, _, _ in resultados if r.revisor_id})
    pendentes: dict[int, int] = dict(
        db.query(CurationReviewNote.review_id, func.count(CurationReviewNote.id))
        .filter(
            CurationReviewNote.review_id.in_([r.id for r, _, _ in resultados] or [0]),
            CurationReviewNote.situacao == SituacaoAnotacao.PENDENTE.value,
        )
        .group_by(CurationReviewNote.review_id)
        .all()
    )
    itens = [
        {
            "id": review.id,
            "motivo": review.motivo,
            "primeiro_parecer": review.primeiro_parecer,
            "criado_em": review.criado_em.isoformat() if review.criado_em else None,
            "respondido_em": review.respondido_em.isoformat() if review.respondido_em else None,
            "revisor": {"id": review.revisor_id, "nome": nomes.get(review.revisor_id)} if review.revisor_id else None,
            "classificacao": review.classificacao,
            "concordancia": review.concordancia,
            "anotacoes_pendentes": pendentes.get(review.id, 0),
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
    usuario: User = Depends(exigir_perfis(*PERFIS_FICHA_LEITURA)),
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
    if not imagem or not visivel_para(imagem, usuario.id, _perfil(usuario)):
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
        # posicao da imagem (girar na Curadoria) e resultado do recorte da moldura
        "giro_graus": imagem.giro_graus or 0,
        "enquadramento": imagem.enquadramento,
    }


# ---------------------------------------------------------------------
# GET /curation/{orthanc_reference_id}/series  -> series do estudo (fila de curadoria)
# ---------------------------------------------------------------------
@router.get("/{orthanc_reference_id}/series")
def obter_series_do_estudo_pendente(
    orthanc_reference_id: int,
    usuario: User = Depends(exigir_perfis(*PERFIS_FICHA_LEITURA)),
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
    if not imagem or not visivel_para(imagem, usuario.id, _perfil(usuario)):
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
    usuario: User = Depends(exigir_perfis(*PERFIS_FICHA_LEITURA)),
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
    if not imagem or not visivel_para(imagem, usuario.id, _perfil(usuario)):
        raise HTTPException(
            status_code=404,
            detail=f"Imagem {orthanc_reference_id} nao encontrada em orthanc_references.",
        )

    conteudo = orthanc_client.obter_preview_instancia(imagem.orthanc_id)
    return Response(
        content=conteudo,
        media_type="image/png",
        headers={"Content-Disposition": disposicao_de_arquivo(f"radix-imago-imagem-{imagem.id}.png")},
    )


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
        so_fichas_ativas(db.query(func.count(CurationHistory.id)).join(Curation, Curation.id == CurationHistory.curation_id))
        .filter(
            CurationHistory.usuario_id == usuario.id,
            CurationHistory.status_novo == StatusCuradoria.APROVADA.value,
            CurationHistory.criado_em >= inicio_mes,
        )
        .scalar()
    ) or 0

    contagem_por_curador: dict[int, int] = dict(
        so_fichas_ativas(db.query(Curation.curador_id, func.count(Curation.id)))
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

    # "Meus dados" (pedido do video, 22/11/2026): TODAS as fichas do
    # curador logado (nao so do mes), por situacao
    minhas_por_status: dict[str, int] = dict(
        so_fichas_ativas(db.query(Curation.status, func.count(Curation.id)))
        .filter(Curation.curador_id == usuario.id)
        .group_by(Curation.status)
        .all()
    )

    return {
        "aprovadas_no_mes": aprovadas_no_mes,
        "curadorias_no_mes": curadorias_no_mes,
        "posicao_ranking": posicao_ranking,
        "total_curadores": total_curadores,
        "minhas_fichas_total": sum(minhas_por_status.values()),
        "minhas_por_status": minhas_por_status,
    }


# ---------------------------------------------------------------------
# GET /curation/{curation_id}  -> ficha de curadoria completa
# ---------------------------------------------------------------------
@router.get("/{curation_id}")
def obter_ficha(
    curation_id: int,
    usuario: User = Depends(exigir_perfis(*PERFIS_FICHA_LEITURA)),
    db: Session = Depends(get_db),
):
    """Busca uma ficha de curadoria especifica, com todos os campos."""
    ficha = _buscar_ficha(db, curation_id, usuario, escrita=False)
    cortes_exame = cortes_da_serie(db, ficha.orthanc_reference) if ficha.orthanc_reference else []
    texto_exame = texto_do_exame(cortes_exame) if cortes_exame else (None, None)

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
        "regioes_imagem": ficha.regioes_imagem,
        "denticao": ficha.denticao,
        "situacao_dentes": ficha.situacao_dentes,
        "estruturas_extradentais": ficha.estruturas_extradentais,
        "qualidade_tecnica": ficha.qualidade_tecnica,
        "dificuldade": ficha.dificuldade,
        "descricao_didatica": ficha.descricao_didatica,
        "observacoes_internas": ficha.observacoes_internas,
        "informacoes_adicionais": ficha.informacoes_adicionais,
        "status": ficha.status,
        "anonimizacao_validada": ficha.anonimizacao_validada,
        "origem": ficha.orthanc_reference.origem if ficha.orthanc_reference else None,
        # verificacao de texto gravado nos pixels (texto_na_imagem.py) - a tela
        # mostra um aviso ao lado de "Anonimizacao validada" quando o curador
        # precisa conferir a imagem com atencao
        # exame em volume (tomografia, 18/11/2026): o aviso considera TODOS os
        # cortes (pior caso), porque a ficha e a aprovacao valem para o exame
        "texto_na_imagem": texto_exame[0],
        "texto_regioes": texto_exame[1],
        "em_volume": bool(ficha.orthanc_reference and ficha.orthanc_reference.em_volume),
        "cortes": len(cortes_exame),
        "termos": [
            t for (t,) in db.query(CurationTermo.termo_id).filter(CurationTermo.curation_id == ficha.id).all()
        ],
        "curador_id": ficha.curador_id,
        "criado_em": ficha.criado_em.isoformat() if ficha.criado_em else None,
        "atualizado_em": ficha.atualizado_em.isoformat() if ficha.atualizado_em else None,
        # secao unica "Achados" (ver ficha._sincronizar_achados)
        "achados": [
            {
                "tipo": a.tipo,
                "regiao_anatomica": a.regiao_anatomica,
                "dentes": a.dentes or [],
                "dente_nao_identificado": a.dente_nao_identificado,
                "descricao": a.descricao,
                "termo_id": a.termo_id,
                "marcacoes": a.marcacoes or [],
            }
            for a in db.query(Achado).filter(Achado.curation_id == ficha.id).order_by(Achado.id).all()
        ],
        "sem_alteracoes": ficha.achado_principal == "normal",
        "erros_tecnicos": [
            t for (t,) in db.query(ErroTecnico.tipo).filter(ErroTecnico.curation_id == ficha.id).order_by(ErroTecnico.id).all()
        ],
    }


# ---------------------------------------------------------------------
# GET /curation/{curation_id}/reviews  -> historico de segundas opinioes
# ---------------------------------------------------------------------
@router.get("/{curation_id}/reviews")
def listar_reviews_da_ficha(
    curation_id: int,
    usuario: User = Depends(exigir_perfis(*PERFIS_FICHA_LEITURA)),
    db: Session = Depends(get_db),
):
    """Lista o historico de segundas opinioes (CurationReview) de uma ficha."""
    _buscar_ficha(db, curation_id, usuario, escrita=False)

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
            "classificacao": r.classificacao,
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
