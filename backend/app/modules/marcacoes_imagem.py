"""
Desenha as marcacoes do curador (formas: oval, retangulo, seta) por cima de
uma imagem PNG ja renderizada pelo Orthanc.

Pra que serve: as marcacoes (ex.: um circulo em volta de uma carie) hoje so
aparecem na TELA, desenhadas por cima da imagem com SVG pelo navegador
(componente FormasMarcacoes.tsx) - o arquivo PNG em si, no servidor, e
sempre a imagem "crua", sem nada desenhado. Isso e otimo pra visualizacao
(o navegador desenha rapido, em qualquer zoom), mas quebra na hora de
BAIXAR o arquivo ou ENVIAR por e-mail: o arquivo que sai do servidor nao
tem a marcacao "gravada" nele - se o usuario tinha "Mostrar marcacao"
ligado na tela, o arquivo baixado/enviado deveria mostrar a mesma coisa.

Por isso esse modulo existe: recebe os bytes do PNG (o mesmo que o Orthanc
devolve) e a lista de marcacoes (o mesmo JSON salvo na ficha de curadoria,
`Curation.marcacoes`) e devolve um NOVO PNG, com as marcacoes desenhadas
em cima - agora "gravadas" na propria imagem, prontas pra baixar ou
anexar num e-mail.

Usa a biblioteca Pillow (PIL) - uma biblioteca padrao em Python pra abrir,
editar e salvar imagens (parecida com o "Paint", mas via codigo). Ela
precisa estar instalada no ambiente (ver requirements.txt) - como e uma
biblioteca nova pro projeto, o container do backend precisa ser
reconstruido depois dessa mudanca (ver aviso na resposta que trouxe este
arquivo).

Estilo: o mesmo da tela (frontend/src/components/detalhe/CamadaMarcacoes.tsx
e o desenho dentro do OHIF):
- cor por tipo de achado (paleta Okabe & Ito, distinguivel por pessoas
  com daltonismo) - tabela CORES_ACHADO, igual a de lib/marcacoes.ts;
- contorno com "halo" (borda escura fina por fora), legivel sobre osso e
  sobre tecidos moles; sem veu branco por cima da anatomia;
- numero (ordem em que o curador marcou) FORA da forma, ligado a ela por
  uma linha-guia, para nao cobrir a regiao marcada.
Como a imagem baixada nao tem zoom, as espessuras e tamanhos sao
proporcionais ao tamanho da imagem (variavel `escala`).
"""

import io
import math
from typing import Any

from PIL import Image, ImageDraw, ImageFont


CORES_ACHADO: dict[str, tuple[int, int, int]] = {
    "carie": (0xE6, 0x9F, 0x00),
    "lesao_periapical": (0xCC, 0x79, 0xA7),
    "perda_ossea": (0x56, 0xB4, 0xE9),
    "dente_incluso": (0x00, 0x9E, 0x73),
    "tratamento_endodontico": (0xF0, 0xE4, 0x42),
    "erro_tecnico": (0xD5, 0x5E, 0x00),
    "normal": (0xFF, 0xFF, 0xFF),
    "outro": (0xC3, 0xCE, 0xDD),
}
COR_SEM_ACHADO = (0xFF, 0xFF, 0xFF)
HALO = (0, 0, 0, 153)  # preto a 60%

Ponto = tuple[float, float]


def cor_marcacao(marcacao: dict[str, Any]) -> tuple[int, int, int]:
    return CORES_ACHADO.get(str(marcacao.get("achado") or ""), COR_SEM_ACHADO)


def desenhar_marcacoes_na_imagem(conteudo_png: bytes, marcacoes: list[dict[str, Any]] | None) -> bytes:
    """
    Recebe os bytes de um PNG e a lista de marcacoes (formato igual ao tipo
    `Marcacao` do frontend, ver frontend/src/lib/marcacoes.ts) e devolve os
    bytes de um novo PNG com as marcacoes desenhadas por cima.

    Se `marcacoes` estiver vazio/None, devolve o PNG original sem
    modificar nada.
    """
    if not marcacoes:
        return conteudo_png

    imagem_original = Image.open(io.BytesIO(conteudo_png)).convert("RGBA")
    largura, altura = imagem_original.size
    camada = Image.new("RGBA", (largura, altura), (0, 0, 0, 0))
    desenho = ImageDraw.Draw(camada)

    # 1.0 numa imagem de ~700 px (o tamanho tipico na tela); maior em
    # imagens de alta resolucao, para continuar visivel ao abrir o arquivo.
    escala = max(1.0, min(largura, altura) / 700)

    def para_pixel(rx: float, ry: float) -> Ponto:
        return (rx * largura, ry * altura)

    selos: list[tuple[int, Ponto, Ponto, tuple[int, int, int]]] = []
    for indice, marcacao in enumerate(marcacoes, start=1):
        geo = _geometria(marcacao, para_pixel, escala)
        if geo is None:
            # tipo desconhecido (ex.: um valor novo no futuro): ignora, em
            # vez de quebrar o download/e-mail inteiro
            continue
        cor = cor_marcacao(marcacao)
        _desenhar_forma(desenho, geo, cor, escala)
        selos.append((indice, geo["ancora"], geo["selo"], cor))

    # numeros por ultimo, por cima de todas as formas
    _desenhar_selos(desenho, selos, escala)

    composta = Image.alpha_composite(imagem_original, camada).convert("RGB")
    buffer = io.BytesIO()
    composta.save(buffer, format="PNG")
    return buffer.getvalue()


