"""
Recorte da moldura branca e giro das radiografias (app/modules/geometria_imagem.py)
- pedido de 20/10/2026. Imagens SINTETICAS (nenhum dado de paciente).
"""

import io

import numpy as np
import pydicom
import pytest
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, generate_uid

from app.modules import geometria_imagem as g

DIGITAL_INTRAORAL = "1.2.840.10008.5.1.4.1.1.1.3"  # Digital Intra-Oral X-Ray Image Storage


def _dicom(pixels: np.ndarray, mono: str = "MONOCHROME2", **extras) -> bytes:
    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = DIGITAL_INTRAORAL
    meta.MediaStorageSOPInstanceUID = generate_uid()
    meta.TransferSyntaxUID = ExplicitVRLittleEndian
    ds = FileDataset("t.dcm", {}, file_meta=meta, preamble=b"\0" * 128)
    ds.SOPClassUID = DIGITAL_INTRAORAL
    ds.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
    ds.Modality = "IO"
    ds.ImageType = ["ORIGINAL", "PRIMARY"]
    ds.PhotometricInterpretation = mono
    if pixels.ndim == 3:
        ds.SamplesPerPixel = 3
        ds.PlanarConfiguration = 0
    else:
        ds.SamplesPerPixel = 1
    ds.Rows, ds.Columns = pixels.shape[:2]
    bits = 16 if pixels.dtype == np.uint16 else 8
    ds.BitsAllocated = bits
    ds.BitsStored = 12 if bits == 16 else 8
    ds.HighBit = ds.BitsStored - 1
    ds.PixelRepresentation = 0
    for chave, valor in extras.items():
        setattr(ds, chave, valor)
    ds.PixelData = np.ascontiguousarray(pixels).tobytes()
    saida = io.BytesIO()
    ds.save_as(saida, enforce_file_format=True)
    return saida.getvalue()


