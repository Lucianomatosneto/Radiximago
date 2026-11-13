"""codigos de recuperacao do segundo fator mais fortes (12/11/2026, ASVS 6.5.2)

Os codigos antigos tinham ~40 bits e eram guardados como SHA-256 sem sal:
quem copiasse o banco conseguiria descobri-los testando todas as
combinacoes. Os novos tem ~119 bits e sao guardados com Argon2id
(app/modules/mfa.py).

O que esta migracao faz:
- cria users.codigos_recuperacao_trocar (sim/nao);
- APAGA os resumos antigos de quem tinha codigos e marca a conta: no
  proximo login com o aplicativo, o sistema gera os 8 codigos novos,
  mostra uma vez e registra "codigos_recuperacao_regenerados" na auditoria.
  O aplicativo do celular (TOTP) continua valendo normalmente.

Caminho de volta: remove a coluna. Os codigos antigos NAO voltam (foram
apagados de proposito); quem precisar gera novos em "Meus acessos".

Revision ID: f1a3c5e7b9d2
Revises: d6e8f0a2b4c5
Create Date: 2026-11-12
"""

import sqlalchemy as sa
from alembic import op

revision = "f1a3c5e7b9d2"
down_revision = "d6e8f0a2b4c5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("codigos_recuperacao_trocar", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    # marca quem tem o aplicativo ligado e tinha codigos (a coluna e JSON:
    # "sem codigos" pode estar gravado como NULL do banco ou como null do JSON)
    op.execute(
        "UPDATE users SET codigos_recuperacao_trocar = true "
        "WHERE totp_ativo = true AND codigos_recuperacao IS NOT NULL "
        "AND json_typeof(codigos_recuperacao) = 'array'"
    )
    # e apaga TODOS os resumos antigos
    op.execute("UPDATE users SET codigos_recuperacao = NULL WHERE codigos_recuperacao IS NOT NULL")


def downgrade() -> None:
    op.drop_column("users", "codigos_recuperacao_trocar")
