"""
Busca por palavras nos textos livres da ficha de curadoria.

Onde procura (o "texto da ficha"):
- Achados detalhados (inclui o texto do achado principal "Outro");
- Descricao didatica;
- a descricao de cada marcacao (o texto do "Outro" das marcacoes).

Como compara (tudo no proprio PostgreSQL):
- sem acento e sem diferenca de maiusculas (extensao unaccent);
- trecho exato ("reabsor" encontra "reabsorcao");
- radical da palavra em portugues ("reabsorcoes" encontra "reabsorcao")
  - busca de texto completo, dicionario 'portuguese';
- pequenos erros de digitacao ("reabsorsao") - semelhanca por trigramas
  (extensao pg_trgm, funcao word_similarity);
- SINONIMOS: se a palavra buscada e um termo do vocabulario (ou sinonimo
  dele), procura tambem por todos os sinonimos e pelas fichas ligadas
  ao termo.
"""

from sqlalchemy import String, and_, cast, exists, func, literal, literal_column, or_
from sqlalchemy.orm import Session

from app.modules.curations import Curation
from app.modules.vocabulario import CurationTermo, SinonimoTermo, TermoVocabulario, normalizar

# dicionario de portugues da busca de texto completo (radical das palavras)
PORTUGUES = literal_column("'portuguese'::regconfig")

# semelhanca minima (0 a 1) para aceitar como erro de digitacao
LIMIAR_SEMELHANCA = 0.6


def texto_ficha_normalizado():
    """Expressao SQL com o texto livre da ficha, minusculo e sem acento."""
    descricoes_marcacoes = cast(
        func.jsonb_path_query_array(Curation.marcacoes, literal("$[*].achado_descricao")), String
    )
    bruto = func.concat_ws(
        " ",
        func.coalesce(Curation.achados_detalhe, ""),
        func.coalesce(Curation.descricao_didatica, ""),
        descricoes_marcacoes,
    )
    return func.lower(func.unaccent(bruto))


def termos_relacionados(db: Session, consulta_normalizada: str) -> list[TermoVocabulario]:
    """Termos ativos cujo nome ou sinonimo e exatamente o que foi buscado."""
    por_nome = db.query(TermoVocabulario).filter(
        TermoVocabulario.ativo.is_(True), TermoVocabulario.termo_normalizado == consulta_normalizada
    )
    por_sinonimo = (
        db.query(TermoVocabulario)
        .join(SinonimoTermo, SinonimoTermo.termo_id == TermoVocabulario.id)
        .filter(TermoVocabulario.ativo.is_(True), SinonimoTermo.sinonimo_normalizado == consulta_normalizada)
    )
    return por_nome.union(por_sinonimo).all()


def condicao_busca_texto(db: Session, consulta: str):
    """
    Condicao (para .filter) que encontra fichas pelo texto livre.
    Devolve None se a consulta ficar vazia depois de normalizada.
    """
    q = normalizar(consulta)
    if not q:
        return None

    frases = {q}
    termos = termos_relacionados(db, q)
    for termo in termos:
        frases.add(termo.termo_normalizado)
        frases.update(s.sinonimo_normalizado for s in termo.sinonimos)

    texto = texto_ficha_normalizado()
    condicoes = []
    for frase in frases:
        frase_like = frase.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        condicoes.append(texto.like(f"%{frase_like}%", escape="\\"))
        condicoes.append(
            func.to_tsvector(PORTUGUES, texto).op("@@")(func.plainto_tsquery(PORTUGUES, frase))
        )
        if len(frase) >= 4:
            condicoes.append(func.word_similarity(frase, texto) >= LIMIAR_SEMELHANCA)

    if termos:
        condicoes.append(
            exists().where(
                and_(
                    CurationTermo.curation_id == Curation.id,
                    CurationTermo.termo_id.in_([t.id for t in termos]),
                )
            )
        )
    return or_(*condicoes)


def condicao_termo(termo_id: int):
    """Fichas ligadas a um termo do vocabulario."""
    return exists().where(and_(CurationTermo.curation_id == Curation.id, CurationTermo.termo_id == termo_id))
