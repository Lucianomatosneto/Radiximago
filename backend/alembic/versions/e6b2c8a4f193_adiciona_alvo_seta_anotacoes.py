"""adiciona ponto alvo (seta) nas anotacoes

Revision ID: e6b2c8a4f193
Revises: d1a5c8f3b7e2
Create Date: 2026-08-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e6b2c8a4f193'
down_revision: Union[str, None] = 'd1a5c8f3b7e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Ponto opcional pra onde a seta da anotacao aponta. Quando nulo, a nota
    # nao tem seta (foi um clique simples, nao um arrastar).
    op.add_column('anotacoes_imagem', sa.Column('alvo_x', sa.Float(), nullable=True))
    op.add_column('anotacoes_imagem', sa.Column('alvo_y', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('anotacoes_imagem', 'alvo_y')
    op.drop_column('anotacoes_imagem', 'alvo_x')
