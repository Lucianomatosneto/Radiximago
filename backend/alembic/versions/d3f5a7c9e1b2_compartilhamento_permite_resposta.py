"""compartilhamento: quem compartilha decide se a pessoa pode responder (22/11/2026)

Revision ID: d3f5a7c9e1b2
Revises: b2d4f6a8c0e1
Create Date: 2026-11-22

Coluna permite_resposta em compartilhamentos_imagem. Os compartilhamentos
que ja existem continuam permitindo (padrao true); os novos guardam o que
quem compartilhou marcou.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'd3f5a7c9e1b2'
down_revision: Union[str, None] = 'b2d4f6a8c0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('compartilhamentos_imagem',
                  sa.Column('permite_resposta', sa.Boolean(), server_default=sa.text('true'), nullable=False))


def downgrade() -> None:
    op.drop_column('compartilhamentos_imagem', 'permite_resposta')
