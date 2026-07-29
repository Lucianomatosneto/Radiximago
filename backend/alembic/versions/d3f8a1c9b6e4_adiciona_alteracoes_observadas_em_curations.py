"""adiciona alteracoes_observadas em curations

Revision ID: d3f8a1c9b6e4
Revises: c7e2f8a1b4d5
Create Date: 2026-07-28 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'd3f8a1c9b6e4'
down_revision: Union[str, None] = 'c7e2f8a1b4d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'curations',
        sa.Column('alteracoes_observadas', postgresql.ARRAY(sa.String(length=60)), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('curations', 'alteracoes_observadas')
