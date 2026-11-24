"""
PANORAMICA E CANAL PARA QUEM ESTUDA (pedido do Luciano, 24/11/2026,
recurso 5): na tomografia APROVADA, estudante, professor e pesquisador veem
as reconstrucoes que o curador gerou - a panoramica reconstruida e os cortes
transversais - e, quando o curador marcou, as versoes com o CANAL
MANDIBULAR desenhado.

Regras conferidas (mesma regra de ouro do /search):
- so ficha APROVADA e imagem ATIVA (404); qualquer usuario logado;
- a lista nao mostra quem gerou (so o que interessa para estudar);
- imagem: panoramica ou corte N (1..total), com ou sem canal; sem canal
  marcado e pedindo canal: 404; corte fora: 422; reconstrucao de outro
  exame: 404.
Tomografia ARTIFICIAL (a dos testes da reconstrucao).
"""

import io

import numpy as np
import pytest
from PIL import Image

from app.modules.curations import StatusCuradoria
from app.modules.users import UserRole
from tests.test_reconstrucao_api import _cab
from tests.test_reconstrucao_canal import orthanc_com_derivadas, reconstrucao  # noqa: F401 - fixtures
from tests.test_reconstrucao_api import orthanc_falso, tomografia  # noqa: F401 - fixtures


@pytest.fixture
def ficha(criar_ficha, reconstrucao, db):  # noqa: F811
    f = criar_ficha(status=StatusCuradoria.APROVADA.value, tipo_radiografia="tomografia")
    f.orthanc_reference_id = reconstrucao["ref"].id
    db.commit()
    return f


def _lista(client, cab, ficha):
    return client.get(f"/search/{ficha.id}/tomografia/reconstrucoes", headers=cab)


def _img(client, cab, ficha, rec_id, **params):
    return client.get(f"/search/{ficha.id}/tomografia/reconstrucoes/{rec_id}/imagem.png", headers=cab, params=params)


def test_estudante_ve_a_lista_sem_quem_gerou(client, criar_usuario, ficha, reconstrucao):  # noqa: F811
    cab = _cab(client, criar_usuario, UserRole.estudante)
    r = _lista(client, cab, ficha)
    assert r.status_code == 200, r.text
    [item] = r.json()
    assert item["id"] == reconstrucao["rec"]["id"]
    assert item["total_cortes"] == reconstrucao["rec"]["total_cortes"]
    assert item["tem_canal"] is False
    assert item["intervalo_mm"] > 0 and item["tamanho_pixel_mm"] > 0
    assert "criado_por_id" not in item and "pontos_px" not in str(item)


def test_panoramica_e_corte_transversal(client, criar_usuario, ficha, reconstrucao):  # noqa: F811
    cab = _cab(client, criar_usuario, UserRole.estudante)
    rec_id = reconstrucao["rec"]["id"]
    pano = _img(client, cab, ficha, rec_id, tipo="panoramica")
    assert pano.status_code == 200, pano.text
    assert pano.headers["content-type"] == "image/png"
    assert np.array(Image.open(io.BytesIO(pano.content))).ndim == 2
    corte = _img(client, cab, ficha, rec_id, tipo="corte", n=1)
    assert corte.status_code == 200, corte.text
    total = reconstrucao["rec"]["total_cortes"]
    assert _img(client, cab, ficha, rec_id, tipo="corte", n=total + 1).status_code == 422
    assert _img(client, cab, ficha, rec_id, tipo="corte", n=0).status_code == 422
    # sem canal marcado
    assert _img(client, cab, ficha, rec_id, tipo="panoramica", canal=True).status_code == 404


def test_com_canal_marcado(client, criar_usuario, ficha, reconstrucao):  # noqa: F811
    from pydicom import dcmread

    p = dcmread(io.BytesIO(reconstrucao["enviados"][0]))
    w, h = int(p.Columns), int(p.Rows)
    r = client.post(f"/reconstrucao/{reconstrucao['ref'].id}/{reconstrucao['rec']['id']}/canal",
                    headers=reconstrucao["cab"], json={"tracados": [[[0, h // 2], [w - 1, h // 2]]]})
    assert r.status_code == 201, r.text
    cab = _cab(client, criar_usuario, UserRole.estudante)
    assert _lista(client, cab, ficha).json()[0]["tem_canal"] is True
    for params in ({"tipo": "panoramica", "canal": True}, {"tipo": "corte", "n": 1, "canal": True}):
        img = _img(client, cab, ficha, reconstrucao["rec"]["id"], **params)
        assert img.status_code == 200, img.text
        assert np.array(Image.open(io.BytesIO(img.content))).shape[-1] == 3  # colorida (o canal em cor)


def test_ficha_nao_aprovada_404(client, criar_usuario, ficha, reconstrucao, db):  # noqa: F811
    ficha.status = StatusCuradoria.EM_ANALISE.value
    db.commit()
    cab = _cab(client, criar_usuario, UserRole.estudante)
    assert _lista(client, cab, ficha).status_code == 404
    assert _img(client, cab, ficha, reconstrucao["rec"]["id"], tipo="panoramica").status_code == 404


def test_reconstrucao_de_outro_exame_404(client, criar_usuario, ficha, reconstrucao, criar_ficha):  # noqa: F811
    outra = criar_ficha(status=StatusCuradoria.APROVADA.value, tipo_radiografia="tomografia")
    cab = _cab(client, criar_usuario, UserRole.estudante)
    assert _img(client, cab, outra, reconstrucao["rec"]["id"], tipo="panoramica").status_code == 404
    assert _lista(client, cab, outra).json() == []


def test_sem_login_401(client, ficha):
    assert client.get(f"/search/{ficha.id}/tomografia/reconstrucoes").status_code == 401