def _ponto_numero(marcacao: dict[str, Any]) -> tuple[float, float]:
    """Ponto (0-1) onde a linha-guia encosta na forma - mesma regra de
    pontoNumeroMarcacao em frontend/src/lib/marcacoes.ts."""
    if marcacao.get("tipo") == "seta":
        return (marcacao.get("x1") or 0, marcacao.get("y1") or 0)
    x = marcacao.get("x") or 0
    y = marcacao.get("y") or 0
    if marcacao.get("tipo") == "oval":
        rx = (marcacao.get("largura") or 0) / 2
        ry = (marcacao.get("altura") or 0) / 2
        fator = math.sqrt(0.5)
        return (x + rx - rx * fator, y + ry - ry * fator)
    return (x, y)


def _geometria(marcacao: dict[str, Any], para_pixel, escala: float) -> dict[str, Any] | None:
    """Mesma conta de geometriaMarcacao (frontend/src/lib/marcacoes.ts)."""
    tipo = marcacao.get("tipo")
    if tipo == "seta":
        a = para_pixel(marcacao.get("x1") or 0, marcacao.get("y1") or 0)
        b = para_pixel(marcacao.get("x2") or 0, marcacao.get("y2") or 0)
        ang = math.atan2(b[1] - a[1], b[0] - a[0])
        tam = 13 * escala
        abertura = math.radians(28)
        p1 = (b[0] - tam * math.cos(ang - abertura), b[1] - tam * math.sin(ang - abertura))
        p2 = (b[0] - tam * math.cos(ang + abertura), b[1] - tam * math.sin(ang + abertura))
        dx, dy = a[0] - b[0], a[1] - b[1]
        comp = math.hypot(dx, dy) or 1.0
        dx, dy = dx / comp, dy / comp
        return {
            "seta": (a, b),
            "ponta": [p1, b, p2],
            "ancora": a,
            "selo": (a[0] + dx * 18 * escala, a[1] + dy * 18 * escala),
        }
    if tipo not in ("oval", "retangulo"):
        return None
    x = marcacao.get("x") or 0
    y = marcacao.get("y") or 0
    w = marcacao.get("largura") or 0
    h = marcacao.get("altura") or 0
    if tipo == "oval":
        pontos = [
            para_pixel(x + w / 2 + (w / 2) * math.cos(2 * math.pi * k / 72), y + h / 2 + (h / 2) * math.sin(2 * math.pi * k / 72))
            for k in range(72)
        ]
    else:
        pontos = [para_pixel(x, y), para_pixel(x + w, y), para_pixel(x + w, y + h), para_pixel(x, y + h)]
    ancora = para_pixel(*_ponto_numero(marcacao))
    centro = para_pixel(x + w / 2, y + h / 2)
    dx, dy = ancora[0] - centro[0], ancora[1] - centro[1]
    comp = math.hypot(dx, dy)
    if comp < 0.5:
        dx = dy = -math.sqrt(0.5)
    else:
        dx, dy = dx / comp, dy / comp
    return {
        "pontos": pontos,
        "ancora": ancora,
        "selo": (ancora[0] + dx * 24 * escala, ancora[1] + dy * 24 * escala),
    }


def _desenhar_forma(desenho: "ImageDraw.ImageDraw", geo: dict[str, Any], cor: tuple[int, int, int], escala: float) -> None:
    # tracos finos (metade do padrao antigo): nao cobrem as estruturas
    halo = max(2, round(2.5 * escala))
    traco = max(1, round(1.25 * escala))
    if "seta" in geo:
        a, b = geo["seta"]
        desenho.line([a, b], fill=HALO, width=halo)
        desenho.line(geo["ponta"], fill=HALO, width=halo, joint="curve")
        desenho.line([a, b], fill=(*cor, 255), width=traco)
        desenho.line(geo["ponta"], fill=(*cor, 255), width=traco, joint="curve")
        return
    pontos = geo["pontos"]
    fechado = pontos + [pontos[0]]
    desenho.polygon(pontos, fill=(*cor, 15))  # ~6%: so um leve tom da cor
    desenho.line(fechado, fill=HALO, width=halo, joint="curve")
    desenho.line(fechado, fill=(*cor, 255), width=traco, joint="curve")


def _desenhar_selos(
    desenho: "ImageDraw.ImageDraw",
    selos: list[tuple[int, Ponto, Ponto, tuple[int, int, int]]],
    escala: float,
) -> None:
    if not selos:
        return
    raio = 11 * escala
    try:
        fonte = ImageFont.load_default(size=max(10, round(12 * escala)))
    except TypeError:  # Pillow antigo, sem tamanho na fonte padrao
        fonte = ImageFont.load_default()
    for numero, ancora, selo, cor in selos:
        desenho.line([ancora, selo], fill=HALO, width=max(2, round(1.75 * escala)))
        desenho.line([ancora, selo], fill=(*cor, 255), width=max(1, round(0.75 * escala)))
        cx, cy = selo
        desenho.ellipse(
            [cx - raio, cy - raio, cx + raio, cy + raio],
            fill=(*cor, 255),
            outline=(11, 18, 32, 255),
            width=max(1, round(2 * escala)),
        )
        desenho.text((cx, cy), str(numero), fill=(0, 0, 0, 255), font=fonte, anchor="mm")
