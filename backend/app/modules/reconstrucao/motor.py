"""
MOTOR DA RECONSTRUCAO PANORAMICA (pedido do Luciano, 23/11/2026).

Matematica pura (numpy), sem banco e sem Orthanc - por isso testavel com
um volume artificial (tests/test_reconstrucao_motor.py).

Ideia, em linguagem simples:
1. A tomografia e um "bloco" de cortes axiais empilhados (volume 3D).
2. O curador clica pontos ao longo da arcada num corte axial. Uma CURVA
   SUAVE passa por esses pontos (spline de Catmull-Rom centripeta).
3. PANORAMICA: a curva e "desenrolada". Para cada ponto da curva e cada
   altura, o motor faz a MEDIA de uma faixa perpendicular a arcada (a
   "espessura", ex.: 10 mm). E o que a radiografia panoramica faz
   fisicamente (soma dos tecidos dentro da camada focal), so que sem a
   ampliacao e as distorcoes do aparelho.
4. CORTES TRANSVERSAIS: de tanto em tanto (ex.: 1 mm) ao longo da curva,
   um corte fino perpendicular a arcada - da lingual (esquerda da imagem)
   para a vestibular (direita).
O valor entre os voxels e calculado por interpolacao TRILINEAR (media
ponderada dos 8 vizinhos), padrao em reformatacao multiplanar.

Coordenadas: milimetros a partir do canto do volume. x = colunas (lado
esquerdo do paciente cresce), y = linhas (posterior cresce), z = altura
(superior cresce, padrao DICOM). Na imagem de saida, a linha 0 e o ALTO.

Limites (para nao pesar o servidor): ver LIMITE_VOXELS e as faixas
validas de espessura/intervalo/largura.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

# volume maximo aceito (cortes x linhas x colunas, depois do recorte):
# 250 milhoes de voxels em int16 = ~500 MB
LIMITE_VOXELS = 250_000_000
ESPESSURA_MIN, ESPESSURA_MAX = 0.5, 40.0  # mm (faixa da panoramica)
INTERVALO_MIN, INTERVALO_MAX = 0.2, 10.0  # mm (entre cortes transversais)
LARGURA_MIN, LARGURA_MAX = 5.0, 80.0  # mm (largura do corte transversal)
COLUNAS_POR_VEZ = 48  # a panoramica e calculada em blocos de colunas (memoria)


@dataclass
class Volume:
    """dados[z, y, x] ja em unidades do exame (slope/intercept aplicados);
    espacamento = (dz, dy, dx) em mm."""
    dados: np.ndarray
    espacamento: tuple[float, float, float]

    @property
    def fundo(self) -> float:
        return float(self.dados.min())

    @property
    def tamanho_mm(self) -> tuple[float, float, float]:
        nz, ny, nx = self.dados.shape
        dz, dy, dx = self.espacamento
        return ((nz - 1) * dz, (ny - 1) * dy, (nx - 1) * dx)


# --------------------------------------------------------------------- volume
def montar_volume(cortes, recorte: tuple[int, int, int, int] | None = None) -> Volume:
    """
    Monta o volume a partir dos cortes DICOM (datasets do pydicom).
    Exige cortes AXIAIS (ImageOrientationPatient ~ 1,0,0,0,1,0), do mesmo
    tamanho e com espacamento regular. `recorte` = (linha0, linha1, col0,
    col1) guarda so uma janela de cada corte (menos memoria).
    """
    if len(cortes) < 2:
        raise ValueError("A tomografia precisa de pelo menos 2 cortes.")
    for ds in cortes:
        orient = np.array([float(v) for v in ds.ImageOrientationPatient])
        if np.max(np.abs(orient - np.array([1, 0, 0, 0, 1, 0]))) > 0.05:
            raise ValueError("Só tomografias com cortes axiais são aceitas (orientação diferente nesta série).")
    ordenados = sorted(cortes, key=lambda ds: float(ds.ImagePositionPatient[2]))
    posicoes = np.array([float(ds.ImagePositionPatient[2]) for ds in ordenados])
    passos = np.diff(posicoes)
    dz = float(np.median(passos))
    if dz <= 0 or np.any(np.abs(passos - dz) > 0.1 * dz):
        raise ValueError("Os cortes têm espaçamento irregular (ou repetido); a reconstrução precisa de cortes igualmente espaçados.")
    linhas, colunas = int(ordenados[0].Rows), int(ordenados[0].Columns)
    if any(int(ds.Rows) != linhas or int(ds.Columns) != colunas for ds in ordenados):
        raise ValueError("Os cortes têm tamanhos diferentes.")
    l0, l1, c0, c1 = recorte or (0, linhas, 0, colunas)
    l0, c0 = max(0, l0), max(0, c0)
    l1, c1 = min(linhas, l1), min(colunas, c1)
    if (l1 - l0) < 2 or (c1 - c0) < 2:
        raise ValueError("O recorte do volume ficou vazio.")
    if len(ordenados) * (l1 - l0) * (c1 - c0) > LIMITE_VOXELS:
        raise ValueError("A tomografia é grande demais para reconstruir de uma vez (limite de memória do servidor).")
    dy, dx = (float(v) for v in ordenados[0].PixelSpacing)
    def escala(ds) -> tuple[float, float]:
        return float(getattr(ds, "RescaleSlope", 1) or 1), float(getattr(ds, "RescaleIntercept", 0) or 0)

    inteiro = all(a.is_integer() and b.is_integer() for a, b in map(escala, ordenados))
    dados: np.ndarray = np.empty((len(ordenados), l1 - l0, c1 - c0), dtype=np.int32 if inteiro else np.float32)
    for i, ds in enumerate(ordenados):
        slope, intercept = escala(ds)
        dados[i] = ds.pixel_array[l0:l1, c0:c1].astype(np.float32) * slope + intercept
    if dados.dtype == np.int32 and dados.min() >= -32768 and dados.max() <= 32767:
        dados = dados.astype(np.int16)  # metade da memoria
    return Volume(dados=dados, espacamento=(dz, dy, dx))


# --------------------------------------------------------------------- curva
def _catmull_rom(pontos: np.ndarray, por_trecho: int = 60) -> np.ndarray:
    """spline de Catmull-Rom CENTRIPETA (alfa 0,5: sem lacos nem pontas)"""
    p = np.vstack([2 * pontos[0] - pontos[1], pontos, 2 * pontos[-1] - pontos[-2]])
    saida = []
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
        t0 = 0.0
        t1 = t0 + max(np.linalg.norm(p1 - p0) ** 0.5, 1e-6)
        t2 = t1 + max(np.linalg.norm(p2 - p1) ** 0.5, 1e-6)
        t3 = t2 + max(np.linalg.norm(p3 - p2) ** 0.5, 1e-6)
        t = np.linspace(t1, t2, por_trecho, endpoint=False)[:, None]
        a1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1
        a2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2
        a3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3
        b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2
        b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3
        saida.append((t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2)
    saida.append(p[-2][None, :])
    return np.vstack(saida)


def curva_suave(pontos_mm, passo_mm: float) -> tuple[np.ndarray, np.ndarray]:
    """
    Curva suave pelos pontos (x, y em mm), reamostrada com passo igual ao
    longo do comprimento. Devolve (posicoes[N, 2], normais[N, 2]); a normal
    aponta para FORA da arcada (lado vestibular).
    """
    p = np.asarray(pontos_mm, dtype=np.float64).reshape(-1, 2) if len(pontos_mm) else np.zeros((0, 2))
    if len(p):
        manter = np.concatenate([[True], np.any(np.abs(np.diff(p, axis=0)) > 1e-9, axis=1)])
        p = p[manter]
    if len(p) < 3:
        raise ValueError("Marque pelo menos 3 pontos diferentes ao longo da arcada.")
    densa = _catmull_rom(p)
    seg = np.hypot(*np.diff(densa, axis=0).T)
    acumulado = np.concatenate([[0.0], np.cumsum(seg)])
    comprimento = acumulado[-1]
    # passo exato (vira o tamanho do pixel); o ultimo passo pode passar um
    # pouco do ultimo ponto, seguindo a direcao final da curva
    n = int(np.ceil(comprimento / passo_mm - 1e-9))
    s = np.arange(n + 1) * passo_mm
    pos = np.column_stack([np.interp(s, acumulado, densa[:, 0]), np.interp(s, acumulado, densa[:, 1])])
    alem = s > comprimento
    if np.any(alem):
        direcao = densa[-1] - densa[-2]
        direcao = direcao / max(np.hypot(*direcao), 1e-12)
        pos[alem] = densa[-1] + (s[alem] - comprimento)[:, None] * direcao
    tang = np.gradient(pos, axis=0)
    tang /= np.maximum(np.hypot(tang[:, 0], tang[:, 1]), 1e-12)[:, None]
    normais = np.column_stack([tang[:, 1], -tang[:, 0]])
    # para fora: longe do "centro" da arcada (media dos pontos marcados)
    centro = p.mean(axis=0)
    if np.sum(np.sum(normais * (pos - centro), axis=1)) < 0:
        normais = -normais
    return pos, normais


# --------------------------------------------------------------------- amostragem
def amostrar(vol: Volume, z_mm, y_mm, x_mm) -> np.ndarray:
    """valor do volume em pontos quaisquer (mm), por interpolacao trilinear;
    fora do volume = fundo (menor valor)"""
    d = vol.dados
    nz, ny, nx = d.shape
    dz, dy, dx = vol.espacamento
    fz, fy, fx = np.asarray(z_mm) / dz, np.asarray(y_mm) / dy, np.asarray(x_mm) / dx
    fora = (fz < 0) | (fz > nz - 1) | (fy < 0) | (fy > ny - 1) | (fx < 0) | (fx > nx - 1)
    z0 = np.clip(np.floor(fz).astype(np.int64), 0, nz - 2)
    y0 = np.clip(np.floor(fy).astype(np.int64), 0, ny - 2)
    x0 = np.clip(np.floor(fx).astype(np.int64), 0, nx - 2)
    wz = np.clip(fz - z0, 0, 1).astype(np.float32)
    wy = np.clip(fy - y0, 0, 1).astype(np.float32)
    wx = np.clip(fx - x0, 0, 1).astype(np.float32)

    def v(a, b, c):
        return d[z0 + a, y0 + b, x0 + c].astype(np.float32)

    c00 = v(0, 0, 0) * (1 - wx) + v(0, 0, 1) * wx
    c01 = v(0, 1, 0) * (1 - wx) + v(0, 1, 1) * wx
    c10 = v(1, 0, 0) * (1 - wx) + v(1, 0, 1) * wx
    c11 = v(1, 1, 0) * (1 - wx) + v(1, 1, 1) * wx
    c0 = c00 * (1 - wy) + c01 * wy
    c1 = c10 * (1 - wy) + c11 * wy
    saida = c0 * (1 - wz) + c1 * wz
    return np.where(fora, np.float32(vol.fundo), saida)


def _passo_padrao(vol: Volume, passo_mm: float | None) -> float:
    if passo_mm:
        return float(passo_mm)
    return float(min(max(min(vol.espacamento[1], vol.espacamento[2]), 0.1), 0.5))


def _curva_no_volume(vol: Volume, pontos_mm, passo: float):
    pos, normais = curva_suave(pontos_mm, passo)
    _, alto_y, alto_x = vol.tamanho_mm
    if np.any(pos[:, 0] < 0) or np.any(pos[:, 0] > alto_x) or np.any(pos[:, 1] < 0) or np.any(pos[:, 1] > alto_y):
        raise ValueError("A curva passa fora da tomografia; marque os pontos dentro da imagem.")
    return pos, normais


def _alturas(vol: Volume, passo: float) -> np.ndarray:
    """alturas (mm) das linhas da imagem de saida, do alto para baixo"""
    alto = vol.tamanho_mm[0]
    return alto - np.arange(int(np.floor(alto / passo + 1e-9)) + 1) * passo


# --------------------------------------------------------------------- panoramica
def panoramica(vol: Volume, pontos_mm, espessura_mm: float = 10.0, passo_mm: float | None = None) -> tuple[np.ndarray, float]:
    """Imagem panoramica [linhas = altura, colunas = ao longo da arcada] e o
    tamanho do pixel (mm). Cada pixel = media da faixa de `espessura_mm`
    perpendicular a arcada."""
    if not (ESPESSURA_MIN <= espessura_mm <= ESPESSURA_MAX):
        raise ValueError(f"Espessura deve ficar entre {ESPESSURA_MIN} e {ESPESSURA_MAX} mm.")
    passo = _passo_padrao(vol, passo_mm)
    pos, normais = _curva_no_volume(vol, pontos_mm, passo)
    zs = _alturas(vol, passo)
    t = np.arange(-espessura_mm / 2, espessura_mm / 2 + 1e-9, passo)
    if len(t) == 0:
        t = np.array([0.0])
    img = np.empty((len(zs), len(pos)), dtype=np.float32)
    for c0 in range(0, len(pos), COLUNAS_POR_VEZ):
        c1 = min(len(pos), c0 + COLUNAS_POR_VEZ)
        xs = pos[c0:c1, 0, None] + normais[c0:c1, 0, None] * t[None, :]  # (C, T)
        ys = pos[c0:c1, 1, None] + normais[c0:c1, 1, None] * t[None, :]
        z = np.broadcast_to(zs[:, None, None], (len(zs),) + xs.shape)
        valores = amostrar(vol, z, np.broadcast_to(ys, z.shape), np.broadcast_to(xs, z.shape))
        img[:, c0:c1] = valores.mean(axis=2)
    return img, passo


# --------------------------------------------------------------------- cortes transversais
def cortes_transversais(
    vol: Volume, pontos_mm, intervalo_mm: float = 1.0, largura_mm: float = 40.0, passo_mm: float | None = None
) -> tuple[list[np.ndarray], float]:
    """Cortes finos perpendiculares a arcada, a cada `intervalo_mm`. Cada
    imagem: linhas = altura, colunas = da lingual (esquerda) para a
    vestibular (direita), com `largura_mm`."""
    if not (INTERVALO_MIN <= intervalo_mm <= INTERVALO_MAX):
        raise ValueError(f"Intervalo entre cortes deve ficar entre {INTERVALO_MIN} e {INTERVALO_MAX} mm.")
    if not (LARGURA_MIN <= largura_mm <= LARGURA_MAX):
        raise ValueError(f"Largura do corte deve ficar entre {LARGURA_MIN} e {LARGURA_MAX} mm.")
    passo = _passo_padrao(vol, passo_mm)
    pos, normais = _curva_no_volume(vol, pontos_mm, passo)
    zs = _alturas(vol, passo)
    u = np.arange(-largura_mm / 2, largura_mm / 2 + 1e-9, passo)
    # o ultimo passo da curva pode passar um pouco do ultimo ponto marcado
    comprimento = max(0.0, (len(pos) - 2) * passo)
    indices = np.round(np.arange(0.0, comprimento + 1e-9, intervalo_mm) / passo).astype(int)
    cortes = []
    for i in np.clip(indices, 0, len(pos) - 1):
        xs = pos[i, 0] + normais[i, 0] * u
        ys = pos[i, 1] + normais[i, 1] * u
        z = np.broadcast_to(zs[:, None], (len(zs), len(u)))
        cortes.append(amostrar(vol, z, np.broadcast_to(ys, z.shape), np.broadcast_to(xs, z.shape)))
    return cortes, passo
