"""
RECONSTRUCAO PANORAMICA DA TOMOGRAFIA - MOTOR DE CALCULO (etapa 1).
Pedido do Luciano, 23/11/2026: criar a reconstrucao panoramica (e os cortes
transversais) a partir da tomografia, "com qualidade e sem prejuizo para o
Radix".

O motor e matematica pura (numpy), testada aqui com um "maxilar" ARTIFICIAL
em que se sabe onde cada estrutura esta:
- um volume de fundo escuro (0);
- "dentes": cilindros verticais claros (1000) sobre uma arcada em parabola;
- um "canal": tubo claro horizontal que segue a arcada numa altura conhecida.
A panoramica tem de mostrar os dentes como faixas verticais na posicao
(ao longo da arcada) esperada; os cortes transversais tem de mostrar o canal
no meio do corte, na altura certa.
Nenhuma imagem de paciente.
"""

import math

import numpy as np
import pytest
from pydicom.dataset import Dataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian

from app.modules.reconstrucao.motor import (
    LIMITE_VOXELS,
    Volume,
    amostrar,
    cortes_transversais,
    curva_suave,
    montar_volume,
    panoramica,
)

# ---------------------------------------------------------------- maxilar sintetico
ESP = 0.5  # mm por voxel nas 3 direcoes
NZ, NY, NX = 80, 140, 140  # 40 x 70 x 70 mm


def arcada(t):
    """parabola da arcada (mm), t de -1 (direita do paciente) a 1 (esquerda)"""
    x = 35 + 25 * t
    y = 15 + 30 * t * t  # frente (incisivos) em cima, y menor
    return x, y


PONTOS = [arcada(t) for t in np.linspace(-1, 1, 7)]


def comprimento_arcada(n=4000):
    ts = np.linspace(-1, 1, n)
    xs, ys = arcada(ts)
    return float(np.sum(np.hypot(np.diff(xs), np.diff(ys))))


def posicao_ao_longo(t_alvo, n=4000):
    ts = np.linspace(-1, t_alvo, n)
    xs, ys = arcada(ts)
    return float(np.sum(np.hypot(np.diff(xs), np.diff(ys))))


T_DENTES = [-0.8, -0.3, 0.2, 0.7]
Z_DENTE = (10.0, 30.0)  # mm: os dentes vao de 10 a 30 mm de altura
Z_CANAL = 6.0  # mm


def volume_sintetico(desvio_mm=0.0):
    """dentes (raio 1,5 mm) sobre a arcada, deslocados `desvio_mm` para FORA
    (para longe do lado concavo da parabola, isto e, para o lado do labio)"""
    dados = np.zeros((NZ, NY, NX), dtype=np.float32)
    yy, xx = np.mgrid[0:NY, 0:NX] * ESP
    for t in T_DENTES:
        x, y = arcada(t)
        # derivada (25, 60t); a normal (60t, -25) aponta sempre para fora
        nx, ny = 60.0 * t, -25.0
        n = math.hypot(nx, ny)
        x, y = x + nx / n * desvio_mm, y + ny / n * desvio_mm
        disco = (xx - x) ** 2 + (yy - y) ** 2 <= 1.5 ** 2
        dados[int(Z_DENTE[0] / ESP):int(Z_DENTE[1] / ESP), disco] = 1000
    # canal: tubo de raio 1 mm seguindo a arcada a 6 mm de altura
    ts = np.linspace(-1, 1, 800)
    xs, ys = arcada(ts)
    for x, y in zip(xs, ys):
        i0, i1 = int((y - 1.2) / ESP), int((y + 1.2) / ESP) + 1
        j0, j1 = int((x - 1.2) / ESP), int((x + 1.2) / ESP) + 1
        k0, k1 = int((Z_CANAL - 1.2) / ESP), int((Z_CANAL + 1.2) / ESP) + 1
        sub_y, sub_x = np.mgrid[i0:i1, j0:j1] * ESP
        sub_z = np.arange(k0, k1) * ESP
        dentro = ((sub_y - y) ** 2 + (sub_x - x) ** 2)[None, :, :] + ((sub_z - Z_CANAL) ** 2)[:, None, None] <= 1.0
        dados[k0:k1, i0:i1, j0:j1][dentro] = 800
    return Volume(dados=dados, espacamento=(ESP, ESP, ESP))


