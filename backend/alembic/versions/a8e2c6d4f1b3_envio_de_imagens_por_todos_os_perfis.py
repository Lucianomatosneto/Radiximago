"""envio de imagens por todos os perfis (estudante: so para mim / analise)

Separacao Radix Imago / Radix Clinica, etapa B (08/11/2026). Acrescenta em
orthanc_references QUEM enviou a imagem e PARA ONDE ela vai:
- destino "fila"    -> fila de curadoria (como sempre foi; padrao das
                       imagens ja existentes);
- destino "pessoal" -> so o dono ve (estudante: "so para mim");
- destino "analise" -> so o dono e a pessoa escolhida (professor ou curador)
                       veem; ela decide colocar na fila ou devolver.
Nada e apagado; as imagens antigas ficam com destino "fila".

Revision ID: a8e2c6d4f1b3
Revises: f5d1b3a7c9e2
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a8e2c6d4f1b3"
down_revision: Union[str, None] = "f5d1b3a7c9e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("orthanc_references", sa.Column("enviado_por_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True))
    op.add_column("orthanc_references", sa.Column("destino", sa.String(10), nullable=False, server_default=sa.text("'fila'")))
    op.add_column("orthanc_references", sa.Column("analise_destinatario_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True))
    op.add_column("orthanc_references", sa.Column("analise_nota", sa.String(500), nullable=True))
    op.add_column("orthanc_references", sa.Column("analise_em", sa.DateTime(timezone=True), nullable=True))
    op.add_column("orthanc_references", sa.Column("devolucao_nota", sa.String(500), nullable=True))
    op.create_index("ix_orthanc_references_enviado_por_id", "orthanc_references", ["enviado_por_id"])
    op.create_index("ix_orthanc_references_analise_destinatario_id", "orthanc_references", ["analise_destinatario_id"])
    op.create_index("ix_orthanc_references_destino", "orthanc_references", ["destino"])
    op.create_check_constraint("ck_orthanc_references_destino", "orthanc_references",
                               "destino IN ('fila', 'pessoal', 'analise')")
    # quem enviou as imagens antigas: o registro de auditoria "upload_imagem"
    op.execute(
        """
        UPDATE orthanc_references r SET enviado_por_id = a.usuario_id
        FROM (SELECT DISTINCT ON (entidade_id) entidade_id, usuario_id FROM audit_logs
              WHERE acao = 'upload_imagem' AND resultado = 'sucesso' AND entidade_id IS NOT NULL
              ORDER BY entidade_id, id) a
        WHERE a.entidade_id = r.id AND r.enviado_por_id IS NULL
        """
    )


def downgrade() -> None:
    op.drop_constraint("ck_orthanc_references_destino", "orthanc_references", type_="check")
    op.drop_index("ix_orthanc_references_destino", "orthanc_references")
    op.drop_index("ix_orthanc_references_analise_destinatario_id", "orthanc_references")
    op.drop_index("ix_orthanc_references_enviado_por_id", "orthanc_references")
    for coluna in ("devolucao_nota", "analise_em", "analise_nota", "analise_destinatario_id", "destino", "enviado_por_id"):
        op.drop_column("orthanc_references", coluna)
