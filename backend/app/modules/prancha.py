"""
PRANCHA DE ESTUDO (pedido de 20/10/2026): uma folha A4 com as radiografias
empilhadas na METADE ESQUERDA e as informacoes de cada uma na METADE
DIREITA, na mesma altura da sua imagem - como a prancha de um atlas.

Dois formatos:
- 2 imagens por folha (uma embaixo da outra);
- 3 imagens por folha (uma embaixo da outra).

A mesma folha serve para BAIXAR (PDF ou PNG), ENVIAR POR E-MAIL e IMPRIMIR:
e montada aqui, no servidor, uma vez so - por isso o resultado e igual nos
tres caminhos (o que sai no papel e o que chega no e-mail sao a mesma coisa).

O que NAO entra na folha: nenhum dado de paciente (as imagens ja sao
anonimizadas e o texto vem so da ficha de curadoria). Toda folha leva o
aviso de uso academico (ensino e pesquisa, nao diagnostico).

Este modulo so DESENHA (recebe imagens e textos prontos e devolve as
paginas); quem busca as fichas, confere a permissao e registra a auditoria
e app/modules/prancha_router.py.

Fonte: DejaVu Sans (livre - licenca em app/assets/fontes/LICENCA-DejaVu.txt),
que tem todos os acentos do portugues. A fonte embutida do Pillow nao tem
"ã", "ç", "é"... e as palavras sairiam com quadradinhos.
"""

from __future__ import annotations

import io
import os
import zipfile
from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

from PIL import Image, ImageDraw, ImageFont, ImageOps

from app.modules.marcacoes_imagem import cor_marcacao

# ---------------------------------------------------------------------------
# Pagina: A4 em pe, 150 pontos por polegada (boa para tela e impressora,
# arquivo leve para e-mail)
# ---------------------------------------------------------------------------
DPI = 150
LARGURA, ALTURA = 1240, 1754
MARGEM = 64
TOPO_CONTEUDO = 150
RODAPE_ALTURA = 110
VAO_LINHAS = 26
VAO_COLUNAS = 22

COR_TEXTO = (17, 24, 39)
COR_SUAVE = (100, 116, 139)
COR_BORDA = (148, 163, 184)
COR_MOLDURA = (13, 148, 136)  # turquesa do Radix
COR_FUNDO_INFO = (248, 250, 252)

AVISO = (
    "Rádix Imago - material de ensino e pesquisa (UFSC). Imagens anonimizadas. "
    "Não destinado a diagnóstico."
)

_PASTA_FONTES = os.path.join(os.path.dirname(__file__), "..", "assets", "fontes")


def _fonte(tamanho: int, negrito: bool = False) -> ImageFont.ImageFont:
    nome = "DejaVuSans-Bold.ttf" if negrito else "DejaVuSans.ttf"
    try:
        return ImageFont.truetype(os.path.join(_PASTA_FONTES, nome), tamanho)
    except OSError:  # fonte ausente: segue com a do Pillow (sem acentos)
        return ImageFont.load_default(size=tamanho)


# ---------------------------------------------------------------------------
# Textos (mesmos rotulos das telas - frontend/messages/pt.json)
# ---------------------------------------------------------------------------
TIPOS = {
    "periapical": "Periapical", "panoramica": "Panorâmica", "interproximal": "Interproximal",
    "oclusal": "Oclusal", "tomografia": "Tomografia (TCFC)",
}
QUALIDADES = {"otima": "Ótima", "boa": "Boa", "regular": "Regular", "insatisfatoria": "Insatisfatória"}
ACHADOS = {
    "normal": "Normal", "carie": "Cárie", "lesao_periapical": "Lesão periapical", "perda_ossea": "Perda óssea",
    "dente_incluso": "Dente incluso", "tratamento_endodontico": "Tratamento endodôntico",
    "erro_tecnico": "Erro técnico", "outro": "Outro",
}
ALTERACOES = {
    "carie_esmalte": "Cárie em esmalte", "carie_dentina": "Cárie em dentina",
    "carie_proxima_polpa": "Cárie próxima à polpa", "carie_secundaria": "Cárie secundária (sob restauração)",
    "perda_ossea_horizontal": "Perda óssea horizontal", "perda_ossea_vertical": "Perda óssea vertical",
    "calculo_dentario": "Cálculo dentário (tártaro)",
    "alargamento_ligamento_periodontal": "Alargamento do ligamento periodontal",
    "lesao_periapical": "Lesão periapical", "reabsorcao_radicular_externa": "Reabsorção radicular externa",
    "reabsorcao_radicular_interna": "Reabsorção radicular interna",
    "tratamento_endodontico_presente": "Tratamento endodôntico presente",
    "tratamento_endodontico_inadequado": "Tratamento endodôntico inadequado",
    "fratura_radicular": "Fratura radicular", "restauracao_presente": "Restauração presente",
    "restauracao_com_infiltracao": "Restauração com infiltração", "coroa_protetica": "Coroa protética",
    "nucleo_pino": "Núcleo/pino intrarradicular", "cisto": "Cisto", "lesao_radiopaca": "Lesão radiopaca",
    "lesao_radiolucida_inespecifica": "Lesão radiolúcida inespecífica",
    "dente_incluso": "Dente incluso/impactado", "dente_supranumerario": "Dente supranumerário",
    "agenesia_dentaria": "Agenesia dentária", "alteracao_seio_maxilar": "Alteração no seio maxilar",
    "corpo_estranho": "Corpo estranho",
}


