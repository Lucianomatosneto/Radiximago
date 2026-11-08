"""prancha enviada a outra pessoa por link com login (etapa E, 08/11/2026)

Tabela nova pranchas_enviadas (o pedido, nao o arquivo). Nada e apagado
nem alterado.

Revision ID: e9c3a5b7d1f2
Revises: d7b2f4a6c8e1
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e9c3a5b7d1f2"
down_revision: Union[str, None] = "d7b2f4a6c8e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pranchas_enviadas",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("remetente_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("destinatario_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("curation_ids", sa.JSON(), nullable=False),
        sa.Column("numeros", sa.JSON(), nullable=True),
        sa.Column("por_folha", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("com_informacoes", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("campos", sa.JSON(), nullable=True),
        sa.Column("com_marcacoes", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("recado", sa.String(500), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("visto_em", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_pranchas_enviadas_id", "pranchas_enviadas", ["id"])
    op.create_index("ix_pranchas_enviadas_remetente_id", "pranchas_enviadas", ["remetente_id"])
    op.create_index("ix_pranchas_enviadas_destinatario_id", "pranchas_enviadas", ["destinatario_id"])
    op.create_index("ix_pranchas_enviadas_criado_em", "pranchas_enviadas", ["criado_em"])


def downgrade() -> None:
    op.drop_table("pranchas_enviadas")
