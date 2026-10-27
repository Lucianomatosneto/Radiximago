"""
SEGMENTACAO DE ESTRUTURAS (pedido de 22/10/2026): o curador "pinta" uma
estrutura da radiografia (ex.: o dente 36, um canal, uma lesao), pixel por
pixel, em vez de so circular. Fase 1: radiografia 2D (a CBCT fica para a
fase 2 - ver o documento "Segmentacao de estruturas").

Como fica guardado:
  - cada estrutura pintada e uma linha desta tabela, ligada a ficha de
    curadoria: nome, dente FDI (opcional), cor e a MASCARA;
  - a mascara e uma imagem PNG de 1 bit (pintado / nao pintado) cobrindo a
    imagem INTEIRA - como um papel vegetal sobre a radiografia. A
    radiografia original nunca e alterada;
  - a mascara recebida do navegador e SEMPRE redesenhada aqui (decodifica,
    confere o tamanho, reduz a 1 bit e grava de novo): nada do arquivo
    enviado e guardado como veio (OWASP: validar entrada no servidor);
  - quando a imagem e girada ou recortada, a mascara gira/recorta junto
    (substituir_instancia.py).
"""

import base64
import binascii
import io

from PIL import Image
from sqlalchemy import Column, DateTime, ForeignKey, Integer, LargeBinary, String, func as sa_func
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from app.core.database import Base

# limites (OWASP ASVS: limitar tamanho de entrada)
MAX_SEGMENTACOES_POR_FICHA = 30
MAX_LADO_MASCARA = 2048
MIN_LADO_MASCARA = 8
MAX_BYTES_MASCARA = 2 * 1024 * 1024  # PNG recebido (ja decodificado do base64)
# base64 cresce ~4/3; + o prefixo "data:image/png;base64,"
MAX_CARACTERES_MASCARA = (MAX_BYTES_MASCARA * 4) // 3 + 64

PREFIXO_DATA_URL = "data:image/png;base64,"


class SegmentacaoCuradoria(Base):
    __tablename__ = "segmentacoes_curadoria"

    id = Column(Integer, primary_key=True, index=True)
    # apagar a ficha apaga as pinturas dela (CASCADE no banco)
    curation_id = Column(Integer, ForeignKey("curations.id", ondelete="CASCADE"), nullable=False, index=True)
    nome = Column(String(60), nullable=False)
    dente = Column(Integer, nullable=True)  # FDI 11-48 (opcional)
    cor = Column(String(7), nullable=False)  # "#RRGGBB"
    mascara = Column(LargeBinary, nullable=False)  # PNG 1 bit, imagem inteira
    largura = Column(Integer, nullable=False)
    altura = Column(Integer, nullable=False)
    criado_por_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())
    atualizado_em = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


def contar_por_ficha(db: Session, curation_ids: list[int]) -> dict[int, int]:
    """Quantas estruturas pintadas cada ficha tem (uma consulta so - grades)."""
    if not curation_ids:
        return {}
    return dict(
        db.query(SegmentacaoCuradoria.curation_id, sa_func.count(SegmentacaoCuradoria.id))
        .filter(SegmentacaoCuradoria.curation_id.in_(curation_ids))
        .group_by(SegmentacaoCuradoria.curation_id)
        .all()
    )


class MascaraInvalida(ValueError):
    """A mascara enviada nao e um PNG valido dentro dos limites."""


