"""
CANAL MANDIBULAR DESENHADO NA RECONSTRUCAO (pedido do Luciano, 23/11/2026).

Decisoes dele: o curador marca o trajeto do canal NA PANORAMICA
RECONSTRUIDA (do forame mandibular ao forame mentual, de cada lado) e o
canal aparece DESENHADO nas series geradas, para ensino.

Em linguagem simples:
- cada "tracado" e uma linha por pontos clicados na panoramica (coluna =
  posicao ao longo da arcada, linha = altura). Ate 2 tracados (os dois
  lados), cada um com uma cor;
- na PANORAMICA o tracado vira um traco colorido;
- em cada CORTE TRANSVERSAL o canal vira uma marca horizontal na ALTURA
  dele, sobre a faixa que formou a panoramica.
  LIMITE (declarado): a panoramica e a media de uma faixa, entao ela mostra
  a altura do canal ao longo da arcada, mas NAO se ele esta mais para
  lingual ou vestibular. A marca no corte indica a altura; a posicao exata
  o aluno ve na propria imagem do corte.

Matematica pura (numpy + Pillow), sem banco e sem Orthanc - testada em
tests/test_reconstrucao_canal.py.
"""

from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw

MAX_TRACADOS = 2
MAX_PONTOS = 60
CORES: list[tuple[int, int, int]] = [(255, 215, 0), (0, 220, 255)]  # amarelo, ciano

Tracado = tuple[np.ndarray, np.ndarray]  # (colunas inteiras, alturas em linhas)


def linha_do_canal(pontos_px, largura: int, altura: int) -> Tracado:
    """
    Pontos clicados (coluna, linha) -> a altura do canal em CADA coluna
    entre o primeiro e o ultimo ponto (ligando os pontos por retas). A ordem
    dos cliques nao importa: os pontos sao ordenados ao longo da panoramica.
    """
    p = np.asarray(pontos_px, dtype=np.float64).reshape(-1, 2) if len(pontos_px) else np.zeros((0, 2))
    if len(p) < 2 or len(p) > MAX_PONTOS:
        raise ValueError(f"Cada traçado do canal precisa de 2 a {MAX_PONTOS} pontos.")
    if np.any(p[:, 0] < 0) or np.any(p[:, 0] > largura - 1) or np.any(p[:, 1] < 0) or np.any(p[:, 1] > altura - 1):
        raise ValueError("Há pontos do canal fora da panorâmica.")
    p = p[np.argsort(p[:, 0], kind="stable")]
    if p[-1, 0] - p[0, 0] < 1:
        raise ValueError("O traçado do canal precisa seguir ao longo da panorâmica (pontos em posições diferentes).")
    colunas = np.arange(int(np.ceil(p[0, 0])), int(np.floor(p[-1, 0])) + 1)
    return colunas, np.interp(colunas, p[:, 0], p[:, 1])


def alturas_na_coluna(tracados: list[Tracado], coluna: int) -> list[tuple[float, tuple[int, int, int]]]:
    """(altura, cor) de cada tracado que passa por esta coluna da panoramica"""
    saida = []
    for i, (cols, linhas) in enumerate(tracados):
        if len(cols) and cols[0] <= coluna <= cols[-1]:
            saida.append((float(linhas[int(coluna - cols[0])]), CORES[i % len(CORES)]))
    return saida


def coluna_do_corte(numero: int, intervalo_mm: float, passo_mm: float, colunas: int) -> int:
    """coluna da panoramica que corresponde ao corte transversal `numero`
    (1, 2, 3...) - a mesma regra de motor.cortes_transversais"""
    return int(np.clip(round((numero - 1) * intervalo_mm / passo_mm), 0, colunas - 1))


def em_rgb(imagem: np.ndarray) -> np.ndarray:
    """imagem da tomografia -> tons de cinza 8 bits (janela dos percentis
    1-99,5) em 3 canais, para receber o desenho colorido"""
    baixo, alto = np.percentile(imagem, [1, 99.5])
    cinza = np.clip((imagem - baixo) / max(float(alto - baixo), 1.0) * 255, 0, 255).astype(np.uint8)
    return np.repeat(cinza[:, :, None], 3, axis=2)


def _espessura(altura: int) -> int:
    return max(1, round(altura / 200))


def panoramica_com_canal(imagem: np.ndarray, tracados_px) -> np.ndarray:
    """panoramica em cor com cada tracado desenhado (lista de pontos)"""
    figura = Image.fromarray(em_rgb(imagem))
    desenho = ImageDraw.Draw(figura)
    largura = max(2, _espessura(imagem.shape[0]) + 1)
    for i, pontos in enumerate(tracados_px):
        ordem = sorted((float(c), float(r)) for c, r in pontos)
        desenho.line(ordem, fill=CORES[i % len(CORES)], width=largura, joint="curve")
    return np.array(figura)


def corte_com_canal(imagem: np.ndarray, marcas: list[tuple[float, tuple[int, int, int]]], meia_faixa_px: int) -> np.ndarray:
    """corte transversal em cor com uma marca horizontal na altura de cada
    canal, sobre a faixa da panoramica (centro do corte +- meia_faixa_px)"""
    rgb = em_rgb(imagem)
    h, w = imagem.shape
    centro = w // 2
    c0, c1 = max(0, centro - meia_faixa_px), min(w - 1, centro + meia_faixa_px)
    t = _espessura(h)
    for altura, cor in marcas:
        linha = int(round(altura))
        l0, l1 = max(0, linha - t // 2), min(h - 1, linha + (t - 1) // 2)
        rgb[l0:l1 + 1, c0:c1 + 1] = cor
        # pontas verticais curtas: a marca nao se confunde com a cortical
        for c in (c0, c1):
            rgb[max(0, linha - 2 * t):min(h, linha + 2 * t + 1), c] = cor
    return rgb
