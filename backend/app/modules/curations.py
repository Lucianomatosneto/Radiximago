"""
Modelos de dados da Curadoria do Radix Imago (Fase 4).

Tabelas:
- curations          -> ficha de curadoria de cada imagem
- curation_history   -> historico de alteracoes (regra obrigatoria do Bloco 4)
- curation_reviews   -> segunda opiniao (solicitar -> responder -> decisao)

Os valores controlados (status, dificuldade, etc.) sao guardados como texto no
banco e validados na camada de aplicacao, o que permite acrescentar novos
valores no futuro sem alterar o banco. As listas oficiais ficam nos Enums.
"""

import enum

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


# ---------------------------------------------------------------------
# Listas fixas (vocabularios controlados) - fonte oficial dos valores
# ---------------------------------------------------------------------
class Modalidade(str, enum.Enum):
    RX = "RX"


class TipoRadiografia(str, enum.Enum):
    PANORAMICA = "panoramica"
    INTERPROXIMAL = "interproximal"
    PERIAPICAL = "periapical"
    OCLUSAL = "oclusal"


class Genero(str, enum.Enum):
    MASCULINO = "masculino"
    FEMININO = "feminino"


class AchadoPrincipal(str, enum.Enum):
    NORMAL = "normal"
    CARIE = "carie"
    LESAO_PERIAPICAL = "lesao_periapical"
    PERDA_OSSEA = "perda_ossea"
    DENTE_INCLUSO = "dente_incluso"
    TRATAMENTO_ENDODONTICO = "tratamento_endodontico"
    ERRO_TECNICO = "erro_tecnico"
    OUTRO = "outro"


class AlteracaoObservada(str, enum.Enum):
    """
    Checklist de alteracoes radiograficas comumente observadas em
    radiografias interproximais, periapicais, oclusais e panoramicas -
    o curador apenas marca as que se aplicam, em vez de descrever em
    texto livre. Complementa (nao substitui) `achado_principal`, que
    continua sendo a classificacao unica/principal da ficha.
    """
    # Carie
    CARIE_ESMALTE = "carie_esmalte"
    CARIE_DENTINA = "carie_dentina"
    CARIE_PROXIMA_POLPA = "carie_proxima_polpa"
    CARIE_SECUNDARIA = "carie_secundaria"
    # Periodontal
    PERDA_OSSEA_HORIZONTAL = "perda_ossea_horizontal"
    PERDA_OSSEA_VERTICAL = "perda_ossea_vertical"
    CALCULO_DENTARIO = "calculo_dentario"
    ALARGAMENTO_LIGAMENTO_PERIODONTAL = "alargamento_ligamento_periodontal"
    # Periapical / endodontico
    LESAO_PERIAPICAL = "lesao_periapical"
    REABSORCAO_RADICULAR_EXTERNA = "reabsorcao_radicular_externa"
    REABSORCAO_RADICULAR_INTERNA = "reabsorcao_radicular_interna"
    TRATAMENTO_ENDODONTICO_PRESENTE = "tratamento_endodontico_presente"
    TRATAMENTO_ENDODONTICO_INADEQUADO = "tratamento_endodontico_inadequado"
    FRATURA_RADICULAR = "fratura_radicular"
    # Restaurador / protetico
    RESTAURACAO_PRESENTE = "restauracao_presente"
    RESTAURACAO_COM_INFILTRACAO = "restauracao_com_infiltracao"
    COROA_PROTETICA = "coroa_protetica"
    NUCLEO_PINO = "nucleo_pino"
    # Osseo / anatomico
    CISTO = "cisto"
    LESAO_RADIOPACA = "lesao_radiopaca"
    LESAO_RADIOLUCIDA_INESPECIFICA = "lesao_radiolucida_inespecifica"
    DENTE_INCLUSO = "dente_incluso"
    DENTE_SUPRANUMERARIO = "dente_supranumerario"
    AGENESIA_DENTARIA = "agenesia_dentaria"
    ALTERACAO_SEIO_MAXILAR = "alteracao_seio_maxilar"
    CORPO_ESTRANHO = "corpo_estranho"


class QualidadeTecnica(str, enum.Enum):
    OTIMA = "otima"
    BOA = "boa"
    REGULAR = "regular"
    INSATISFATORIA = "insatisfatoria"


class Dificuldade(str, enum.Enum):
    BASICO = "basico"
    INTERMEDIARIO = "intermediario"
    AVANCADO = "avancado"


class StatusCuradoria(str, enum.Enum):
    PENDENTE = "pendente"
    EM_ANALISE = "em_analise"
    APROVADA = "aprovada"
    DESCARTADA = "descartada"
    SEGUNDA_OPINIAO = "segunda_opiniao"
    BAIXA_QUALIDADE = "baixa_qualidade"


