"""
Upload de avatar: a validacao real e pela assinatura binaria do arquivo
(magic bytes), nao so pelo Content-Type que o cliente informa.
"""

import os
import struct
import zlib

import pytest

from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


def _png_minimo() -> bytes:
    """Monta um PNG 1x1 valido de verdade (assinatura + IHDR/IDAT/IEND)."""
    assinatura = b"\x89PNG\r\n\x1a\n"

    def bloco(tipo: bytes, dados: bytes) -> bytes:
        return (
            struct.pack(">I", len(dados))
            + tipo
            + dados
            + struct.pack(">I", zlib.crc32(tipo + dados))
        )

    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    idat = zlib.compress(b"\x00\xff\xff\xff")
    return assinatura + bloco(b"IHDR", ihdr) + bloco(b"IDAT", idat) + bloco(b"IEND", b"")


@pytest.fixture()
def usuario_logado(client, criar_usuario):
    usuario = criar_usuario(perfil=UserRole.estudante)
    token = obter_token(client, usuario.email)
    avatares_para_limpar = []

    yield usuario, token, avatares_para_limpar

    # limpa qualquer avatar que tenha ficado gravado em disco pelo teste
    for foto_perfil_url in avatares_para_limpar:
        caminho = os.path.join(
            os.path.dirname(__file__), "..", "uploads", "avatars",
            os.path.basename(foto_perfil_url),
        )
        if os.path.isfile(caminho):
            os.remove(caminho)


def test_upload_png_valido_e_aceito(client, usuario_logado):
    _, token, avatares_para_limpar = usuario_logado

    resposta = client.post(
        "/users/me/avatar",
        headers=cabecalho_auth(token),
        files={"arquivo": ("foto.png", _png_minimo(), "image/png")},
    )

    assert resposta.status_code == 200
    foto_perfil_url = resposta.json()["foto_perfil_url"]
    assert foto_perfil_url.endswith(".png")
    avatares_para_limpar.append(foto_perfil_url)


def test_upload_texto_disfarcado_de_imagem_e_rejeitado(client, usuario_logado):
    _, token, _avatares = usuario_logado

    resposta = client.post(
        "/users/me/avatar",
        headers=cabecalho_auth(token),
        # Content-Type correto na requisicao, mas o conteudo do arquivo
        # nao e um PNG/JPEG/WEBP de verdade - a assinatura binaria deve
        # pegar isso mesmo com o header "certo".
        files={"arquivo": ("foto.png", b"nao sou uma imagem de verdade", "image/png")},
    )

    assert resposta.status_code == 422


def test_upload_com_content_type_nao_permitido_e_rejeitado(client, usuario_logado):
    _, token, _avatares = usuario_logado

    resposta = client.post(
        "/users/me/avatar",
        headers=cabecalho_auth(token),
        files={"arquivo": ("arquivo.txt", b"conteudo qualquer", "text/plain")},
    )

    assert resposta.status_code == 422


def test_upload_sem_autenticacao_e_recusado(client):
    resposta = client.post(
        "/users/me/avatar",
        files={"arquivo": ("foto.png", _png_minimo(), "image/png")},
    )
    assert resposta.status_code == 401
