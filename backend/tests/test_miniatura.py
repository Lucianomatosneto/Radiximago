"""
Miniatura das grades de escolha (Pesquisa): versao reduzida e leve da
imagem, para a grade carregar rapido. A resolucao completa continua sendo
a padrao (visualizador, download).
"""

import io

from PIL import Image

from app.modules import search_router
from tests.conftest import cabecalho_auth, obter_token


def _png(largura: int, altura: int) -> bytes:
    saida = io.BytesIO()
    Image.new("L", (largura, altura), 128).save(saida, format="PNG")
    return saida.getvalue()


def test_miniatura_e_reduzida_e_mantem_a_proporcao(client, criar_usuario, criar_ficha, monkeypatch):
    usuario = criar_usuario()
    token = obter_token(client, usuario.email)
    ficha = criar_ficha()
    original = _png(3000, 2000)
    monkeypatch.setattr(search_router.orthanc_client, "obter_preview_instancia", lambda i: original)

    r = client.get(f"/search/{ficha.id}/preview?tamanho=miniatura", headers=cabecalho_auth(token))
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/jpeg"
    assert r.headers["cache-control"] == "private, max-age=600"
    with Image.open(io.BytesIO(r.content)) as img:
        assert img.size == (search_router.MINIATURA_PX, round(search_router.MINIATURA_PX * 2 / 3))
    assert len(r.content) < len(original)

    # sem o parametro: resolucao completa, como sempre
    r = client.get(f"/search/{ficha.id}/preview", headers=cabecalho_auth(token))
    assert r.headers["content-type"] == "image/png" and r.content == original


def test_tamanho_invalido_e_recusado(client, criar_usuario, criar_ficha):
    usuario = criar_usuario()
    token = obter_token(client, usuario.email)
    ficha = criar_ficha()
    assert client.get(f"/search/{ficha.id}/preview?tamanho=gigante", headers=cabecalho_auth(token)).status_code == 422


def test_imagem_ja_pequena_volta_como_esta(client, criar_usuario, criar_ficha, monkeypatch):
    usuario = criar_usuario()
    token = obter_token(client, usuario.email)
    ficha = criar_ficha()
    pequena = _png(200, 150)
    monkeypatch.setattr(search_router.orthanc_client, "obter_preview_instancia", lambda i: pequena)
    r = client.get(f"/search/{ficha.id}/preview?tamanho=miniatura", headers=cabecalho_auth(token))
    assert r.headers["content-type"] == "image/png" and r.content == pequena
