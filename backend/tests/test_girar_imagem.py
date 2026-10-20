"""
Giro da imagem pelo curador (POST /curation/imagem/{id}/girar) - 20/10/2026.
O Orthanc e simulado em memoria; imagens SINTETICAS.
"""

import io
import uuid

import numpy as np
import pydicom
import pytest

from app.modules import orthanc_client, substituir_instancia
from app.modules.achados import Achado
from app.modules.anotacoes import AnotacaoImagem
from app.modules.audit_logs import AuditLog
from app.modules.curations import Curation, StatusCuradoria
from app.modules.orthanc_references import OrthancReference
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token
from tests.test_geometria_imagem import _dicom, _radiografia


class OrthancFalso:
    def __init__(self, monkeypatch):
        self.arquivos: dict[str, bytes] = {}
        self.tags: dict[str, dict] = {}
        self.apagados: list[str] = []
        monkeypatch.setattr(orthanc_client, "obter_arquivo_instancia", lambda i: self.arquivos[i])
        monkeypatch.setattr(orthanc_client, "obter_tags_simplificadas_instancia", self._tags)
        monkeypatch.setattr(orthanc_client, "enviar_instancia", self._enviar)
        monkeypatch.setattr(orthanc_client, "excluir_instancia", self._excluir)

    def guardar(self, orthanc_id: str, arquivo: bytes, **tags) -> None:
        self.arquivos[orthanc_id] = arquivo
        self.tags[orthanc_id] = {"Modality": "IO", **tags}

    def _tags(self, i):
        ds = pydicom.dcmread(io.BytesIO(self.arquivos[i]), stop_before_pixels=True)
        return {**self.tags.get(i, {}), "SOPInstanceUID": ds.SOPInstanceUID}

    def _enviar(self, conteudo):
        novo = f"novo-{uuid.uuid4().hex[:10]}"
        self.arquivos[novo] = conteudo
        self.tags[novo] = {"Modality": "IO"}
        return {"ID": novo}

    def _excluir(self, i):
        self.apagados.append(i)
        self.arquivos.pop(i, None)


@pytest.fixture()
def orthanc(monkeypatch):
    return OrthancFalso(monkeypatch)


def _token(client, criar_usuario, perfil=UserRole.curador):
    return cabecalho_auth(obter_token(client, criar_usuario(perfil=perfil).email))


def test_curador_gira_e_tudo_acompanha(client, db, criar_usuario, criar_ficha, orthanc):
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)
    ref = db.get(OrthancReference, ficha.orthanc_reference_id)
    antigo = ref.orthanc_id
    rad = _radiografia(120, 200)
    orthanc.guardar(antigo, _dicom(rad))
    ficha = db.get(Curation, ficha.id)
    ficha.marcacoes = [{"id": "m", "tipo": "seta", "x1": 0.1, "y1": 0.2, "x2": 0.3, "y2": 0.4}]
    achado = Achado(curation_id=ficha.id, tipo="carie_dentina",
                    marcacoes=[{"id": "a", "tipo": "retangulo", "x": 0.1, "y": 0.2, "largura": 0.3, "altura": 0.1}])
    autor = criar_usuario()
    nota = AnotacaoImagem(curation_id=ficha.id, usuario_id=autor.id, texto="nota", pos_x=0.25, pos_y=0.5)
    db.add_all([achado, nota])
    db.commit()
    try:
        r = client.post(f"/curation/imagem/{ref.id}/girar", json={"graus": 90}, headers=_token(client, criar_usuario))
        assert r.status_code == 200, r.text
        assert r.json()["giro_graus"] == 90
        db.expire_all()
        ref = db.get(OrthancReference, ref.id)
        assert ref.orthanc_id != antigo and orthanc.apagados == [antigo]
        assert np.array_equal(pydicom.dcmread(io.BytesIO(orthanc.arquivos[ref.orthanc_id])).pixel_array, np.rot90(rad, -1))
        assert ref.sop_instance_uid == pydicom.dcmread(io.BytesIO(orthanc.arquivos[ref.orthanc_id])).SOPInstanceUID
        assert ref.dicomweb_url.endswith(ref.orthanc_id)
        # marcacoes da ficha, do achado e as anotacoes giraram junto
        seta = db.get(Curation, ficha.id).marcacoes[0]
        assert (seta["x1"], seta["y1"]) == pytest.approx((0.8, 0.1))
        caixa = db.get(Achado, achado.id).marcacoes[0]
        assert (caixa["x"], caixa["y"], caixa["largura"], caixa["altura"]) == pytest.approx((0.7, 0.1, 0.1, 0.3))
        nota = db.get(AnotacaoImagem, nota.id)
        assert (nota.pos_x, nota.pos_y) == pytest.approx((0.5, 0.25))
        assert db.query(AuditLog).filter(AuditLog.acao == "imagem_girada", AuditLog.entidade_id == ref.id).count() == 1

        # mais 270: volta a posicao original (giro acumulado 0)
        r = client.post(f"/curation/imagem/{ref.id}/girar", json={"graus": 270}, headers=_token(client, criar_usuario))
        assert r.json()["giro_graus"] == 0
        db.expire_all()
        assert np.array_equal(pydicom.dcmread(io.BytesIO(orthanc.arquivos[db.get(OrthancReference, ref.id).orthanc_id])).pixel_array, rad)
        assert db.get(Curation, ficha.id).marcacoes[0]["x1"] == pytest.approx(0.1)
    finally:
        db.query(Achado).filter(Achado.id == achado.id).delete()
        db.commit()


