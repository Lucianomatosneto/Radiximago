"""
Ajustes de ENQUADRAMENTO e ORIENTACAO das radiografias (pedido de 20/10/2026).

1. RECORTE DA BORDA BRANCA (automatico, na entrada da imagem)
   Muitos leitores de placa de fosforo e sensores gravam a radiografia
   dentro de uma "folha" maior: em volta da parte escura (a radiografia de
   verdade) fica uma moldura branca e uniforme, sem informacao nenhuma. Como
   todas as telas enquadram a imagem inteira, o dente aparecia pequeno.
   Aqui a moldura e encontrada e cortada, junto com a anonimizacao.

   Regra de seguranca (o recorte nunca pode cortar anatomia):
   - so corta se pelo menos DOIS lados inteiros da imagem forem CLAROS e
     UNIFORMES (uma faixa clara de dente num lado so nao conta);
   - a parte descartada precisa ser quase toda (>= 97%) igual a moldura;
     se houver conteudo ali, a imagem fica como esta ("incerto");
   - o que sobra precisa ter tamanho razoavel (>= 15% da area, >= 64 px).

2. GIRO (manual, pelo curador, em passos de 90 graus)
   O computador nao sabe sozinho se a radiografia e de dentes superiores ou
   inferiores. O curador gira na Curadoria; a tela sugere a posicao pelos
   dentes marcados (FDI 11-28 superiores: coroas para BAIXO; 31-48
   inferiores: coroas para CIMA - frontend/src/lib/orientacao.ts).

   O giro em 90/180/270 graus so TROCA OS PIXELS DE LUGAR - nenhum valor e
   recalculado, entao nao ha perda de informacao (e reversivel: girar de
   volta devolve exatamente a mesma matriz).

Nos dois casos o arquivo DICOM e regravado e o ajuste fica REGISTRADO NO
PROPRIO ARQUIVO (ImageType = DERIVED e DerivationDescription), alem da
auditoria do sistema - rastreabilidade para a dissertacao e para quem
receber a imagem depois.
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

# --- resultados do recorte ---------------------------------------------------
RECORTADA = "recortada"          # havia moldura branca e ela foi cortada
SEM_BORDA = "sem_borda"          # nao ha moldura branca
INCERTO = "incerto"              # parecia haver moldura, mas cortar arriscaria anatomia
NAO_VERIFICADO = "nao_verificado"  # formato nao suportado / arquivo ilegivel

# --- parametros do recorte (documentados em docs/DADOS_E_PRIVACIDADE.md) ---
BRILHO_MINIMO_MOLDURA = 0.60    # moldura: pelo menos 60% do caminho entre o mais escuro e o mais claro
TOLERANCIA_MIN = 0.05           # quanto um pixel pode variar e ainda "ser moldura"
TOLERANCIA_MAX = 0.15
FRACAO_LADO_MOLDURA = 0.90      # um lado "e moldura" se >= 90% dele for igual a moldura
LADOS_MINIMOS = 2               # moldura em pelo menos 2 lados inteiros (pode faltar dos outros)
FRACAO_NUCLEO = 0.25            # linha/coluna "da radiografia": >= 25% de pixels escuros
FRACAO_EXTENSAO = 0.005         # bordas inclinadas: segue enquanto houver >= 0,5% de pixels escuros
FRACAO_DESCARTE_MAX_ESCURA = 0.03  # o que for cortado pode ter no maximo 3% de pixels escuros
GANHO_MINIMO = 0.02             # cortar menos de 2% de cada lado nao vale a regravacao
AREA_MINIMA = 0.15
LADO_MINIMO = 64

# giros aceitos (sentido horario, como no relogio)
GIROS = (90, 180, 270)


class FormatoNaoSuportado(ValueError):
    """Imagem que nao da para regravar com seguranca (varios quadros, cor YBR...)."""


@dataclass
class ResultadoRecorte:
    situacao: str
    # caixa mantida (x0, y0, x1, y1) em pixels do arquivo original - x1/y1 exclusivos
    caixa: tuple[int, int, int, int] | None = None
    largura_original: int = 0
    altura_original: int = 0
    detalhe: str = ""

    @property
    def descricao(self) -> str:
        if self.situacao != RECORTADA or not self.caixa:
            return self.detalhe or self.situacao
        x0, y0, x1, y1 = self.caixa
        return (f"moldura branca recortada: {self.largura_original}x{self.altura_original} -> "
                f"{x1 - x0}x{y1 - y0} px")


# --- leitura dos pixels -------------------------------------------------------

def ler_pixels(dicom_bytes: bytes):
    import pydicom

    ds = pydicom.dcmread(io.BytesIO(dicom_bytes))
    if "PixelData" not in ds:
        raise FormatoNaoSuportado("arquivo sem imagem")
    if int(getattr(ds, "NumberOfFrames", 1) or 1) > 1:
        raise FormatoNaoSuportado("imagem com vários quadros")
    fotometria = str(getattr(ds, "PhotometricInterpretation", "MONOCHROME2"))
    # Fotos/scans de filme costumam vir em JPEG colorido (YBR_FULL_422 etc.):
    # a leitura do pydicom ja entrega essas cores convertidas para RGB, e o
    # arquivo regravado passa a dizer RGB (pixels sem compressao).
    ybr = fotometria.startswith("YBR_")
    if fotometria not in ("MONOCHROME1", "MONOCHROME2", "RGB") and not ybr:
        raise FormatoNaoSuportado(f"cor {fotometria} não suportada")
    try:
        pixels = ds.pixel_array
    except Exception as erro:  # codec ausente
        raise FormatoNaoSuportado(f"formato de pixels não suportado ({type(erro).__name__})") from erro
    if ybr:
        ds.PhotometricInterpretation = "RGB"
        fotometria = "RGB"
    if (pixels.ndim == 3) != (fotometria == "RGB"):
        raise FormatoNaoSuportado("formato de pixels inesperado")
    return ds, pixels, fotometria


def brilho_na_tela(pixels: np.ndarray, fotometria: str) -> np.ndarray:
    """Matriz 0..1 em que 1 = BRANCO na tela (MONOCHROME1 e invertido)."""
    cinza = pixels.mean(axis=2) if pixels.ndim == 3 else pixels
    q = cinza.astype(np.float32)
    # 0,1% / 99,9%: um pixel defeituoso isolado nao estraga a escala
    baixo, alto = np.percentile(q, (0.1, 99.9))
    if alto <= baixo:
        baixo, alto = float(q.min()), float(q.max())
    if alto <= baixo:
        return np.zeros(q.shape, dtype=np.float32)
    b = np.clip((q - baixo) / (alto - baixo), 0.0, 1.0)
    return 1.0 - b if fotometria == "MONOCHROME1" else b


# --- deteccao da moldura -------------------------------------------------------

def _maior_trecho(marcados: np.ndarray) -> tuple[int, int] | None:
    """(inicio, fim exclusivo) do maior trecho seguido de True."""
    melhor, inicio = None, None
    for i, v in enumerate(list(marcados) + [False]):
        if v and inicio is None:
            inicio = i
        elif not v and inicio is not None:
            if melhor is None or i - inicio > melhor[1] - melhor[0]:
                melhor = (inicio, i)
            inicio = None
    return melhor


def _estender(fracoes: np.ndarray, trecho: tuple[int, int]) -> tuple[int, int]:
    """Inclui as bordas inclinadas/irregulares da radiografia, ate achar moldura pura."""
    a, b = trecho
    while a > 0 and fracoes[a - 1] >= FRACAO_EXTENSAO:
        a -= 1
    while b < len(fracoes) and fracoes[b] >= FRACAO_EXTENSAO:
        b += 1
    return a, b


def detectar_moldura(brilho: np.ndarray) -> tuple[tuple[int, int, int, int] | None, str, str]:
    """
    Recebe o brilho na tela (0..1) e devolve (caixa, situacao, detalhe).
    caixa = parte a manter (x0, y0, x1, y1) ou None.
    """
    altura, largura = brilho.shape
    if altura < LADO_MINIMO or largura < LADO_MINIMO:
        return None, SEM_BORDA, "imagem pequena demais"

    espessura = max(2, int(round(min(altura, largura) * 0.01)))
    lados = [brilho[:espessura], brilho[-espessura:], brilho[:, :espessura], brilho[:, -espessura:]]
    claros = [lado.ravel() for lado in lados if float(np.median(lado)) >= BRILHO_MINIMO_MOLDURA]
    if len(claros) < LADOS_MINIMOS:
        return None, SEM_BORDA, "a borda da imagem não é clara"
    pixels_claros = np.concatenate(claros)
    valor = float(np.median(pixels_claros))
    desvio = float(np.median(np.abs(pixels_claros - valor)))
    tolerancia = min(TOLERANCIA_MAX, max(TOLERANCIA_MIN, 4.0 * desvio))
    moldura = np.abs(brilho - valor) <= tolerancia
    lados_moldura = sum(
        float(lado.mean()) >= FRACAO_LADO_MOLDURA
        for lado in (moldura[:espessura], moldura[-espessura:], moldura[:, :espessura], moldura[:, -espessura:])
    )
    # pelo menos DOIS lados inteiros de moldura: uma faixa clara de dente ou
    # restauracao encostada em UM lado nao e confundida com moldura
    if lados_moldura < LADOS_MINIMOS:
        return None, SEM_BORDA, "a borda da imagem não é uniforme"

    escuro = ~moldura  # tudo o que NAO e moldura (a radiografia)

    # linhas: o maior bloco seguido de linhas "da radiografia" + bordas inclinadas
    trecho = _maior_trecho(escuro.mean(axis=1) >= FRACAO_NUCLEO)
    if trecho is None:
        return None, INCERTO, "não foi encontrada uma região escura contínua"
    y0, y1 = _estender(escuro.mean(axis=1), trecho)
    # colunas, olhando so as linhas escolhidas
    colunas = escuro[y0:y1].mean(axis=0)
    trecho = _maior_trecho(colunas >= FRACAO_NUCLEO)
    if trecho is None:
        return None, INCERTO, "não foi encontrada uma região escura contínua"
    x0, x1 = _estender(colunas, trecho)
    # refina as linhas olhando so as colunas escolhidas
    linhas = escuro[:, x0:x1].mean(axis=1)
    trecho = _maior_trecho(linhas >= FRACAO_NUCLEO)
    if trecho is None:
        return None, INCERTO, "não foi encontrada uma região escura contínua"
    y0, y1 = _estender(linhas, trecho)

    if (x1 - x0) < LADO_MINIMO or (y1 - y0) < LADO_MINIMO:
        return None, INCERTO, "a parte escura ficaria pequena demais"
    if (x1 - x0) * (y1 - y0) < AREA_MINIMA * altura * largura:
        return None, INCERTO, "a parte escura ficaria pequena demais"
    if (1 - (x1 - x0) / largura) < GANHO_MINIMO and (1 - (y1 - y0) / altura) < GANHO_MINIMO:
        return None, SEM_BORDA, "moldura estreita demais para recortar"

    # garantia final: o que vai ser DESCARTADO tem de ser (quase) so moldura
    descartado = escuro.copy()
    descartado[y0:y1, x0:x1] = False
    area_descartada = altura * largura - (x1 - x0) * (y1 - y0)
    if area_descartada and descartado.sum() / area_descartada > FRACAO_DESCARTE_MAX_ESCURA:
        return None, INCERTO, "há conteúdo escuro fora da região principal"
    return (x0, y0, x1, y1), RECORTADA, ""


# --- regravacao do arquivo ------------------------------------------------------

_GRUPOS_SOBREPOSICAO = range(0x6000, 0x6020, 2)  # "overlays": desenhos sobre a imagem


def _registrar_derivacao(ds, texto: str) -> None:
    """Marca o arquivo como imagem DERIVADA e acrescenta o que foi feito."""
    tipo = getattr(ds, "ImageType", None)
    if tipo:
        valores = [tipo] if isinstance(tipo, str) else list(tipo)
        valores[0] = "DERIVED"
        ds.ImageType = valores
    anterior = str(getattr(ds, "DerivationDescription", "") or "")
    novo = f"{anterior}; {texto}" if anterior else texto
    ds.DerivationDescription = novo[-1024:]  # tipo ST: ate 1024 caracteres


def _regravar(ds, novos_pixels: np.ndarray, fotometria: str, texto: str) -> bytes:
    from pydicom.uid import ExplicitVRLittleEndian

    novos_pixels = np.ascontiguousarray(novos_pixels)
    ds.Rows, ds.Columns = int(novos_pixels.shape[0]), int(novos_pixels.shape[1])
    dados = novos_pixels.tobytes()
    if len(dados) % 2:
        dados += b"\0"  # o DICOM exige tamanho par
    ds.PixelData = dados
    if ds.file_meta.TransferSyntaxUID.is_compressed:
        # os pixels agora estao descomprimidos: o arquivo passa a dizer isso
        ds.file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    ds["PixelData"].VR = "OW" if int(getattr(ds, "BitsAllocated", 8)) > 8 else "OB"
    if fotometria == "RGB":
        ds.PlanarConfiguration = 0  # pixel_array devolve as cores intercaladas
    # desenhos sobrepostos (overlay) ficariam fora do lugar: sao removidos
    for grupo in _GRUPOS_SOBREPOSICAO:
        for elemento in [e.tag for e in ds if e.tag.group == grupo]:
            del ds[elemento]
    _registrar_derivacao(ds, texto)
    saida = io.BytesIO()
    ds.save_as(saida, enforce_file_format=True)
    return saida.getvalue()


def recortar_moldura(dicom_bytes: bytes) -> tuple[bytes, ResultadoRecorte]:
    """
    Recebe o arquivo DICOM (ja anonimizado) e devolve (arquivo, resultado).
    Sem moldura clara, ou na duvida, devolve o MESMO arquivo, sem alteracao.
    """
    try:
        ds, pixels, fotometria = ler_pixels(dicom_bytes)
    except FormatoNaoSuportado as erro:
        return dicom_bytes, ResultadoRecorte(NAO_VERIFICADO, detalhe=str(erro))
    except Exception as erro:
        logger.warning("Recorte da moldura: arquivo ilegivel (%s).", erro)
        return dicom_bytes, ResultadoRecorte(NAO_VERIFICADO, detalhe="arquivo ilegível")

    altura, largura = pixels.shape[:2]
    caixa, situacao, detalhe = detectar_moldura(brilho_na_tela(pixels, fotometria))
    resultado = ResultadoRecorte(situacao, caixa, largura, altura, detalhe)
    if caixa is None:
        return dicom_bytes, resultado
    x0, y0, x1, y1 = caixa
    texto = f"Radix: moldura branca recortada (x={x0}, y={y0}, {x1 - x0}x{y1 - y0} de {largura}x{altura} px)"
    return _regravar(ds, pixels[y0:y1, x0:x1], fotometria, texto), resultado


def girar_dicom(dicom_bytes: bytes, graus: int) -> bytes:
    """
    Gira a imagem no sentido HORARIO (90, 180 ou 270 graus), sem perda.
    O arquivo novo recebe um identificador de instancia (SOPInstanceUID)
    novo - e outra imagem, derivada da anterior.
    """
    from pydicom.uid import generate_uid

    if graus not in GIROS:
        raise ValueError("O giro precisa ser de 90, 180 ou 270 graus.")
    ds, pixels, fotometria = ler_pixels(dicom_bytes)
    # np.rot90 gira no sentido ANTI-horario; k negativo = horario
    girada = np.rot90(pixels, k=-(graus // 90), axes=(0, 1))
    if graus in (90, 270):
        # o tamanho do pixel e guardado como [entre linhas, entre colunas]: troca
        for campo in ("PixelSpacing", "ImagerPixelSpacing", "NominalScannedPixelSpacing"):
            valor = getattr(ds, campo, None)
            if valor is not None and len(valor) == 2:
                setattr(ds, campo, [valor[1], valor[0]])
        proporcao = getattr(ds, "PixelAspectRatio", None)
        if proporcao is not None and len(proporcao) == 2:
            ds.PixelAspectRatio = [proporcao[1], proporcao[0]]
    novo_uid = generate_uid()
    ds.SOPInstanceUID = novo_uid
    ds.file_meta.MediaStorageSOPInstanceUID = novo_uid
    return _regravar(ds, girada, fotometria, f"Radix: girada {graus} graus no sentido horario")


def novo_identificador(dicom_bytes: bytes) -> bytes:
    """Regrava o arquivo com um SOPInstanceUID novo (usado no recorte de imagens ja guardadas)."""
    import pydicom
    from pydicom.uid import generate_uid

    ds = pydicom.dcmread(io.BytesIO(dicom_bytes))
    novo_uid = generate_uid()
    ds.SOPInstanceUID = novo_uid
    ds.file_meta.MediaStorageSOPInstanceUID = novo_uid
    saida = io.BytesIO()
    ds.save_as(saida, enforce_file_format=True)
    return saida.getvalue()


# --- marcacoes acompanham a imagem ----------------------------------------------
# Todas as marcacoes do sistema usam coordenadas RELATIVAS (0 a 1) a largura
# e altura da imagem (curation/schemas.py: Marcacao; anotacoes.py).

def _limitar(v: float) -> float:
    return min(1.0, max(0.0, v))


def girar_ponto(x: float, y: float, graus: int) -> tuple[float, float]:
    """Onde o ponto (x, y) vai parar depois do giro horario."""
    if graus == 90:
        return 1.0 - y, x
    if graus == 180:
        return 1.0 - x, 1.0 - y
    if graus == 270:
        return y, 1.0 - x
    return x, y


def recortar_ponto(x: float, y: float, caixa: tuple[int, int, int, int], largura: int, altura: int) -> tuple[float, float]:
    x0, y0, x1, y1 = caixa
    return (
        _limitar((x * largura - x0) / (x1 - x0)),
        _limitar((y * altura - y0) / (y1 - y0)),
    )


def _transformar_marcacao(m: dict[str, Any], ponto) -> dict[str, Any]:
    nova = dict(m)
    if m.get("tipo") == "seta":
        if None not in (m.get("x1"), m.get("y1"), m.get("x2"), m.get("y2")):
            nova["x1"], nova["y1"] = ponto(m["x1"], m["y1"])
            nova["x2"], nova["y2"] = ponto(m["x2"], m["y2"])
        return nova
    if None in (m.get("x"), m.get("y"), m.get("largura"), m.get("altura")):
        return nova
    # oval/retangulo: transforma os dois cantos e refaz a caixa
    ax, ay = ponto(m["x"], m["y"])
    bx, by = ponto(m["x"] + m["largura"], m["y"] + m["altura"])
    nova["x"], nova["y"] = min(ax, bx), min(ay, by)
    nova["largura"], nova["altura"] = abs(bx - ax), abs(by - ay)
    return nova


def girar_marcacoes(marcacoes: list[dict] | None, graus: int) -> list[dict]:
    return [_transformar_marcacao(m, lambda x, y: girar_ponto(x, y, graus)) for m in (marcacoes or [])]


def recortar_marcacoes(marcacoes: list[dict] | None, caixa, largura: int, altura: int) -> list[dict]:
    return [
        _transformar_marcacao(m, lambda x, y: recortar_ponto(x, y, caixa, largura, altura))
        for m in (marcacoes or [])
    ]
