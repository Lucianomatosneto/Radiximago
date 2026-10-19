"""sessoes guardam de onde foram abertas e o ultimo uso

OWASP ASVS 7.5.2 (o usuario ve e encerra os proprios acessos) e 7.4.5
(o administrador encerra sessoes). Colunas novas em sessoes_usuario
(nada e apagado):
- ip: endereco de rede de onde a sessao foi aberta;
- aparelho: RESUMO do navegador/sistema (ex.: "Chrome · Windows") - o
  texto completo do navegador NAO e guardado (minimizacao, LGPD art. 6 III);
- ultimo_uso: atualizado no maximo a cada 5 minutos de uso.

Revision ID: b5d9f3a7c2e8
Revises: a4c8e2f6b1d9
"""
import sqlalchemy as sa
from alembic import op

revision = "b5d9f3a7c2e8"
down_revision = "a4c8e2f6b1d9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sessoes_usuario", sa.Column("ip", sa.String(length=45), nullable=True))
    op.add_column("sessoes_usuario", sa.Column("aparelho", sa.String(length=80), nullable=True))
    op.add_column("sessoes_usuario", sa.Column("ultimo_uso", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("sessoes_usuario", "ultimo_uso")
    op.drop_column("sessoes_usuario", "aparelho")
    op.drop_column("sessoes_usuario", "ip")
