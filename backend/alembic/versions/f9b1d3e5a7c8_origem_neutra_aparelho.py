"""origem da imagem: valor "ufsc" passa a se chamar "aparelho" (18/11/2026)

Decisao do responsavel em 18/11/2026: o rotulo de origem das imagens
recebidas direto de um aparelho (protocolo DICOM) nao deve citar instituicao.
O valor "ufsc" vira "aparelho" em:
- orthanc_references.origem;
- macros_curadoria.conteudo (campo "origem" do JSON, quando existir).

So muda o NOME do valor; nenhuma imagem, ficha ou registro e apagado.
A trilha de auditoria NAO e alterada (registros antigos ficam como foram
gravados - ela e encadeada e imutavel). O codigo continua aceitando "ufsc"
como sinonimo (OrigemImagem._missing_), para links e pedidos antigos.

Revision ID: f9b1d3e5a7c8
Revises: e8a0c2d4f6b3
"""
from typing import Sequence, Union

from alembic import op

revision: str = "f9b1d3e5a7c8"
down_revision: Union[str, None] = "e8a0c2d4f6b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _trocar(de: str, para: str) -> None:
    op.execute(f"UPDATE orthanc_references SET origem = '{para}' WHERE origem = '{de}'")
    op.execute(
        "UPDATE macros_curadoria "
        f"SET conteudo = jsonb_set(conteudo, '{{origem}}', '\"{para}\"'::jsonb) "
        f"WHERE conteudo ->> 'origem' = '{de}'"
    )


def upgrade() -> None:
    _trocar("ufsc", "aparelho")


def downgrade() -> None:
    _trocar("aparelho", "ufsc")
