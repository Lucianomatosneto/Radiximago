"""ficha comecada pelo professor como sugestao ao curador (etapa C, 08/11/2026)

Duas colunas novas em curations; nada e apagado nem alterado.

Revision ID: c5a9e3b7d2f4
Revises: b3f7d1a9c5e2
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c5a9e3b7d2f4"
down_revision: Union[str, None] = "b3f7d1a9c5e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("curations", sa.Column("sugerida_por_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True))
    op.add_column("curations", sa.Column("sugestao_enviada_em", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_curations_sugerida_por_id", "curations", ["sugerida_por_id"])


def downgrade() -> None:
    op.drop_index("ix_curations_sugerida_por_id", "curations")
    op.drop_column("curations", "sugestao_enviada_em")
    op.drop_column("curations", "sugerida_por_id")
