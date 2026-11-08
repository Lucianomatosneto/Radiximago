"""
GRUPOS DE ENVIO e IMAGENS ENVIADAS A PESSOAS - etapa C da separacao Radix
Imago / Radix Clinica (08/11/2026).

- GrupoEnvio: lista de pessoas que um professor ou curador monta para enviar
  imagens de uma vez (por exemplo, uma turma). Cada um cuida dos PROPRIOS
  grupos (decisao do Luciano); quem esta no grupo nao ve quem mais esta.
- EnvioDestinatario: uma imagem enviada (ainda fora do banco geral, ou ja
  nele) que o remetente mandou para uma pessoa. Quem recebe passa a poder ver
  a imagem em "Compartilhadas comigo > Recebidas de colegas". A imagem enviada
  pelo professor continua indo para a fila de curadoria; so o curador publica.
"""

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.sql import func

from app.core.database import Base

NOME_GRUPO_MAX = 80
MEMBROS_MAX = 300


class GrupoEnvio(Base):
    __tablename__ = "grupos_envio"
    __table_args__ = (UniqueConstraint("dono_id", "nome", name="uq_grupos_envio_dono_nome"),)

    id = Column(Integer, primary_key=True, index=True)
    dono_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    nome = Column(String(NOME_GRUPO_MAX), nullable=False)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())


class GrupoEnvioMembro(Base):
    __tablename__ = "grupos_envio_membros"

    grupo_id = Column(Integer, ForeignKey("grupos_envio.id", ondelete="CASCADE"), primary_key=True)
    usuario_id = Column(Integer, ForeignKey("users.id"), primary_key=True, index=True)


class EnvioDestinatario(Base):
    __tablename__ = "envios_destinatarios"
    __table_args__ = (UniqueConstraint("orthanc_reference_id", "destinatario_id", name="uq_envio_imagem_pessoa"),)

    id = Column(Integer, primary_key=True, index=True)
    orthanc_reference_id = Column(Integer, ForeignKey("orthanc_references.id", ondelete="CASCADE"),
                                  nullable=False, index=True)
    remetente_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    destinatario_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())
    visto_em = Column(DateTime(timezone=True), nullable=True)
