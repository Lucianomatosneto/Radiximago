"""
CANAL MANDIBULAR NA RECONSTRUCAO PANORAMICA (pedido do Luciano, 23/11/2026).

Decisoes dele: o curador marca o trajeto do canal NA PANORAMICA
RECONSTRUIDA (do forame mandibular ao forame mentual, de cada lado), e o
canal aparece DESENHADO nas series geradas (traco na panoramica, marca em
cada corte transversal), para ensino.

Regras conferidas:
- matematica do desenho (app/modules/reconstrucao/canal.py), sem Orthanc:
  o traco liga os pontos clicados; no corte transversal o canal vira uma
  marca na ALTURA dele, sobre a faixa da panoramica (a panoramica nao diz
  se o canal esta mais para lingual ou vestibular - limite declarado);
- servidor: series NOVAS no mesmo estudo ("Panorâmica com canal" e
  "Cortes com canal"), em cor (RGB); a reconstrucao original nao muda; o
  trajeto fica registrado; a sincronizacao nao importa as series novas;
  auditoria "marcacao_canal_mandibular"; so curador e administrador.
Tomografia ARTIFICIAL (a mesma dos testes da reconstrucao).
"""

import io

import numpy as np
import pytest
from PIL import Image
from pydicom import dcmread

from app.modules import orthanc_client
from app.modules.audit_logs import AuditLog
from app.modules.reconstrucao import canal
from app.modules.reconstrucao.modelo import ReconstrucaoTomografia
from app.modules.users import UserRole
from tests.test_reconstrucao_api import ESTUDO, _cab, _gerar
from tests.test_reconstrucao_api import orthanc_falso, tomografia  # noqa: F401 - fixtures

# --------------------------------------------------------------------- desenho (sem Orthanc)


def test_linha_do_canal_liga_os_pontos_coluna_a_coluna():
    cols, linhas = canal.linha_do_canal([[30, 20], [10, 10]], largura=50, altura=40)
    assert cols[0] == 10 and cols[-1] == 30  # em ordem ao longo da panoramica
    assert linhas[0] == pytest.approx(10) and linhas[-1] == pytest.approx(20)
    assert linhas[list(cols).index(20)] == pytest.approx(15)


@pytest.mark.parametrize("pontos", [[[5, 5]], [[5, 5], [5, 9]], [[5, 5], [60, 9]], [[-1, 5], [9, 9]]])
def test_linha_do_canal_invalida(pontos):
    with pytest.raises(ValueError):
        canal.linha_do_canal(pontos, largura=50, altura=40)


def _cinza(h=40, w=50):
    return np.tile(np.linspace(-1000, 2000, w, dtype=np.float32), (h, 1))


def _colorido(px):
    r, g, b = (int(v) for v in px)
    return not (r == g == b)


def test_panoramica_com_canal_desenha_em_cor():
    rgb = canal.panoramica_com_canal(_cinza(), [[[10, 20], [40, 20]]])
    assert rgb.shape == (40, 50, 3) and rgb.dtype == np.uint8
    assert _colorido(rgb[20, 25])          # em cima do traco
    assert not _colorido(rgb[5, 25])       # longe do traco: cinza
    assert tuple(rgb[20, 25]) == canal.CORES[0]


def test_segundo_tracado_tem_outra_cor():
    rgb = canal.panoramica_com_canal(_cinza(), [[[2, 10], [20, 10]], [[30, 30], [48, 30]]])
    assert tuple(rgb[10, 10]) == canal.CORES[0]
    assert tuple(rgb[30, 40]) == canal.CORES[1]
    assert canal.CORES[0] != canal.CORES[1]


def test_corte_com_canal_marca_a_altura_sobre_a_faixa():
    corte = _cinza(h=40, w=31)
    rgb = canal.corte_com_canal(corte, [(18.0, canal.CORES[0])], meia_faixa_px=5)
    assert _colorido(rgb[18, 15])          # centro do corte, na altura do canal
    assert not _colorido(rgb[18, 2])       # fora da faixa: sem marca
    assert not _colorido(rgb[5, 15])       # outra altura: sem marca
    sem = canal.corte_com_canal(corte, [], meia_faixa_px=5)
    assert not any(_colorido(p) for p in sem.reshape(-1, 3))


def test_coluna_do_corte_segue_a_regra_dos_cortes_transversais():
    # corte 1 = inicio da curva; a cada `intervalo` mm, `intervalo/passo` colunas
    assert canal.coluna_do_corte(1, intervalo_mm=2, passo_mm=0.4, colunas=100) == 0
    assert canal.coluna_do_corte(3, intervalo_mm=2, passo_mm=0.4, colunas=100) == 10
    assert canal.coluna_do_corte(99, intervalo_mm=2, passo_mm=0.4, colunas=100) == 99


def test_alturas_no_corte_so_dos_tracados_que_passam_ali():
    tracados = [canal.linha_do_canal([[0, 10], [20, 30]], 50, 40), canal.linha_do_canal([[30, 5], [45, 5]], 50, 40)]
    assert [round(a) for a, _ in canal.alturas_na_coluna(tracados, 10)] == [20]
    assert [round(a) for a, _ in canal.alturas_na_coluna(tracados, 40)] == [5]
    assert canal.alturas_na_coluna(tracados, 25) == []


# --------------------------------------------------------------------- servidor


