"""macros da curadoria e frases aprendidas pela voz

Revision ID: a8c3e5f1b7d2
Revises: e1b4c7a9d2f6
Create Date: 2026-10-13 21:00:00.000000

- macros_curadoria: frases prontas ("macro <nome>") que preenchem a ficha;
- frases_aprendidas_voz: frases faladas que o curador ensinou a valer como
  uma alteracao da lista (ver app/modules/macros.py).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'a8c3e5f1b7d2'
down_revision: Union[str, None] = 'e1b4c7a9d2f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'macros_curadoria',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('nome', sa.String(length=80), nullable=False),
        sa.Column('nome_normalizado', sa.String(length=80), nullable=False),
        sa.Column('conteudo', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column('ativo', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('criado_por_id', sa.Integer(), nullable=True),
        sa.Column('criado_em', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('atualizado_em', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['criado_por_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_macros_curadoria_id'), 'macros_curadoria', ['id'], unique=False)
    op.create_index(op.f('ix_macros_curadoria_nome_normalizado'), 'macros_curadoria', ['nome_normalizado'], unique=True)

    op.create_table(
        'frases_aprendidas_voz',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('frase', sa.String(length=150), nullable=False),
        sa.Column('frase_normalizada', sa.String(length=150), nullable=False),
        sa.Column('alteracao', sa.String(length=60), nullable=False),
        sa.Column('criado_por_id', sa.Integer(), nullable=True),
        sa.Column('criado_em', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['criado_por_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_frases_aprendidas_voz_id'), 'frases_aprendidas_voz', ['id'], unique=False)
    op.create_index(op.f('ix_frases_aprendidas_voz_frase_normalizada'), 'frases_aprendidas_voz', ['frase_normalizada'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_frases_aprendidas_voz_frase_normalizada'), table_name='frases_aprendidas_voz')
    op.drop_index(op.f('ix_frases_aprendidas_voz_id'), table_name='frases_aprendidas_voz')
    op.drop_table('frases_aprendidas_voz')
    op.drop_index(op.f('ix_macros_curadoria_nome_normalizado'), table_name='macros_curadoria')
    op.drop_index(op.f('ix_macros_curadoria_id'), table_name='macros_curadoria')
    op.drop_table('macros_curadoria')
