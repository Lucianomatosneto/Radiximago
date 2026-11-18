"""imagens: marca de corte de exame em volume (tomografia) (18/11/2026)

Nova coluna orthanc_references.em_volume (verdadeiro/falso, padrao falso).
Os cortes de uma mesma serie de tomografia passam a aparecer como UM item
na fila de curadoria, e a ficha vale para o exame inteiro.

Imagens ja cadastradas ficam como "falso": ate 18/11/2026 o acervo so tinha
radiografias de imagem unica, e tomografias recebidas antes nao tinham os
cortes no mesmo exame (UIDs sorteados - dossie doc. 06, DICOM-ACH-01).
Nenhuma imagem, ficha ou registro de auditoria e alterado.

Revision ID: b2d4f6a8c0e1
Revises: f9b1d3e5a7c8
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b2d4f6a8c0e1"
down_revision: Union[str, None] = "f9b1d3e5a7c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "orthanc_references",
        sa.Column("em_volume", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    # a fila procura "o primeiro corte da serie": indice pela serie so dos cortes
    op.create_index(
        "ix_orthanc_references_volume_serie",
        "orthanc_references",
        ["series_instance_uid", "id"],
        postgresql_where=sa.text("em_volume"),
    )


def downgrade() -> None:
    op.drop_index("ix_orthanc_references_volume_serie", table_name="orthanc_references")
    op.drop_column("orthanc_references", "em_volume")
