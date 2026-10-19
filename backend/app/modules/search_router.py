"""
Roteador de Pesquisa - Fase 5.

Endpoint:
- GET /search  -> lista as imagens APROVADAS (curadas e liberadas), com filtros.

Regra de ouro (Bloco 4): so retorna imagens com status 'aprovada'.
Acesso: qualquer usuario logado (a pesquisa so expoe o que ja foi liberado).
"""

import io
import logging
import zipfile
from typing import List, Literal, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import and_, exists, func, or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.cabecalhos import disposicao_de_arquivo
from app.core.config import settings
from app.core.email import enviar_email_imagem_pesquisa, enviar_email_imagens_pesquisa_lote
from app.core.rate_limit import (
    LIMITE_DOWNLOAD_ZIP,
    LIMITE_EMAIL_IMAGEM,
    LIMITE_EMAIL_LOTE,
    MAX_CORTES_ZIP_PNG,
    MAX_IMAGENS_EMAIL_LOTE,
    VagaDeTrabalhoPesado,
    limiter,
)
from app.modules.auth import obter_usuario_atual
from app.modules.users import User
from app.modules.orthanc_references import OrthancReference, OrigemImagem
from app.modules import orthanc_client
from app.modules.marcacoes_imagem import desenhar_marcacoes_na_imagem
from app.modules.curations import (
    Curation,
    TipoRadiografia,
    Genero,
    AchadoPrincipal,
    QualidadeTecnica,
    Dificuldade,
    StatusCuradoria,
    DENTES_PERMANENTES,
)
from app.modules.achados import Achado, ErroTecnico, TipoAchado, RegiaoAnatomica, TipoErroTecnico, erros_por_ficha

from app.modules.busca_texto import condicao_busca_texto, condicao_termo

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/search", tags=["Pesquisa"])

# Faixas de dentes (FDI) por arcada e por lado, para os filtros derivados.
DENTES_SUPERIORES = list(range(11, 29))   # 11-28
DENTES_INFERIORES = list(range(31, 49))   # 31-48
DENTES_DIREITA = list(range(11, 19)) + list(range(41, 49))   # quadrantes 1 e 4
DENTES_ESQUERDA = list(range(21, 29)) + list(range(31, 39))  # quadrantes 2 e 3

# Quadrante (FDI) - mesmo principio de arcada/lado acima: SO existe como
# faixa calculada em tempo de consulta, nunca como coluna persistida (Fase
# 4, secao 6/62 - "quadrante e somente conceito de interface"). Reaproveita
# a mesma logica ja usada no frontend (frontend/src/lib/dentesFdi.ts,
# dentesDoQuadrante) so que do lado do banco, pra permitir "Quadrante 4,
# nenhum dente especifico marcado" como filtro por si so (secao 9/10).
DENTES_POR_QUADRANTE = {
    1: list(range(11, 19)),
    2: list(range(21, 29)),
    3: list(range(31, 39)),
    4: list(range(41, 49)),
}


def _chamar_orthanc(descricao_acao: str, funcao, *args, **kwargs):
    """
    Chama uma funcao do orthanc_client protegida por try/except.

    Sem isso, se o Orthanc estiver fora do ar (ou a imagem tiver sido
    removida de la depois de aprovada), o FastAPI deixa a excecao subir sem
    tratamento - o que gera um erro 500 "cru", que o navegador do usuario
    mostra como erro de CORS (confuso, esconde o problema real) em vez de
    uma mensagem clara. Com este helper, todo o modulo devolve sempre um
    erro 502 (Bad Gateway - "o servidor de fora falhou") com uma mensagem
    legivel, e registra o detalhe tecnico no log do backend pra investigar
    depois.
    """
    try:
        return funcao(*args, **kwargs)
    except (httpx.HTTPStatusError, httpx.HTTPError):
        logger.exception("Falha ao comunicar com o Orthanc (%s).", descricao_acao)
        raise HTTPException(
            status_code=502,
            detail=f"Não foi possível {descricao_acao} agora - tente novamente em instantes.",
        )


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
    # teto de anexos por e-mail (ASVS 2.3.2 - docs/REGRAS_DE_NEGOCIO.md)
    curation_ids: List[int] = Field(max_length=MAX_IMAGENS_EMAIL_LOTE)


