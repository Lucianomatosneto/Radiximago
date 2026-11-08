"""tabelas legadas de um modulo retirado (mantidas no banco; nao usadas)

Revision ID: d2b8f4a6c1e3
Revises: c1a7e3f9b5d2
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "d2b8f4a6c1e3"
down_revision = "c1a7e3f9b5d2"
branch_labels = None
depends_on = None


def _fk(col, nullable=True, index=False):
    return sa.Column(col, sa.Integer(), sa.ForeignKey("users.id"), nullable=nullable, index=index)


def upgrade() -> None:
    op.create_table(
        "casos_clinicos",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        _fk("aluno_id", nullable=False, index=True),
        _fk("professor_id", index=True),
        sa.Column("paciente_nome", sa.String(200), nullable=False),
        sa.Column("paciente_nascimento", sa.Date(), nullable=False),
        sa.Column("paciente_genero", sa.String(20), nullable=False),
        sa.Column("paciente_contato", sa.String(100), nullable=False),
        sa.Column("paciente_prontuario", sa.String(50), nullable=True),
        sa.Column("paciente_observacoes", sa.Text(), nullable=True),
        sa.Column("modalidade", sa.String(20), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=False),
        sa.Column("etapa", sa.String(30), nullable=False, server_default="enviado", index=True),
        _fk("encaminhado_curador_por_id"),
        sa.Column("encaminhado_curador_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("nota_encaminhamento", sa.Text(), nullable=True),
        sa.Column("tratamentos", postgresql.ARRAY(sa.String(30)), nullable=False, server_default="{}"),
        _fk("classificado_por_id"),
        sa.Column("classificado_em", sa.DateTime(timezone=True), nullable=True),
        _fk("aluno_tratamento_id", index=True),
        sa.Column("tratamento_escolhido", sa.String(30), nullable=True),
        _fk("encaminhado_tratamento_por_id"),
        sa.Column("encaminhado_tratamento_em", sa.DateTime(timezone=True), nullable=True),
        _fk("concluido_por_id"),
        sa.Column("concluido_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("corrigido_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("visto_aluno_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint(
            "etapa IN ('enviado','aguardando_classificacao','na_fila','em_tratamento','concluido')",
            name="ck_casos_clinicos_etapa",
        ),
    )
    op.create_table(
        "casos_imagens",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("caso_id", sa.Integer(), sa.ForeignKey("casos_clinicos.id"), nullable=False, index=True),
        sa.Column("ordem", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tipo", sa.String(15), nullable=False, server_default="radiografia"),
        sa.Column("arquivo", sa.String(80), nullable=False),
        sa.Column("miniatura", sa.String(80), nullable=False),
        sa.Column("largura", sa.Integer(), nullable=False),
        sa.Column("altura", sa.Integer(), nullable=False),
        sa.Column("bytes", sa.Integer(), nullable=False),
        sa.Column("dentes", postgresql.ARRAY(sa.Integer()), nullable=False, server_default="{}"),
        sa.Column("observacao", sa.Text(), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "casos_revisoes",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("caso_id", sa.Integer(), sa.ForeignKey("casos_clinicos.id"), nullable=False, index=True),
        sa.Column("versao", sa.Integer(), nullable=False),
        _fk("autor_id", nullable=False),
        sa.Column("autor_perfil", sa.String(20), nullable=False),
        sa.Column("comentario", sa.Text(), nullable=True),
        sa.Column("anotacoes", sa.JSON(), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("caso_id", "versao", name="uq_casos_revisoes_versao"),
    )
    op.create_table(
        "casos_compartilhamentos",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("caso_id", sa.Integer(), sa.ForeignKey("casos_clinicos.id"), nullable=False, index=True),
        _fk("de_id", nullable=False),
        _fk("para_id", nullable=False, index=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("visto_em", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("caso_id", "para_id", name="uq_casos_compartilhamentos_para"),
    )
    op.create_table(
        "casos_historico",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("caso_id", sa.Integer(), sa.ForeignKey("casos_clinicos.id"), nullable=False, index=True),
        _fk("usuario_id", nullable=False),
        sa.Column("acao", sa.String(40), nullable=False),
        sa.Column("detalhes", sa.Text(), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    for tabela in ("casos_historico", "casos_compartilhamentos", "casos_revisoes", "casos_imagens", "casos_clinicos"):
        op.drop_table(tabela)
