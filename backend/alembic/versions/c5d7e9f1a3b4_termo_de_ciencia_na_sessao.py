"""termo de ciencia apos o login, registrado na sessao (10/11/2026)

sessoes_usuario.termo_aceito_em / termo_versao: cada login precisa do
aceite (app/modules/termo_ciencia.py). Caminho de volta: apaga as duas
colunas (o aceite continua na auditoria).

Revision ID: c5d7e9f1a3b4
Revises: b3e5f7a9c1d2
Create Date: 2026-11-10
"""

import sqlalchemy as sa
from alembic import op

revision = "c5d7e9f1a3b4"
down_revision = "b3e5f7a9c1d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sessoes_usuario", sa.Column("termo_aceito_em", sa.DateTime(timezone=True), nullable=True))
    op.add_column("sessoes_usuario", sa.Column("termo_versao", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("sessoes_usuario", "termo_versao")
    op.drop_column("sessoes_usuario", "termo_aceito_em")
