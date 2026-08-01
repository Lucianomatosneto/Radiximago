"""adiciona marcacao_x e marcacao_y em curations

Revision ID: b8e5f1a3c7d2
Revises: a4d8f6c2b1e9
Create Date: 2026-07-31 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8e5f1a3c7d2'
down_revision: Union[str, None] = 'a4d8f6c2b1e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('curations', sa.Column('marcacao_x', sa.Float(), nullable=True))
    op.add_column('curations', sa.Column('marcacao_y', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('curations', 'marcacao_y')
    op.drop_column('curations', 'marcacao_x')
