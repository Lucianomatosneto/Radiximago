"""recado do remetente ocultado por quem recebeu o compartilhamento

Revision ID: c2e8a4d6f1b3
Revises: b5d1f3a7c9e2
Create Date: 2026-10-14 19:30:00.000000

- compartilhamentos_imagem.mensagem_oculta: quem recebeu "apagou" o recado
  (ex.: "favor avaliar") da propria visao. O recado nao e apagado do banco -
  so deixa de aparecer para quem recebeu (desfazivel em "mostrar apagadas").
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c2e8a4d6f1b3'
down_revision: Union[str, None] = 'b5d1f3a7c9e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'compartilhamentos_imagem',
        sa.Column('mensagem_oculta', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('compartilhamentos_imagem', 'mensagem_oculta')
