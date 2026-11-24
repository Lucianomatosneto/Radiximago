"""consentimento da pesquisa e resultados do modo desafio (24/11/2026)

Pedido do Luciano: guardar os resultados do modo desafio para medir o
aprendizado, mas SO com o TCLE aprovado e o consentimento de cada estudante
(o registro fica desligado por configuracao ate la). Duas tabelas novas:
- consentimentos_pesquisa: aceite (e revogacao) do TCLE por usuario/versao;
- resultados_desafio: contagens de cada rodada (sem coordenadas).
Apagar o usuario ou a ficha apaga as linhas (CASCADE).

Revision ID: f9b1d3e5a7c9
Revises: e7a9c1d3f5b8
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f9b1d3e5a7c9"
down_revision: Union[str, None] = "e7a9c1d3f5b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "consentimentos_pesquisa",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("usuario_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("versao_tcle", sa.String(20), nullable=False),
        sa.Column("aceito_em", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("revogado_em", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_consentimentos_pesquisa_id", "consentimentos_pesquisa", ["id"])
    op.create_index("ix_consentimentos_pesquisa_usuario_id", "consentimentos_pesquisa", ["usuario_id"])
    op.create_table(
        "resultados_desafio",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("usuario_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("curation_id", sa.Integer(), sa.ForeignKey("curations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("total_lesoes", sa.Integer(), nullable=False),
        sa.Column("encontradas", sa.Integer(), nullable=False),
        sa.Column("palpites", sa.Integer(), nullable=False),
        sa.Column("versao_tcle", sa.String(20), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_resultados_desafio_id", "resultados_desafio", ["id"])
    op.create_index("ix_resultados_desafio_usuario_id", "resultados_desafio", ["usuario_id"])
    op.create_index("ix_resultados_desafio_curation_id", "resultados_desafio", ["curation_id"])


def downgrade() -> None:
    op.drop_table("resultados_desafio")
    op.drop_table("consentimentos_pesquisa")
