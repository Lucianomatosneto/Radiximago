"""
Recorte da moldura branca: na ENTRADA (anonimizacao) e no roteiro para as
imagens ja guardadas (recortar_molduras.py) - 20/10/2026. Imagens SINTETICAS.
"""

import io

import numpy as np
import pydicom
import pytest

from app.modules import geometria_imagem as g
from app.modules import orthanc_client
from app.modules.curations import Curation
from app.modules.orthanc_references import OrthancReference
from tests.test_geometria_imagem import _com_moldura, _dicom, _radiografia
from tests.test_girar_imagem import OrthancFalso


class _Resposta:
    def __init__(self, conteudo: bytes):
        self.content = conteudo

    def raise_for_status(self):
        return None


def test_anonimizacao_recorta_a_moldura_antes_de_guardar(monkeypatch):
    rad = _radiografia()
    enviados = []
    monkeypatch.setattr(orthanc_client, "obter_tags_simplificadas_instancia", lambda i: {})
    monkeypatch.setattr(orthanc_client._client, "post", lambda *a, **k: _Resposta(_dicom(_com_moldura(rad))))
    monkeypatch.setattr(orthanc_client, "enviar_instancia", lambda c: enviados.append(c) or {"ID": "anon-1"})
    resposta, texto, recorte = orthanc_client.anonimizar_instancia("original-1")
    assert resposta == {"ID": "anon-1"} and recorte.situacao == g.RECORTADA
    assert np.array_equal(pydicom.dcmread(io.BytesIO(enviados[0])).pixel_array, rad)


def test_registro_da_imagem_guarda_o_resultado_do_recorte(db, monkeypatch):
    from app.modules import images_router

    monkeypatch.setattr(images_router, "_determinar_origem", lambda oid: "externa")
    monkeypatch.setattr(images_router.orthanc_client, "anonimizar_instancia",
                        lambda oid: ({"ID": "anon-reg-1"}, type("T", (), {"situacao": "sem_texto", "regioes": 0})(),
                                     g.ResultadoRecorte(g.RECORTADA, (1, 1, 99, 99), 100, 100)))
    monkeypatch.setattr(images_router.orthanc_client, "excluir_instancia", lambda oid: None)
    monkeypatch.setattr(images_router.orthanc_client, "obter_detalhes_instancia", lambda oid: {"MainDicomTags": {}})
    monkeypatch.setattr(images_router.orthanc_client, "obter_tags_simplificadas_instancia", lambda oid: {})
    db.query(OrthancReference).filter(OrthancReference.orthanc_id == "anon-reg-1").delete()
    db.commit()
    ref, criada = images_router._registrar_referencia_se_nova(db, "original-reg-1")
    try:
        assert criada and ref.enquadramento == g.RECORTADA and ref.giro_graus == 0
    finally:
        db.delete(ref)
        db.commit()


def test_roteiro_simula_sem_alterar_e_depois_aplica(db, criar_ficha, monkeypatch, tmp_path):
    import recortar_molduras

    orthanc = OrthancFalso(monkeypatch)
    monkeypatch.setattr(recortar_molduras, "PASTA_SIMULACAO", tmp_path)
    ficha = criar_ficha()
    ref = db.get(OrthancReference, ficha.orthanc_reference_id)
    antigo = ref.orthanc_id
    rad = _radiografia()
    orthanc.guardar(antigo, _dicom(_com_moldura(rad)))  # 495x365, mantem (60,40)-(460,340)
    ficha = db.get(Curation, ficha.id)
    ficha.marcacoes = [{"id": "m", "tipo": "oval", "x": 100 / 495, "y": 40 / 365, "largura": 200 / 495, "altura": 0.2}]
    db.commit()
    # outras imagens do banco de teste (sem arquivo no Orthanc falso) dao "erro" e ficam como estao
    recortar_molduras.executar(aplicar=False)
    db.expire_all()
    assert db.get(OrthancReference, ref.id).orthanc_id == antigo  # simulacao nao mexe
    assert db.get(OrthancReference, ref.id).enquadramento is None
    assert (tmp_path / f"imagem_{ref.id}.png").exists()  # figura para conferir

    recortar_molduras.executar(aplicar=True)
    db.expire_all()
    ref = db.get(OrthancReference, ref.id)
    assert ref.orthanc_id != antigo and ref.enquadramento == g.RECORTADA
    assert np.array_equal(pydicom.dcmread(io.BytesIO(orthanc.arquivos[ref.orthanc_id])).pixel_array, rad)
    oval = db.get(Curation, ficha.id).marcacoes[0]
    # x: 100 px -> (100-60)/400 = 0.1 ; y: 40 px -> 0 ; largura 200/400 = 0.5
    assert (oval["x"], oval["y"], oval["largura"]) == pytest.approx((0.1, 0.0, 0.5))