def test_imagem_sem_ficha_tambem_pode_ser_girada(client, db, criar_usuario, criar_referencia, orthanc):
    ref = criar_referencia()
    orthanc.guardar(ref.orthanc_id, _dicom(_radiografia(80, 120)))
    r = client.post(f"/curation/imagem/{ref.id}/girar", json={"graus": 180}, headers=_token(client, criar_usuario))
    assert r.status_code == 200 and r.json()["giro_graus"] == 180


def test_estudante_nao_gira(client, criar_usuario, criar_referencia, orthanc):
    ref = criar_referencia()
    r = client.post(f"/curation/imagem/{ref.id}/girar", json={"graus": 90},
                    headers=_token(client, criar_usuario, UserRole.estudante))
    assert r.status_code == 403


def test_angulo_invalido_e_recusado(client, criar_usuario, criar_referencia, orthanc):
    ref = criar_referencia()
    for graus in (45, 360, -90, "90"):
        r = client.post(f"/curation/imagem/{ref.id}/girar", json={"graus": graus}, headers=_token(client, criar_usuario))
        assert r.status_code == 422


def test_corte_de_tomografia_nao_e_girado(client, db, criar_usuario, criar_referencia, orthanc):
    ref = criar_referencia()
    antigo = ref.orthanc_id
    orthanc.guardar(antigo, _dicom(_radiografia(80, 120)), Modality="CT")
    r = client.post(f"/curation/imagem/{ref.id}/girar", json={"graus": 90}, headers=_token(client, criar_usuario))
    assert r.status_code == 422 and "volume" in r.json()["detail"]
    db.expire_all()
    assert db.get(OrthancReference, ref.id).orthanc_id == antigo and list(orthanc.arquivos) == [antigo]


def test_falha_no_meio_mantem_a_imagem_antiga(client, db, criar_usuario, criar_referencia, orthanc, monkeypatch):
    ref = criar_referencia()
    antigo = ref.orthanc_id
    orthanc.guardar(antigo, _dicom(_radiografia(80, 120)))

    def quebra(*a, **k):
        raise RuntimeError("banco caiu")

    monkeypatch.setattr(substituir_instancia, "_ajustar_marcacoes", quebra)
    cliente = type(client)(client.app, raise_server_exceptions=False)
    r = cliente.post(f"/curation/imagem/{ref.id}/girar", json={"graus": 90}, headers=_token(client, criar_usuario))
    assert r.status_code == 500
    db.expire_all()
    ref = db.get(OrthancReference, ref.id)
    assert ref.orthanc_id == antigo and ref.giro_graus == 0
    assert list(orthanc.arquivos) == [antigo]  # o arquivo NOVO e que foi apagado


def test_miniatura_da_pesquisa_muda_de_etiqueta_depois_do_giro(client, db, criar_usuario, criar_ficha, orthanc, monkeypatch):
    from app.modules import search_router

    ficha = criar_ficha()
    ref = db.get(OrthancReference, ficha.orthanc_reference_id)
    orthanc.guardar(ref.orthanc_id, _dicom(_radiografia(80, 120)))
    monkeypatch.setattr(search_router.orthanc_client, "obter_preview_instancia", lambda i: b"\x89PNG-falso")
    estudante = _token(client, criar_usuario, UserRole.estudante)
    antes = client.get(f"/search/{ficha.id}/preview", headers=estudante).headers["etag"]
    client.post(f"/curation/imagem/{ref.id}/girar", json={"graus": 90}, headers=_token(client, criar_usuario))
    r = client.get(f"/search/{ficha.id}/preview", headers={**estudante, "If-None-Match": antes})
    assert r.status_code == 200 and r.headers["etag"] != antes  # o navegador recebe a imagem nova
