"""
TOMOGRAFIA CURADA PARA QUEM ESTUDA (pedido do Luciano, 24/11/2026: "trazer
recursos para quem visualizara as tomografias curadas"; escolha "Lesões
marcadas"). Estudante, professor e pesquisador abrem o CORTE onde o curador
marcou a lesao (plano + corte), com a marcacao desenhada pela tela.

Regras conferidas (mesma regra de ouro do /search):
- so ficha APROVADA e imagem ATIVA (senao 404, sem dizer o motivo);
- qualquer usuario logado que pode pesquisar (o mesmo do preview);
- imagem que nao e tomografia: 422; corte fora do exame: 422;
- o /search devolve as marcacoes com o plano e o corte.
Tomografia ARTIFICIAL (a dos testes da reconstrucao).
"""

import io

import numpy as np
import pytest
from PIL import Image

from app.modules.curations import StatusCuradoria
from app.modules.users import UserRole
from tests.test_reconstrucao_api import _cab
from tests.test_reconstrucao_api import orthanc_falso  # noqa: F401 - fixture

MARCA = {"id": "m1", "tipo": "oval", "x": 0.4, "y": 0.2, "largura": 0.2, "altura": 0.2, "plano": "axial", "corte": 20}


@pytest.fixture
def ficha_tc(criar_ficha, db):
    ficha = criar_ficha(status=StatusCuradoria.APROVADA.value, tipo_radiografia="tomografia")
    ficha.orthanc_reference.orthanc_id = "corte-00"
    ficha.marcacoes = [MARCA]
    db.commit()
    return ficha


def _geo(client, cab, ficha):
    return client.get(f"/search/{ficha.id}/tomografia/geometria", headers=cab)


def _plano(client, cab, ficha, plano="axial", indice=20):
    return client.get(f"/search/{ficha.id}/tomografia/plano.png", headers=cab, params={"plano": plano, "indice": indice})


@pytest.mark.parametrize("perfil", [UserRole.estudante, UserRole.professor, UserRole.pesquisador])
def test_quem_estuda_ve_a_geometria_e_o_corte(client, criar_usuario, ficha_tc, orthanc_falso, perfil):  # noqa: F811
    cab = _cab(client, criar_usuario, perfil)
    r = _geo(client, cab, ficha_tc)
    assert r.status_code == 200, r.text
    g = r.json()
    assert (g["cortes"], g["linhas"], g["colunas"]) == (40, 60, 70)
    assert len(g["espacamento_mm"]) == 3
    r = _plano(client, cab, ficha_tc)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "image/png"
    img = np.array(Image.open(io.BytesIO(r.content)))
    assert img.shape == (60, 70)
    assert img[20, 35] > 200


def test_ficha_nao_aprovada_404(client, criar_usuario, ficha_tc, orthanc_falso, db):  # noqa: F811
    ficha_tc.status = StatusCuradoria.EM_ANALISE.value
    db.commit()
    cab = _cab(client, criar_usuario, UserRole.estudante)
    assert _geo(client, cab, ficha_tc).status_code == 404
    assert _plano(client, cab, ficha_tc).status_code == 404


def test_imagem_desativada_404(client, criar_usuario, ficha_tc, orthanc_falso, db):  # noqa: F811
    ficha_tc.orthanc_reference.ativo = False
    db.commit()
    assert _geo(client, _cab(client, criar_usuario, UserRole.estudante), ficha_tc).status_code == 404


def test_sem_login_401(client, ficha_tc, orthanc_falso):  # noqa: F811
    assert client.get(f"/search/{ficha_tc.id}/tomografia/geometria").status_code == 401


def test_radiografia_422(client, criar_usuario, ficha_tc, orthanc_falso, db):  # noqa: F811
    ficha_tc.orthanc_reference.orthanc_id = "rx-1"
    db.commit()
    assert _geo(client, _cab(client, criar_usuario, UserRole.estudante), ficha_tc).status_code == 422


@pytest.mark.parametrize("plano, indice", [("axial", 40), ("sagital", 70), ("obliquo", 1)])
def test_corte_fora_ou_plano_desconhecido_422(client, criar_usuario, ficha_tc, orthanc_falso, plano, indice):  # noqa: F811
    assert _plano(client, _cab(client, criar_usuario, UserRole.estudante), ficha_tc, plano, indice).status_code == 422


def test_pesquisa_devolve_as_marcacoes_com_plano_e_corte(client, criar_usuario, ficha_tc, orthanc_falso):  # noqa: F811
    r = client.get("/search", headers=_cab(client, criar_usuario, UserRole.estudante), params={"limit": 200})
    assert r.status_code == 200, r.text
    item = next(i for i in r.json()["itens"] if i["curation_id"] == ficha_tc.id)
    assert any(m.get("plano") == "axial" and m.get("corte") == 20 for m in item["marcacoes"])
