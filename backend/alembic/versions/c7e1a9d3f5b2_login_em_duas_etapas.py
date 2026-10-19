"""Login em duas etapas (TOTP) - OWASP ASVS 6.3.3

Revision ID: c7e1a9d3f5b2
Revises: b5d9f3a7c2e8
Create Date: 2026-10-19
"""

import sqlalchemy as sa
from alembic import op

revision = "c7e1a9d3f5b2"
down_revision = "b5d9f3a7c2e8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("totp_segredo_cifrado", sa.String(300), nullable=True))
    op.add_column("users", sa.Column("totp_ativo", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("users", sa.Column("totp_ultimo_passo", sa.BigInteger(), nullable=True))
    op.add_column("users", sa.Column("codigos_recuperacao", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "codigos_recuperacao")
    op.drop_column("users", "totp_ultimo_passo")
    op.drop_column("users", "totp_ativo")
    op.drop_column("users", "totp_segredo_cifrado")
