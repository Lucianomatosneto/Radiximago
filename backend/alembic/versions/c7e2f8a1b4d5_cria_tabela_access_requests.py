"""cria tabela access_requests

Revision ID: c7e2f8a1b4d5
Revises: b1c4a9d7e2f3
Create Date: 2026-07-28 17:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7e2f8a1b4d5'
down_revision: Union[str, None] = 'b1c4a9d7e2f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # O proprio create_table abaixo ja cria o tipo enum "statussolicitacaoacesso"
    # (associado a coluna "status") automaticamente - nao precisa criar
    # antes na mao, senao da erro de tipo duplicado.
    status_solicitacao = sa.Enum(
        'pendente', 'aprovada', 'rejeitada', name='statussolicitacaoacesso'
    )

    op.create_table(
        'access_requests',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('nome', sa.String(length=150), nullable=False),
        sa.Column('email', sa.String(length=150), nullable=False),
        sa.Column('senha_hash', sa.String(length=255), nullable=False),
        sa.Column('instituicao', sa.String(length=200), nullable=True),
        # VARCHAR simples (nao o tipo enum nativo "userrole" que a tabela
        # users usa) - evita ter que compartilhar/recriar esse tipo aqui.
        # Validacao do valor acontece no Pydantic, antes de chegar no banco.
        sa.Column('perfil_solicitado', sa.String(length=20), nullable=False),
        sa.Column('motivo', sa.Text(), nullable=True),
        sa.Column('status', status_solicitacao, nullable=False),
        sa.Column('motivo_rejeicao', sa.Text(), nullable=True),
        sa.Column('revisado_por_id', sa.Integer(), nullable=True),
        sa.Column('revisado_em', sa.DateTime(timezone=True), nullable=True),
        sa.Column('criado_em', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['revisado_por_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_access_requests_id'), 'access_requests', ['id'], unique=False)
    op.create_index(op.f('ix_access_requests_email'), 'access_requests', ['email'], unique=False)
    op.create_index(op.f('ix_access_requests_status'), 'access_requests', ['status'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_access_requests_status'), table_name='access_requests')
    op.drop_index(op.f('ix_access_requests_email'), table_name='access_requests')
    op.drop_index(op.f('ix_access_requests_id'), table_name='access_requests')
    op.drop_table('access_requests')
    sa.Enum(name='statussolicitacaoacesso').drop(op.get_bind(), checkfirst=True)