@pytest.fixture()
def orthanc_com_derivadas(orthanc_falso, monkeypatch):  # noqa: F811
    """o Orthanc falso tambem devolve as instancias que o Radix gravou"""
    original = orthanc_client.obter_arquivo_instancia

    def arquivo(oid):
        if oid.startswith("derivada-"):
            return orthanc_falso[int(oid.split("-")[1]) - 1]
        return original(oid)

    monkeypatch.setattr(orthanc_client, "obter_arquivo_instancia", arquivo)
    return orthanc_falso


@pytest.fixture()
def reconstrucao(client, criar_usuario, tomografia, orthanc_com_derivadas):  # noqa: F811
    cab = _cab(client, criar_usuario)
    r = _gerar(client, cab, tomografia)
    assert r.status_code == 201, r.text
    return {"cab": cab, "ref": tomografia, "rec": r.json(), "enviados": orthanc_com_derivadas}


def _url(dados, fim=""):
    return f"/reconstrucao/{dados['ref'].id}/{dados['rec']['id']}{fim}"


def test_panoramica_para_marcar(client, reconstrucao):
    info = client.get(_url(reconstrucao, "/panoramica"), headers=reconstrucao["cab"])
    assert info.status_code == 200, info.text
    pano = dcmread(io.BytesIO(reconstrucao["enviados"][0]))
    assert (info.json()["largura"], info.json()["altura"]) == (int(pano.Columns), int(pano.Rows))
    png = client.get(_url(reconstrucao, "/panoramica.png"), headers=reconstrucao["cab"])
    assert png.status_code == 200 and png.headers["content-type"] == "image/png"
    assert "attachment" in png.headers["content-disposition"] or "inline" in png.headers["content-disposition"]
    assert np.array(Image.open(io.BytesIO(png.content))).shape == (int(pano.Rows), int(pano.Columns))


def test_marca_o_canal_e_gera_series_desenhadas(client, reconstrucao, db):
    pano = dcmread(io.BytesIO(reconstrucao["enviados"][0]))
    w, h = int(pano.Columns), int(pano.Rows)
    antes = len(reconstrucao["enviados"])
    tracado = [[1, h // 2], [w // 2, h // 2 + 2], [w - 2, h // 2]]
    r = client.post(_url(reconstrucao, "/canal"), headers=reconstrucao["cab"], json={"tracados": [tracado]})
    assert r.status_code == 201, r.text
    novos = [dcmread(io.BytesIO(b)) for b in reconstrucao["enviados"][antes:]]
    total = reconstrucao["rec"]["total_cortes"]
    assert len(novos) == 1 + total
    for ds in novos:
        assert ds.StudyInstanceUID == ESTUDO
        assert ds.PhotometricInterpretation == "RGB" and int(ds.SamplesPerPixel) == 3
        assert ds.Modality == "OT" and "DERIVED" in list(ds.ImageType)
    assert novos[0].SeriesDescription.startswith("RADIX - Panorâmica com canal")
    assert {d.SeriesDescription for d in novos[1:]} == {novos[1].SeriesDescription}
    assert novos[1].SeriesDescription.startswith("RADIX - Cortes com canal")
    assert novos[0].SeriesInstanceUID not in (reconstrucao["rec"]["serie_panoramica_uid"], reconstrucao["rec"]["serie_cortes_uid"])
    # o traco aparece na panoramica (em cor) e cada corte tem a marca
    rgb = novos[0].pixel_array
    assert tuple(rgb[h // 2 + 2, w // 2]) == canal.CORES[0]
    assert all(np.any(c.pixel_array[..., 0] != c.pixel_array[..., 2]) for c in novos[1:])
    # registrado: trajeto, series e instancias (a sincronizacao nao as importa)
    db.expire_all()
    rec = db.get(ReconstrucaoTomografia, reconstrucao["rec"]["id"])
    assert rec.canal["tracados"] == [tracado]
    assert len(rec.instancias_orthanc) == antes + len(novos)
    log = db.query(AuditLog).filter(AuditLog.acao == "marcacao_canal_mandibular").order_by(AuditLog.id.desc()).first()
    assert log.entidade_id == reconstrucao["ref"].id and log.resultado == "sucesso"
    lista = client.get(f"/reconstrucao/{reconstrucao['ref'].id}/lista", headers=reconstrucao["cab"]).json()
    assert lista[0]["canal"]["tracados"] == [tracado]


@pytest.mark.parametrize("tracados", [
    [],
    [[[1, 1]]],
    [[[1, 1], [9999, 2]]],
    [[[1, 1], [5, 2]], [[6, 1], [9, 2]], [[10, 1], [12, 2]]],
])
def test_tracados_invalidos(client, reconstrucao, tracados):
    antes = len(reconstrucao["enviados"])
    r = client.post(_url(reconstrucao, "/canal"), headers=reconstrucao["cab"], json={"tracados": tracados})
    assert r.status_code == 422
    assert len(reconstrucao["enviados"]) == antes


@pytest.mark.parametrize("perfil", [UserRole.estudante, UserRole.professor, UserRole.suporte])
def test_so_curador_e_administrador_marcam(client, criar_usuario, reconstrucao, perfil):
    r = client.post(_url(reconstrucao, "/canal"), headers=_cab(client, criar_usuario, perfil),
                    json={"tracados": [[[1, 5], [9, 5]]]})
    assert r.status_code == 403


def test_reconstrucao_de_outro_exame_nao_e_achada(client, reconstrucao, criar_referencia, db):
    outra = criar_referencia()
    db.commit()
    r = client.get(f"/reconstrucao/{outra.id}/{reconstrucao['rec']['id']}/panoramica", headers=reconstrucao["cab"])
    assert r.status_code == 404
