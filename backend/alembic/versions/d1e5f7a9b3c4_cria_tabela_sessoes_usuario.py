"""cria tabela sessoes_usuario (sessoes revogaveis - OWASP ASVS 7.2.4/7.4.1)

Revision ID: d1e5f7a9b3c4
Revises: c2e8a4d6f1b3
Create Date: 2026-10-15
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'd1e5f7a9b3c4'
down_revision: Union[str, None] = 'c2e8a4d6f1b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'sessoes_usuario',
        sa.Column('id', sa.String(length=64), primary_key=True),
        sa.Column('usuario_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('criada_em', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('encerrada_em', sa.DateTime(timezone=True), nullable=True),
        sa.Column('motivo_encerramento', sa.String(length=30), nullable=True),
    )
    op.create_index('ix_sessoes_usuario_usuario_id', 'sessoes_usuario', ['usuario_id'])


def downgrade() -> None:
    op.drop_index('ix_sessoes_usuario_usuario_id', table_name='sessoes_usuario')
    op.drop_table('sessoes_usuario')
