"""ficha: denticao, odontograma de situacao e estruturas fora dos dentes (23/11/2026)

Pedido do Luciano (junto com o layout da panoramica). Tres colunas novas
em curations, todas opcionais (fichas antigas ficam vazias):
- denticao: decidua / mista / permanente;
- situacao_dentes: odontograma de situacao em JSON, {"16": ["restaurado"]};
- estruturas_extradentais: lista (seio maxilar, ATM, calcificacoes...).
Os dentes deciduos (51-85) passam a valer na coluna dentes que ja existe
(validacao no servidor, sem mudar o banco).

Revision ID: a9d1f3b5c7e9
Revises: f7c9e1b3d5a7
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a9d1f3b5c7e9"
down_revision: Union[str, None] = "f7c9e1b3d5a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("curations", sa.Column("denticao", sa.String(length=15), nullable=True))
    op.add_column("curations", sa.Column("situacao_dentes", postgresql.JSONB(), nullable=True))
    op.add_column("curations", sa.Column("estruturas_extradentais", postgresql.ARRAY(sa.String(length=40)), nullable=True))
    op.create_index("ix_curations_denticao", "curations", ["denticao"])


def downgrade() -> None:
    op.drop_index("ix_curations_denticao", table_name="curations")
    op.drop_column("curations", "estruturas_extradentais")
    op.drop_column("curations", "situacao_dentes")
    op.drop_column("curations", "denticao")
