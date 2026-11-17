"""grupos com entrada consentida: convites e pedidos (Etapa 1, 17/11/2026)

Decisao D1 do Luciano: ninguem e colocado direto num grupo. Para isso:
- grupos_envio ganha "aceita_pedidos" (aparece na busca dos estudantes).
  Os grupos que ja existem ficam DESLIGADOS (false) ate o dono ligar (D6);
- grupos_envio_membros ganha "entrou_em" e "origem". Quem ja estava num
  grupo fica com origem "anterior" e continua no grupo;
- tabela nova grupo_entradas: convites (o dono chama, a pessoa aceita) e
  pedidos (o estudante pede, o dono autoriza), com no maximo UM pendente por
  pessoa em cada grupo.
Nada e apagado; o "downgrade" desfaz exatamente estas mudancas.

Revision ID: c4e6a8b0d2f1
Revises: f1a3c5e7b9d2
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c4e6a8b0d2f1"
down_revision: Union[str, None] = "f1a3c5e7b9d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("grupos_envio", sa.Column("aceita_pedidos", sa.Boolean(), nullable=False,
                                            server_default=sa.text("false")))
    op.add_column("grupos_envio_membros", sa.Column("entrou_em", sa.DateTime(timezone=True),
                                                    server_default=sa.func.now(), nullable=True))
    op.add_column("grupos_envio_membros", sa.Column("origem", sa.String(length=10), nullable=False,
                                                    server_default="anterior"))
    op.create_table(
        "grupo_entradas",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("grupo_id", sa.Integer(), sa.ForeignKey("grupos_envio.id", ondelete="CASCADE"), nullable=False),
        sa.Column("usuario_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tipo", sa.String(length=10), nullable=False),
        sa.Column("estado", sa.String(length=10), nullable=False, server_default="pendente"),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("decidido_em", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("tipo IN ('convite', 'pedido')", name="ck_grupo_entradas_tipo"),
        sa.CheckConstraint("estado IN ('pendente', 'aceito', 'recusado', 'cancelado', 'vencido')",
                           name="ck_grupo_entradas_estado"),
    )
    op.create_index("ix_grupo_entradas_id", "grupo_entradas", ["id"])
    op.create_index("ix_grupo_entradas_grupo_id", "grupo_entradas", ["grupo_id"])
    op.create_index("ix_grupo_entradas_usuario_id", "grupo_entradas", ["usuario_id"])
    op.create_index("uq_grupo_entradas_pendente", "grupo_entradas", ["grupo_id", "usuario_id"], unique=True,
                    postgresql_where=sa.text("estado = 'pendente'"))


def downgrade() -> None:
    op.drop_index("uq_grupo_entradas_pendente", table_name="grupo_entradas")
    op.drop_index("ix_grupo_entradas_usuario_id", table_name="grupo_entradas")
    op.drop_index("ix_grupo_entradas_grupo_id", table_name="grupo_entradas")
    op.drop_index("ix_grupo_entradas_id", table_name="grupo_entradas")
    op.drop_table("grupo_entradas")
    op.drop_column("grupos_envio_membros", "origem")
    op.drop_column("grupos_envio_membros", "entrou_em")
    op.drop_column("grupos_envio", "aceita_pedidos")
