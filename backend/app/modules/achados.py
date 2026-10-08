"""
Modelos de dados da classificacao odontologica estruturada (Fase 1).

Tabelas:
- achados         -> achado/condicao odontologica, 0..N por ficha de curadoria
- erros_tecnicos  -> erro tecnico da aquisicao da imagem, dimensao
                     independente do achado clinico (0..N por ficha)

Estas tabelas sao ADITIVAS: nao substituem nem alteram `Curation.dentes`,
`Curation.achado_principal`, `Curation.alteracoes_observadas`,
`Curation.marcacoes` nem `Curation.achados_detalhe`, que continuam
existindo e funcionando exatamente como antes. Ver especificacao tecnica
consolidada (investigacoes anteriores) para o raciocinio completo por tras
de cada decisao de modelagem documentada abaixo.

Os schemas Pydantic de entrada/saida da API (AchadoCreate/Update/Out,
ErroTecnicoCreate/Update/Out) ficam em app/modules/curation/schemas.py,
junto com os demais schemas de curadoria (Fase 2) - aqui so os
enums (vocabulario) e os modelos ORM (tabelas).
"""

import enum

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
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
# Vocabularios controlados (mesmo padrao de curations.py: guardados como
# texto no banco, validados na camada de aplicacao via estes Enums).
# ---------------------------------------------------------------------
class TipoAchado(str, enum.Enum):
    """
    Tipo/classificacao de um Achado estruturado. Reaproveita os MESMOS 26
    valores de `AlteracaoObservada` (curations.py) - mesma nomenclatura,
    sem alterar aquele enum, que continua existindo e sendo usado pelo
    checklist atual da Curadoria. Acrescenta apenas OUTRO, que
    `AlteracaoObservada` nao tem (ela e um checklist complementar aberto,
    nao uma classificacao unica fechada com "catch-all" - ja o Achado
    estruturado precisa de um valor livre, como `AchadoPrincipal.OUTRO`
    ja tinha).
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
    # Catch-all (nao existe em AlteracaoObservada - ver docstring da classe)
    OUTRO = "outro"


class RegiaoAnatomica(str, enum.Enum):
    """
    Regiao anatomica associada a um Achado. Estrutura nova - nao existia
    nenhum campo equivalente reutilizavel no schema atual (investigacoes
    anteriores confirmaram ausencia de qualquer conceito de regiao
    anatomica no codigo, so achado/dente/marcacao espacial).
    """
    COROA = "coroa"
    RAIZ = "raiz"
    REGIAO_PERIAPICAL = "regiao_periapical"
    PERIODONTO = "periodonto"
    OSSO_ALVEOLAR = "osso_alveolar"
    CANAL_MANDIBULAR = "canal_mandibular"
    SEIO_MAXILAR = "seio_maxilar"
    ATM = "atm"
    MAXILA = "maxila"
    MANDIBULA = "mandibula"
    PALATO = "palato"
    OUTRAS_ESTRUTURAS = "outras_estruturas"


class TipoErroTecnico(str, enum.Enum):
    """
    Tipo de erro tecnico da AQUISICAO da imagem - dimensao independente
    do achado clinico odontologico (nao reaproveita `TipoAchado` nem o
    antigo valor `AchadoPrincipal.ERRO_TECNICO`, que misturava os dois
    conceitos - ver especificacao consolidada, secao sobre Erro Tecnico).
    """
    MOVIMENTO = "movimento"
    CORTE_APICE = "corte_apice"
    CORTE_COROA = "corte_coroa"
    ANGULACAO_INADEQUADA = "angulacao_inadequada"
    EXPOSICAO_INADEQUADA = "exposicao_inadequada"
    POSICIONAMENTO_INADEQUADO = "posicionamento_inadequado"
    ARTEFATO = "artefato"
    PROCESSAMENTO_INADEQUADO = "processamento_inadequado"


# ---------------------------------------------------------------------
# Tabela: achado odontologico estruturado
# ---------------------------------------------------------------------
class Achado(Base):
    __tablename__ = "achados"

    id = Column(Integer, primary_key=True, index=True)
    curation_id = Column(Integer, ForeignKey("curations.id"), nullable=False, index=True)
    curation = relationship("Curation", back_populates="achados")

    tipo = Column(String(60), nullable=False)  # TipoAchado
    regiao_anatomica = Column(String(30), nullable=True)  # RegiaoAnatomica

    # Numeros FDI (11-48) relacionados ESPECIFICAMENTE a este achado - nao
    # confundir com `Curation.dentes` (nivel da ficha: "quais dentes a
    # imagem contem/representa no total"). Mesmo tipo e mesma semantica de
    # `Curation.dentes`: o numero representa a regiao odontologica,
    # presente fisicamente ou nao (ex.: dente 46 ausente mas a regiao
    # correspondente e identificavel na imagem - registra-se 46 do mesmo
    # jeito, sem nenhum valor artificial). 0..N dentes por achado - um
    # achado pode nao ter dente (ex.: alteracao de seio maxilar) ou ter
    # varios (ex.: perda ossea relacionada a 45, 46 e 47 como UM achado
    # so, nao tres achados separados).
    dentes = Column(ARRAY(Integer), nullable=True)

    # O curador identificou uma regiao/lesao na imagem mas NAO conseguiu
    # determinar a qual numero FDI ela corresponde - situacao DIFERENTE de
    # "dente ausente fisicamente mas regiao identificavel" (que usa
    # `dentes` normalmente, com o FDI real, sem nenhum tratamento
    # especial). Campo booleano proprio, fora do array `dentes`, de
    # proposito: a instrucao foi explicita em nao usar `0` nem nenhum
    # codigo artificial dentro do array de dentes para representar
    # incerteza/ausencia.
    dente_nao_identificado = Column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )

    # Texto livre - usado na pratica sempre que tipo == "outro", mas
    # tambem pode complementar qualquer outro tipo (mesmo padrao tolerante
    # ja usado em achados_detalhe/achado_descricao hoje).
    descricao = Column(Text, nullable=True)

    # Mesmo formato de `Curation.marcacoes` (lista de formas oval/
    # retangulo/seta, coordenadas relativas 0.0-1.0), MENOS os campos
    # achado/achado_descricao por forma - aqui ficariam redundantes, ja
    # que o achado e o proprio registro desta tabela, nao mais um atributo
    # por forma dentro de uma lista de marcacoes soltas na ficha.
    marcacoes = Column(JSONB, nullable=False, server_default="[]")

    criado_em = Column(DateTime(timezone=True), server_default=func.now())
    atualizado_em = Column(DateTime(timezone=True), onupdate=func.now())


# ---------------------------------------------------------------------
# Tabela: erro tecnico da aquisicao (dimensao independente do achado)
# ---------------------------------------------------------------------
class ErroTecnico(Base):
    __tablename__ = "erros_tecnicos"

    id = Column(Integer, primary_key=True, index=True)
    curation_id = Column(Integer, ForeignKey("curations.id"), nullable=False, index=True)
    curation = relationship("Curation", back_populates="erros_tecnicos")

    tipo = Column(String(60), nullable=False)  # TipoErroTecnico
    descricao = Column(Text, nullable=True)

    criado_em = Column(DateTime(timezone=True), server_default=func.now())
