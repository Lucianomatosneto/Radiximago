"""
Le a tomografia no Orthanc para a reconstrucao (pedido do Luciano,
23/11/2026). So LEITURA: a tomografia original nao e alterada.
"""

from __future__ import annotations

import io
from dataclasses import dataclass

import numpy as np
from pydicom import dcmread
from pydicom.dataset import Dataset

from app.modules import orthanc_client
from app.modules.reconstrucao.motor import LIMITE_VOXELS, Volume

MIN_CORTES = 10  # menos que isso nao e tomografia para reconstruir


class NaoETomografia(ValueError):
    pass


@dataclass
class Geometria:
    ids: list[str]           # instancias, em ordem espacial
    linhas: int
    colunas: int
    espacamento: tuple[float, float, float]  # dz, dy, dx (mm)
    z_inicial: float         # posicao (mm) do 1o corte
    primeiro: Dataset        # cabecalho do 1o corte (paciente/estudo/serie)


def ler_corte(orthanc_id: str, so_cabecalho: bool = False) -> Dataset:
    return dcmread(io.BytesIO(orthanc_client.obter_arquivo_instancia(orthanc_id)), stop_before_pixels=so_cabecalho)


def geometria(orthanc_id_do_exame: str) -> Geometria:
    """Descobre a serie do exame, a ordem dos cortes e as medidas."""
    serie = orthanc_client.obter_detalhes_instancia(orthanc_id_do_exame)["ParentSeries"]
    ids = orthanc_client.listar_cortes_ordenados(serie)
    if len(ids) < MIN_CORTES:
        raise NaoETomografia("Esta imagem não é uma tomografia (a reconstrução precisa de uma série de cortes).")
    primeiro = ler_corte(ids[0], so_cabecalho=True)
    if str(getattr(primeiro, "Modality", "")).upper() != "CT":
        raise NaoETomografia("Esta imagem não é uma tomografia (modalidade diferente de CT).")
    ultimo = ler_corte(ids[-1], so_cabecalho=True)
    z0, z1 = float(primeiro.ImagePositionPatient[2]), float(ultimo.ImagePositionPatient[2])
    if z1 < z0:  # a ordem do Orthanc pode vir de cima para baixo
        ids = ids[::-1]
        z0, z1 = z1, z0
        primeiro = ultimo
    dz = (z1 - z0) / (len(ids) - 1)
    if dz <= 0:
        raise NaoETomografia("Os cortes desta tomografia não têm posições diferentes.")
    dy, dx = (float(v) for v in primeiro.PixelSpacing)
    return Geometria(ids=ids, linhas=int(primeiro.Rows), colunas=int(primeiro.Columns),
                     espacamento=(dz, dy, dx), z_inicial=z0, primeiro=primeiro)


def corte_axial_mip(g: Geometria, altura_mm: float, espessura_mm: float) -> np.ndarray:
    """Corte axial na altura pedida (mm a partir do 1o corte). Com
    espessura, a projecao de maxima intensidade (MIP) da faixa: a arcada
    inteira aparece mesmo que os dentes nao estejam todos no mesmo plano."""
    dz = g.espacamento[0]
    centro = int(round(altura_mm / dz))
    meia = max(0, int(round(espessura_mm / 2 / dz)))
    k0, k1 = max(0, centro - meia), min(len(g.ids) - 1, centro + meia)
    if k0 > k1:
        raise ValueError("Altura fora da tomografia.")
    saida = None
    for k in range(k0, k1 + 1):
        ds = ler_corte(g.ids[k])
        slope = float(getattr(ds, "RescaleSlope", 1) or 1)
        intercept = float(getattr(ds, "RescaleIntercept", 0) or 0)
        fatia = ds.pixel_array.astype(np.float32) * slope + intercept
        saida = fatia if saida is None else np.maximum(saida, fatia)
    if saida is None:
        raise ValueError("Altura fora da tomografia.")
    return saida


def carregar_volume(g: Geometria, recorte: tuple[int, int, int, int]) -> Volume:
    """
    Le os cortes UM A UM e guarda so a janela `recorte` (linha0, linha1,
    col0, col1) de cada um - a memoria fica no tamanho da regiao da arcada,
    nao da tomografia inteira. Confere orientacao axial, tamanho e
    espacamento regular de cada corte.
    """
    l0, l1, c0, c1 = max(0, recorte[0]), min(g.linhas, recorte[1]), max(0, recorte[2]), min(g.colunas, recorte[3])
    if (l1 - l0) < 2 or (c1 - c0) < 2:
        raise ValueError("A curva ficou fora da tomografia.")
    if len(g.ids) * (l1 - l0) * (c1 - c0) > LIMITE_VOXELS:
        raise ValueError("A região da arcada é grande demais para reconstruir de uma vez (limite de memória do servidor).")
    dz = g.espacamento[0]
    dados = np.empty((len(g.ids), l1 - l0, c1 - c0), dtype=np.int16)
    for k, oid in enumerate(g.ids):
        ds = ler_corte(oid)
        orient = np.array([float(v) for v in ds.ImageOrientationPatient])
        if np.max(np.abs(orient - np.array([1, 0, 0, 0, 1, 0]))) > 0.05:
            raise ValueError("Só tomografias com cortes axiais são aceitas (orientação diferente nesta série).")
        if int(ds.Rows) != g.linhas or int(ds.Columns) != g.colunas:
            raise ValueError("Os cortes têm tamanhos diferentes.")
        if abs(float(ds.ImagePositionPatient[2]) - (g.z_inicial + k * dz)) > 0.1 * dz + 1e-6:
            raise ValueError("Os cortes têm espaçamento irregular; a reconstrução precisa de cortes igualmente espaçados.")
        slope = float(getattr(ds, "RescaleSlope", 1) or 1)
        intercept = float(getattr(ds, "RescaleIntercept", 0) or 0)
        fatia = ds.pixel_array[l0:l1, c0:c1].astype(np.float32) * slope + intercept
        if dados.dtype == np.int16 and (not (slope.is_integer() and intercept.is_integer())
                                         or fatia.min() < -32768 or fatia.max() > 32767):
            dados = dados.astype(np.float32)
        dados[k] = fatia
    return Volume(dados=dados, espacamento=g.espacamento)
