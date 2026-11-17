"""grupos: imagens curadas enviadas em "modo aula" e comentarios (Etapa 3, 17/11/2026)

Duas tabelas novas; nenhuma tabela existente e alterada e nada e apagado.
- grupo_envios_curados: a imagem aprovada que o dono enviou ao grupo, com a
  mensagem, a chave "pode comentar", as marcacoes DA AULA e os destaques. A
  ficha oficial nao e tocada (D3);
- grupo_comentarios: conversa PARTICULAR entre cada participante e o dono (D4).

Revision ID: d7f9b1c3e5a2
Revises: c4e6a8b0d2f1
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d7f9b1c3e5a2"
down_revision: Union[str, None] = "c4e6a8b0d2f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "grupo_envios_curados",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("grupo_id", sa.Integer(), sa.ForeignKey("grupos_envio.id", ondelete="CASCADE"), nullable=False),
        sa.Column("curation_id", sa.Integer(), sa.ForeignKey("curations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("remetente_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("mensagem", sa.Text(), nullable=True),
        sa.Column("permite_comentar", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("marcacoes", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("destaques", postgresql.ARRAY(sa.String(length=60)), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.UniqueConstraint("grupo_id", "curation_id", name="uq_grupo_envio_curado_imagem"),
    )
    op.create_index("ix_grupo_envios_curados_id", "grupo_envios_curados", ["id"])
    op.create_index("ix_grupo_envios_curados_grupo_id", "grupo_envios_curados", ["grupo_id"])
    op.create_index("ix_grupo_envios_curados_curation_id", "grupo_envios_curados", ["curation_id"])
    op.create_index("ix_grupo_envios_curados_remetente_id", "grupo_envios_curados", ["remetente_id"])
    op.create_table(
        "grupo_comentarios",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("envio_id", sa.Integer(), sa.ForeignKey("grupo_envios_curados.id", ondelete="CASCADE"), nullable=False),
        sa.Column("participante_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("autor_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("texto", sa.Text(), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
    )
    op.create_index("ix_grupo_comentarios_id", "grupo_comentarios", ["id"])
    op.create_index("ix_grupo_comentarios_conversa", "grupo_comentarios", ["envio_id", "participante_id"])


def downgrade() -> None:
    op.drop_index("ix_grupo_comentarios_conversa", table_name="grupo_comentarios")
    op.drop_index("ix_grupo_comentarios_id", table_name="grupo_comentarios")
    op.drop_table("grupo_comentarios")
    op.drop_index("ix_grupo_envios_curados_remetente_id", table_name="grupo_envios_curados")
    op.drop_index("ix_grupo_envios_curados_curation_id", table_name="grupo_envios_curados")
    op.drop_index("ix_grupo_envios_curados_grupo_id", table_name="grupo_envios_curados")
    op.drop_index("ix_grupo_envios_curados_id", table_name="grupo_envios_curados")
    op.drop_table("grupo_envios_curados")
