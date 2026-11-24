"""
MARCAR LESAO NA TOMOGRAFIA - NO CORTE (pedido do Luciano, 23/11/2026,
"opcao 1"): o curador para no PLANO (axial, sagital ou coronal) e no CORTE
onde a lesao aparece melhor e desenha como nas radiografias (oval,
retangulo, seta). O Radix guarda o plano e o numero do corte junto da
marcacao.

Regras conferidas:
- servidor: a imagem do corte de cada plano (PNG em tons de cinza), na
  proporcao REAL (pixels quadrados em mm), com a parte de cima do paciente
  em cima nos planos sagital e coronal; corte fora do exame ou plano
  desconhecido = 422; so curador e administrador;
- ficha: a marcacao aceita "plano" e "corte" (os dois juntos); sem eles
  continua sendo marcacao de radiografia.
Tomografia ARTIFICIAL (a mesma dos testes da reconstrucao): 40 cortes de
60 x 70 pixels (0,4 mm) a cada 0,5 mm, com um "dente" claro na linha 20,
coluna 35, entre os cortes 10 e 29.
"""

import io

import numpy as np
import pytest
from PIL import Image
from pydantic import ValidationError

from app.modules.curation.schemas import Marcacao
from app.modules.users import UserRole
from tests.test_reconstrucao_api import _cab
from tests.test_reconstrucao_api import orthanc_falso, tomografia  # noqa: F401 - fixtures


def _png(client, cab, ref, plano, indice):
    return client.get(f"/reconstrucao/{ref.id}/plano.png", headers=cab, params={"plano": plano, "indice": indice})


def _imagem(r):
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "image/png"
    return np.array(Image.open(io.BytesIO(r.content)))


def test_corte_axial(client, criar_usuario, tomografia, orthanc_falso):  # noqa: F811
    cab = _cab(client, criar_usuario)
    img = _imagem(_png(client, cab, tomografia, "axial", 20))
    assert img.shape == (60, 70)
    assert img[20, 35] > 200 and img[5, 5] < 50
    # fora do dente (corte 2): tudo escuro
    assert _imagem(_png(client, cab, tomografia, "axial", 2)).max() < 50


def test_corte_sagital_em_mm_e_com_o_alto_em_cima(client, criar_usuario, tomografia, orthanc_falso):  # noqa: F811
    cab = _cab(client, criar_usuario)
    img = _imagem(_png(client, cab, tomografia, "sagital", 35))
    # largura = linhas (60 x 0,4 = 24 mm); altura = 20 mm de cortes / 0,4 = 50 pixels
    assert img.shape == (50, 60)
    # o dente (cortes 10-29 = 5 a 14,5 mm) fica no meio da altura, na coluna 20
    assert img[25, 20] > 200
    assert img[2, 20] < 50 and img[47, 20] < 50
    assert img[25, 50] < 50


def test_corte_coronal(client, criar_usuario, tomografia, orthanc_falso):  # noqa: F811
    cab = _cab(client, criar_usuario)
    img = _imagem(_png(client, cab, tomografia, "coronal", 20))
    assert img.shape == (50, 70)
    assert img[25, 35] > 200 and img[25, 5] < 50


@pytest.mark.parametrize("plano, indice", [("axial", 40), ("sagital", 70), ("coronal", 60), ("obliquo", 1), ("axial", -1)])
def test_corte_fora_do_exame_ou_plano_desconhecido(client, criar_usuario, tomografia, orthanc_falso, plano, indice):  # noqa: F811
    assert _png(client, _cab(client, criar_usuario), tomografia, plano, indice).status_code == 422


def test_so_curador_e_administrador(client, criar_usuario, tomografia, orthanc_falso):  # noqa: F811
    cab = _cab(client, criar_usuario, UserRole.estudante)
    assert _png(client, cab, tomografia, "axial", 20).status_code == 403


# --------------------------------------------------------------------- marcacao


def test_marcacao_guarda_plano_e_corte():
    m = Marcacao(id="m1", tipo="oval", x=0.1, y=0.1, largura=0.2, altura=0.2, plano="sagital", corte=35)
    assert (m.plano, m.corte) == ("sagital", 35)
    # radiografia: sem plano nem corte, como sempre
    r = Marcacao(id="m2", tipo="seta", x1=0.1, y1=0.1, x2=0.2, y2=0.2)
    assert r.plano is None and r.corte is None


@pytest.mark.parametrize("extra", [{"plano": "axial"}, {"corte": 3}, {"plano": "axial", "corte": -1}, {"plano": "obliquo", "corte": 3}])
def test_marcacao_plano_e_corte_andam_juntos(extra):
    with pytest.raises(ValidationError):
        Marcacao(id="m1", tipo="oval", x=0.1, y=0.1, largura=0.2, altura=0.2, **extra)


# --------------------------------------------------------------------- axial rapido
# 23/11/2026 (pedido do Luciano): na Reconstrucao, ao girar a roda a linha da
# miniatura mexia mas a imagem grande nao - cada corte axial (MIP de 10 mm)
# relia ~10 cortes do Orthanc. Agora o volume em 8 bits e preparado em
# segundo plano e, pronto, o corte axial sai da memoria, sem Orthanc.
def test_axial_usa_o_volume_da_memoria_quando_pronto(client, criar_usuario, tomografia, orthanc_falso, monkeypatch):  # noqa: F811
    from app.modules import orthanc_client
    from app.modules.reconstrucao import fonte

    cab = _cab(client, criar_usuario)
    fonte.limpar_volume()
    r = client.get(f"/reconstrucao/{tomografia.id}/axial.png", headers=cab, params={"altura_mm": 10, "espessura_mm": 4})
    assert r.status_code == 200
    fonte.aguardar_preparo()  # o volume foi montado em segundo plano
    g = fonte.geometria(tomografia.orthanc_id)
    assert fonte.volume_na_memoria(g) is not None

    # sem Orthanc: o corte sai da memoria
    def sem_orthanc(_oid):
        raise AssertionError("nao devia ler o Orthanc")

    monkeypatch.setattr(orthanc_client, "obter_arquivo_instancia", sem_orthanc)
    monkeypatch.setattr(fonte, "geometria", lambda _oid: g)
    img = _imagem(client.get(f"/reconstrucao/{tomografia.id}/axial.png", headers=cab, params={"altura_mm": 10, "espessura_mm": 4}))
    assert img.shape == (60, 70)
    assert img[20, 35] > 200 and img[5, 5] < 50
    fonte.limpar_volume()
