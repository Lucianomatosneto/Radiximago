"""reset_token passa a guardar so o resumo (SHA-256) do codigo

O codigo do link "esqueci minha senha" deixa de ficar no banco em texto
puro (OWASP ASVS 6.4.1). Nao muda a estrutura da tabela (a coluna ja
comporta 64 caracteres). Links pendentes gravados no formato antigo sao
anulados: com o novo formato eles nao funcionariam mesmo, e o usuario so
precisa pedir um novo link.

Revision ID: e2f6a8c0b4d5
Revises: d1e5f7a9b3c4
"""
from alembic import op

revision = "e2f6a8c0b4d5"
down_revision = "d1e5f7a9b3c4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE users SET reset_token = NULL, reset_token_expira_em = NULL WHERE reset_token IS NOT NULL")


def downgrade() -> None:
    # nada a desfazer: links anulados nao podem ser recuperados (e nem devem)
    pass
