"""regioes anatomicas que a imagem mostra (curations.regioes_imagem)

Revision ID: e3c9a5f1b7d4
Revises: d2b8f4a6c1e3
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "e3c9a5f1b7d4"
down_revision = "d2b8f4a6c1e3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # coluna nova e vazia (None): fichas antigas continuam sendo achadas pelo
    # padrao do tipo de exame (ver busca_termos.condicao_regiao)
    op.add_column("curations", sa.Column("regioes_imagem", postgresql.ARRAY(sa.String(30)), nullable=True))


def downgrade() -> None:
    op.drop_column("curations", "regioes_imagem")
