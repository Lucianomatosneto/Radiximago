"""cria tabela saved_images

Revision ID: a4d8f6c2b1e9
Revises: f7c4b2e9a1d6
Create Date: 2026-07-29 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a4d8f6c2b1e9'
down_revision: Union[str, None] = 'f7c4b2e9a1d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'saved_images',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('curation_id', sa.Integer(), nullable=False),
        sa.Column('criado_em', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['curation_id'], ['curations.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'curation_id', name='uq_saved_images_usuario_curation'),
    )
    op.create_index(op.f('ix_saved_images_id'), 'saved_images', ['id'], unique=False)
    op.create_index(op.f('ix_saved_images_user_id'), 'saved_images', ['user_id'], unique=False)
    op.create_index(op.f('ix_saved_images_curation_id'), 'saved_images', ['curation_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_saved_images_curation_id'), table_name='saved_images')
    op.drop_index(op.f('ix_saved_images_user_id'), table_name='saved_images')
    op.drop_index(op.f('ix_saved_images_id'), table_name='saved_images')
    op.drop_table('saved_images')
