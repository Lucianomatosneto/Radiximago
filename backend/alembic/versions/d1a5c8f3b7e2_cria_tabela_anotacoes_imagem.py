"""cria tabela anotacoes_imagem

Revision ID: d1a5c8f3b7e2
Revises: c9f4a2d81e63
Create Date: 2026-08-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd1a5c8f3b7e2'
down_revision: Union[str, None] = 'c9f4a2d81e63'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'anotacoes_imagem',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('curation_id', sa.Integer(), nullable=False),
        sa.Column('usuario_id', sa.Integer(), nullable=False),
        sa.Column('texto', sa.Text(), nullable=False),
        sa.Column('cor', sa.String(length=20), nullable=False, server_default='#facc15'),
        sa.Column('tamanho_fonte', sa.Integer(), nullable=False, server_default='14'),
        sa.Column('negrito', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('italico', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('pos_x', sa.Float(), nullable=True),
        sa.Column('pos_y', sa.Float(), nullable=True),
        sa.Column('criado_em', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('atualizado_em', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['curation_id'], ['curations.id']),
        sa.ForeignKeyConstraint(['usuario_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_anotacoes_imagem_id'), 'anotacoes_imagem', ['id'], unique=False)
    op.create_index(op.f('ix_anotacoes_imagem_curation_id'), 'anotacoes_imagem', ['curation_id'], unique=False)
    op.create_index(op.f('ix_anotacoes_imagem_usuario_id'), 'anotacoes_imagem', ['usuario_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_anotacoes_imagem_usuario_id'), table_name='anotacoes_imagem')
    op.drop_index(op.f('ix_anotacoes_imagem_curation_id'), table_name='anotacoes_imagem')
    op.drop_index(op.f('ix_anotacoes_imagem_id'), table_name='anotacoes_imagem')
    op.drop_table('anotacoes_imagem')
