"""
PASTAS DE PACIENTES (casos clinicos da escola de Odontologia) - 30/10/2026.

Especificacao: "Radix Imago - Especificacao: fotos dos alunos, revisao do
professor e fila de tratamento" (documento do projeto).

O aluno fotografa no negatoscopio as radiografias que fez, cadastra o
paciente e envia a pasta a um professor. O professor revisa (marcacoes e
anotacoes, com historico de versoes), pode compartilhar com outros
professores/curadores e encaminhar ao curador, que CLASSIFICA o tratamento
necessario e poe o paciente na FILA. Os professores consultam a fila e
encaminham o paciente a um aluno; ai ele sai da fila.

Diferente do restante do Radix:
- os dados sao IDENTIFICADOS (nome do paciente) - nada aqui passa pelo
  Orthanc nem pela anonimizacao, e nada aparece no banco geral, na busca
  dos usuarios gerais ou para pesquisadores;
- as fotos ficam CIFRADAS no disco (app/modules/casos_arquivos.py);
- quem pode ver: o aluno autor, o aluno que recebeu o tratamento,
  professores e curadores (app/modules/casos_router.py: _pode_ver). O
  administrador ve so o registro de acessos, nunca as imagens.
- o Radix NAO emite diagnostico: e um organizador; a validacao e sempre no
  filme fisico (aviso fixo nas telas).

Etapas (campo `etapa`):
  enviado                 -> pasta criada pelo aluno (com ou sem professor)
  aguardando_classificacao-> professor encaminhou ao curador
  na_fila                 -> curador classificou o tratamento; esta na fila
  em_tratamento           -> professor encaminhou a um aluno
  concluido               -> tratamento concluido
"""

import enum

from sqlalchemy import (
    JSON, Column, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class EtapaCaso(str, enum.Enum):
    ENVIADO = "enviado"
    AGUARDANDO_CLASSIFICACAO = "aguardando_classificacao"
    NA_FILA = "na_fila"
    EM_TRATAMENTO = "em_tratamento"
    CONCLUIDO = "concluido"


class GeneroPaciente(str, enum.Enum):
    FEMININO = "feminino"
    MASCULINO = "masculino"
    OUTRO = "outro"
    NAO_INFORMADO = "nao_informado"


class ModalidadeCaso(str, enum.Enum):
    PERIAPICAL = "periapical"
    INTERPROXIMAL = "interproximal"
    OCLUSAL = "oclusal"
    PANORAMICA = "panoramica"
    OUTRA = "outra"


class TipoTratamento(str, enum.Enum):
    """Lista inicial (proposta da especificacao - pode crescer)."""
    DENTISTICA = "dentistica"
    ENDODONTIA = "endodontia"
    PERIODONTIA = "periodontia"
    EXODONTIA_CIRURGIA = "exodontia_cirurgia"
    PROTESE = "protese"
    ORTODONTIA = "ortodontia"
    ODONTOPEDIATRIA = "odontopediatria"
    IMPLANTE = "implante"
    OUTROS = "outros"


class TipoImagemCaso(str, enum.Enum):
    RADIOGRAFIA = "radiografia"
    TERMO = "termo"  # foto do termo de aceitacao assinado pelo paciente


class CasoClinico(Base):
    __tablename__ = "casos_clinicos"

    id = Column(Integer, primary_key=True, index=True)
    aluno_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # professor que vai ver (None = o aluno enviou "so para mim")
    professor_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    paciente_nome = Column(String(200), nullable=False)
    paciente_nascimento = Column(Date, nullable=False)
    paciente_genero = Column(String(20), nullable=False)
    paciente_contato = Column(String(100), nullable=False)
    paciente_prontuario = Column(String(50), nullable=True)
    paciente_observacoes = Column(Text, nullable=True)  # "outros dados fundamentais"

    modalidade = Column(String(20), nullable=False)
    descricao = Column(Text, nullable=False)

    etapa = Column(String(30), nullable=False, default=EtapaCaso.ENVIADO.value, index=True)

    encaminhado_curador_por_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    encaminhado_curador_em = Column(DateTime(timezone=True), nullable=True)
    nota_encaminhamento = Column(Text, nullable=True)

    tratamentos = Column(ARRAY(String(30)), nullable=False, default=list)
    classificado_por_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    classificado_em = Column(DateTime(timezone=True), nullable=True)

    aluno_tratamento_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    tratamento_escolhido = Column(String(30), nullable=True)
    encaminhado_tratamento_por_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    encaminhado_tratamento_em = Column(DateTime(timezone=True), nullable=True)

    concluido_por_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    concluido_em = Column(DateTime(timezone=True), nullable=True)

    # aviso "corrigida pelo professor" para o aluno: ultima revisao de outra
    # pessoa x ultima vez que o aluno autor abriu a pasta
    corrigido_em = Column(DateTime(timezone=True), nullable=True)
    visto_aluno_em = Column(DateTime(timezone=True), nullable=True)

    criado_em = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    atualizado_em = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    aluno = relationship("User", foreign_keys=[aluno_id])
    professor = relationship("User", foreign_keys=[professor_id])
    aluno_tratamento = relationship("User", foreign_keys=[aluno_tratamento_id])
    encaminhado_tratamento_por = relationship("User", foreign_keys=[encaminhado_tratamento_por_id])
    imagens = relationship("CasoImagem", order_by="CasoImagem.ordem", cascade="all, delete-orphan")


class CasoImagem(Base):
    __tablename__ = "casos_imagens"

    id = Column(Integer, primary_key=True, index=True)
    caso_id = Column(Integer, ForeignKey("casos_clinicos.id"), nullable=False, index=True)
    ordem = Column(Integer, nullable=False, default=0)
    tipo = Column(String(15), nullable=False, default=TipoImagemCaso.RADIOGRAFIA.value)
    # nomes dos arquivos CIFRADOS no disco (aleatorios, sem dado do paciente)
    arquivo = Column(String(80), nullable=False)
    miniatura = Column(String(80), nullable=False)
    largura = Column(Integer, nullable=False)
    altura = Column(Integer, nullable=False)
    bytes = Column(Integer, nullable=False)
    dentes = Column(ARRAY(Integer), nullable=False, default=list)
    observacao = Column(Text, nullable=True)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())


