"""
Roteador de Pesquisa - Fase 5.

Endpoint:
- GET /search  -> lista as imagens APROVADAS (curadas e liberadas), com filtros.

Regra de ouro (Bloco 4): so retorna imagens com status 'aprovada'.
Acesso: qualquer usuario logado (a pesquisa so expoe o que ja foi liberado).
"""

import io
import zipfile
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.config import settings
from app.core.email import enviar_email_imagem_pesquisa, enviar_email_imagens_pesquisa_lote
from app.modules.auth import obter_usuario_atual
from app.modules.users import User
from app.modules.orthanc_references import OrthancReference, OrigemImagem
from app.modules import orthanc_client
from app.modules.curations import (
    Curation,
    TipoRadiografia,
    Genero,
    AchadoPrincipal,
    QualidadeTecnica,
    Dificuldade,
    StatusCuradoria,
)

router = APIRouter(prefix="/search", tags=["Pesquisa"])

# Faixas de dentes (FDI) por arcada e por lado, para os filtros derivados.
DENTES_SUPERIORES = list(range(11, 29))   # 11-28
DENTES_INFERIORES = list(range(31, 49))   # 31-48
DENTES_DIREITA = list(range(11, 19)) + list(range(41, 49))   # quadrantes 1 e 4
DENTES_ESQUERDA = list(range(21, 29)) + list(range(31, 39))  # quadrantes 2 e 3


def _contar_por(db: Session, coluna) -> dict:
    """Conta, entre as imagens disponiveis pra pesquisa (aprovadas + ativas),
    quantas ha para cada valor da coluna informada."""
    linhas = (
        db.query(coluna, func.count(Curation.id))
        .join(OrthancReference, Curation.orthanc_reference_id == OrthancReference.id)
        .filter(Curation.status == StatusCuradoria.APROVADA.value)
        .filter(OrthancReference.ativo.is_(True))
        .group_by(coluna)
        .all()
    )
    return {(valor if valor is not None else "nao_informado"): total for valor, total in linhas}


@router.get("/counts")
def contagens_disponiveis(
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """
    Contagens de imagens disponiveis pra pesquisa (aprovadas + ativas) - o
    total geral e a quebra por tipo de radiografia/achado/qualidade, usados
    no Banco de Imagens pra mostrar "X imagens" em cada categoria sem
    precisar de uma chamada por card.
    """
    total = (
        db.query(func.count(Curation.id))
        .join(OrthancReference, Curation.orthanc_reference_id == OrthancReference.id)
        .filter(Curation.status == StatusCuradoria.APROVADA.value)
        .filter(OrthancReference.ativo.is_(True))
        .scalar()
    )
    return {
        "total": total,
        "por_tipo_radiografia": _contar_por(db, Curation.tipo_radiografia),
        "por_achado_principal": _contar_por(db, Curation.achado_principal),
        "por_qualidade_tecnica": _contar_por(db, Curation.qualidade_tecnica),
        "por_origem": _contar_por(db, OrthancReference.origem),
    }


class EnvioLotePedido(BaseModel):
    curation_ids: List[int]


@router.post("/send-email-lote")
def enviar_por_email_lote(
    pedido: EnvioLotePedido,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """
    Envia varias imagens selecionadas (ex.: em "Minhas imagens") num unico
    e-mail pro proprio usuario logado - cada uma anexada como PNG.

    Imagens que sao na verdade uma serie com varios cortes (ex.: tomografia)
    NAO podem ser enviadas por e-mail (so pelos downloads em ZIP, na tela do
    visualizador) - a mesma regra ja aplicada no envio de uma unica imagem.
    """
    if not pedido.curation_ids:
        raise HTTPException(status_code=400, detail="Selecione ao menos uma imagem.")

    itens = []
    for curation_id in pedido.curation_ids:
        ficha = _buscar_ficha_aprovada(db, curation_id)
        _, instancias = _instancias_do_estudo_da_ficha(ficha)
        if len(instancias) > 1:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"A imagem #{ficha.id} faz parte de uma série com vários cortes "
                    "e não pode ser enviada por e-mail - use o download em ZIP."
                ),
            )
        conteudo = orthanc_client.obter_preview_instancia(ficha.orthanc_reference.orthanc_id)
        descricao = ficha.descricao_didatica or f"Imagem #{ficha.id} ({ficha.tipo_radiografia or 'radiografia'})"
        itens.append((descricao, conteudo, f"radix-imago-{ficha.id}.png"))

    enviar_email_imagens_pesquisa_lote(usuario.email, usuario.nome, itens)
    return {"mensagem": f"{len(itens)} imagens enviadas para {usuario.email}."}


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
    idade_min: Optional[int] = Query(None, ge=0, le=120),
    idade_max: Optional[int] = Query(None, ge=0, le=120),
    origem: Optional[OrigemImagem] = Query(
        None, description="'ufsc' (recebida direto do equipamento) ou 'externa' (upload manual)"
    ),
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
        .filter(OrthancReference.ativo.is_(True))
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
    if origem is not None:
        consulta = consulta.filter(OrthancReference.origem == origem.value)

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
            "achados_detalhe": ficha.achados_detalhe,
            "alteracoes_observadas": ficha.alteracoes_observadas,
            "marcacoes": ficha.marcacoes,
            "qualidade_tecnica": ficha.qualidade_tecnica,
            "dificuldade": ficha.dificuldade,
            "descricao_didatica": ficha.descricao_didatica,
            "origem": ref.origem,
            "viewer_url": viewer_url,
        })

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "quantidade_retornada": len(itens),
        "itens": itens,
    }


