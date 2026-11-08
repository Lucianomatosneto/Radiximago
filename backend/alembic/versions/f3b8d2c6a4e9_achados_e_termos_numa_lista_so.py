"""achados das marcacoes e termos do vocabulario numa lista so (08/11/2026)

- termos_vocabulario ganha na_busca (o termo aparece nas opcoes da Pesquisa
  avancada) e nas_curadorias (o termo aparece como opcao nas proximas
  curadorias). Termos que ja existem continuam com os dois ligados.
- achados ganha termo_id: a marcacao cujo achado e um termo do vocabulario
  guarda qual termo e (tipo "outro" + o nome do termo na descricao).
Nada e apagado nem alterado.

Revision ID: f3b8d2c6a4e9
Revises: e9c3a5b7d1f2
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f3b8d2c6a4e9"
down_revision: Union[str, None] = "e9c3a5b7d1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("termos_vocabulario", sa.Column("na_busca", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("termos_vocabulario", sa.Column("nas_curadorias", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("achados", sa.Column("termo_id", sa.Integer(),
                                       sa.ForeignKey("termos_vocabulario.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_achados_termo_id", "achados", ["termo_id"])


def downgrade() -> None:
    op.drop_index("ix_achados_termo_id", "achados")
    op.drop_column("achados", "termo_id")
    op.drop_column("termos_vocabulario", "nas_curadorias")
    op.drop_column("termos_vocabulario", "na_busca")
