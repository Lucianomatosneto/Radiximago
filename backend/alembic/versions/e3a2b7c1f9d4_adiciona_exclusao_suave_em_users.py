"""adiciona exclusao suave em users

Revision ID: e3a2b7c1f9d4
Revises: d3f8a1c9b6e4
Create Date: 2026-07-29 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e3a2b7c1f9d4'
down_revision: Union[str, None] = 'd3f8a1c9b6e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('excluido', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('users', sa.Column('excluido_em', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('excluido_por_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_users_excluido_por_id', 'users', 'users', ['excluido_por_id'], ['id']
    )

    # Troca a unicidade de email de "global" pra "so entre nao excluidos" -
    # e o que permite reaproveitar o e-mail de um usuario excluido num
    # novo cadastro, sem abrir mao de impedir e-mail duplicado entre
    # contas ativas.
    op.drop_index('ix_users_email', table_name='users')
    op.create_index(
        'ix_users_email_ativo', 'users', ['email'], unique=True,
        postgresql_where=sa.text('excluido = false'),
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_users_email', table_name='users')
    op.drop_index('ix_users_email_ativo', table_name='users')
    op.create_index('ix_users_email', 'users', ['email'], unique=True)

    op.drop_constraint('fk_users_excluido_por_id', 'users', type_='foreignkey')
    op.drop_column('users', 'excluido_por_id')
    op.drop_column('users', 'excluido_em')
    op.drop_column('users', 'excluido')
