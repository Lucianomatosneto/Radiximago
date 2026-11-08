"""grupos de envio e imagens enviadas a pessoas (etapa C, 08/11/2026)

Tres tabelas novas; nenhuma tabela existente e alterada e nada e apagado.

Revision ID: b3f7d1a9c5e2
Revises: a8e2c6d4f1b3
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b3f7d1a9c5e2"
down_revision: Union[str, None] = "a8e2c6d4f1b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "grupos_envio",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("dono_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("nome", sa.String(80), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("dono_id", "nome", name="uq_grupos_envio_dono_nome"),
    )
    op.create_index("ix_grupos_envio_id", "grupos_envio", ["id"])
    op.create_index("ix_grupos_envio_dono_id", "grupos_envio", ["dono_id"])
    op.create_table(
        "grupos_envio_membros",
        sa.Column("grupo_id", sa.Integer(), sa.ForeignKey("grupos_envio.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("usuario_id", sa.Integer(), sa.ForeignKey("users.id"), primary_key=True),
    )
    op.create_index("ix_grupos_envio_membros_usuario_id", "grupos_envio_membros", ["usuario_id"])
    op.create_table(
        "envios_destinatarios",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("orthanc_reference_id", sa.Integer(),
                  sa.ForeignKey("orthanc_references.id", ondelete="CASCADE"), nullable=False),
        sa.Column("remetente_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("destinatario_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("visto_em", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("orthanc_reference_id", "destinatario_id", name="uq_envio_imagem_pessoa"),
    )
    for coluna in ("id", "orthanc_reference_id", "remetente_id", "destinatario_id"):
        op.create_index(f"ix_envios_destinatarios_{coluna}", "envios_destinatarios", [coluna])


def downgrade() -> None:
    op.drop_table("envios_destinatarios")
    op.drop_table("grupos_envio_membros")
    op.drop_table("grupos_envio")
