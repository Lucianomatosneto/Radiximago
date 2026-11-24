"""medidas da tomografia na ficha (24/11/2026)

Pedido do Luciano (recurso 6): a regua (mm) e o angulo (graus) que o
curador faz num corte da tomografia passam a ser dado da ficha. Uma coluna
nova em curations: "medidas" (JSONB, lista vazia por padrao) - as fichas
existentes ficam com a lista vazia; nada mais muda.

Revision ID: d6f8b0c2e4a6
Revises: c5e7a9b1d3f5
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d6f8b0c2e4a6"
down_revision: Union[str, None] = "c5e7a9b1d3f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "curations",
        sa.Column("medidas", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )


def downgrade() -> None:
    op.drop_column("curations", "medidas")
