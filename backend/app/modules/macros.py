"""
Recursos de produtividade da curadoria, inspirados nos sistemas de laudo
por voz mais usados em radiologia (PowerScribe, Fluency) e nos modelos de
laudo estruturado da RSNA:

1. MACROS (frases prontas / "autotexto"): o curador fala "macro <nome>"
   (ou escolhe no menu) e a ficha recebe um conteudo padrao - descricao,
   achados, observacoes, alteracoes, tipo e qualidade. Sao da equipe
   (todos os curadores usam); quem cria fica registrado e toda criacao,
   edicao e desativacao vai para a auditoria. Aplicar uma macro so
   preenche o RASCUNHO: aprovar continua manual.

2. FRASES APRENDIDAS (dicionario de voz): quando o Whisper transcreve uma
   palavra de um jeito que as regras nao reconhecem (ex.: "reabsorsão
   externa") e o curador aceita a sugestao, ele pode "ensinar" o sistema:
   a frase falada passa a valer como aquela alteracao da lista. Para
   termos do vocabulario controlado, o ensino vira um SINONIMO do termo
   (tabela sinonimos_termo, ver vocabulario.py).
"""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from app.core.database import Base

# campos da ficha que uma macro pode preencher
CAMPOS_TEXTO_MACRO = ("descricao_didatica", "achados_detalhe", "observacoes_internas")
CAMPOS_MACRO = CAMPOS_TEXTO_MACRO + ("alteracoes_observadas", "tipo_radiografia", "qualidade_tecnica")


class MacroCuradoria(Base):
    __tablename__ = "macros_curadoria"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(80), nullable=False)
    # nome sem acento/minusculas: e o que o curador fala depois de "macro"
    nome_normalizado = Column(String(80), nullable=False, unique=True, index=True)
    conteudo = Column(JSONB, nullable=False, default=dict)
    ativo = Column(Boolean, nullable=False, default=True)
    criado_por_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())
    atualizado_em = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class FraseAprendida(Base):
    __tablename__ = "frases_aprendidas_voz"

    id = Column(Integer, primary_key=True, index=True)
    frase = Column(String(150), nullable=False)
    frase_normalizada = Column(String(150), nullable=False, unique=True, index=True)
    # valor de AlteracaoObservada (ex.: "reabsorcao_radicular_externa")
    alteracao = Column(String(60), nullable=False)
    criado_por_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())
