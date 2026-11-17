"""
GRUPOS DE ENVIO e IMAGENS ENVIADAS A PESSOAS - etapa C (08/11/2026).

- GrupoEnvio: lista de pessoas que um professor ou curador monta para enviar
  imagens de uma vez (por exemplo, uma turma). Cada um cuida dos PROPRIOS
  grupos (decisao do Luciano); quem esta no grupo nao ve quem mais esta.
- EnvioDestinatario: uma imagem enviada (ainda fora do banco geral, ou ja
  nele) que o remetente mandou para uma pessoa. Quem recebe passa a poder ver
  a imagem em "Compartilhadas comigo > Recebidas de colegas". A imagem enviada
  pelo professor continua indo para a fila de curadoria; so o curador publica.

ENTRADA CONSENTIDA (17/11/2026, decisao D1 do Luciano): ninguem e colocado
direto num grupo. GrupoEntrada guarda os dois caminhos de entrada:
- tipo "convite": o dono convida; a pessoa entra so depois de ACEITAR;
- tipo "pedido": o estudante pede; ele entra so depois que o dono AUTORIZA.
Convite e pedido sem resposta vencem em DIAS_VALIDADE_ENTRADA dias. So pode
haver UM pendente por pessoa em cada grupo (indice unico parcial).
"""

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, text
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime

from app.core.database import Base

NOME_GRUPO_MAX = 80
MEMBROS_MAX = 300
DIAS_VALIDADE_ENTRADA = 30

# como a pessoa entrou no grupo
ORIGEM_CONVITE = "convite"      # aceitou um convite do dono
ORIGEM_PEDIDO = "pedido"        # o dono autorizou o pedido dela
ORIGEM_ANTERIOR = "anterior"    # ja estava no grupo antes de 17/11/2026


class GrupoEnvio(Base):
    __tablename__ = "grupos_envio"
    __table_args__ = (UniqueConstraint("dono_id", "nome", name="uq_grupos_envio_dono_nome"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    dono_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    nome: Mapped[str] = mapped_column(String(NOME_GRUPO_MAX), nullable=False)
    criado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # aparece na busca dos estudantes e recebe pedidos? (grupos de antes de
    # 17/11/2026 ficam desligados ate o dono ligar - D6)
    aceita_pedidos: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))


class GrupoEnvioMembro(Base):
    __tablename__ = "grupos_envio_membros"

    grupo_id: Mapped[int] = mapped_column(Integer, ForeignKey("grupos_envio.id", ondelete="CASCADE"), primary_key=True)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), primary_key=True, index=True)
    entrou_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    origem: Mapped[str] = mapped_column(String(10), nullable=False, server_default=ORIGEM_ANTERIOR)


class GrupoEntrada(Base):
    """Convite (o dono chama) ou pedido (o estudante pede) para entrar num grupo."""
    __tablename__ = "grupo_entradas"
    __table_args__ = (
        CheckConstraint("tipo IN ('convite', 'pedido')", name="ck_grupo_entradas_tipo"),
        CheckConstraint("estado IN ('pendente', 'aceito', 'recusado', 'cancelado', 'vencido')",
                        name="ck_grupo_entradas_estado"),
        # so UM convite ou pedido pendente por pessoa em cada grupo
        Index("uq_grupo_entradas_pendente", "grupo_id", "usuario_id", unique=True,
              postgresql_where=text("estado = 'pendente'")),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    grupo_id: Mapped[int] = mapped_column(Integer, ForeignKey("grupos_envio.id", ondelete="CASCADE"),
                                          nullable=False, index=True)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"),
                                            nullable=False, index=True)
    tipo: Mapped[str] = mapped_column(String(10), nullable=False)
    estado: Mapped[str] = mapped_column(String(10), nullable=False, server_default="pendente")
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    decidido_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class EnvioDestinatario(Base):
    __tablename__ = "envios_destinatarios"
    __table_args__ = (UniqueConstraint("orthanc_reference_id", "destinatario_id", name="uq_envio_imagem_pessoa"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    orthanc_reference_id: Mapped[int] = mapped_column(Integer, ForeignKey("orthanc_references.id", ondelete="CASCADE"),
                                  nullable=False, index=True)
    remetente_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    destinatario_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    criado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    visto_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
