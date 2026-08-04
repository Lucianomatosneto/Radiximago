"""adiciona coluna fixada (nota sempre visivel) nas anotacoes

Revision ID: f4d7b1a9e2c6
Revises: e6b2c8a4f193
Create Date: 2026-08-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f4d7b1a9e2c6'
down_revision: Union[str, None] = 'e6b2c8a4f193'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'anotacoes_imagem',
        sa.Column('fixada', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('anotacoes_imagem', 'fixada')
