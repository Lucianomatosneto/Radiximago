"""janela de envio da foto (Fase 1 - foto do negatoscopio pelo celular)

- tabela janelas_envio_foto: cada janela de 5 minutos aberta para enviar
  UMA foto (uso unico; app/modules/janela_foto.py);
- orthanc_references.formato_entrada: "dicom" ou "foto" (a foto convertida
  em DICOM de captura secundaria; a ficha dela nasce com modalidade OT).

Caminho de volta (downgrade): apaga a tabela e a coluna. Nao mexe em
nenhum outro dado; fichas ja gravadas com modalidade "OT" continuam
legiveis (a modalidade e texto simples, sem tipo enumerado no banco).

Revision ID: b3e5f7a9c1d2
Revises: a1d4f6b8c2e5
Create Date: 2026-11-10
"""

import sqlalchemy as sa
from alembic import op

revision = "b3e5f7a9c1d2"
down_revision = "a1d4f6b8c2e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "janelas_envio_foto",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("usuario_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("identificador", sa.String(64), nullable=False, unique=True),
        sa.Column("aberta_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expira_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("usada_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelada_em", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_janelas_envio_foto_usuario_id", "janelas_envio_foto", ["usuario_id"])
    op.add_column(
        "orthanc_references",
        sa.Column("formato_entrada", sa.String(10), nullable=False, server_default=sa.text("'dicom'")),
    )


def downgrade() -> None:
    op.drop_column("orthanc_references", "formato_entrada")
    op.drop_index("ix_janelas_envio_foto_usuario_id", table_name="janelas_envio_foto")
    op.drop_table("janelas_envio_foto")
