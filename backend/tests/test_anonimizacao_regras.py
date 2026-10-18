"""
Regras de anonimizacao (app/modules/orthanc_client.py) e verificacao de texto
nos pixels (app/modules/texto_na_imagem.py) - auditoria TST-DICOM-02/03.
Decisoes do responsavel (18/10/2026): datas so com o ano, horas apagadas,
idade exata com 90+ agrupado, sexo mantido, sequencia de equipamento removida.
"""

import io
import shutil

import numpy as np
import pydicom
import pytest
from PIL import Image, ImageDraw, ImageFont
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, SecondaryCaptureImageStorage, generate_uid

from app.modules.orthanc_client import METODO_ANONIMIZACAO, regras_de_anonimizacao
from app.modules.texto_na_imagem import NAO_VERIFICADO, SEM_TEXTO, TARJADO, tarjar_texto

TEM_OCR = shutil.which("tesseract") is not None


def test_datas_ficam_so_com_o_ano_e_horas_nao_sao_mantidas():
    regras = regras_de_anonimizacao({"StudyDate": "20261015", "SeriesDate": "20261015", "StudyTime": "101500"})
    assert regras["Replace"]["StudyDate"] == "20260101"
    assert regras["Replace"]["SeriesDate"] == "20260101"
    assert "StudyTime" not in regras["Keep"] and "StudyTime" not in regras["Replace"]


def test_idade_mantida_e_90_ou_mais_agrupada():
    assert regras_de_anonimizacao({"PatientAge": "055Y"})["Keep"] == ["PatientSex", "PatientAge"]
    r = regras_de_anonimizacao({"PatientAge": "097Y"})
    assert "PatientAge" not in r["Keep"] and r["Replace"]["PatientAge"] == "090Y"
    assert regras_de_anonimizacao({"PatientAge": "008M"})["Keep"] == ["PatientSex", "PatientAge"]  # bebe: meses


def test_sequencia_de_equipamento_removida_e_metodo_registrado():
    r = regras_de_anonimizacao({})
    assert r["Remove"] == ["ContributingEquipmentSequence"]
    assert r["Replace"]["DeidentificationMethod"] == METODO_ANONIMIZACAO
    assert len(METODO_ANONIMIZACAO) <= 64  # limite do tipo LO no DICOM


def test_data_invalida_e_ignorada():
    assert "StudyDate" not in regras_de_anonimizacao({"StudyDate": ""})["Replace"]
    assert "StudyDate" not in regras_de_anonimizacao({"StudyDate": "xx"})["Replace"]


def _dicom(pixels: np.ndarray, mono: str = "MONOCHROME2") -> bytes:
    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = SecondaryCaptureImageStorage
    meta.MediaStorageSOPInstanceUID = generate_uid()
    meta.TransferSyntaxUID = ExplicitVRLittleEndian
    ds = FileDataset("t.dcm", {}, file_meta=meta, preamble=b"\0" * 128)
    ds.SOPClassUID = SecondaryCaptureImageStorage
    ds.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
    ds.Modality = "PX"
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = mono
    ds.Rows, ds.Columns = pixels.shape
    ds.BitsAllocated, ds.BitsStored, ds.HighBit, ds.PixelRepresentation = 16, 12, 11, 0
    ds.PixelData = pixels.astype(np.uint16).tobytes()
    saida = io.BytesIO()
    ds.save_as(saida, enforce_file_format=True)
    return saida.getvalue()


def _radiografia(h: int, w: int) -> np.ndarray:
    rng = np.random.default_rng(3)
    y, x = np.mgrid[0:h, 0:w]
    base = 1200 + 900 * np.exp(-(((x - w / 2) / (w / 3)) ** 2 + ((y - h / 2) / (h / 4)) ** 2))
    return np.clip(base + 150 * np.sin(x / 3.1) * np.cos(y / 2.7) + 120 * rng.standard_normal((h, w)), 0, 4095)


def _com_texto(pix: np.ndarray, frase: str, posicao=(20, 15)) -> np.ndarray:
    camada = Image.new("L", (pix.shape[1], pix.shape[0]), 0)
    fonte = ImageFont.load_default(size=26)  # fonte embutida no Pillow: funciona sem fontes do sistema
    ImageDraw.Draw(camada).text(posicao, frase, fill=255, font=fonte)
    pix = pix.copy()
    pix[np.array(camada) > 128] = 4095
    return pix


