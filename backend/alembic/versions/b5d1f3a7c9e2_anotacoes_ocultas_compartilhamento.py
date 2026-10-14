"""anotacoes do remetente ocultadas por quem recebeu o compartilhamento

Revision ID: b5d1f3a7c9e2
Revises: a8c3e5f1b7d2
Create Date: 2026-10-14 19:00:00.000000

- compartilhamentos_imagem.anotacoes_ocultas: ids das anotacoes do
  REMETENTE que o DESTINATARIO "apagou" da propria visao (ex.: antes de
  imprimir). As anotacoes continuam existindo para quem as escreveu - quem
  recebe so deixa de ve-las. Lista vazia = ve todas.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'b5d1f3a7c9e2'
down_revision: Union[str, None] = 'a8c3e5f1b7d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'compartilhamentos_imagem',
        sa.Column('anotacoes_ocultas', postgresql.ARRAY(sa.Integer()), nullable=False, server_default=sa.text("'{}'")),
    )


def downgrade() -> None:
    op.drop_column('compartilhamentos_imagem', 'anotacoes_ocultas')
