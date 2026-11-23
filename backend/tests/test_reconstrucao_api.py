"""
RECONSTRUCAO PANORAMICA - SERVIDOR (etapa 2). Pedido do Luciano, 23/11/2026.

Decisoes dele: a reconstrucao serve para VISUALIZAR e ENSINAR - vira serie
nova DENTRO do estudo da tomografia (marcada como reconstrucao), nao entra
na fila nem na pesquisa como radiografia; 1a entrega = panoramica + cortes
transversais.

Aqui o Orthanc e FALSO (dicionario em memoria) com uma tomografia
ARTIFICIAL: 40 cortes axiais de 60 x 70 pixels, um "dente" claro no meio.
Regras conferidas:
- so curador e administrador geram; so de tomografia (CT com varios cortes);
- geometria e corte axial (PNG) para a tela de tracar a curva;
- as series novas ficam no MESMO estudo (mesmo StudyInstanceUID), com UIDs
  novos, modalidade OT, ImageType DERIVED e o tamanho do pixel (mm);
- a tomografia original nao muda; as series novas ficam registradas e a
  sincronizacao com o Orthanc NAO as poe na fila;
- uma reconstrucao por vez no servidor (protege a memoria);
- auditoria "reconstrucao_panoramica".
"""

import io

import numpy as np
import pytest
from PIL import Image
from pydicom import dcmread
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import CTImageStorage, ExplicitVRLittleEndian, generate_uid

from app.modules import orthanc_client
from app.modules.audit_logs import AuditLog
from app.modules.orthanc_references import OrthancReference
from app.modules.reconstrucao import router as modulo_router
from app.modules.reconstrucao.modelo import ReconstrucaoTomografia
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token

NZ, LINHAS, COLUNAS = 40, 60, 70
ESP_XY, ESP_Z = 0.4, 0.5
ESTUDO = "1.2.826.0.1.3680043.8.498.999.1"
SERIE = "1.2.826.0.1.3680043.8.498.999.2"


def _corte(k: int, modalidade="CT") -> bytes:
    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = CTImageStorage
    meta.MediaStorageSOPInstanceUID = generate_uid()
    meta.TransferSyntaxUID = ExplicitVRLittleEndian
    ds = FileDataset("corte.dcm", {}, file_meta=meta, preamble=b"\0" * 128)
    ds.SOPClassUID = CTImageStorage
    ds.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
    ds.StudyInstanceUID, ds.SeriesInstanceUID = ESTUDO, SERIE
    ds.PatientID, ds.PatientName = "ANON-SINTETICO", "Anonimo^Sintetico"
    ds.Modality = modalidade
    ds.SeriesNumber, ds.InstanceNumber = 2, k + 1
    ds.Rows, ds.Columns = LINHAS, COLUNAS
    ds.PixelSpacing = [ESP_XY, ESP_XY]
    ds.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
    ds.ImagePositionPatient = [0.0, 0.0, k * ESP_Z]
    ds.RescaleSlope, ds.RescaleIntercept = 1, -1024
    ds.BitsAllocated, ds.BitsStored, ds.HighBit, ds.PixelRepresentation = 16, 16, 15, 0
    ds.SamplesPerPixel, ds.PhotometricInterpretation = 1, "MONOCHROME2"
    img = np.full((LINHAS, COLUNAS), 24, dtype=np.uint16)  # -1000 HU
    if 10 <= k < 30:
        yy, xx = np.mgrid[0:LINHAS, 0:COLUNAS]
        img[(yy - 20) ** 2 + (xx - 35) ** 2 <= 9] = 2524  # "dente" 1500 HU
    ds.PixelData = img.tobytes()
    buf = io.BytesIO()
    ds.save_as(buf, enforce_file_format=True)
    return buf.getvalue()