# ---------------------------------------------------------------- curva
def test_curva_passa_pelos_pontos_com_passo_igual():
    pos, normais = curva_suave(PONTOS, passo_mm=0.25)
    passos = np.hypot(*np.diff(pos, axis=0).T)
    assert np.allclose(passos, 0.25, atol=0.02)
    for p in PONTOS:
        assert np.min(np.hypot(pos[:, 0] - p[0], pos[:, 1] - p[1])) < 0.15
    # comprimento parecido com o da parabola verdadeira
    assert abs(len(pos) * 0.25 - comprimento_arcada()) < 2.0
    # normais: unitarias e perpendiculares a curva
    assert np.allclose(np.hypot(normais[:, 0], normais[:, 1]), 1, atol=1e-6)
    tang = np.gradient(pos, axis=0)
    assert np.allclose(np.sum(tang * normais, axis=1), 0, atol=0.02)


def test_normal_aponta_para_fora_da_arcada():
    pos, normais = curva_suave(PONTOS, passo_mm=0.5)
    meio = len(pos) // 2  # incisivos: frente da arcada em y menor -> fora = y negativo
    assert normais[meio, 1] < -0.9
    # e a mesma resposta com os pontos na ordem contraria
    pos2, normais2 = curva_suave(PONTOS[::-1], passo_mm=0.5)
    assert normais2[len(pos2) // 2, 1] < -0.9


@pytest.mark.parametrize("pontos", [[(1, 1), (2, 2)], [], [(1, 1), (1, 1), (1, 1)]])
def test_curva_precisa_de_3_pontos_diferentes(pontos):
    with pytest.raises(ValueError):
        curva_suave(pontos, passo_mm=0.5)


# ---------------------------------------------------------------- amostragem
def test_amostragem_trilinear_e_exata_numa_rampa():
    z, y, x = np.mgrid[0:10, 0:12, 0:14].astype(np.float32)
    vol = Volume(dados=2 * x + 3 * y + 5 * z, espacamento=(1.0, 2.0, 0.5))
    # ponto em mm -> indices (z/1, y/2, x/0.5)
    zm, ym, xm = np.array([2.3, 4.5]), np.array([5.0, 7.2]), np.array([3.3, 1.1])
    esperado = 2 * (xm / 0.5) + 3 * (ym / 2.0) + 5 * (zm / 1.0)
    assert np.allclose(amostrar(vol, zm, ym, xm), esperado, atol=1e-4)
    # fora do volume: o menor valor do volume (fundo)
    assert amostrar(vol, np.array([-5.0]), np.array([1.0]), np.array([1.0]))[0] == 0


# ---------------------------------------------------------------- panoramica
def test_panoramica_mostra_os_dentes_nas_posicoes_certas():
    vol = volume_sintetico()
    img, passo = panoramica(vol, PONTOS, espessura_mm=6.0, passo_mm=0.5)
    assert passo == 0.5
    linhas, colunas = img.shape
    assert linhas == NZ  # altura inteira do volume, passo 0.5
    assert abs(colunas * 0.5 - comprimento_arcada()) < 2.5
    # linha 0 = alto da tomografia (superior); os dentes (10-30 mm) ficam no meio
    linha_dente = int((NZ * ESP - 20.0) / 0.5)
    perfil = img[linha_dente]
    for t in T_DENTES:
        col = int(round(posicao_ao_longo(t) / 0.5))
        assert perfil[col] > 150, f"dente em t={t} nao apareceu na coluna {col}"
    # entre os dentes: fundo
    col_vazia = int(round(posicao_ao_longo(-0.55) / 0.5))
    assert perfil[col_vazia] < 20
    # acima dos dentes (z > 30 mm): fundo
    assert img[int((NZ * ESP - 35.0) / 0.5)].max() < 20


def test_espessura_da_faixa_decide_o_que_entra():
    """dente 4 mm para fora da curva: entra com faixa de 12 mm, nao com 2 mm"""
    vol = volume_sintetico(desvio_mm=4.0)
    linha = int((NZ * ESP - 20.0) / 0.5)
    col = int(round(posicao_ao_longo(0.2) / 0.5))
    larga, _ = panoramica(vol, PONTOS, espessura_mm=12.0, passo_mm=0.5)
    fina, _ = panoramica(vol, PONTOS, espessura_mm=2.0, passo_mm=0.5)
    assert larga[linha, col] > 50
    assert fina[linha, col] < 5


@pytest.mark.parametrize("espessura", [0.1, 60.0])
def test_espessura_fora_do_limite(espessura):
    with pytest.raises(ValueError):
        panoramica(volume_sintetico(), PONTOS, espessura_mm=espessura)


def test_pontos_fora_do_volume():
    with pytest.raises(ValueError):
        panoramica(volume_sintetico(), [(10, 10), (200, 30), (300, 10)], espessura_mm=5)


# ---------------------------------------------------------------- cortes transversais
def test_cortes_transversais_mostram_o_canal_no_meio_e_na_altura_certa():
    vol = volume_sintetico()
    cortes, passo = cortes_transversais(vol, PONTOS, intervalo_mm=2.0, largura_mm=20.0, passo_mm=0.5)
    assert len(cortes) == int(comprimento_arcada() // 2.0) + 1 or len(cortes) == int(comprimento_arcada() // 2.0)
    img = cortes[len(cortes) // 2]
    linhas, colunas = img.shape
    assert colunas == 41 and linhas == NZ
    linha_canal = int(round((NZ * ESP - Z_CANAL) / 0.5))
    meio = colunas // 2
    assert img[linha_canal, meio] > 300
    assert img[linha_canal, 2] < 20  # longe da arcada: fundo
    assert img[int(round((NZ * ESP - 20.0) / 0.5)), meio] < 900  # sem dente no meio (t=0)


def test_limite_de_tamanho():
    assert LIMITE_VOXELS >= 200_000_000


# ---------------------------------------------------------------- volume a partir dos cortes DICOM
def _corte(z_mm, valor, orientacao=(1, 0, 0, 0, 1, 0), slope=1, intercept=-1000, numero=1):
    ds = Dataset()
    ds.file_meta = FileMetaDataset()
    ds.file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    ds.Rows, ds.Columns = 4, 5
    ds.PixelSpacing = [0.3, 0.25]
    ds.ImageOrientationPatient = list(orientacao)
    ds.ImagePositionPatient = [-10.0, -20.0, float(z_mm)]
    ds.RescaleSlope, ds.RescaleIntercept = slope, intercept
    ds.BitsAllocated, ds.BitsStored, ds.HighBit = 16, 16, 15
    ds.PixelRepresentation = 0
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.InstanceNumber = numero
    ds.PixelData = (np.full((4, 5), valor, dtype=np.uint16)).tobytes()
    return ds


def test_montar_volume_ordena_pela_posicao_e_aplica_slope():
    cortes = [_corte(5.0, 1300, numero=3), _corte(4.0, 1200, numero=1), _corte(4.5, 1250, numero=2)]
    vol = montar_volume(cortes)
    assert vol.dados.shape == (3, 4, 5)
    assert vol.espacamento == pytest.approx((0.5, 0.3, 0.25))
    assert vol.dados[:, 0, 0].tolist() == [200, 250, 300]  # -1000 + valor, de baixo para cima


def test_montar_volume_recusa_orientacao_que_nao_e_axial():
    cortes = [_corte(z, 1000, orientacao=(1, 0, 0, 0, 0, -1)) for z in (0, 1, 2)]
    with pytest.raises(ValueError, match="axia"):
        montar_volume(cortes)


def test_montar_volume_recusa_espacamento_irregular():
    cortes = [_corte(z, 1000) for z in (0.0, 1.0, 3.5)]
    with pytest.raises(ValueError, match="espa"):
        montar_volume(cortes)


def test_montar_volume_precisa_de_varios_cortes():
    with pytest.raises(ValueError):
        montar_volume([_corte(0, 1000)])
