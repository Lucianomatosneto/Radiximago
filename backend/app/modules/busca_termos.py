"""
BUSCA POR TERMOS da Pesquisa avancada (pedido de 26/10/2026).

A busca avancada passou a usar os MESMOS termos que o curador marca na
Curadoria. Cada termo escolhido na caixa "Buscar por termos" chega aqui
como um "token" (tipo:valor) e vira uma condicao da consulta; varios
termos se somam com E (a imagem precisa ter todos):

  grupo:carie        -> qualquer tipo de carie marcado pelo curador
                        (esmalte, dentina, proxima a polpa, secundaria) ou o
                        campo antigo "achado principal" / marcacao antiga;
  achado:carie_dentina -> um achado especifico (marcacoes/achados da ficha);
  regiao:coroa       -> achado marcado numa regiao anatomica;
  vocab:12           -> termo do vocabulario controlado: fichas ligadas a ele
                        pelo curador OU que o citam nos textos (com sinonimos);
  texto:reabsorcao   -> palavras nos textos livres (sem acento, plural,
                        pequenos erros, sinonimos) - busca_texto.py.
  dentes:incisivos   -> GRUPO DE DENTES (27/10/2026): basta o curador
                        marcar o numero do dente (ex.: 11) que a imagem
                        entra no grupo dele (incisivos, caninos, pre-molares,
                        molares...) - na ficha ou em qualquer achado;
  dente:36           -> um dente especifico (numero FDI).

Os GRUPOS sao os mesmos cartoes do Banco de imagens: um clique em "Carie"
traz todas as imagens com qualquer carie marcada na curadoria.
"""

from fastapi import HTTPException
from sqlalchemy import and_, exists, or_
from sqlalchemy.orm import Session

from app.modules.achados import Achado, ErroTecnico, RegiaoAnatomica, TipoAchado
from app.modules.busca_texto import condicao_busca_texto, condicao_termo
from app.modules.curations import Curation
from app.modules.vocabulario import TermoVocabulario

MAX_TERMOS_BUSCA = 12
MAX_CARACTERES_TOKEN = 160

# grupo -> (achados estruturados que contam, valor antigo de "achado principal"/marcacao)
GRUPOS_ACHADO: dict[str, tuple[list[str], str | None]] = {
    "normal": ([], "normal"),
    "carie": (["carie_esmalte", "carie_dentina", "carie_proxima_polpa", "carie_secundaria"], "carie"),
    "lesao_periapical": (["lesao_periapical"], "lesao_periapical"),
    "perda_ossea": (["perda_ossea_horizontal", "perda_ossea_vertical"], "perda_ossea"),
    "dente_incluso": (["dente_incluso"], "dente_incluso"),
    "tratamento_endodontico": (["tratamento_endodontico_presente", "tratamento_endodontico_inadequado"], "tratamento_endodontico"),
    "periodontal": (
        ["perda_ossea_horizontal", "perda_ossea_vertical", "calculo_dentario", "alargamento_ligamento_periodontal"],
        None,
    ),
    "restaurador": (["restauracao_presente", "restauracao_com_infiltracao", "coroa_protetica", "nucleo_pino"], None),
    "reabsorcao": (["reabsorcao_radicular_externa", "reabsorcao_radicular_interna"], None),
    "lesoes_osseas": (["cisto", "lesao_radiopaca", "lesao_radiolucida_inespecifica"], None),
    "anomalias": (["dente_incluso", "dente_supranumerario", "agenesia_dentaria"], None),
    # erro tecnico e uma dimensao a parte (ErroTecnico), tratada abaixo
    "erro_tecnico": ([], "erro_tecnico"),
}

# Numeracao FDI (dois digitos): o primeiro e o quadrante (1-4 permanentes,
# 5-8 deciduos) e o segundo, a posicao a partir da linha media.
PERMANENTES = [q * 10 + p for q in (1, 2, 3, 4) for p in range(1, 9)]
DECIDUOS = [q * 10 + p for q in (5, 6, 7, 8) for p in range(1, 6)]
DENTES_VALIDOS = set(PERMANENTES + DECIDUOS)


def _posicoes(quadrantes, posicoes):
    return [q * 10 + p for q in quadrantes for p in posicoes]


