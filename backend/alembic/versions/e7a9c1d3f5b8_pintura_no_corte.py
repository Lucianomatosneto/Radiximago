"""pintura (segmentacao) nos cortes da tomografia (24/11/2026)

Pedido do Luciano (recurso 8): pintar a lesao num corte de um plano da
tomografia, com o mesmo pincel das radiografias. Duas colunas novas,
opcionais, em segmentacoes_curadoria: "plano" (axial/sagital/coronal) e
"corte" (numero do corte). Sem elas, pintura de radiografia, como sempre.

Revision ID: e7a9c1d3f5b8
Revises: d6f8b0c2e4a6
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e7a9c1d3f5b8"
down_revision: Union[str, None] = "d6f8b0c2e4a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("segmentacoes_curadoria", sa.Column("plano", sa.String(10), nullable=True))
    op.add_column("segmentacoes_curadoria", sa.Column("corte", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("segmentacoes_curadoria", "corte")
    op.drop_column("segmentacoes_curadoria", "plano")