def _cru(valor) -> str | None:
    """Valor de enum ou texto -> texto (None se vazio)."""
    if valor is None:
        return None
    texto = str(getattr(valor, "value", valor)).strip()
    return texto or None


@dataclass
class Linha:
    rotulo: str
    valor: str
    cor: tuple[int, int, int] | None = None  # linhas "Marcação N": cor do achado


@dataclass
class ItemPrancha:
    numero: int
    curation_id: int
    imagem_png: bytes | None
    linhas: list[Linha] = field(default_factory=list)


def descrever_ficha(ficha, marcacoes: list[dict] | None) -> list[Linha]:
    """As mesmas linhas da caixa "i" das telas (lib/descricaoCuradoria.ts)."""
    linhas: list[Linha] = []

    def add(rotulo: str, valor: str | None):
        if valor and valor.strip():
            linhas.append(Linha(rotulo, valor.strip()))

    tipo = _cru(ficha.tipo_radiografia)
    add("Tipo", TIPOS.get(tipo, tipo) if tipo else None)
    qualidade = _cru(ficha.qualidade_tecnica)
    add("Qualidade", QUALIDADES.get(qualidade, qualidade) if qualidade else None)
    dentes = ficha.dentes or []
    add("Dentes", ", ".join(str(d) for d in dentes) if dentes else None)
    achado = _cru(ficha.achado_principal)
    add("Achado principal", ACHADOS.get(achado, achado) if achado else None)
    alteracoes = [ALTERACOES.get(_cru(a) or "", _cru(a) or "") for a in (ficha.alteracoes_observadas or [])]
    add("Alterações observadas", ", ".join(a for a in alteracoes if a))
    add("Achados detalhados", _cru(ficha.achados_detalhe))
    add("Descrição didática", _cru(ficha.descricao_didatica))
    for i, m in enumerate(marcacoes or [], start=1):
        achado_m = m.get("achado")
        if achado_m == "outro" and m.get("achado_descricao"):
            texto = str(m.get("achado_descricao"))
        else:
            texto = ACHADOS.get(achado_m, achado_m or "—")
        linhas.append(Linha(f"Marcação {i}", texto, cor=cor_marcacao(m)))
    return linhas


# ---------------------------------------------------------------------------
# Desenho
# ---------------------------------------------------------------------------
def _quebrar(desenho: ImageDraw.ImageDraw, texto: str, fonte, largura: int, recuo_primeira: int = 0) -> list[str]:
    """Quebra o texto em linhas que cabem na largura (respeita quebras de linha)."""
    saida: list[str] = []
    for paragrafo in texto.split("\n"):
        palavras = paragrafo.split()
        atual = ""
        limite = largura - (recuo_primeira if not saida else 0)
        for palavra in palavras:
            tentativa = f"{atual} {palavra}".strip()
            if desenho.textlength(tentativa, font=fonte) <= limite:
                atual = tentativa
                continue
            if atual:
                saida.append(atual)
                limite = largura
            # palavra maior que a linha inteira: corta em pedacos
            while desenho.textlength(palavra, font=fonte) > limite:
                corte = len(palavra)
                while corte > 1 and desenho.textlength(palavra[:corte], font=fonte) > limite:
                    corte -= 1
                saida.append(palavra[:corte])
                palavra = palavra[corte:]
                limite = largura
            atual = palavra
        saida.append(atual)
    return saida


