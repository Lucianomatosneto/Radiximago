"""vocabulario: definicao e fonte de cada termo (22/11/2026)

Pedido do video (B14): no visualizador, o "?" ao lado de cada marcacao
mostra a definicao do achado. Duas colunas novas em termos_vocabulario:
- definicao (texto, opcional);
- definicao_fonte (texto curto, opcional; obrigatoria quando ha definicao -
  regra no servidor). Ex.: "DeCS/BIREME, edicao 2025" ou "Texto do curador".
Nenhum termo existente muda: os dois campos comecam vazios.

Revision ID: e5b7d9f1a3c5
Revises: b2d4f6a8c0e1
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e5b7d9f1a3c5"
down_revision: Union[str, None] = "b2d4f6a8c0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("termos_vocabulario", sa.Column("definicao", sa.Text(), nullable=True))
    op.add_column("termos_vocabulario", sa.Column("definicao_fonte", sa.String(length=300), nullable=True))


def downgrade() -> None:
    op.drop_column("termos_vocabulario", "definicao_fonte")
    op.drop_column("termos_vocabulario", "definicao")
