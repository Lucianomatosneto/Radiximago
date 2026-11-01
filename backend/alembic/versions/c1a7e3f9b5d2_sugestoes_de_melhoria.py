"""sugestoes de melhoria do sistema

Revision ID: c1a7e3f9b5d2
Revises: b4d6f8a1c3e5
"""
import sqlalchemy as sa
from alembic import op

revision = "c1a7e3f9b5d2"
down_revision = "b4d6f8a1c3e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sugestoes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("usuario_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("perfil", sa.String(20), nullable=False),
        sa.Column("texto", sa.Text(), nullable=False),
        sa.Column("contato", sa.String(200), nullable=True),
        sa.Column("andamento", sa.String(20), nullable=False, server_default="recebida"),
        sa.Column("motivo", sa.Text(), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("atualizado_por_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.CheckConstraint(
            "andamento IN ('recebida','em_analise','feita','nao_sera_feita')", name="ck_sugestoes_andamento"
        ),
    )
    op.create_index("ix_sugestoes_id", "sugestoes", ["id"])
    op.create_index("ix_sugestoes_usuario_id", "sugestoes", ["usuario_id"])
    op.create_index("ix_sugestoes_andamento", "sugestoes", ["andamento"])
    op.create_index("ix_sugestoes_criado_em", "sugestoes", ["criado_em"])


def downgrade() -> None:
    op.drop_table("sugestoes")
