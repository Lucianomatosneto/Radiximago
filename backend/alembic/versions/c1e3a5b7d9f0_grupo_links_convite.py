"""link de convite para entrar no grupo (pedido do video, 22/11/2026)

Revision ID: c1e3a5b7d9f0
Revises: b2d4f6a8c0e1
Create Date: 2026-11-22

Tabela grupo_links_convite: so o resumo SHA-256 do codigo, validade,
cancelamento e quantas pessoas entraram. Nao mexe em dados existentes.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'c1e3a5b7d9f0'
down_revision: Union[str, None] = 'b2d4f6a8c0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'grupo_links_convite',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('grupo_id', sa.Integer(), sa.ForeignKey('grupos_envio.id', ondelete='CASCADE'), nullable=False),
        sa.Column('codigo_hash', sa.String(length=64), nullable=False),
        sa.Column('criado_por_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('criado_em', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('expira_em', sa.DateTime(timezone=True), nullable=False),
        sa.Column('cancelado_em', sa.DateTime(timezone=True), nullable=True),
        sa.Column('usos', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.UniqueConstraint('codigo_hash', name='uq_grupo_links_convite_codigo_hash'),
    )
    op.create_index('ix_grupo_links_convite_id', 'grupo_links_convite', ['id'])
    op.create_index('ix_grupo_links_convite_grupo_id', 'grupo_links_convite', ['grupo_id'])


def downgrade() -> None:
    op.drop_index('ix_grupo_links_convite_grupo_id', table_name='grupo_links_convite')
    op.drop_index('ix_grupo_links_convite_id', table_name='grupo_links_convite')
    op.drop_table('grupo_links_convite')
