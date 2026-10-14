"""vocabulario controlado (termos, sinonimos) e busca por palavras

Revision ID: e1b4c7a9d2f6
Revises: d7a3e9c1f5b2
Create Date: 2026-10-13 19:00:00.000000

- extensoes do PostgreSQL usadas pela busca por palavras:
  unaccent (ignorar acentos) e pg_trgm (tolerar pequenos erros de digitacao);
- tabelas do vocabulario evolutivo: termos_vocabulario, sinonimos_termo e
  curation_termos (ver app/modules/vocabulario.py).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e1b4c7a9d2f6'
down_revision: Union[str, None] = 'd7a3e9c1f5b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.create_table(
        'termos_vocabulario',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('termo', sa.String(length=150), nullable=False),
        sa.Column('termo_normalizado', sa.String(length=150), nullable=False),
        sa.Column('categoria', sa.String(length=20), nullable=False, server_default='achado'),
        sa.Column('codigo_decs', sa.String(length=30), nullable=True),
        sa.Column('ativo', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('criado_por_id', sa.Integer(), nullable=True),
        sa.Column('criado_em', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['criado_por_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_termos_vocabulario_id'), 'termos_vocabulario', ['id'], unique=False)
    op.create_index(op.f('ix_termos_vocabulario_termo_normalizado'), 'termos_vocabulario', ['termo_normalizado'], unique=True)

    op.create_table(
        'sinonimos_termo',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('termo_id', sa.Integer(), nullable=False),
        sa.Column('sinonimo', sa.String(length=150), nullable=False),
        sa.Column('sinonimo_normalizado', sa.String(length=150), nullable=False),
        sa.ForeignKeyConstraint(['termo_id'], ['termos_vocabulario.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_sinonimos_termo_id'), 'sinonimos_termo', ['id'], unique=False)
    op.create_index(op.f('ix_sinonimos_termo_termo_id'), 'sinonimos_termo', ['termo_id'], unique=False)
    op.create_index(op.f('ix_sinonimos_termo_sinonimo_normalizado'), 'sinonimos_termo', ['sinonimo_normalizado'], unique=True)

    op.create_table(
        'curation_termos',
        sa.Column('curation_id', sa.Integer(), nullable=False),
        sa.Column('termo_id', sa.Integer(), nullable=False),
        sa.Column('vinculado_por_id', sa.Integer(), nullable=True),
        sa.Column('vinculado_em', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['curation_id'], ['curations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['termo_id'], ['termos_vocabulario.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['vinculado_por_id'], ['users.id']),
        sa.PrimaryKeyConstraint('curation_id', 'termo_id'),
        sa.UniqueConstraint('curation_id', 'termo_id', name='uq_curation_termo'),
    )
    op.create_index(op.f('ix_curation_termos_termo_id'), 'curation_termos', ['termo_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_curation_termos_termo_id'), table_name='curation_termos')
    op.drop_table('curation_termos')
    op.drop_index(op.f('ix_sinonimos_termo_sinonimo_normalizado'), table_name='sinonimos_termo')
    op.drop_index(op.f('ix_sinonimos_termo_termo_id'), table_name='sinonimos_termo')
    op.drop_index(op.f('ix_sinonimos_termo_id'), table_name='sinonimos_termo')
    op.drop_table('sinonimos_termo')
    op.drop_index(op.f('ix_termos_vocabulario_termo_normalizado'), table_name='termos_vocabulario')
    op.drop_index(op.f('ix_termos_vocabulario_id'), table_name='termos_vocabulario')
    op.drop_table('termos_vocabulario')
    # as extensoes ficam (podem ser usadas por outras partes do banco)
