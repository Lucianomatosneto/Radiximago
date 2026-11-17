"""grupos: quando o participante viu as imagens do grupo pela ultima vez (17/11/2026)

Uma coluna nova em grupos_envio_membros (imagens_vistas_em), usada no aviso de
"imagem nova" do menu. Vazia para todos (= ainda nao viu). Nada e apagado.

Revision ID: e8a0c2d4f6b3
Revises: d7f9b1c3e5a2
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e8a0c2d4f6b3"
down_revision: Union[str, None] = "d7f9b1c3e5a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("grupos_envio_membros", sa.Column("imagens_vistas_em", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("grupos_envio_membros", "imagens_vistas_em")
