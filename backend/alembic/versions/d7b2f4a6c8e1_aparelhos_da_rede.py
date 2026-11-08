"""aparelhos de raio X da rede (etapa D, 08/11/2026)

Tabela nova aparelhos_rede e uma coluna nova em orthanc_references
(aparelho_id: de qual aparelho a imagem chegou). Nada e apagado nem alterado.

Revision ID: d7b2f4a6c8e1
Revises: c5a9e3b7d2f4
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d7b2f4a6c8e1"
down_revision: Union[str, None] = "c5a9e3b7d2f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "aparelhos_rede",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nome", sa.String(80), nullable=False),
        sa.Column("unidade", sa.String(80), nullable=True),
        sa.Column("aet", sa.String(16), nullable=False),
        sa.Column("ip", sa.String(45), nullable=False),
        sa.Column("porta", sa.Integer(), nullable=False, server_default="104"),
        sa.Column("liberado", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("criado_por_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("ultimo_recebimento_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("total_recebidas", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("aet", name="uq_aparelhos_rede_aet"),
        sa.CheckConstraint("porta BETWEEN 1 AND 65535", name="ck_aparelhos_rede_porta"),
    )
    op.create_index("ix_aparelhos_rede_id", "aparelhos_rede", ["id"])
    op.add_column("orthanc_references",
                  sa.Column("aparelho_id", sa.Integer(), sa.ForeignKey("aparelhos_rede.id"), nullable=True))
    op.create_index("ix_orthanc_references_aparelho_id", "orthanc_references", ["aparelho_id"])


def downgrade() -> None:
    op.drop_index("ix_orthanc_references_aparelho_id", "orthanc_references")
    op.drop_column("orthanc_references", "aparelho_id")
    op.drop_index("ix_aparelhos_rede_id", "aparelhos_rede")
    op.drop_table("aparelhos_rede")
