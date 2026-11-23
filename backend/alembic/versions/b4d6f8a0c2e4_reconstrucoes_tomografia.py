"""reconstrucoes_tomografia: panoramica reconstruida e cortes transversais (23/11/2026)

Pedido do Luciano: reconstrucao panoramica a partir da tomografia, para
visualizar e ensinar. Tabela nova (nada muda nas tabelas existentes).

Revision ID: b4d6f8a0c2e4
Revises: a9d1f3b5c7e9
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b4d6f8a0c2e4"
down_revision: Union[str, None] = "a9d1f3b5c7e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "reconstrucoes_tomografia",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("orthanc_reference_id", sa.Integer(), sa.ForeignKey("orthanc_references.id", ondelete="CASCADE"), nullable=False),
        sa.Column("criado_por_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("parametros", postgresql.JSONB(), nullable=False),
        sa.Column("serie_panoramica_uid", sa.String(length=64), nullable=False),
        sa.Column("serie_cortes_uid", sa.String(length=64), nullable=False),
        sa.Column("total_cortes", sa.Integer(), nullable=False),
        sa.Column("tamanho_pixel_mm", sa.Float(), nullable=False),
        sa.Column("instancias_orthanc", postgresql.JSONB(), nullable=False),
    )
    op.create_index("ix_reconstrucoes_tomografia_orthanc_reference_id", "reconstrucoes_tomografia", ["orthanc_reference_id"])


def downgrade() -> None:
    op.drop_index("ix_reconstrucoes_tomografia_orthanc_reference_id", table_name="reconstrucoes_tomografia")
    op.drop_table("reconstrucoes_tomografia")
