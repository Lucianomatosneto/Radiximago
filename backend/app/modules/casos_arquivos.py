"""
FOTOS DAS PASTAS DE PACIENTES - preparo e guarda CIFRADA no disco.

Cada foto enviada pelo celular:
1. e conferida: so JPEG, PNG ou WEBP de verdade (o conteudo, nao o nome),
   no maximo MAX_FOTO_MB e MAX_PIXELS (protecao contra "bomba de
   descompressao" - imagem minuscula no arquivo que explode na memoria);
2. e endireitada (a orientacao gravada pelo celular) e reduzida para no
   maximo LADO_MAXIMO pixels no lado maior - suficiente para estudar a
   radiografia na tela, com arquivos pequenos;
3. e regravada como JPEG NOVO: os dados escondidos da foto original (EXIF:
   localizacao GPS, modelo do celular, data) NAO sao copiados;
4. ganha uma miniatura (LADO_MINIATURA) para as grades;
5. as duas sao CIFRADAS com AES-256-GCM antes de tocar o disco - quem
   copiar a pasta do servidor ve so bytes embaralhados. O nome do arquivo e
   aleatorio (nada do paciente no nome).

Chave: CASOS_CHAVE do .env (recomendado em producao); sem ela, uma chave
DERIVADA da JWT_SECRET_KEY (HKDF, rotulo proprio). ATENCAO: trocar a chave
usada torna as fotos ja guardadas ilegiveis - ver docs/CRIPTOGRAFIA.md.
"""

from __future__ import annotations

import io
import os
import secrets
import uuid
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from PIL import Image, ImageOps

from app.core.config import settings

MAX_FOTO_MB = 15
MAX_PIXELS = 60_000_000          # ~ 60 megapixels
LADO_MAXIMO = 2400
LADO_MINIATURA = 480
FORMATOS_ACEITOS = {"JPEG", "PNG", "WEBP", "MPO"}  # MPO = JPEG de alguns celulares
_VERSAO = b"R1"                  # cabecalho do arquivo cifrado (permite trocar o formato no futuro)


class FotoInvalida(ValueError):
    """Arquivo que nao e uma foto aceitavel (mensagem pronta para o usuario)."""


def pasta_casos() -> Path:
    pasta = Path(settings.CASOS_PASTA)
    pasta.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(pasta, 0o700)
    except OSError:
        pass
    return pasta


def _chave(segredo: str) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=b"radix-imago/casos-clinicos/v1").derive(
        segredo.encode("utf-8")
    )


def _cifrador() -> AESGCM:
    segredo = settings.CASOS_CHAVE.strip() or settings.JWT_SECRET_KEY
    return AESGCM(_chave(segredo))


def cifrar(dados: bytes) -> bytes:
    nonce = secrets.token_bytes(12)
    return _VERSAO + nonce + _cifrador().encrypt(nonce, dados, _VERSAO)


def decifrar(dados: bytes) -> bytes:
    if not dados.startswith(_VERSAO):
        raise ValueError("arquivo de caso em formato desconhecido")
    nonce, corpo = dados[2:14], dados[14:]
    return _cifrador().decrypt(nonce, corpo, _VERSAO)


def preparar_foto(conteudo: bytes) -> tuple[bytes, bytes, int, int]:
    """Confere, endireita, reduz e regrava SEM metadados. Devolve
    (jpeg, miniatura_jpeg, largura, altura)."""
    if not conteudo:
        raise FotoInvalida("Arquivo vazio.")
    if len(conteudo) > MAX_FOTO_MB * 1024 * 1024:
        raise FotoInvalida(f"Foto maior que {MAX_FOTO_MB} MB.")
    try:
        with Image.open(io.BytesIO(conteudo)) as bruta:
            if bruta.format not in FORMATOS_ACEITOS:
                raise FotoInvalida("Envie fotos JPEG, PNG ou WEBP.")
            largura, altura = bruta.size
            if largura * altura > MAX_PIXELS:
                raise FotoInvalida("Foto grande demais (resolução acima do permitido).")
            img = ImageOps.exif_transpose(bruta)
            img = img.convert("RGB")
    except FotoInvalida:
        raise
    except Exception as erro:  # noqa: BLE001 - qualquer falha de leitura = arquivo invalido
        raise FotoInvalida("O arquivo não é uma foto válida.") from erro

    img.thumbnail((LADO_MAXIMO, LADO_MAXIMO), Image.Resampling.LANCZOS)
    saida = io.BytesIO()
    img.save(saida, format="JPEG", quality=88, optimize=True)  # sem exif=: nada da foto original vai junto
    mini = img.copy()
    mini.thumbnail((LADO_MINIATURA, LADO_MINIATURA), Image.Resampling.LANCZOS)
    saida_mini = io.BytesIO()
    mini.save(saida_mini, format="JPEG", quality=80, optimize=True)
    return saida.getvalue(), saida_mini.getvalue(), img.width, img.height


def gravar(dados: bytes) -> str:
    """Cifra e grava; devolve o nome (aleatorio) do arquivo."""
    nome = f"{uuid.uuid4().hex}.rx"
    destino = pasta_casos() / nome
    temporario = destino.with_suffix(".tmp")
    with open(temporario, "wb") as f:
        f.write(cifrar(dados))
    os.replace(temporario, destino)
    try:
        os.chmod(destino, 0o600)
    except OSError:
        pass
    return nome


def ler(nome: str) -> bytes:
    if not nome or "/" in nome or "\\" in nome or nome.startswith("."):
        raise FileNotFoundError(nome)
    with open(pasta_casos() / nome, "rb") as f:
        return decifrar(f.read())


def apagar(nome: str) -> None:
    try:
        (pasta_casos() / nome).unlink()
    except FileNotFoundError:
        pass