def sanitizar_mascara(texto: str) -> tuple[bytes, int, int]:
    """
    Recebe a mascara do navegador (PNG em base64, com ou sem o prefixo
    data:) e devolve (png_1bit, largura, altura). Pintado = pixel com
    opacidade (alfa) acima da metade; sem canal alfa, vale o brilho.
    """
    if not isinstance(texto, str) or not texto:
        raise MascaraInvalida("Máscara vazia.")
    if texto.startswith("data:"):
        if not texto.startswith(PREFIXO_DATA_URL):
            raise MascaraInvalida("A máscara precisa ser uma imagem PNG.")
        texto = texto[len(PREFIXO_DATA_URL):]
    if len(texto) > MAX_CARACTERES_MASCARA:
        raise MascaraInvalida("Máscara grande demais.")
    try:
        bruto = base64.b64decode(texto, validate=True)
    except (binascii.Error, ValueError):
        raise MascaraInvalida("Máscara com codificação inválida.")
    if len(bruto) > MAX_BYTES_MASCARA or not bruto.startswith(b"\x89PNG\r\n\x1a\n"):
        raise MascaraInvalida("A máscara precisa ser uma imagem PNG dentro do limite de tamanho.")
    try:
        with Image.open(io.BytesIO(bruto)) as img:
            if img.format != "PNG":
                raise MascaraInvalida("A máscara precisa ser uma imagem PNG.")
            largura, altura = img.size
            # confere ANTES de decodificar os pixels (evita "bomba" de descompressao)
            if not (MIN_LADO_MASCARA <= largura <= MAX_LADO_MASCARA and MIN_LADO_MASCARA <= altura <= MAX_LADO_MASCARA):
                raise MascaraInvalida(
                    f"Tamanho da máscara fora do limite ({MIN_LADO_MASCARA} a {MAX_LADO_MASCARA} pixels por lado)."
                )
            img.load()
            if "A" in img.getbands():
                canal = img.getchannel("A")
            elif img.mode == "P" and "transparency" in img.info:
                canal = img.convert("RGBA").getchannel("A")
            else:
                canal = img.convert("L")
    except MascaraInvalida:
        raise
    except Exception:
        raise MascaraInvalida("Não foi possível ler a máscara (PNG inválido).")
    return _png_1bit(canal.point(lambda v: 255 if v > 127 else 0).convert("1")), largura, altura


def _png_1bit(img: Image.Image) -> bytes:
    saida = io.BytesIO()
    img.convert("1").save(saida, format="PNG", optimize=True)
    return saida.getvalue()


def mascara_para_exibir(png_1bit: bytes) -> str:
    """
    PNG para o navegador desenhar: pintado = branco opaco, resto =
    transparente (a tela aplica a cor e a transparencia por cima, via CSS
    mask-image). Devolve como data URL.
    """
    with Image.open(io.BytesIO(png_1bit)) as img:
        alfa = img.convert("L")
    branco = Image.new("L", alfa.size, 255)
    saida = io.BytesIO()
    Image.merge("LA", (branco, alfa)).save(saida, format="PNG", optimize=True)
    return PREFIXO_DATA_URL + base64.b64encode(saida.getvalue()).decode("ascii")


def pixels_pintados(png_1bit: bytes) -> int:
    with Image.open(io.BytesIO(png_1bit)) as img:
        return img.convert("L").histogram()[255]


def girar_mascara(png_1bit: bytes, graus: int) -> tuple[bytes, int, int]:
    """Gira a mascara junto com a imagem (sentido horario, 90/180/270)."""
    transposicao = {90: Image.Transpose.ROTATE_270, 180: Image.Transpose.ROTATE_180, 270: Image.Transpose.ROTATE_90}
    with Image.open(io.BytesIO(png_1bit)) as img:
        img.load()
        girada = img.transpose(transposicao[graus]) if graus in transposicao else img.copy()
    return _png_1bit(girada), girada.width, girada.height


def recortar_mascara(
    png_1bit: bytes, caixa: tuple[int, int, int, int], largura_original: int, altura_original: int
) -> tuple[bytes, int, int]:
    """Recorta a mascara na MESMA regiao (proporcional) em que a imagem foi recortada."""
    x0, y0, x1, y1 = caixa
    with Image.open(io.BytesIO(png_1bit)) as img:
        img.load()
        w, h = img.size
        bx0 = max(0, min(w - 1, round(x0 / largura_original * w)))
        by0 = max(0, min(h - 1, round(y0 / altura_original * h)))
        bx1 = max(bx0 + 1, min(w, round(x1 / largura_original * w)))
        by1 = max(by0 + 1, min(h, round(y1 / altura_original * h)))
        recortada = img.crop((bx0, by0, bx1, by1))
    return _png_1bit(recortada), recortada.width, recortada.height
