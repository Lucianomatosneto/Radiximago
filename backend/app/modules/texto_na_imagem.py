"""
Texto gravado nos pixels da imagem (OWASP/LGPD - auditoria TST-DICOM-03).

Muitas radiografias (sobretudo panoramicas) trazem nome, data de nascimento,
numero do paciente ou nome da clinica ESCRITOS NA PROPRIA IMAGEM. Apagar os
metadados do arquivo DICOM nao remove esse texto - ele faz parte do desenho.

O que este modulo faz, sem enviar nada para fora do servidor:
1. le a imagem do arquivo DICOM ja anonimizado (metadados);
2. procura texto com o Tesseract (OCR - "reconhecimento optico de
   caracteres", programa livre que roda no proprio servidor);
3. cobre cada trecho de texto encontrado com uma tarja preta;
4. devolve o arquivo novo e o resultado, que fica registrado na imagem
   (OrthancReference.texto_na_imagem) e aparece para o curador conferir
   antes de aprovar.

Resultados possiveis:
- "sem_texto": o OCR nao encontrou texto;
- "tarjado": havia texto e ele foi coberto (o curador deve conferir se
  sobrou algo e se a tarja nao cobriu anatomia importante);
- "nao_verificado": nao foi possivel verificar (formato de imagem nao
  suportado, varios quadros, OCR indisponivel). A imagem nao e alterada e
  o curador precisa conferir com atencao redobrada.

Limite honesto (para a dissertacao): o OCR reduz o risco, nao o elimina -
texto muito pequeno, inclinado, manuscrito ou com pouco contraste pode
escapar. Por isso a conferencia humana continua obrigatoria (a aprovacao
exige "anonimizacao validada").
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass

import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

SEM_TEXTO = "sem_texto"
TARJADO = "tarjado"
NAO_VERIFICADO = "nao_verificado"

# Filtros contra "falso texto" (o OCR as vezes "le" letras em textura
# ossea ou ruido): so conta palavra com confianca alta, com pelo menos 2
# letras/numeros e com altura tipica de texto impresso na imagem.
CONFIANCA_MINIMA = 60
CONFIANCA_MINIMA_PALAVRA_CURTA = 80  # 2-3 caracteres: o falso texto em osso costuma ser curto
ALTURA_MIN_RELATIVA = 0.008   # 0,8% da altura da imagem
ALTURA_MAX_RELATIVA = 0.15    # 15% da altura da imagem
MARGEM_TARJA = 0.25           # a tarja passa 25% da altura do texto para cada lado
LADO_MINIMO_OCR = 1000        # imagens menores sao ampliadas para o OCR ler melhor


@dataclass
class ResultadoTexto:
    situacao: str
    regioes: int = 0
    detalhe: str = ""


def _para_8_bits(quadro: np.ndarray, monochrome1: bool) -> np.ndarray:
    """Converte a imagem (8, 12 ou 16 bits) em cinza de 0 a 255 so para o OCR ler."""
    q = quadro.astype(np.float32)
    minimo, maximo = float(q.min()), float(q.max())
    if maximo <= minimo:
        return np.zeros(q.shape, dtype=np.uint8)
    q = (q - minimo) * (255.0 / (maximo - minimo))
    if monochrome1:  # em MONOCHROME1 o "branco" e o valor mais baixo
        q = 255.0 - q
    return q.astype(np.uint8)


def _caixas_de_texto(cinza: np.ndarray) -> list[tuple[int, int, int, int]]:
    """Procura texto claro sobre fundo escuro E escuro sobre fundo claro."""
    import pytesseract

    altura, largura = cinza.shape
    escala = max(1.0, LADO_MINIMO_OCR / max(altura, largura))
    caixas: list[tuple[int, int, int, int]] = []
    for versao in (cinza, 255 - cinza):
        imagem = Image.fromarray(versao)
        if escala > 1.0:
            imagem = imagem.resize((int(largura * escala), int(altura * escala)), Image.LANCZOS)
        dados = pytesseract.image_to_data(
            imagem, config="--psm 11", output_type=pytesseract.Output.DICT
        )
        for i, palavra in enumerate(dados["text"]):
            texto = (palavra or "").strip()
            try:
                confianca = float(dados["conf"][i])
            except (TypeError, ValueError):
                continue
            letras = sum(c.isalnum() for c in texto)
            minimo = CONFIANCA_MINIMA_PALAVRA_CURTA if letras <= 3 else CONFIANCA_MINIMA
            if letras < 2 or confianca < minimo:
                continue
            x, y = dados["left"][i] / escala, dados["top"][i] / escala
            w, h = dados["width"][i] / escala, dados["height"][i] / escala
            if not (ALTURA_MIN_RELATIVA * altura <= h <= ALTURA_MAX_RELATIVA * altura):
                continue
            m = h * MARGEM_TARJA
            caixas.append((
                max(0, int(x - m)), max(0, int(y - m)),
                min(largura, int(x + w + m + 1)), min(altura, int(y + h + m + 1)),
            ))
    return caixas


def tarjar_texto(dicom_bytes: bytes) -> tuple[bytes, ResultadoTexto]:
    """
    Recebe o arquivo DICOM (ja sem metadados pessoais) e devolve
    (arquivo, resultado). Se nada for encontrado ou nao der para verificar,
    devolve o MESMO arquivo, sem alteracao.
    """
    import pydicom
    from pydicom.uid import ExplicitVRLittleEndian

    try:
        ds = pydicom.dcmread(io.BytesIO(dicom_bytes))
    except Exception as erro:  # arquivo ilegivel para o pydicom
        logger.warning("Texto na imagem: DICOM ilegivel (%s).", erro)
        return dicom_bytes, ResultadoTexto(NAO_VERIFICADO, detalhe="arquivo ilegível para verificação")

    if "PixelData" not in ds:
        return dicom_bytes, ResultadoTexto(SEM_TEXTO, detalhe="arquivo sem imagem")
    if int(getattr(ds, "NumberOfFrames", 1) or 1) > 1:
        return dicom_bytes, ResultadoTexto(NAO_VERIFICADO, detalhe="imagem com vários quadros")

    try:
        pixels = ds.pixel_array
    except Exception as erro:
        logger.warning("Texto na imagem: formato de pixels nao suportado (%s).", erro)
        return dicom_bytes, ResultadoTexto(NAO_VERIFICADO, detalhe="formato de imagem não suportado")

    fotometria = str(getattr(ds, "PhotometricInterpretation", "MONOCHROME2"))
    colorida = pixels.ndim == 3
    if colorida and fotometria not in ("RGB",):
        return dicom_bytes, ResultadoTexto(NAO_VERIFICADO, detalhe=f"cor {fotometria} não suportada")
    cinza_original = pixels.mean(axis=2) if colorida else pixels
    cinza = _para_8_bits(cinza_original, fotometria == "MONOCHROME1")

    try:
        caixas = _caixas_de_texto(cinza)
    except Exception as erro:  # Tesseract ausente/quebrado
        logger.exception("Texto na imagem: OCR indisponivel.")
        return dicom_bytes, ResultadoTexto(NAO_VERIFICADO, detalhe=f"OCR indisponível ({type(erro).__name__})")

    if not caixas:
        return dicom_bytes, ResultadoTexto(SEM_TEXTO)

    tarjada = np.array(pixels, copy=True)
    # "preto" da imagem: menor valor em MONOCHROME2/RGB, maior em MONOCHROME1
    preto = tarjada.max() if fotometria == "MONOCHROME1" else tarjada.min()
    for x1, y1, x2, y2 in caixas:
        tarjada[y1:y2, x1:x2] = preto

    ds.PixelData = tarjada.tobytes()
    if ds.file_meta.TransferSyntaxUID.is_compressed:
        # os pixels agora estao descomprimidos: o arquivo passa a dizer isso
        ds.file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
        if colorida:
            ds.PlanarConfiguration = 0
    # o campo aceita varios valores (VM 1-n), cada um com ate 64 caracteres
    anteriores = getattr(ds, "DeidentificationMethod", None)
    metodos = [] if not anteriores else (list(anteriores) if not isinstance(anteriores, str) else [anteriores])
    metodos.append(f"Radix OCR: texto nos pixels tarjado ({len(caixas)} regioes)"[:64])
    ds.DeidentificationMethod = metodos
    saida = io.BytesIO()
    ds.save_as(saida, enforce_file_format=True)
    return saida.getvalue(), ResultadoTexto(TARJADO, regioes=len(caixas))
