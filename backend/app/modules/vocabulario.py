"""
Vocabulario controlado e evolutivo do Radix Imago.

Problema: a ficha de curadoria tem listas fechadas (tipo de radiografia,
achados, alteracoes...) e, para o que nao cabe nelas, a opcao "Outro" com
texto livre. Texto livre e dificil de pesquisar e cada curador escreve de
um jeito.

Solucao (vocabulario evolutivo, com uma pessoa sempre aprovando):
1. o texto livre ja e encontrado pela "busca por palavras" (search_router);
2. os textos livres que mais se repetem aparecem na tela Vocabulario;
3. o curador/administrador PROMOVE um termo a termo oficial
   (TermoVocabulario), opcionalmente com o codigo DeCS (Descritores em
   Ciencias da Saude - BIREME);
4. termos com o mesmo significado sao agrupados como SINONIMOS;
5. as fichas antigas que tinham o texto sao VINCULADAS ao termo (depois
   de conferidas) e o termo vira filtro na Pesquisa avancada e passa a ser
   reconhecido na curadoria por voz.

Os textos sao comparados sempre "normalizados" (minusculas, sem acento e
sem espacos repetidos) - ver normalizar().
"""

import re
import unicodedata

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base

CATEGORIAS_TERMO = ("achado", "alteracao", "outro")


def normalizar(texto: str | None) -> str:
    """minusculas, sem acentos, sem pontuacao nas pontas e com espacos simples"""
    if not texto:
        return ""
    sem_acento = "".join(
        c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn"
    )
    limpo = re.sub(r"\s+", " ", sem_acento.lower()).strip()
    return limpo.strip(" .,;:!?-\"'")


class TermoVocabulario(Base):
    __tablename__ = "termos_vocabulario"

    id = Column(Integer, primary_key=True, index=True)
    termo = Column(String(150), nullable=False)
    termo_normalizado = Column(String(150), nullable=False, unique=True, index=True)
    categoria = Column(String(20), nullable=False, default="achado")
    # codigo do descritor no DeCS/MeSH (opcional), ex.: "D012086"
    codigo_decs = Column(String(30), nullable=True)
    ativo = Column(Boolean, nullable=False, default=True)
    criado_por_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())

    sinonimos = relationship(
        "SinonimoTermo", back_populates="termo", cascade="all, delete-orphan", order_by="SinonimoTermo.id"
    )


class SinonimoTermo(Base):
    __tablename__ = "sinonimos_termo"

    id = Column(Integer, primary_key=True, index=True)
    termo_id = Column(Integer, ForeignKey("termos_vocabulario.id", ondelete="CASCADE"), nullable=False, index=True)
    sinonimo = Column(String(150), nullable=False)
    sinonimo_normalizado = Column(String(150), nullable=False, unique=True, index=True)

    termo = relationship("TermoVocabulario", back_populates="sinonimos")


class CurationTermo(Base):
    """Ligacao ficha <-> termo do vocabulario (muitos para muitos)."""

    __tablename__ = "curation_termos"

    curation_id = Column(Integer, ForeignKey("curations.id", ondelete="CASCADE"), primary_key=True)
    termo_id = Column(Integer, ForeignKey("termos_vocabulario.id", ondelete="CASCADE"), primary_key=True, index=True)
    vinculado_por_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    vinculado_em = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("curation_id", "termo_id", name="uq_curation_termo"),)
