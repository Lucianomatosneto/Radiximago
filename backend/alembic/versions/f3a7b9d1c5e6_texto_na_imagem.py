"""registra a verificacao de texto gravado nos pixels de cada imagem

Duas colunas novas em orthanc_references (nada e apagado):
- texto_na_imagem: "sem_texto", "tarjado" ou "nao_verificado";
- texto_regioes: quantas tarjas foram aplicadas.
Imagens ja existentes ficam com NULL (= recebidas antes da verificacao) e
devem ser conferidas pelo curador. Ver app/modules/texto_na_imagem.py.

Revision ID: f3a7b9d1c5e6
Revises: e2f6a8c0b4d5
"""
import sqlalchemy as sa
from alembic import op

revision = "f3a7b9d1c5e6"
down_revision = "e2f6a8c0b4d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orthanc_references", sa.Column("texto_na_imagem", sa.String(length=20), nullable=True))
    op.add_column("orthanc_references", sa.Column("texto_regioes", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("orthanc_references", "texto_regioes")
    op.drop_column("orthanc_references", "texto_na_imagem")
