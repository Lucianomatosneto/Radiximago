"""indices para busca por dentes/achado (Fase 4)

Revision ID: b3d6f8a1c9e4
Revises: a2c9e4f7b1d6
Create Date: 2026-08-12 03:00:00.000000

Migration SOMENTE de indices - nenhuma coluna, tabela ou tipo de dado e
criado/alterado/removido. Aditiva e reversivel (downgrade remove so os
indices criados aqui). Justificativa (relatorio da Fase 3.1, reafirmada na
Fase 4): a partir desta fase, `curations.dentes` e `achados.dentes` passam
a ser usados em filtros de Busca Avancada com `.any()`/`.overlap()`/
`.contains()` (operadores GIN-friendly do tipo ARRAY do Postgres), e
`achados.tipo` passa a ser usado em EXISTS correlacionado - ambos sem
indice ate agora.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'b3d6f8a1c9e4'
down_revision: Union[str, None] = 'a2c9e4f7b1d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE INDEX ix_curations_dentes_gin ON curations USING GIN (dentes)")
    op.execute("CREATE INDEX ix_achados_dentes_gin ON achados USING GIN (dentes)")
    op.create_index(op.f('ix_achados_tipo'), 'achados', ['tipo'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_achados_tipo'), table_name='achados')
    op.execute("DROP INDEX IF EXISTS ix_achados_dentes_gin")
    op.execute("DROP INDEX IF EXISTS ix_curations_dentes_gin")