class StatusRevisao(str, enum.Enum):
    SOLICITADA = "solicitada"
    RESPONDIDA = "respondida"
    FINALIZADA = "finalizada"


class DecisaoRevisao(str, enum.Enum):
    APROVAR = "aprovar"
    DESCARTAR = "descartar"
    MANTER = "manter"


class DecisaoFinalRevisao(str, enum.Enum):
    APROVAR = "aprovar"
    DESCARTAR = "descartar"


# Dentes permanentes validos (notacao FDI), quadrantes 1 a 4.
DENTES_PERMANENTES = (
    list(range(11, 19))    # 11-18 superior direita
    + list(range(21, 29))  # 21-28 superior esquerda
    + list(range(31, 39))  # 31-38 inferior esquerda
    + list(range(41, 49))  # 41-48 inferior direita
)


# ---------------------------------------------------------------------
# Tabela principal: ficha de curadoria
# ---------------------------------------------------------------------
class Curation(Base):
    __tablename__ = "curations"

    id = Column(Integer, primary_key=True, index=True)

    # Imagem curada (referencia registrada na Fase 3)
    orthanc_reference_id = Column(
        Integer, ForeignKey("orthanc_references.id"), nullable=False, index=True
    )
    orthanc_reference = relationship("OrthancReference", back_populates="curations")

    # Classificacao (valores controlados guardados como texto)
    modalidade = Column(String(20), nullable=False, default="RX")
    tipo_radiografia = Column(String(30), nullable=True)
    dentes = Column(ARRAY(Integer), nullable=True)  # numeros FDI 11-48
    idade_min = Column(Integer, nullable=True)
    idade_max = Column(Integer, nullable=True)
    genero = Column(String(15), nullable=True)
    achado_principal = Column(String(40), nullable=True)
    # Marcacoes desenhadas pelo curador sobre a miniatura estatica (nao o
    # OHIF, que roda em outra origem e nao tem como ser lido de volta) pra
    # indicar onde estao as lesoes. Lista de objetos, cada um com posicao
    # relativa (0.0 a 1.0 da largura/altura da imagem):
    # oval/retangulo: {id, tipo, x, y, largura, altura}
    # seta:           {id, tipo, x1, y1, x2, y2}
    marcacoes = Column(JSONB, nullable=False, server_default="[]")
    achados_detalhe = Column(Text, nullable=True)
    alteracoes_observadas = Column(ARRAY(String(60)), nullable=True)  # checklist (AlteracaoObservada)
    qualidade_tecnica = Column(String(20), nullable=True)
    dificuldade = Column(String(20), nullable=True)
    descricao_didatica = Column(Text, nullable=True)
    observacoes_internas = Column(Text, nullable=True)

    # Fluxo
    status = Column(String(25), nullable=False, default="pendente", index=True)
    anonimizacao_validada = Column(Boolean, nullable=False, default=False)

    # Autoria e datas
    curador_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())
    atualizado_em = Column(DateTime(timezone=True), onupdate=func.now())


# ---------------------------------------------------------------------
# Historico de alteracoes da curadoria
# ---------------------------------------------------------------------
class CurationHistory(Base):
    __tablename__ = "curation_history"

    id = Column(Integer, primary_key=True, index=True)
    curation_id = Column(
        Integer, ForeignKey("curations.id"), nullable=False, index=True
    )
    usuario_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    acao = Column(String(50), nullable=False)  # criacao, aprovacao, descarte...
    status_anterior = Column(String(25), nullable=True)
    status_novo = Column(String(25), nullable=True)
    justificativa = Column(Text, nullable=True)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())


# ---------------------------------------------------------------------
# Segunda opiniao
# ---------------------------------------------------------------------
class CurationReview(Base):
    __tablename__ = "curation_reviews"

    id = Column(Integer, primary_key=True, index=True)
    curation_id = Column(
        Integer, ForeignKey("curations.id"), nullable=False, index=True
    )
    solicitante_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    motivo = Column(Text, nullable=False)  # justificativa obrigatoria (Bloco 4)
    primeiro_parecer = Column(Text, nullable=True)
    revisor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    parecer_revisor = Column(Text, nullable=True)
    concordancia = Column(String(15), nullable=True)  # concorda / discorda
    decisao_final = Column(String(25), nullable=True)
    observacoes = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="solicitada")
    criado_em = Column(DateTime(timezone=True), server_default=func.now())
    respondido_em = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        # No maximo uma review "em aberto" (solicitada ou respondida, ainda
        # nao aplicada) por ficha - impede a condicao de corrida onde duas
        # solicitacoes concorrentes passam pela checagem da aplicacao antes
        # de qualquer uma commitar.
        Index(
            "uq_curation_reviews_aberta",
            "curation_id",
            unique=True,
            postgresql_where=text("status IN ('solicitada', 'respondida')"),
        ),
    )