class CasoRevisao(Base):
    """
    Versoes das anotacoes da pasta (historico - nunca apagado). Cada
    "salvar" do professor/curador (ou "editar depois do envio") cria uma
    versao NOVA; a ultima e a atual. `anotacoes` = {"<imagem_id>":
    {"texto": "...", "marcacoes": [Marcacao...]}}.
    """
    __tablename__ = "casos_revisoes"

    id = Column(Integer, primary_key=True, index=True)
    caso_id = Column(Integer, ForeignKey("casos_clinicos.id"), nullable=False, index=True)
    versao = Column(Integer, nullable=False)
    autor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    autor_perfil = Column(String(20), nullable=False)
    comentario = Column(Text, nullable=True)
    anotacoes = Column(JSON, nullable=False, default=dict)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())

    autor = relationship("User")

    __table_args__ = (UniqueConstraint("caso_id", "versao", name="uq_casos_revisoes_versao"),)


class CasoCompartilhamento(Base):
    """Pasta compartilhada com outro professor ou curador."""
    __tablename__ = "casos_compartilhamentos"

    id = Column(Integer, primary_key=True, index=True)
    caso_id = Column(Integer, ForeignKey("casos_clinicos.id"), nullable=False, index=True)
    de_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    para_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())
    visto_em = Column(DateTime(timezone=True), nullable=True)

    de = relationship("User", foreign_keys=[de_id])

    __table_args__ = (UniqueConstraint("caso_id", "para_id", name="uq_casos_compartilhamentos_para"),)


class CasoHistorico(Base):
    """
    Linha do tempo da pasta (o que aconteceu, quem fez e quando): envio,
    dados do paciente alterados, revisao vN, compartilhamento, encaminhamento
    ao curador, classificacao, encaminhamento ao aluno, conclusao.
    Os ACESSOS (quem abriu) ficam na auditoria geral (caso_visualizado).
    """
    __tablename__ = "casos_historico"

    id = Column(Integer, primary_key=True, index=True)
    caso_id = Column(Integer, ForeignKey("casos_clinicos.id"), nullable=False, index=True)
    usuario_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    acao = Column(String(40), nullable=False)
    detalhes = Column(Text, nullable=True)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())

    usuario = relationship("User")