def _buscar_ficha_aprovada(db: Session, curation_id: int) -> Curation:
    """
    Busca uma ficha, mas so devolve se ela estiver aprovada e com a imagem
    ativa - a mesma regra de ouro do /search. 404 tanto se nao existir
    quanto se nao estiver aprovada (nao revela o motivo).
    """
    ficha = (
        db.query(Curation)
        .join(OrthancReference, Curation.orthanc_reference_id == OrthancReference.id)
        .filter(Curation.id == curation_id)
        .filter(Curation.status == StatusCuradoria.APROVADA.value)
        .filter(OrthancReference.ativo.is_(True))
        .first()
    )
    if not ficha:
        raise HTTPException(status_code=404, detail="Imagem não encontrada.")
    return ficha


def _instancias_do_estudo_da_ficha(ficha: Curation) -> tuple[str, list[str]]:
    """
    Devolve (orthanc_study_id, lista_de_instancias) do estudo ao qual a
    ficha pertence - usado pra descobrir se a imagem faz parte de uma serie
    com varios cortes (ex.: tomografia) e pra montar os downloads em lote.
    """
    detalhes_instancia = orthanc_client.obter_detalhes_instancia(ficha.orthanc_reference.orthanc_id)
    detalhes_serie = orthanc_client.obter_detalhes_serie(detalhes_instancia["ParentSeries"])
    orthanc_study_id = detalhes_serie["ParentStudy"]
    instancias = orthanc_client.listar_instancias_do_estudo(orthanc_study_id)
    return orthanc_study_id, instancias


@router.get("/{curation_id}/serie-info")
def obter_info_serie(
    curation_id: int,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """
    Informa se a imagem faz parte de uma serie com varios cortes (ex.:
    tomografia) - usado pelo frontend pra decidir se mostra os botoes de
    download em ZIP (serie) ou o download unico (imagem simples), e se
    mostra ou nao a opcao de enviar por e-mail (so faz sentido pra imagem
    simples, um anexo unico).
    """
    ficha = _buscar_ficha_aprovada(db, curation_id)
    _, instancias = _instancias_do_estudo_da_ficha(ficha)
    return {"eh_serie": len(instancias) > 1, "total_cortes": len(instancias)}


@router.get("/{curation_id}/series")
def obter_series_do_estudo(
    curation_id: int,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """
    Lista as series ("pastas" de imagens) do estudo dessa ficha, cada uma
    com o SeriesInstanceUID real (do Orthanc, nao a coluna do banco) -
    usado pelo frontend pra montar a navegacao entre series dentro do
    mesmo estudo no visualizador em sequencia.
    """
    ficha = _buscar_ficha_aprovada(db, curation_id)
    orthanc_study_id, _ = _instancias_do_estudo_da_ficha(ficha)
    series = orthanc_client.listar_series_do_estudo(orthanc_study_id)
    return {"series": series}


@router.get("/{curation_id}/download/imagens.zip")
def baixar_zip_imagens(
    curation_id: int,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """
    ZIP com todos os cortes da serie ja renderizados em PNG (mesmo
    janelamento automatico do /preview) - abre em qualquer visualizador de
    imagem comum, sem precisar de software DICOM.
    """
    ficha = _buscar_ficha_aprovada(db, curation_id)
    _, instancias = _instancias_do_estudo_da_ficha(ficha)

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zip_arquivo:
        for indice, instancia_id in enumerate(instancias, start=1):
            conteudo = orthanc_client.obter_preview_instancia(instancia_id)
            zip_arquivo.writestr(f"corte_{indice:03d}.png", conteudo)

    return Response(
        content=buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="radix-imago-{curation_id}-imagens.zip"'},
    )


@router.get("/{curation_id}/download/dicom.zip")
def baixar_zip_dicom(
    curation_id: int,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """
    ZIP com os arquivos DICOM originais anonimizados de todos os cortes da
    serie - mantem os metadados DICOM completos, mas exige um software
    especializado (nao um visualizador de imagem comum) pra abrir.
    """
    ficha = _buscar_ficha_aprovada(db, curation_id)
    orthanc_study_id, _ = _instancias_do_estudo_da_ficha(ficha)
    conteudo = orthanc_client.obter_arquivo_zip_estudo(orthanc_study_id)

    return Response(
        content=conteudo,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="radix-imago-{curation_id}-dicom.zip"'},
    )


@router.get("/{curation_id}/preview")
def obter_preview(
    curation_id: int,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """
    Renderizacao PNG da imagem (janelamento automatico do Orthanc) - usada
    pra miniatura na lista de resultados, no visualizador em sequencia, e
    como o proprio arquivo do botao "Baixar" (o link do download aponta
    pra essa mesma rota).
    """
    ficha = _buscar_ficha_aprovada(db, curation_id)
    conteudo = orthanc_client.obter_preview_instancia(ficha.orthanc_reference.orthanc_id)
    return Response(content=conteudo, media_type="image/png")


@router.post("/{curation_id}/send-email")
def enviar_por_email(
    curation_id: int,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """
    Envia a imagem (PNG) por e-mail pro proprio usuario logado - sempre pro
    e-mail cadastrado na conta, sem destinatario livre.
    """
    ficha = _buscar_ficha_aprovada(db, curation_id)
    conteudo = orthanc_client.obter_preview_instancia(ficha.orthanc_reference.orthanc_id)
    descricao = ficha.descricao_didatica or f"Imagem #{ficha.id} ({ficha.tipo_radiografia or 'radiografia'})"
    enviar_email_imagem_pesquisa(
        usuario.email, usuario.nome, descricao, conteudo, f"radix-imago-{ficha.id}.png",
    )
    return {"mensagem": f"Imagem enviada para {usuario.email}."}