@router.post("/send-email-lote")
@limiter.limit(LIMITE_EMAIL_LOTE)
def enviar_por_email_lote(
    request: Request,
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
    # a mesma imagem marcada duas vezes vai uma vez so
    for curation_id in dict.fromkeys(pedido.curation_ids):
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
        conteudo = _chamar_orthanc(
            "gerar a imagem para envio por e-mail",
            orthanc_client.obter_preview_instancia,
            ficha.orthanc_reference.orthanc_id,
        )
        descricao = ficha.descricao_didatica or f"Imagem #{ficha.id} ({ficha.tipo_radiografia or 'radiografia'})"
        itens.append((descricao, conteudo, f"radix-imago-{ficha.id}.png"))

    enviar_email_imagens_pesquisa_lote(usuario.email, usuario.nome, itens)
    return {"mensagem": f"{len(itens)} imagens enviadas para {usuario.email}."}


@router.get("")
def pesquisar_imagens(
    tipo_radiografia: Optional[TipoRadiografia] = Query(None),
    dente: Optional[int] = Query(None, description="Numero FDI (11-48) - filtro de um unico dente, mantido por compatibilidade"),
    dentes: Optional[List[int]] = Query(None, description="Varios numeros FDI - combinar com modo_dentes"),
    modo_dentes: Literal["qualquer_um", "todos"] = Query(
        "qualquer_um", description="Como combinar 'dentes': qualquer_um (OR) ou todos (AND)"
    ),
    quadrante: Optional[int] = Query(None, ge=1, le=4, description="1-4 - equivale a filtrar pelos dentes daquele quadrante"),
    arcada: Optional[str] = Query(None, max_length=20, description="'superior' ou 'inferior'"),
    lado: Optional[str] = Query(None, max_length=20, description="'direito' ou 'esquerdo'"),
    achado_principal: Optional[AchadoPrincipal] = Query(None),
    achado: Optional[TipoAchado] = Query(
        None, description="Achado/condicao - busca hibrida (legado + estruturado), ou so estruturado se combinado com dentes/regiao_anatomica"
    ),
    regiao_anatomica: Optional[RegiaoAnatomica] = Query(None, description="So existe no sistema estruturado (Achado)"),
    erro_tecnico: Optional[TipoErroTecnico] = Query(None),
    genero: Optional[Genero] = Query(None),
    qualidade_tecnica: Optional[QualidadeTecnica] = Query(None),
    dificuldade: Optional[Dificuldade] = Query(None),
    idade_min: Optional[int] = Query(None, ge=0, le=120),
    idade_max: Optional[int] = Query(None, ge=0, le=120),
    origem: Optional[OrigemImagem] = Query(
        None, description="'ufsc' (recebida direto do equipamento) ou 'externa' (upload manual)"
    ),
    texto: Optional[str] = Query(
        None, max_length=150,
        description="Busca por palavras nos textos livres (achados detalhados, descricao, 'Outro' das marcacoes) - ver busca_texto.py",
    ),
    termo_id: Optional[int] = Query(None, description="Termo do vocabulario controlado (ver /vocabulario)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """
    Pesquisa imagens aprovadas com filtros opcionais.

    Todos os filtros sao combinados com E (todos precisam bater). Dentro de
    'dentes', o modo (qualquer_um/todos) decide OR/AND entre os numeros.

    Achado/regiao/erro tecnico (Fase 4): 'achado' sozinho consulta o
    legado (alteracoes_observadas) OU o estruturado (Achado.tipo) - os
    dois vocabularios sao identicos, entao a uniao nao precisa de
    normalizacao. Ja 'achado' combinado com 'dentes' e/ou
    'regiao_anatomica' exige que o MESMO registro de Achado satisfaca as
    duas condicoes ao mesmo tempo (EXISTS correlacionado) - o legado nao
    tem como representar essa correlacao (alteracoes_observadas nao
    associa dente nem regiao), entao nesse caso so o estruturado e
    consultado. 'regiao_anatomica'/'erro_tecnico' sozinhos tambem so
    existem no estruturado. Ver relatorio da Fase 4 para o raciocinio
    completo por tras dessa regra.
    """
    # Combinacao incoerente (OWASP ASVS 2.2.3): faixa de idade invertida
    # daria sempre "nenhum resultado" sem explicar o porque.
    if idade_min is not None and idade_max is not None and idade_min > idade_max:
        raise HTTPException(status_code=422, detail="A idade mínima não pode ser maior que a idade máxima.")

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

    # Busca por palavras (texto livre, com sinonimos) e termo do vocabulario.
    if texto:
        condicao = condicao_busca_texto(db, texto)
        if condicao is not None:
            consulta = consulta.filter(condicao)
    if termo_id is not None:
        consulta = consulta.filter(condicao_termo(termo_id))

    # Filtro por dente especifico (o array de dentes contem aquele numero) -
    # mantido exatamente como antes, nenhuma mudanca de comportamento.
    if dente is not None:
        consulta = consulta.filter(Curation.dentes.any(dente))

    # Filtros derivados do dente: arcada e lado - inalterados.
    if arcada == "superior":
        consulta = consulta.filter(Curation.dentes.overlap(DENTES_SUPERIORES))
    elif arcada == "inferior":
        consulta = consulta.filter(Curation.dentes.overlap(DENTES_INFERIORES))
    if lado == "direito":
        consulta = consulta.filter(Curation.dentes.overlap(DENTES_DIREITA))
    elif lado == "esquerdo":
        consulta = consulta.filter(Curation.dentes.overlap(DENTES_ESQUERDA))

    # Multiplos dentes (Fase 4) - QUALQUER UM (overlap/&&) ou TODOS
    # (contains/@>). Validacao de FDI manual (os mesmos 32 numeros
    # permitidos em toda a aplicacao) porque Query(List[int]) nao valida
    # o CONTEUDO da lista sozinho.
    dentes_normalizados: Optional[List[int]] = None
    if dentes:
        invalidos = [d for d in dentes if d not in DENTES_PERMANENTES]
        if invalidos:
            raise HTTPException(
                status_code=422,
                detail=f"Dentes invalidos (use apenas 11-48, notacao FDI): {invalidos}",
            )
        dentes_normalizados = sorted(set(dentes))
        if modo_dentes == "todos":
            consulta = consulta.filter(Curation.dentes.contains(dentes_normalizados))
        else:
            consulta = consulta.filter(Curation.dentes.overlap(dentes_normalizados))

    # Quadrante SEM dentes especificos marcados (secao 9/10): filtro
    # independente por si so - "a ficha tem pelo menos um dente deste
    # quadrante". NAO participa da correlacao com Achado (isso e so pra
    # selecao INDIVIDUAL de dentes, via 'dentes' acima) - e por isso que
    # quadrante e 'dentes' sao parametros separados, nao um so.
    if quadrante is not None:
        consulta = consulta.filter(Curation.dentes.overlap(DENTES_POR_QUADRANTE[quadrante]))

    # Filtros de idade (sobreposicao de faixas) - inalterados.
    if idade_min is not None:
        consulta = consulta.filter(
            (Curation.idade_max.is_(None)) | (Curation.idade_max >= idade_min)
        )
    if idade_max is not None:
        consulta = consulta.filter(
            (Curation.idade_min.is_(None)) | (Curation.idade_min <= idade_max)
        )

    # ------------------------------------------------------------------
    # Achado / regiao anatomica (Fase 4) - estrategia hibrida aprovada na
    # Fase 3.1. 'dentes_normalizados' (selecao INDIVIDUAL de dentes, nao
    # o quadrante sozinho) e reaproveitado aqui como a condicao de
    # correlacao dente<->achado quando presente.
    # ------------------------------------------------------------------
    exige_estrutura = achado is not None and (dentes_normalizados or regiao_anatomica is not None)

    if achado is not None and not exige_estrutura:
        # Achado sozinho (sem dente/regiao) - hibrido: legado OU
        # estruturado. O vocabulario e identico (TipoAchado reaproveita
        # AlteracaoObservada + 'outro'), entao a uniao nao precisa de
        # normalizacao/mapeamento. 'outro' nunca bate no legado (aquele
        # enum nao tem esse valor), entao degrada corretamente pra
        # "so estruturado" sem nenhum tratamento especial.
        consulta = consulta.filter(
            or_(
                Curation.alteracoes_observadas.overlap([achado.value]),
                exists().where(and_(Achado.curation_id == Curation.id, Achado.tipo == achado.value)),
            )
        )
    elif achado is not None or regiao_anatomica is not None:
        # Achado + dente e/ou regiao, OU regiao sozinha: so o sistema
        # estruturado consegue representar essa correlacao (o legado nao
        # associa dente nem regiao a um achado) - EXISTS correlacionado
        # exigindo que o MESMO registro de Achado satisfaca tudo ao mesmo
        # tempo (nao "a ficha tem o dente" E, separadamente, "a ficha tem
        # o achado em outro lugar" - isso daria falso positivo, ver
        # exemplo critico da Fase 4).
        condicoes_achado = [Achado.curation_id == Curation.id]
        if achado is not None:
            condicoes_achado.append(Achado.tipo == achado.value)
        if regiao_anatomica is not None:
            condicoes_achado.append(Achado.regiao_anatomica == regiao_anatomica.value)
        if dentes_normalizados:
            if modo_dentes == "todos":
                condicoes_achado.append(Achado.dentes.contains(dentes_normalizados))
            else:
                condicoes_achado.append(Achado.dentes.overlap(dentes_normalizados))
        consulta = consulta.filter(exists().where(and_(*condicoes_achado)))

    if erro_tecnico is not None:
        consulta = consulta.filter(
            exists().where(
                and_(ErroTecnico.curation_id == Curation.id, ErroTecnico.tipo == erro_tecnico.value)
            )
        )

    consulta = consulta.order_by(Curation.id)
    total = consulta.count()
    resultados = consulta.offset(skip).limit(limit).all()

    erros = erros_por_ficha(db, [r[0].id for r in resultados])
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
            "erros_tecnicos": erros.get(ficha.id, []),
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


# Maior lado da miniatura das grades de escolha. O cartao da Pesquisa tem
# cerca de 300 px e dobra ao usar a lupa: 400 px fica nitido o bastante e
# pesa uma fracao do original (radiografias tem milhares de pixels por lado).
MINIATURA_PX = 400


def reduzir_para_miniatura(conteudo_png: bytes) -> tuple[bytes, str]:
    """Reduz a imagem (mantendo a proporcao) e devolve (JPEG leve, tipo).
    Imagem que ja e pequena volta como esta (reduzir nao ganharia nada)."""
    from PIL import Image

    with Image.open(io.BytesIO(conteudo_png)) as imagem:
        if max(imagem.size) <= MINIATURA_PX:
            return conteudo_png, "image/png"
        imagem.thumbnail((MINIATURA_PX, MINIATURA_PX))
        if imagem.mode not in ("L", "RGB"):
            imagem = imagem.convert("RGB")
        saida = io.BytesIO()
        imagem.save(saida, format="JPEG", quality=82, optimize=True)
    return saida.getvalue(), "image/jpeg"


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
    detalhes_instancia = _chamar_orthanc(
        "consultar as informações da série no Orthanc",
        orthanc_client.obter_detalhes_instancia,
        ficha.orthanc_reference.orthanc_id,
    )
    detalhes_serie = _chamar_orthanc(
        "consultar as informações da série no Orthanc",
        orthanc_client.obter_detalhes_serie,
        detalhes_instancia["ParentSeries"],
    )
    orthanc_study_id = detalhes_serie["ParentStudy"]
    instancias = _chamar_orthanc(
        "listar os cortes da série no Orthanc",
        orthanc_client.listar_instancias_do_estudo,
        orthanc_study_id,
    )
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
    series = _chamar_orthanc(
        "listar as séries do estudo",
        orthanc_client.listar_series_do_estudo,
        orthanc_study_id,
    )
    return {"series": series}


@router.get("/{curation_id}/download/imagens.zip")
@limiter.shared_limit(LIMITE_DOWNLOAD_ZIP, scope="download_zip")
def baixar_zip_imagens(
    request: Request,
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
    if len(instancias) > MAX_CORTES_ZIP_PNG:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Esta série tem {len(instancias)} cortes; o ZIP de imagens aceita até {MAX_CORTES_ZIP_PNG}. "
                "Use o download em DICOM."
            ),
        )

    buffer = io.BytesIO()
    # funcao pesada: no maximo MAX_ZIPS_SIMULTANEOS montagens ao mesmo tempo (ASVS 15.2.2)
    with VagaDeTrabalhoPesado(), zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zip_arquivo:
        for indice, instancia_id in enumerate(instancias, start=1):
            conteudo = _chamar_orthanc(
                "gerar uma das imagens do ZIP",
                orthanc_client.obter_preview_instancia,
                instancia_id,
            )
            zip_arquivo.writestr(f"corte_{indice:03d}.png", conteudo)

    return Response(
        content=buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": disposicao_de_arquivo(f"radix-imago-{curation_id}-imagens.zip", baixar=True)},
    )


@router.get("/{curation_id}/download/dicom.zip")
@limiter.shared_limit(LIMITE_DOWNLOAD_ZIP, scope="download_zip")
def baixar_zip_dicom(
    request: Request,
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
    with VagaDeTrabalhoPesado():
        conteudo = _chamar_orthanc(
            "gerar o ZIP com os arquivos DICOM",
            orthanc_client.obter_arquivo_zip_estudo,
            orthanc_study_id,
        )

    return Response(
        content=conteudo,
        media_type="application/zip",
        headers={"Content-Disposition": disposicao_de_arquivo(f"radix-imago-{curation_id}-dicom.zip", baixar=True)},
    )


@router.get("/{curation_id}/preview")
def obter_preview(
    curation_id: int,
    com_marcacao: bool = Query(
        False,
        description=(
            "Se true, desenha as marcacoes do curador (se houver) por cima "
            "da imagem antes de devolver - usado quando o botao 'Baixar' e "
            "clicado com 'Mostrar marcação' ligado na tela. Sem esse "
            "parametro (ou com false), devolve a imagem crua, igual sempre "
            "foi - miniaturas e o visualizador continuam pedindo assim, sem "
            "mudanca nenhuma."
        ),
    ),
    tamanho: Literal["original", "miniatura"] = Query(
        "original",
        description=(
            "'miniatura': versao reduzida (ate MINIATURA_PX no maior lado, JPEG) para "
            "as grades de escolha (Pesquisa) - carrega muito mais rapido. "
            "'original': resolucao completa (visualizador, download)."
        ),
    ),
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
    conteudo = _chamar_orthanc(
        "carregar a miniatura/imagem",
        orthanc_client.obter_preview_instancia,
        ficha.orthanc_reference.orthanc_id,
    )
    if com_marcacao:
        conteudo = desenhar_marcacoes_na_imagem(conteudo, ficha.marcacoes)
    if tamanho == "miniatura":
        reduzida, tipo = reduzir_para_miniatura(conteudo)
        extensao = "jpg" if tipo == "image/jpeg" else "png"
        return Response(
            content=reduzida,
            media_type=tipo,
            headers={
                "Content-Disposition": disposicao_de_arquivo(f"radix-imago-{ficha.id}-miniatura.{extensao}"),
                # a mesma miniatura volta da memoria do navegador ao voltar a
                # Pesquisa (so neste navegador; imagem anonimizada e aprovada)
                "Cache-Control": "private, max-age=600",
            },
        )
    return Response(
        content=conteudo,
        media_type="image/png",
        headers={"Content-Disposition": disposicao_de_arquivo(f"radix-imago-{ficha.id}.png")},
    )


@router.post("/{curation_id}/send-email")
@limiter.limit(LIMITE_EMAIL_IMAGEM)
def enviar_por_email(
    request: Request,
    curation_id: int,
    com_marcacao: bool = Query(
        False,
        description="Se true, envia a imagem com as marcacoes do curador desenhadas por cima (mesma regra do /preview).",
    ),
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """
    Envia a imagem (PNG) por e-mail pro proprio usuario logado - sempre pro
    e-mail cadastrado na conta, sem destinatario livre.
    """
    ficha = _buscar_ficha_aprovada(db, curation_id)
    conteudo = _chamar_orthanc(
        "gerar a imagem para envio por e-mail",
        orthanc_client.obter_preview_instancia,
        ficha.orthanc_reference.orthanc_id,
    )
    if com_marcacao:
        conteudo = desenhar_marcacoes_na_imagem(conteudo, ficha.marcacoes)
    descricao = ficha.descricao_didatica or f"Imagem #{ficha.id} ({ficha.tipo_radiografia or 'radiografia'})"
    enviar_email_imagem_pesquisa(
        usuario.email, usuario.nome, descricao, conteudo, f"radix-imago-{ficha.id}.png",
    )
    return {"mensagem": f"Imagem enviada para {usuario.email}."}