@pytest.fixture()
def orthanc_falso(monkeypatch):
    arquivos = {f"corte-{k:02d}": _corte(k) for k in range(NZ)}
    enviados: list[bytes] = []

    def detalhes(oid):
        return {"ParentSeries": "serie-tc" if oid.startswith("corte") else "serie-rx", "ID": oid}

    def cortes(serie):
        return sorted(arquivos) if serie == "serie-tc" else ["rx-1"]

    def arquivo(oid):
        if oid == "rx-1":
            return _corte(0, modalidade="DX")
        return arquivos[oid]

    def enviar(conteudo):
        enviados.append(conteudo)
        return {"ID": f"derivada-{len(enviados)}", "Status": "Success"}

    monkeypatch.setattr(orthanc_client, "obter_detalhes_instancia", detalhes)
    monkeypatch.setattr(orthanc_client, "listar_cortes_ordenados", cortes)
    monkeypatch.setattr(orthanc_client, "obter_arquivo_instancia", arquivo)
    monkeypatch.setattr(orthanc_client, "enviar_instancia", enviar)
    return enviados


@pytest.fixture()
def tomografia(criar_referencia, db):
    ref = criar_referencia()
    ref.orthanc_id = "corte-00"
    ref.study_instance_uid = ESTUDO
    ref.em_volume = False
    db.commit()
    yield ref
    db.query(ReconstrucaoTomografia).filter(ReconstrucaoTomografia.orthanc_reference_id == ref.id).delete()
    db.commit()


def _cab(client, criar_usuario, perfil=UserRole.curador):
    return cabecalho_auth(obter_token(client, criar_usuario(perfil=perfil).email))


# arcada em pixels do corte axial (coluna, linha), passando pelo "dente" (35, 20)
PONTOS = [[10, 45], [20, 28], [35, 20], [50, 28], [60, 45]]


def _gerar(client, cab, ref, **extra):
    corpo = {"pontos_px": PONTOS, "espessura_mm": 6, "intervalo_mm": 2, "largura_mm": 12, **extra}
    return client.post(f"/reconstrucao/{ref.id}", headers=cab, json=corpo)


# ------------------------------------------------------------------ tela de tracar
def test_geometria_da_tomografia(client, criar_usuario, tomografia, orthanc_falso):
    r = client.get(f"/reconstrucao/{tomografia.id}/geometria", headers=_cab(client, criar_usuario))
    assert r.status_code == 200, r.text
    g = r.json()
    assert (g["cortes"], g["linhas"], g["colunas"]) == (NZ, LINHAS, COLUNAS)
    assert g["espacamento_mm"] == pytest.approx([ESP_Z, ESP_XY, ESP_XY])
    assert g["altura_mm"] == pytest.approx((NZ - 1) * ESP_Z)


def test_corte_axial_em_png(client, criar_usuario, tomografia, orthanc_falso):
    r = client.get(f"/reconstrucao/{tomografia.id}/axial.png", headers=_cab(client, criar_usuario),
                   params={"altura_mm": 10, "espessura_mm": 4})
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "image/png"
    img = np.array(Image.open(io.BytesIO(r.content)))
    assert img.shape == (LINHAS, COLUNAS)
    assert img[20, 35] > 200 and img[50, 5] < 50  # o "dente" claro, o fundo escuro


def test_radiografia_nao_e_tomografia(client, criar_usuario, criar_referencia, db, orthanc_falso):
    ref = criar_referencia()
    ref.orthanc_id = "rx-1"
    db.commit()
    r = client.get(f"/reconstrucao/{ref.id}/geometria", headers=_cab(client, criar_usuario))
    assert r.status_code == 422
    assert "tomografia" in r.json()["detail"]


