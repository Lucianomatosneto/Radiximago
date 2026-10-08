"""cria tabelas achados e erros_tecnicos (Fase 1 - classificacao odontologica)

Revision ID: a2c9e4f7b1d6
Revises: b2d5e8a1c4f7
Create Date: 2026-08-11 21:00:00.000000

Migration puramente aditiva: cria duas tabelas novas (achados,
erros_tecnicos), sem tocar em nenhuma coluna/tabela existente. Nao apaga
colunas, nao apaga tabelas, nao altera dados existentes. Reversivel via
downgrade (drop das duas tabelas novas, sem impacto no restante do banco).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'a2c9e4f7b1d6'
down_revision: Union[str, None] = 'b2d5e8a1c4f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'achados',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('curation_id', sa.Integer(), nullable=False),
        sa.Column('tipo', sa.String(length=60), nullable=False),
        sa.Column('regiao_anatomica', sa.String(length=30), nullable=True),
        sa.Column('dentes', postgresql.ARRAY(sa.Integer()), nullable=True),
        sa.Column(
            'dente_nao_identificado',
            sa.Boolean(),
            nullable=False,
            server_default=sa.text('false'),
        ),
        sa.Column('descricao', sa.Text(), nullable=True),
        sa.Column(
            'marcacoes',
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default='[]',
        ),
        sa.Column('criado_em', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('atualizado_em', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['curation_id'], ['curations.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_achados_id'), 'achados', ['id'], unique=False)
    op.create_index(op.f('ix_achados_curation_id'), 'achados', ['curation_id'], unique=False)

    op.create_table(
        'erros_tecnicos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('curation_id', sa.Integer(), nullable=False),
        sa.Column('tipo', sa.String(length=60), nullable=False),
        sa.Column('descricao', sa.Text(), nullable=True),
        sa.Column('criado_em', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['curation_id'], ['curations.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_erros_tecnicos_id'), 'erros_tecnicos', ['id'], unique=False)
    op.create_index(op.f('ix_erros_tecnicos_curation_id'), 'erros_tecnicos', ['curation_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_erros_tecnicos_curation_id'), table_name='erros_tecnicos')
    op.drop_index(op.f('ix_erros_tecnicos_id'), table_name='erros_tecnicos')
    op.drop_table('erros_tecnicos')

    op.drop_index(op.f('ix_achados_curation_id'), table_name='achados')
    op.drop_index(op.f('ix_achados_id'), table_name='achados')
    op.drop_table('achados')
