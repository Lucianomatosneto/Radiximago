"""troca marcacao_x/marcacao_y por marcacoes (lista de formas)

Revision ID: c9f4a2d81e63
Revises: b8e5f1a3c7d2
Create Date: 2026-08-01 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = 'c9f4a2d81e63'
down_revision: Union[str, None] = 'b8e5f1a3c7d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'curations',
        sa.Column('marcacoes', JSONB(astext_type=sa.Text()), nullable=False, server_default='[]'),
    )

    # Migra as marcacoes de ponto unico ja salvas (marcacao_x/marcacao_y)
    # pra um oval pequeno centrado no mesmo ponto, no novo formato de
    # lista - assim nenhuma marcacao real feita por curador se perde.
    op.execute(
        """
        UPDATE curations
        SET marcacoes = jsonb_build_array(
            jsonb_build_object(
                'id', substr(md5(random()::text || id::text), 1, 8),
                'tipo', 'oval',
                'x', GREATEST(marcacao_x - 0.03, 0),
                'y', GREATEST(marcacao_y - 0.03, 0),
                'largura', 0.06,
                'altura', 0.06
            )
        )
        WHERE marcacao_x IS NOT NULL AND marcacao_y IS NOT NULL
        """
    )

    op.drop_column('curations', 'marcacao_x')
    op.drop_column('curations', 'marcacao_y')


def downgrade() -> None:
    op.add_column('curations', sa.Column('marcacao_x', sa.Float(), nullable=True))
    op.add_column('curations', sa.Column('marcacao_y', sa.Float(), nullable=True))

    # Recupera so a primeira marcacao de cada ficha (o formato antigo so
    # suportava uma) como um ponto no centro da forma salva.
    op.execute(
        """
        UPDATE curations
        SET
            marcacao_x = (marcacoes->0->>'x')::float + COALESCE((marcacoes->0->>'largura')::float, 0) / 2,
            marcacao_y = (marcacoes->0->>'y')::float + COALESCE((marcacoes->0->>'altura')::float, 0) / 2
        WHERE jsonb_array_length(marcacoes) > 0 AND marcacoes->0->>'x' IS NOT NULL
        """
    )

    op.drop_column('curations', 'marcacoes')