# ------------------------------------------------------------------ gerar
def test_gera_panoramica_e_cortes_no_mesmo_estudo(client, criar_usuario, tomografia, orthanc_falso, db):
    cab = _cab(client, criar_usuario)
    r = _gerar(client, cab, tomografia)
    assert r.status_code == 201, r.text
    dados = r.json()
    assert dados["total_cortes"] >= 10
    enviados = [dcmread(io.BytesIO(b)) for b in orthanc_falso]
    assert len(enviados) == 1 + dados["total_cortes"]
    pano, cortes = enviados[0], enviados[1:]
    for ds in enviados:
        assert ds.StudyInstanceUID == ESTUDO
        assert ds.SeriesInstanceUID != SERIE
        assert ds.PatientID == "ANON-SINTETICO"
        assert ds.Modality == "OT"
        assert "DERIVED" in list(ds.ImageType)
        assert float(ds.PixelSpacing[0]) == pytest.approx(dados["tamanho_pixel_mm"])
        assert ds.ReferencedSeriesSequence[0].SeriesInstanceUID == SERIE
    assert "Panorâmica reconstruída" in pano.SeriesDescription
    assert pano.SeriesInstanceUID == dados["serie_panoramica_uid"]
    assert {c.SeriesInstanceUID for c in cortes} == {dados["serie_cortes_uid"]}
    assert [int(c.InstanceNumber) for c in cortes] == list(range(1, len(cortes) + 1))
    assert "Cortes transversais" in cortes[0].SeriesDescription
    # o "dente" aparece claro na panoramica
    assert pano.pixel_array.max() > 500
    # registrada, com as instancias novas (para a sincronizacao nao as importar)
    db.expire_all()
    rec = db.query(ReconstrucaoTomografia).filter(ReconstrucaoTomografia.orthanc_reference_id == tomografia.id).one()
    assert len(rec.instancias_orthanc) == len(enviados)
    assert rec.parametros["espessura_mm"] == 6
    log = db.query(AuditLog).filter(AuditLog.acao == "reconstrucao_panoramica").order_by(AuditLog.id.desc()).first()
    assert log.entidade_id == tomografia.id and log.resultado == "sucesso"
    # a lista mostra a reconstrucao
    lista = client.get(f"/reconstrucao/{tomografia.id}/lista", headers=cab).json()
    assert lista[0]["serie_cortes_uid"] == dados["serie_cortes_uid"]


@pytest.mark.parametrize("perfil", [UserRole.estudante, UserRole.professor, UserRole.suporte, UserRole.pesquisador])
def test_so_curador_e_administrador_geram(client, criar_usuario, tomografia, orthanc_falso, perfil):
    assert _gerar(client, _cab(client, criar_usuario, perfil), tomografia).status_code == 403
    assert orthanc_falso == []


def test_administrador_gera(client, criar_usuario, tomografia, orthanc_falso):
    assert _gerar(client, _cab(client, criar_usuario, UserRole.administrador), tomografia).status_code == 201


@pytest.mark.parametrize("extra", [
    {"pontos_px": [[10, 10], [20, 20]]},
    {"pontos_px": [[10, 10], [500, 20], [600, 30]]},
    {"espessura_mm": 100},
    {"intervalo_mm": 0},
])
def test_parametros_invalidos(client, criar_usuario, tomografia, orthanc_falso, extra):
    r = _gerar(client, _cab(client, criar_usuario), tomografia, **extra)
    assert r.status_code == 422
    assert orthanc_falso == []


def test_uma_reconstrucao_por_vez(client, criar_usuario, tomografia, orthanc_falso):
    cab = _cab(client, criar_usuario)
    assert modulo_router.TRAVA.acquire(blocking=False)
    try:
        r = _gerar(client, cab, tomografia)
    finally:
        modulo_router.TRAVA.release()
    assert r.status_code == 409
    assert "outra reconstrução" in r.json()["detail"]


def test_sincronizacao_nao_importa_as_series_derivadas(client, criar_usuario, tomografia, orthanc_falso, db, monkeypatch):
    cab = _cab(client, criar_usuario)
    assert _gerar(client, cab, tomografia).status_code == 201
    derivadas = [f"derivada-{i + 1}" for i in range(len(orthanc_falso))]
    from app.modules import images_router

    def nao_chame(_db, oid):
        raise AssertionError(f"tentou importar a derivada {oid}")

    monkeypatch.setattr(orthanc_client, "listar_instancias", lambda: derivadas)
    monkeypatch.setattr(images_router, "_registrar_referencia_se_nova", nao_chame)
    adm = _cab(client, criar_usuario, UserRole.administrador)
    r = client.post("/images/import-from-orthanc", headers=adm)
    assert r.status_code == 200, r.text
    assert r.json()["erros"] == 0 and r.json()["novas_importadas"] == 0
    assert db.query(OrthancReference).filter(OrthancReference.orthanc_id.in_(derivadas)).count() == 0
