"""informacoes adicionais e anexos da curadoria (08/11/2026)

curations ganha informacoes_adicionais (texto livre que nao entra na
Pesquisa avancada) e nasce a tabela anexos_curadoria (imagens anexadas pelo
curador). Nada e apagado nem alterado.

Revision ID: a1d4f6b8c2e5
Revises: f3b8d2c6a4e9
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1d4f6b8c2e5"
down_revision: Union[str, None] = "f3b8d2c6a4e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("curations", sa.Column("informacoes_adicionais", sa.Text(), nullable=True))
    op.create_table(
        "anexos_curadoria",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("curation_id", sa.Integer(), sa.ForeignKey("curations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("nome_original", sa.String(120), nullable=False),
        sa.Column("arquivo", sa.String(80), nullable=False),
        sa.Column("tipo_mime", sa.String(30), nullable=False),
        sa.Column("tamanho", sa.Integer(), nullable=False),
        sa.Column("largura", sa.Integer(), nullable=True),
        sa.Column("altura", sa.Integer(), nullable=True),
        sa.Column("criado_por_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("arquivo", name="uq_anexos_curadoria_arquivo"),
    )
    op.create_index("ix_anexos_curadoria_id", "anexos_curadoria", ["id"])
    op.create_index("ix_anexos_curadoria_curation_id", "anexos_curadoria", ["curation_id"])


def downgrade() -> None:
    op.drop_table("anexos_curadoria")
    op.drop_column("curations", "informacoes_adicionais")
