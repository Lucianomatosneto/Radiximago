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
    # memoria do navegador com "etiqueta": volta 304 (sem imagem) enquanto o arquivo for o mesmo
    assert r.headers["cache-control"] == "private, no-cache"
    etiqueta = r.headers["etag"]
    pedidos = []
    monkeypatch.setattr(search_router.orthanc_client, "obter_preview_instancia", lambda i: pedidos.append(i) or original)
    r304 = client.get(f"/search/{ficha.id}/preview?tamanho=miniatura",
                      headers={**cabecalho_auth(token), "If-None-Match": etiqueta})
    assert r304.status_code == 304 and not r304.content and pedidos == []  # nem consultou o Orthanc
    with Image.open(io.BytesIO(r.content)) as img:
        assert img.size == (search_router.MINIATURA_PX, round(search_router.MINIATURA_PX * 2 / 3))
    assert len(r.content) < len(original)

    # lupa: versao "ampliada", maior que a miniatura e ainda bem menor que o original
    r = client.get(f"/search/{ficha.id}/preview?tamanho=ampliada", headers=cabecalho_auth(token))
    assert r.headers["content-type"] == "image/jpeg"
    with Image.open(io.BytesIO(r.content)) as img:
        assert img.size == (400, 267)

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


def test_busca_conta_marcacoes_da_ficha_e_dos_achados_sem_repetir(client, criar_usuario, criar_ficha, db):
    from app.modules.achados import Achado

    usuario = criar_usuario()
    token = obter_token(client, usuario.email)
    ficha = criar_ficha(descricao_didatica="contagem-marcacoes-teste")
    oval = {"id": "a", "tipo": "oval", "x": 0.1, "y": 0.1, "largura": 0.1, "altura": 0.1}
    ficha.marcacoes = [oval]
    db.add(Achado(curation_id=ficha.id, tipo="carie_dentina", marcacoes=[oval, {**oval, "id": "b"}]))
    db.commit()
    try:
        r = client.get("/search?texto=contagem-marcacoes-teste", headers=cabecalho_auth(token))
        item = [i for i in r.json()["itens"] if i["curation_id"] == ficha.id][0]
        # "a" esta na ficha E no achado (copia): conta uma vez so
        assert item["total_marcacoes"] == 2
        assert [m["id"] for m in item["marcacoes_exibicao"]] == ["a", "b"]
    finally:
        db.query(Achado).filter(Achado.curation_id == ficha.id).delete()
        db.commit()
