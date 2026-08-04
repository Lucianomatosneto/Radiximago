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

Limitacao conhecida (documentavel na dissertacao como trade-off aceito):
na tela, o preenchimento do oval/retangulo usa mix-blend-mode "overlay"
do CSS (um efeito que reage a cor de fundo, deixando areas escuras mais
claras e vice-versa). O Pillow nao tem um equivalente direto e simples
pra isso - aqui usamos uma sobreposicao alfa comum (branco
semi-transparente por cima), que fica visualmente proxima mas nao
identica pixel a pixel ao que aparece na tela. Como o objetivo aqui e
apenas ter um arquivo PORTATIL com a marcacao visivel (nao uma copia
perfeita da tela), essa diferenca e aceitavel.
"""

import io
import math
from typing import Any

from PIL import Image, ImageDraw


def desenhar_marcacoes_na_imagem(conteudo_png: bytes, marcacoes: list[dict[str, Any]] | None) -> bytes:
    """
    Recebe os bytes de um PNG e a lista de marcacoes (formato igual ao tipo
    `Marcacao` do frontend, ver frontend/src/lib/marcacoes.ts) e devolve os
    bytes de um novo PNG com as marcacoes desenhadas por cima.

    Se `marcacoes` estiver vazio/None, devolve o PNG original sem
    modificar nada (evita trabalho e cor de arredondamento a toa quando
    nao ha nada pra desenhar).
    """
    if not marcacoes:
        return conteudo_png

    imagem_original = Image.open(io.BytesIO(conteudo_png)).convert("RGBA")
    largura, altura = imagem_original.size

    # Desenha numa camada transparente separada e so no final "cola" ela
    # em cima da imagem original - assim o preenchimento semi-transparente
    # do oval/retangulo fica correto (nao precisa calcular a cor de fundo
    # manualmente, o alpha_composite ja faz essa mistura).
    camada = Image.new("RGBA", (largura, altura), (0, 0, 0, 0))
    desenho = ImageDraw.Draw(camada)

    # Espessura do traco em pixels reais. Na tela, o SVG usa
    # vector-effect="non-scaling-stroke" pra manter a linha sempre fina,
    # nao importa o zoom - aqui nao existe "zoom", entao usamos uma
    # espessura proporcional ao tamanho da imagem, pra continuar visivel
    # tanto numa miniatura pequena quanto numa imagem de alta resolucao.
    espessura = max(2, round(min(largura, altura) * 0.004))

    for marcacao in marcacoes:
        tipo = marcacao.get("tipo")
        if tipo == "seta":
            _desenhar_seta(desenho, marcacao, largura, altura, espessura)
        elif tipo in ("oval", "retangulo"):
            _desenhar_forma_fechada(desenho, marcacao, largura, altura, tipo)
        # Tipos desconhecidos (ex.: um valor novo adicionado no futuro que
        # este modulo ainda nao conhece) sao simplesmente ignorados, em vez
        # de quebrar o download/e-mail inteiro por causa de uma marcacao.

    composta = Image.alpha_composite(imagem_original, camada).convert("RGB")
    buffer = io.BytesIO()
    composta.save(buffer, format="PNG")
    return buffer.getvalue()


def _desenhar_forma_fechada(
    desenho: "ImageDraw.ImageDraw",
    marcacao: dict[str, Any],
    largura: int,
    altura: int,
    tipo: str,
) -> None:
    """Oval ou retangulo - x,y = canto superior esquerdo (relativo 0-1),
    largura/altura = tamanho (relativo 0-1), igual ao formato usado na
    tela (ver FormasMarcacoes.tsx)."""
    x = (marcacao.get("x") or 0) * largura
    y = (marcacao.get("y") or 0) * altura
    w = (marcacao.get("largura") or 0) * largura
    h = (marcacao.get("altura") or 0) * altura
    caixa = [x, y, x + w, y + h]
    preenchimento = (255, 255, 255, 77)  # branco a ~30% de opacidade
    contorno = (255, 255, 255, 230)
    espessura_contorno = max(1, round(min(largura, altura) * 0.002))

    if tipo == "oval":
        desenho.ellipse(caixa, fill=preenchimento, outline=contorno, width=espessura_contorno)
    else:
        desenho.rectangle(caixa, fill=preenchimento, outline=contorno, width=espessura_contorno)


def _desenhar_seta(
    desenho: "ImageDraw.ImageDraw",
    marcacao: dict[str, Any],
    largura: int,
    altura: int,
    espessura: int,
) -> None:
    """Seta: x1,y1 = cauda, x2,y2 = ponta (relativo 0-1) - desenha a linha
    e um triangulo simples na ponta, no lugar do <marker> usado no SVG."""
    x1 = (marcacao.get("x1") or 0) * largura
    y1 = (marcacao.get("y1") or 0) * altura
    x2 = (marcacao.get("x2") or 0) * largura
    y2 = (marcacao.get("y2") or 0) * altura

    desenho.line([(x1, y1), (x2, y2)], fill=(255, 255, 255, 255), width=espessura)

    comprimento = math.hypot(x2 - x1, y2 - y1)
    if comprimento == 0:
        return

    tamanho_ponta = max(8.0, espessura * 4.0)
    angulo = math.atan2(y2 - y1, x2 - x1)
    angulo_abertura = math.radians(25)
    ponta_1 = (
        x2 - tamanho_ponta * math.cos(angulo - angulo_abertura),
        y2 - tamanho_ponta * math.sin(angulo - angulo_abertura),
    )
    ponta_2 = (
        x2 - tamanho_ponta * math.cos(angulo + angulo_abertura),
        y2 - tamanho_ponta * math.sin(angulo + angulo_abertura),
    )
    desenho.polygon([(x2, y2), ponta_1, ponta_2], fill=(255, 255, 255, 255))
