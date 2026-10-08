"""confirmacao de e-mail na solicitacao de acesso

Revision ID: c3e9a7d2f5b8
Revises: b3d6f8a1c9e4
Create Date: 2026-10-08 15:40:00.000000

Cadastro em duas etapas: o pedido de acesso so segue para o administrador
depois que o solicitante confirma o e-mail (link de uso unico + a senha
definida no formulario). Ver AccessRequest em app/modules/access_requests.py.

Pedidos que ja existiam antes desta migracao foram feitos quando a
confirmacao ainda nao existia: eles sao marcados como "confirmados" na
data em que foram criados, para nao sumirem da fila do administrador.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3e9a7d2f5b8'
down_revision: Union[str, None] = 'b3d6f8a1c9e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('access_requests', sa.Column('email_confirmado_em', sa.DateTime(timezone=True), nullable=True))
    op.add_column('access_requests', sa.Column('token_confirmacao_hash', sa.String(length=64), nullable=True))
    op.add_column('access_requests', sa.Column('token_confirmacao_expira_em', sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        'access_requests',
        sa.Column('tentativas_confirmacao', sa.SmallInteger(), nullable=False, server_default='0'),
    )
    op.create_index(
        op.f('ix_access_requests_token_confirmacao_hash'), 'access_requests',
        ['token_confirmacao_hash'], unique=True,
    )
    # pedidos anteriores a esta regra: considerados confirmados
    op.execute("UPDATE access_requests SET email_confirmado_em = criado_em WHERE email_confirmado_em IS NULL")


def downgrade() -> None:
    op.drop_index(op.f('ix_access_requests_token_confirmacao_hash'), table_name='access_requests')
    op.drop_column('access_requests', 'tentativas_confirmacao')
    op.drop_column('access_requests', 'token_confirmacao_expira_em')
    op.drop_column('access_requests', 'token_confirmacao_hash')
    op.drop_column('access_requests', 'email_confirmado_em')
