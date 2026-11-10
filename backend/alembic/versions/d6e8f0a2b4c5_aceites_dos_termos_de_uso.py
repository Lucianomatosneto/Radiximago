"""aceites dos Termos de Uso e da Politica de Privacidade (10/11/2026)

Cada aceite (primeiro acesso e cada nova versao) com versao, perfil, data e
resumo SHA-256 do texto aceito (app/modules/termos_uso.py). Caminho de
volta: apaga a tabela (os aceites continuam na auditoria).

Revision ID: d6e8f0a2b4c5
Revises: c5d7e9f1a3b4
Create Date: 2026-11-10
"""

import sqlalchemy as sa
from alembic import op

revision = "d6e8f0a2b4c5"
down_revision = "c5d7e9f1a3b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "aceites_termos_uso",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("usuario_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("versao", sa.String(20), nullable=False),
        sa.Column("perfil", sa.String(20), nullable=False),
        sa.Column("resumo_textos", sa.String(64), nullable=False),
        sa.Column("aceito_em", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_aceites_termos_uso_usuario_id", "aceites_termos_uso", ["usuario_id"])


def downgrade() -> None:
    op.drop_index("ix_aceites_termos_uso_usuario_id", table_name="aceites_termos_uso")
    op.drop_table("aceites_termos_uso")
