"""adiciona foto de perfil em users

Revision ID: f7c4b2e9a1d6
Revises: e3a2b7c1f9d4
Create Date: 2026-07-29 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f7c4b2e9a1d6'
down_revision: Union[str, None] = 'e3a2b7c1f9d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('foto_perfil_url', sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'foto_perfil_url')