def _radiografia(altura=300, largura=400, rng=None) -> np.ndarray:
    """Parte "escura" com dentes claros e ruido - como uma periapical."""
    rng = rng or np.random.default_rng(7)
    img = rng.normal(900, 120, (altura, largura))
    for i in range(3):  # tres "dentes" verticais claros
        x = int(largura * (0.2 + 0.3 * i))
        img[int(altura * 0.1):int(altura * 0.9), x:x + largura // 10] = rng.normal(3200, 150, (int(altura * 0.9) - int(altura * 0.1), largura // 10))
    return np.clip(img, 0, 4095).astype(np.uint16)


def _com_moldura(rad: np.ndarray, topo=40, esquerda=60, baixo=25, direita=35, branco=4095) -> np.ndarray:
    a, l = rad.shape
    folha = np.full((a + topo + baixo, l + esquerda + direita), branco, dtype=np.uint16)
    folha[topo:topo + a, esquerda:esquerda + l] = rad
    return folha


def _pixels(arquivo: bytes) -> np.ndarray:
    return pydicom.dcmread(io.BytesIO(arquivo)).pixel_array


# ------------------------------------------------------------------ recorte

def test_moldura_branca_em_volta_e_recortada_exatamente():
    rad = _radiografia()
    arquivo, res = g.recortar_moldura(_dicom(_com_moldura(rad)))
    assert res.situacao == g.RECORTADA
    assert res.caixa == (60, 40, 460, 340)
    assert np.array_equal(_pixels(arquivo), rad)  # nenhum pixel da radiografia mudou
    ds = pydicom.dcmread(io.BytesIO(arquivo))
    assert ds.ImageType[0] == "DERIVED"
    assert "moldura branca recortada" in ds.DerivationDescription


def test_sem_moldura_nada_muda():
    original = _dicom(_radiografia())
    arquivo, res = g.recortar_moldura(original)
    assert res.situacao == g.SEM_BORDA and arquivo == original


def test_moldura_em_monochrome1_branco_e_o_valor_baixo():
    rad = 4095 - _radiografia()  # mesma imagem, escala invertida
    arquivo, res = g.recortar_moldura(_dicom(_com_moldura(rad, branco=0), mono="MONOCHROME1"))
    assert res.situacao == g.RECORTADA and np.array_equal(_pixels(arquivo), rad)


def test_moldura_so_de_dois_lados_tambem_sai():
    rad = _radiografia()
    _, res = g.recortar_moldura(_dicom(_com_moldura(rad, topo=0, esquerda=0, baixo=50, direita=80)))
    assert res.situacao == g.RECORTADA and res.caixa == (0, 0, 400, 300)


def test_placa_inclinada_nao_perde_nenhum_pixel_escuro():
    """Placa torta dentro da folha: o recorte e o retangulo que contem TODA a parte escura."""
    folha = np.full((500, 600), 4095, dtype=np.uint16)
    yy, xx = np.mgrid[0:500, 0:600]
    # losango "torto" (placa girada uns 10 graus)
    dentro = (np.abs((xx - 300) * 0.98 + (yy - 250) * 0.17) < 200) & (np.abs(-(xx - 300) * 0.17 + (yy - 250) * 0.98) < 150)
    folha[dentro] = 800
    arquivo, res = g.recortar_moldura(_dicom(folha))
    assert res.situacao == g.RECORTADA
    x0, y0, x1, y1 = res.caixa
    ys, xs = np.nonzero(dentro)
    assert x0 <= xs.min() and x1 > xs.max() and y0 <= ys.min() and y1 > ys.max()


def test_tarja_ou_texto_pequeno_na_moldura_nao_impede_o_recorte():
    folha = _com_moldura(_radiografia(), topo=80)
    folha[10:30, 300:420] = 0  # tarja preta do OCR, longe da radiografia
    _, res = g.recortar_moldura(_dicom(folha))
    assert res.situacao == g.RECORTADA and res.caixa[1] == 80


def test_conteudo_escuro_grande_fora_da_regiao_principal_fica_como_esta():
    """Duas radiografias na mesma folha: cortar uma perderia a outra -> incerto."""
    folha = np.full((400, 900), 4095, dtype=np.uint16)
    folha[50:350, 30:420] = _radiografia(300, 390)
    folha[50:350, 480:870] = _radiografia(300, 390)
    original = _dicom(folha)
    arquivo, res = g.recortar_moldura(original)
    assert res.situacao == g.INCERTO and arquivo == original


def test_dente_claro_encostado_na_borda_nao_e_confundido_com_moldura():
    rad = _radiografia()
    rad[:, :30] = 4095  # faixa clara (dente/restauracao) so num lado
    original = _dicom(rad)
    arquivo, res = g.recortar_moldura(original)
    assert res.situacao == g.SEM_BORDA and arquivo == original


def test_arquivo_ilegivel_nao_quebra():
    arquivo, res = g.recortar_moldura(b"nao e dicom")
    assert res.situacao == g.NAO_VERIFICADO and arquivo == b"nao e dicom"


def test_imagem_colorida_rgb():
    rad = (_radiografia() // 16).astype(np.uint8)
    folha = _com_moldura(rad.astype(np.uint16), branco=255).astype(np.uint8)
    rgb = np.stack([folha] * 3, axis=2)
    arquivo, res = g.recortar_moldura(_dicom(rgb, mono="RGB"))
    assert res.situacao == g.RECORTADA
    assert np.array_equal(_pixels(arquivo)[..., 0], rad)


# ------------------------------------------------------------------ giro

@pytest.mark.parametrize("graus,k", [(90, -1), (180, -2), (270, -3)])
def test_giro_horario_sem_perda(graus, k):
    rad = _radiografia(120, 200)
    original = _dicom(rad, PixelSpacing=[0.02, 0.04])
    girado = g.girar_dicom(original, graus)
    ds = pydicom.dcmread(io.BytesIO(girado))
    assert np.array_equal(ds.pixel_array, np.rot90(rad, k))
    assert ds.SOPInstanceUID != pydicom.dcmread(io.BytesIO(original)).SOPInstanceUID
    assert ds.file_meta.MediaStorageSOPInstanceUID == ds.SOPInstanceUID
    assert f"girada {graus} graus" in ds.DerivationDescription
    espacamento = [float(v) for v in ds.PixelSpacing]
    assert espacamento == ([0.04, 0.02] if graus in (90, 270) else [0.02, 0.04])


def test_quatro_giros_de_90_voltam_a_imagem_original():
    rad = _radiografia(120, 200)
    arquivo = _dicom(rad)
    for _ in range(4):
        arquivo = g.girar_dicom(arquivo, 90)
    assert np.array_equal(_pixels(arquivo), rad)


def test_giro_90_coloca_o_canto_superior_esquerdo_no_superior_direito():
    rad = np.zeros((100, 160), dtype=np.uint16)
    rad[0:10, 0:10] = 4000
    girada = _pixels(g.girar_dicom(_dicom(rad), 90))
    assert girada.shape == (160, 100) and girada[0:10, -10:].min() == 4000


def test_giro_recusa_angulo_invalido_e_varios_quadros():
    with pytest.raises(ValueError):
        g.girar_dicom(_dicom(_radiografia()), 45)
    with pytest.raises(g.FormatoNaoSuportado):
        g.girar_dicom(_dicom(_radiografia(), NumberOfFrames=2), 90)


# ------------------------------------------------------------------ marcacoes

def test_marcacoes_giram_junto_com_a_imagem():
    seta = {"id": "a", "tipo": "seta", "x1": 0.1, "y1": 0.2, "x2": 0.3, "y2": 0.4}
    caixa = {"id": "b", "tipo": "retangulo", "x": 0.1, "y": 0.2, "largura": 0.3, "altura": 0.1, "achado": "carie"}
    s90, c90 = g.girar_marcacoes([seta, caixa], 90)
    assert (s90["x1"], s90["y1"]) == pytest.approx((0.8, 0.1))
    assert (c90["x"], c90["y"], c90["largura"], c90["altura"]) == pytest.approx((0.7, 0.1, 0.1, 0.3))
    assert c90["achado"] == "carie"  # o resto da marcacao nao muda
    volta = [seta, caixa]
    for _ in range(4):
        volta = g.girar_marcacoes(volta, 90)
    assert volta[0]["x2"] == pytest.approx(0.3) and volta[1]["largura"] == pytest.approx(0.3)


def test_ponto_marcado_continua_sobre_o_mesmo_pixel_depois_do_giro():
    rad = np.zeros((100, 160), dtype=np.uint16)
    rad[20, 120] = 4000  # x=120/160, y=20/100
    girada = _pixels(g.girar_dicom(_dicom(rad), 270))
    x, y = g.girar_ponto((120 + 0.5) / 160, (20 + 0.5) / 100, 270)
    assert girada[int(y * girada.shape[0]), int(x * girada.shape[1])] == 4000


def test_marcacoes_acompanham_o_recorte():
    # imagem 500x400, mantida a caixa (100, 50)-(400, 350)
    m = {"id": "a", "tipo": "oval", "x": 0.3, "y": 0.25, "largura": 0.2, "altura": 0.25}
    (r,) = g.recortar_marcacoes([m], (100, 50, 400, 350), 500, 400)
    assert (r["x"], r["y"], r["largura"], r["altura"]) == pytest.approx((50 / 300, 50 / 300, 100 / 300, 100 / 300))


# ------------------------------------------------------------------ JPEG colorido (scan de filme)

def _dicom_jpeg_ybr(rgb: np.ndarray) -> bytes:
    """Como chegam fotos/scans de filme: JPEG colorido, cor YBR_FULL_422."""
    from PIL import Image
    from pydicom.encaps import encapsulate
    from pydicom.uid import JPEGBaseline8Bit

    buf = io.BytesIO()
    Image.fromarray(rgb).save(buf, format="JPEG", quality=95)
    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = DIGITAL_INTRAORAL
    meta.MediaStorageSOPInstanceUID = generate_uid()
    meta.TransferSyntaxUID = JPEGBaseline8Bit
    ds = FileDataset("t.dcm", {}, file_meta=meta, preamble=b"\0" * 128)
    ds.SOPClassUID = DIGITAL_INTRAORAL
    ds.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
    ds.Modality = "DX"
    ds.ImagePositionPatient = [0, 0, 0]  # alguns aparelhos gravam, mesmo sendo radiografia
    ds.SamplesPerPixel = 3
    ds.PhotometricInterpretation = "YBR_FULL_422"
    ds.PlanarConfiguration = 0
    ds.Rows, ds.Columns = rgb.shape[:2]
    ds.BitsAllocated = ds.BitsStored = 8
    ds.HighBit = 7
    ds.PixelRepresentation = 0
    ds.PixelData = encapsulate([buf.getvalue()])
    ds["PixelData"].VR = "OB"
    saida = io.BytesIO()
    ds.save_as(saida, enforce_file_format=True)
    return saida.getvalue()


def test_jpeg_colorido_ybr_gira_e_vira_rgb():
    rgb = np.zeros((120, 200, 3), dtype=np.uint8)
    rgb[:, :100] = 200
    girado = g.girar_dicom(_dicom_jpeg_ybr(rgb), 90)
    ds = pydicom.dcmread(io.BytesIO(girado))
    assert ds.PhotometricInterpretation == "RGB" and not ds.file_meta.TransferSyntaxUID.is_compressed
    px = ds.pixel_array
    assert px.shape == (200, 120, 3)
    # metade clara (esquerda) foi para cima depois do giro horario
    assert px[:100].mean() > 150 and px[100:].mean() < 50


def test_radiografia_com_posicao_gravada_pode_ser_ajustada():
    from app.modules.substituir_instancia import ImagemDeVolume, conferir_pode_ajustar

    conferir_pode_ajustar({"Modality": "DX", "ImagePositionPatient": "0\\0\\0"})
    with pytest.raises(ImagemDeVolume):
        conferir_pode_ajustar({"Modality": "CT"})
    with pytest.raises(ImagemDeVolume):
        conferir_pode_ajustar({"Modality": "", "ImagePositionPatient": "0\\0\\0"})


def test_retangulo_inclinado_gira_em_volta_do_centro():
    """27/10/2026: retangulo com `angulo` e desenhado inclinado (em pixels)."""
    from app.modules.marcacoes_imagem import _geometria

    def para_pixel(rx, ry):
        return (rx * 200, ry * 100)

    m = {"tipo": "retangulo", "x": 0.25, "y": 0.25, "largura": 0.5, "altura": 0.5}
    reto = _geometria(m, para_pixel, 1.0)["pontos"]
    inclinado = _geometria({**m, "angulo": 90}, para_pixel, 1.0)["pontos"]
    # 100x50 px em volta do centro (100, 50): a 90 graus vira 50x100
    xs = [p[0] for p in inclinado]
    ys = [p[1] for p in inclinado]
    assert round(max(xs) - min(xs)) == 50 and round(max(ys) - min(ys)) == 100
    assert reto != inclinado
    assert round(sum(xs) / 4) == 100 and round(sum(ys) / 4) == 50
