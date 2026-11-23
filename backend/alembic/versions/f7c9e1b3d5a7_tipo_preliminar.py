"""imagens: modalidade preliminar para filtrar a fila da curadoria (23/11/2026)

Pedido do Luciano: o curador escolhe a modalidade (tipo de exame) que vai
curar. Duas colunas novas em orthanc_references:
- tipo_preliminar: tipo de radiografia informado por quem enviou, ou o
  reconhecido na entrada (tomografia, panoramica ou "intraoral");
- tipo_preliminar_origem: "envio" ou "automatico".
As imagens que ja estavam no Radix ficam vazias ("nao informado") ate
rodar o roteiro preencher_tipo_preliminar.py.

Revision ID: f7c9e1b3d5a7
Revises: e5b7d9f1a3c5
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f7c9e1b3d5a7"
down_revision: Union[str, None] = "e5b7d9f1a3c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("orthanc_references", sa.Column("tipo_preliminar", sa.String(length=20), nullable=True))
    op.add_column("orthanc_references", sa.Column("tipo_preliminar_origem", sa.String(length=10), nullable=True))
    op.create_index("ix_orthanc_references_tipo_preliminar", "orthanc_references", ["tipo_preliminar"])


def downgrade() -> None:
    op.drop_index("ix_orthanc_references_tipo_preliminar", table_name="orthanc_references")
    op.drop_column("orthanc_references", "tipo_preliminar_origem")
    op.drop_column("orthanc_references", "tipo_preliminar")
