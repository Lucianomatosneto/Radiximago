"""canal mandibular na reconstrucao panoramica (23/11/2026)

Pedido do Luciano: marcar o canal mandibular na panoramica reconstruida e
ve-lo desenhado nas series geradas. Uma coluna nova, opcional (JSONB), em
reconstrucoes_tomografia: o trajeto marcado e as series desenhadas.

Revision ID: c5e7a9b1d3f5
Revises: b4d6f8a0c2e4
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c5e7a9b1d3f5"
down_revision: Union[str, None] = "b4d6f8a0c2e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("reconstrucoes_tomografia", sa.Column("canal", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("reconstrucoes_tomografia", "canal")