def _colar_imagem(pagina: Image.Image, conteudo: bytes | None, caixa: tuple[int, int, int, int], numero: int) -> None:
    x0, y0, x1, y1 = caixa
    desenho = ImageDraw.Draw(pagina)
    larg, alt = x1 - x0, y1 - y0
    if conteudo:
        try:
            img = Image.open(io.BytesIO(conteudo))
            img = ImageOps.exif_transpose(img)
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB") if img.mode in ("RGBA", "P", "LA") else ImageOps.autocontrast(img.convert("L"))
            img = img.convert("RGB")
            img.thumbnail((larg, alt), Image.LANCZOS)
            # a radiografia fica sobre fundo preto (como nas telas), centrada
            desenho.rectangle(caixa, fill=(0, 0, 0))
            pagina.paste(img, (x0 + (larg - img.width) // 2, y0 + (alt - img.height) // 2))
        except Exception:
            conteudo = None
    if not conteudo:
        desenho.rectangle(caixa, fill=(226, 232, 240))
        f = _fonte(22)
        texto = "Imagem indisponível"
        desenho.text((x0 + larg / 2, y0 + alt / 2), texto, font=f, fill=COR_SUAVE, anchor="mm")
    # numero da imagem no canto (como o selo das telas)
    f = _fonte(20, negrito=True)
    rotulo = f"#{numero}"
    w = desenho.textlength(rotulo, font=f)
    desenho.rounded_rectangle((x0 + 8, y0 + 8, x0 + 8 + w + 16, y0 + 38), radius=6, fill=(0, 0, 0))
    desenho.text((x0 + 16, y0 + 23), rotulo, font=f, fill=(153, 246, 228), anchor="lm")


def _desenhar_informacoes(pagina: Image.Image, item: ItemPrancha, caixa: tuple[int, int, int, int]) -> None:
    x0, y0, x1, y1 = caixa
    desenho = ImageDraw.Draw(pagina)
    desenho.rounded_rectangle(caixa, radius=10, fill=COR_FUNDO_INFO, outline=COR_BORDA, width=2)
    pad = 18
    largura = x1 - x0 - 2 * pad
    linhas = item.linhas or [Linha("", "Sem descrição da curadoria.")]

    # tenta o maior tamanho de letra em que tudo cabe (de 21 ate 12)
    for tamanho in range(21, 11, -1):
        f_titulo = _fonte(tamanho + 4, negrito=True)
        f_rot = _fonte(tamanho, negrito=True)
        f_val = _fonte(tamanho)
        entre = round(tamanho * 1.32)
        blocos = []
        altura = tamanho + 4 + entre  # titulo
        for linha in linhas:
            recuo = 0
            if linha.cor:
                recuo += tamanho + 6  # bolinha da cor
            prefixo = f"{linha.rotulo}: " if linha.rotulo else ""
            recuo += round(desenho.textlength(prefixo, font=f_rot))
            partes = _quebrar(desenho, linha.valor, f_val, largura, recuo_primeira=recuo)
            blocos.append((linha, prefixo, partes))
            altura += len(partes) * entre + 4
        if altura <= (y1 - y0) - 2 * pad:
            break

    y = y0 + pad
    desenho.text((x0 + pad, y), f"Imagem {item.numero}", font=f_titulo, fill=COR_MOLDURA)
    y += tamanho + 4 + entre
    limite = y1 - pad - entre
    for linha, prefixo, partes in blocos:
        x = x0 + pad
        if y > limite:
            desenho.text((x, y - entre / 2), "…", font=f_val, fill=COR_SUAVE)
            break
        if linha.cor:
            r = tamanho // 2
            cy = y + tamanho * 0.55
            desenho.ellipse((x, cy - r, x + 2 * r, cy + r), fill=linha.cor, outline=(30, 41, 59), width=2)
            x += tamanho + 6
        if prefixo:
            desenho.text((x, y), prefixo, font=f_rot, fill=COR_TEXTO)
            x += desenho.textlength(prefixo, font=f_rot)
        for k, parte in enumerate(partes):
            if y > limite:
                desenho.text((x0 + pad, y - entre / 2), "…", font=f_val, fill=COR_SUAVE)
                return
            desenho.text((x if k == 0 else x0 + pad, y), parte, font=f_val, fill=COR_TEXTO)
            y += entre
        y += 4


def _cabecalho_e_rodape(pagina: Image.Image, numero_pagina: int, total_paginas: int, data: str) -> None:
    desenho = ImageDraw.Draw(pagina)
    desenho.text((MARGEM, 70), "RÁDIX IMAGO", font=_fonte(32, negrito=True), fill=COR_MOLDURA, anchor="lm")
    desenho.text(
        (LARGURA - MARGEM, 70), f"Página {numero_pagina} de {total_paginas} · {data}",
        font=_fonte(20), fill=COR_SUAVE, anchor="rm",
    )
    desenho.line((MARGEM, 108, LARGURA - MARGEM, 108), fill=COR_BORDA, width=2)
    y = ALTURA - RODAPE_ALTURA + 20
    desenho.line((MARGEM, y, LARGURA - MARGEM, y), fill=COR_BORDA, width=1)
    f = _fonte(17)
    for k, parte in enumerate(_quebrar(desenho, AVISO, f, LARGURA - 2 * MARGEM)):
        desenho.text((LARGURA / 2, y + 30 + k * 24), parte, font=f, fill=COR_SUAVE, anchor="mm")


def montar_paginas(
    itens: list[ItemPrancha],
    por_folha: Literal[2, 3] = 2,
    com_informacoes: bool = True,
    data: str | None = None,
) -> list[Image.Image]:
    """Monta as folhas: imagens empilhadas a esquerda, informacoes a direita."""
    if por_folha not in (2, 3):
        raise ValueError("por_folha deve ser 2 ou 3")
    data = data or datetime.now().strftime("%d/%m/%Y")
    grupos = [itens[i:i + por_folha] for i in range(0, len(itens), por_folha)] or [[]]
    paginas: list[Image.Image] = []
    area_y0 = TOPO_CONTEUDO
    area_y1 = ALTURA - RODAPE_ALTURA
    altura_linha = (area_y1 - area_y0 - VAO_LINHAS * (por_folha - 1)) // por_folha
    metade = (LARGURA - 2 * MARGEM - VAO_COLUNAS) // 2
    for n, grupo in enumerate(grupos, start=1):
        pagina = Image.new("RGB", (LARGURA, ALTURA), "white")
        _cabecalho_e_rodape(pagina, n, len(grupos), data)
        desenho = ImageDraw.Draw(pagina)
        for k, item in enumerate(grupo):
            y0 = area_y0 + k * (altura_linha + VAO_LINHAS)
            y1 = y0 + altura_linha
            if com_informacoes:
                caixa_img = (MARGEM + 8, y0 + 8, MARGEM + metade - 4, y1 - 8)
                caixa_info = (MARGEM + metade + VAO_COLUNAS + 4, y0 + 8, LARGURA - MARGEM - 8, y1 - 8)
                _colar_imagem(pagina, item.imagem_png, caixa_img, item.numero)
                _desenhar_informacoes(pagina, item, caixa_info)
            else:
                _colar_imagem(pagina, item.imagem_png, (MARGEM + 8, y0 + 8, LARGURA - MARGEM - 8, y1 - 8), item.numero)
            # moldura UNICA em volta da imagem e das suas informacoes
            desenho.rounded_rectangle((MARGEM, y0, LARGURA - MARGEM, y1), radius=14, outline=COR_MOLDURA, width=3)
        paginas.append(pagina)
    return paginas


def em_pdf(paginas: list[Image.Image]) -> bytes:
    saida = io.BytesIO()
    paginas[0].save(
        saida, "PDF", resolution=DPI, save_all=True, append_images=paginas[1:],
        title="Prancha Rádix Imago", author="Rádix Imago", producer="Rádix Imago",
    )
    return saida.getvalue()


def em_png(paginas: list[Image.Image], nome_base: str) -> tuple[bytes, str, str]:
    """Uma folha: PNG. Varias: ZIP com um PNG por folha. Devolve (bytes, tipo, nome)."""
    def png(img: Image.Image) -> bytes:
        b = io.BytesIO()
        img.save(b, "PNG", optimize=True, dpi=(DPI, DPI))
        return b.getvalue()

    if len(paginas) == 1:
        return png(paginas[0]), "image/png", f"{nome_base}.png"
    saida = io.BytesIO()
    with zipfile.ZipFile(saida, "w", zipfile.ZIP_DEFLATED) as z:
        for i, pagina in enumerate(paginas, start=1):
            z.writestr(f"{nome_base}-folha-{i}.png", png(pagina))
    return saida.getvalue(), "application/zip", f"{nome_base}.zip"
