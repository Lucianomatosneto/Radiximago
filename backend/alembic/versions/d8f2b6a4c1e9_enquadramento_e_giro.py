"""registra o recorte da moldura branca e o giro de cada imagem

Duas colunas novas em orthanc_references (nada e apagado):
- enquadramento: resultado do recorte automatico da moldura branca na
  entrada ("recortada", "sem_borda", "incerto", "nao_verificado"); NULL =
  imagem recebida antes de 20/10/2026;
- giro_graus: quanto o curador ja girou a imagem (0, 90, 180, 270).
Ver app/modules/geometria_imagem.py.

Revision ID: d8f2b6a4c1e9
Revises: c7e1a9d3f5b2
"""
import sqlalchemy as sa
from alembic import op

revision = "d8f2b6a4c1e9"
down_revision = "c7e1a9d3f5b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orthanc_references", sa.Column("enquadramento", sa.String(length=20), nullable=True))
    op.add_column(
        "orthanc_references",
        sa.Column("giro_graus", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )


def downgrade() -> None:
    op.drop_column("orthanc_references", "giro_graus")
    op.drop_column("orthanc_references", "enquadramento")