GRUPOS_DENTES: dict[str, list[int]] = {
    "incisivos": _posicoes((1, 2, 3, 4), (1, 2)) + _posicoes((5, 6, 7, 8), (1, 2)),
    "incisivos_centrais": _posicoes((1, 2, 3, 4), (1,)) + _posicoes((5, 6, 7, 8), (1,)),
    "incisivos_laterais": _posicoes((1, 2, 3, 4), (2,)) + _posicoes((5, 6, 7, 8), (2,)),
    "caninos": _posicoes((1, 2, 3, 4), (3,)) + _posicoes((5, 6, 7, 8), (3,)),
    "pre_molares": _posicoes((1, 2, 3, 4), (4, 5)),
    "molares": _posicoes((1, 2, 3, 4), (6, 7, 8)) + _posicoes((5, 6, 7, 8), (4, 5)),
    "primeiros_molares": _posicoes((1, 2, 3, 4), (6,)),
    "segundos_molares": _posicoes((1, 2, 3, 4), (7,)),
    "terceiros_molares": _posicoes((1, 2, 3, 4), (8,)),
    "anteriores": _posicoes((1, 2, 3, 4), (1, 2, 3)) + _posicoes((5, 6, 7, 8), (1, 2, 3)),
    "posteriores": _posicoes((1, 2, 3, 4), (4, 5, 6, 7, 8)) + _posicoes((5, 6, 7, 8), (4, 5)),
    "superiores": _posicoes((1, 2), range(1, 9)) + _posicoes((5, 6), range(1, 6)),
    "inferiores": _posicoes((3, 4), range(1, 9)) + _posicoes((7, 8), range(1, 6)),
    "deciduos": DECIDUOS,
    "permanentes": PERMANENTES,
}

TIPOS_ACHADO = {t.value for t in TipoAchado}
REGIOES = {r.value for r in RegiaoAnatomica}


def condicao_grupo(grupo: str):
    if grupo not in GRUPOS_ACHADO:
        raise HTTPException(status_code=422, detail=f"Grupo de achados desconhecido: {grupo}")
    tipos, legado = GRUPOS_ACHADO[grupo]
    partes = []
    if tipos:
        partes.append(exists().where(and_(Achado.curation_id == Curation.id, Achado.tipo.in_(tipos))))
        partes.append(Curation.alteracoes_observadas.overlap(tipos))
    if legado:
        partes.append(Curation.achado_principal == legado)
        # marcacao antiga com o achado no proprio desenho
        partes.append(Curation.marcacoes.contains([{"achado": legado}]))
    if grupo == "erro_tecnico":
        partes.append(exists().where(ErroTecnico.curation_id == Curation.id))
    return or_(*partes)


def condicao_achado(tipo: str):
    if tipo not in TIPOS_ACHADO:
        raise HTTPException(status_code=422, detail=f"Achado desconhecido: {tipo}")
    return or_(
        Curation.alteracoes_observadas.overlap([tipo]),
        exists().where(and_(Achado.curation_id == Curation.id, Achado.tipo == tipo)),
    )


def condicao_regiao(regiao: str):
    if regiao not in REGIOES:
        raise HTTPException(status_code=422, detail=f"Região anatômica desconhecida: {regiao}")
    return exists().where(and_(Achado.curation_id == Curation.id, Achado.regiao_anatomica == regiao))


def condicao_dentes(numeros: list[int]):
    """A ficha (dentes da imagem) OU algum achado marcado nesses dentes."""
    return or_(
        Curation.dentes.overlap(numeros),
        exists().where(and_(Achado.curation_id == Curation.id, Achado.dentes.overlap(numeros))),
    )


def condicao_grupo_dentes(grupo: str):
    if grupo not in GRUPOS_DENTES:
        raise HTTPException(status_code=422, detail=f"Grupo de dentes desconhecido: {grupo}")
    return condicao_dentes(GRUPOS_DENTES[grupo])


def condicao_dente(valor: str):
    if not valor.isdigit() or int(valor) not in DENTES_VALIDOS:
        raise HTTPException(status_code=422, detail="Número de dente inválido (FDI).")
    return condicao_dentes([int(valor)])


def condicao_vocabulario(db: Session, termo_id: int):
    termo = db.query(TermoVocabulario).filter(TermoVocabulario.id == termo_id).first()
    if not termo:
        raise HTTPException(status_code=422, detail="Termo do vocabulário não encontrado.")
    texto = condicao_busca_texto(db, termo.termo)
    return or_(condicao_termo(termo_id), texto) if texto is not None else condicao_termo(termo_id)


def condicao_token(db: Session, token: str):
    """Um termo escolhido na busca ("tipo:valor") -> condicao para .filter()."""
    tipo, sep, valor = (token or "").partition(":")
    valor = valor.strip()
    if not sep or not valor:
        raise HTTPException(status_code=422, detail=f"Termo de busca inválido: {token[:40]}")
    if tipo == "grupo":
        return condicao_grupo(valor)
    if tipo == "achado":
        return condicao_achado(valor)
    if tipo == "regiao":
        return condicao_regiao(valor)
    if tipo == "vocab":
        if not valor.isdigit():
            raise HTTPException(status_code=422, detail="Termo do vocabulário inválido.")
        return condicao_vocabulario(db, int(valor))
    if tipo == "dentes":
        return condicao_grupo_dentes(valor)
    if tipo == "dente":
        return condicao_dente(valor)
    if tipo == "texto":
        return condicao_busca_texto(db, valor)
    raise HTTPException(status_code=422, detail=f"Tipo de termo desconhecido: {tipo[:20]}")