@pytest.mark.skipif(not TEM_OCR, reason="Tesseract nao instalado neste ambiente")
def test_texto_gravado_e_tarjado_e_imagem_limpa_nao_muda():
    limpa = _radiografia(450, 900)
    arquivo_limpo = _dicom(limpa)
    saida, res = tarjar_texto(arquivo_limpo)
    assert res.situacao == SEM_TEXTO and saida == arquivo_limpo  # nada alterado

    com_texto = _com_texto(limpa, "PACIENTE FICTICIO 998877")
    saida, res = tarjar_texto(_dicom(com_texto))
    assert res.situacao == TARJADO and res.regioes >= 2
    ds = pydicom.dcmread(io.BytesIO(saida))
    faixa = ds.pixel_array[10:50, 15:420]
    assert (faixa == 4095).mean() < 0.01, "o texto branco deveria ter sido coberto"
    metodos = ds.DeidentificationMethod
    metodos = [metodos] if isinstance(metodos, str) else list(metodos)
    assert any("Radix OCR" in m for m in metodos)


def test_imagem_com_varios_quadros_fica_para_conferencia_humana():
    pix = _radiografia(64, 64)
    meta_bytes = _dicom(pix)
    ds = pydicom.dcmread(io.BytesIO(meta_bytes))
    ds.NumberOfFrames = 2
    ds.PixelData = np.stack([pix, pix]).astype(np.uint16).tobytes()
    b = io.BytesIO(); ds.save_as(b, enforce_file_format=True)
    saida, res = tarjar_texto(b.getvalue())
    assert res.situacao == NAO_VERIFICADO and saida == b.getvalue()


def test_arquivo_ilegivel_nao_quebra_e_fica_para_conferencia():
    saida, res = tarjar_texto(b"isto nao e um dicom")
    assert res.situacao == NAO_VERIFICADO and saida == b"isto nao e um dicom"


def test_curador_ve_o_resultado_e_aprovacao_registra_a_conferencia(client, criar_usuario, criar_ficha, db):
    from app.modules.audit_logs import AuditLog
    from app.modules.users import UserRole
    from tests.conftest import cabecalho_auth, obter_token

    ficha = criar_ficha(status="pendente")
    ficha.orthanc_reference.texto_na_imagem = TARJADO
    ficha.orthanc_reference.texto_regioes = 3
    db.commit()
    curador = criar_usuario(perfil=UserRole.curador)
    client.cookies.clear()
    cab = cabecalho_auth(obter_token(client, curador.email))
    dados = client.get(f"/curation/{ficha.id}", headers=cab).json()
    assert dados["texto_na_imagem"] == TARJADO and dados["texto_regioes"] == 3
    # sem marcar "anonimizacao validada" nao aprova
    assert client.post(f"/curation/{ficha.id}/approve", json={"anonimizacao_validada": False}, headers=cab).status_code == 422
    r = client.post(f"/curation/{ficha.id}/approve", json={"anonimizacao_validada": True}, headers=cab)
    assert r.status_code == 200, r.text
    log = (db.query(AuditLog).filter(AuditLog.entidade_id == ficha.id, AuditLog.resultado == "sucesso")
           .order_by(AuditLog.id.desc()).first())
    assert "Texto na imagem: tarjado, 3 tarjas" in log.detalhes
    client.cookies.clear()


def test_sem_leitor_de_texto_a_chegada_automatica_nao_toca_nas_imagens(monkeypatch):
    """Se o Tesseract nao estiver instalado, nenhuma imagem do aparelho e mexida (nem apagada)."""
    import shutil as _shutil

    from app.modules import anonimizacao_automatica as auto

    chamado = []
    monkeypatch.setattr(_shutil, "which", lambda nome: None)
    monkeypatch.setattr(auto.orthanc_client, "listar_instancias", lambda: chamado.append(1) or ["x"])
    assert auto.processar_chegadas() == 0
    assert chamado == []  # nem chegou a consultar o Orthanc
