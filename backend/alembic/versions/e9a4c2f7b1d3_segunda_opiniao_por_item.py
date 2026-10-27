"""segunda opiniao com anotacao por item e avaliacao geral (escala tipo RADPEER)

- curation_reviews.classificacao: concordo / discordancia_menor /
  discordancia_importante (avaliacao geral do revisor);
- curation_review_notes: uma anotacao do revisor por item da ficha (tipo,
  dentes, achado, descricao...), com a sugestao e o que o curador fez com
  ela depois (incorporada / dispensada). Nada existente e alterado.

Revision ID: e9a4c2f7b1d3
Revises: d8f2b6a4c1e9
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "e9a4c2f7b1d3"
down_revision = "d8f2b6a4c1e9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("curation_reviews", sa.Column("classificacao", sa.String(length=30), nullable=True))
    op.create_table(
        "curation_review_notes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("review_id", sa.Integer(), sa.ForeignKey("curation_reviews.id"), nullable=False),
        sa.Column("item", sa.String(length=40), nullable=False),
        sa.Column("avaliacao", sa.String(length=15), nullable=False),
        sa.Column("nota", sa.Text(), nullable=True),
        sa.Column("valor_sugerido", postgresql.JSONB(), nullable=True),
        sa.Column("situacao", sa.String(length=15), nullable=False, server_default="pendente"),
        sa.Column("resolvido_por", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("resolvido_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_curation_review_notes_id", "curation_review_notes", ["id"])
    op.create_index("ix_curation_review_notes_review_id", "curation_review_notes", ["review_id"])
    op.create_index("uq_curation_review_notes_item", "curation_review_notes", ["review_id", "item"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_curation_review_notes_item", table_name="curation_review_notes")
    op.drop_index("ix_curation_review_notes_review_id", table_name="curation_review_notes")
    op.drop_index("ix_curation_review_notes_id", table_name="curation_review_notes")
    op.drop_table("curation_review_notes")
    op.drop_column("curation_reviews", "classificacao")
