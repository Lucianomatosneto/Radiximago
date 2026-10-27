"""segmentacao de estruturas (pintura do curador sobre a radiografia)

Nova tabela segmentacoes_curadoria: cada estrutura pintada (nome, dente FDI,
cor e mascara PNG de 1 bit) ligada a uma ficha de curadoria. Apagar a ficha
apaga as pinturas dela (ON DELETE CASCADE). Nada existente e alterado.

Revision ID: a3c5e7f9b2d4
Revises: e9a4c2f7b1d3
"""
import sqlalchemy as sa
from alembic import op

revision = "a3c5e7f9b2d4"
down_revision = "e9a4c2f7b1d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "segmentacoes_curadoria",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("curation_id", sa.Integer(), sa.ForeignKey("curations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("nome", sa.String(length=60), nullable=False),
        sa.Column("dente", sa.Integer(), nullable=True),
        sa.Column("cor", sa.String(length=7), nullable=False),
        sa.Column("mascara", sa.LargeBinary(), nullable=False),
        sa.Column("largura", sa.Integer(), nullable=False),
        sa.Column("altura", sa.Integer(), nullable=False),
        sa.Column("criado_por_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("dente IS NULL OR (dente BETWEEN 11 AND 48)", name="ck_segmentacoes_dente_fdi"),
        sa.CheckConstraint("largura BETWEEN 8 AND 2048 AND altura BETWEEN 8 AND 2048", name="ck_segmentacoes_tamanho"),
    )
    op.create_index("ix_segmentacoes_curadoria_id", "segmentacoes_curadoria", ["id"])
    op.create_index("ix_segmentacoes_curadoria_curation_id", "segmentacoes_curadoria", ["curation_id"])


def downgrade() -> None:
    op.drop_index("ix_segmentacoes_curadoria_curation_id", table_name="segmentacoes_curadoria")
    op.drop_index("ix_segmentacoes_curadoria_id", table_name="segmentacoes_curadoria")
    op.drop_table("segmentacoes_curadoria")
