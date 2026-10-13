"""cria tabela compartilhamentos_imagem

Revision ID: d7a3e9c1f5b2
Revises: c3e9a7d2f5b8
Create Date: 2026-10-13 13:00:00.000000

Compartilhamento de imagens anotadas entre usuarios ("Compartilhadas
comigo"). Ver CompartilhamentoImagem em app/modules/compartilhamentos.py.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd7a3e9c1f5b2'
down_revision: Union[str, None] = 'c3e9a7d2f5b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'compartilhamentos_imagem',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('remetente_id', sa.Integer(), nullable=False),
        sa.Column('destinatario_id', sa.Integer(), nullable=False),
        sa.Column('curation_id', sa.Integer(), nullable=False),
        sa.Column('mensagem', sa.Text(), nullable=True),
        sa.Column('criado_em', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('visto_em', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['remetente_id'], ['users.id']),
        sa.ForeignKeyConstraint(['destinatario_id'], ['users.id']),
        sa.ForeignKeyConstraint(['curation_id'], ['curations.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('remetente_id', 'destinatario_id', 'curation_id', name='uq_compartilhamento_unico'),
    )
    op.create_index(op.f('ix_compartilhamentos_imagem_id'), 'compartilhamentos_imagem', ['id'], unique=False)
    op.create_index(op.f('ix_compartilhamentos_imagem_remetente_id'), 'compartilhamentos_imagem', ['remetente_id'], unique=False)
    op.create_index(op.f('ix_compartilhamentos_imagem_destinatario_id'), 'compartilhamentos_imagem', ['destinatario_id'], unique=False)
    op.create_index(op.f('ix_compartilhamentos_imagem_curation_id'), 'compartilhamentos_imagem', ['curation_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_compartilhamentos_imagem_curation_id'), table_name='compartilhamentos_imagem')
    op.drop_index(op.f('ix_compartilhamentos_imagem_destinatario_id'), table_name='compartilhamentos_imagem')
    op.drop_index(op.f('ix_compartilhamentos_imagem_remetente_id'), table_name='compartilhamentos_imagem')
    op.drop_index(op.f('ix_compartilhamentos_imagem_id'), table_name='compartilhamentos_imagem')
    op.drop_table('compartilhamentos_imagem')
