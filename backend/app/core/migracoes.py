"""
ATUALIZACAO DO BANCO PENDENTE? (01/11/2026 - auditoria do administrador, A2)

Compara a versao do banco (tabela alembic_version) com a versao mais nova
que o codigo conhece (pasta alembic/versions). Se o codigo e mais novo,
faltou rodar "alembic upgrade head" - foi o que causou os erros 500 de
01/11 (coluna regioes_imagem usada antes de existir). Mostrado no Painel
administrativo e em /health/database.
"""

from pathlib import Path

from sqlalchemy import text
from sqlalchemy.orm import Session

PASTA_BACKEND = Path(__file__).resolve().parents[2]


def versoes_do_codigo() -> frozenset[str]:
    """Le a pasta alembic/versions (rapido; sem guardar em memoria - ASVS 14.2.2)."""
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    config = Config(str(PASTA_BACKEND / "alembic.ini"))
    config.set_main_option("script_location", str(PASTA_BACKEND / "alembic"))
    return frozenset(ScriptDirectory.from_config(config).get_heads())


def estado_das_migracoes(db: Session) -> dict:
    try:
        no_banco = {linha[0] for linha in db.execute(text("SELECT version_num FROM alembic_version"))}
    except Exception:  # noqa: BLE001 - sem a tabela: banco nunca atualizado
        db.rollback()
        no_banco = set()
    try:
        no_codigo = set(versoes_do_codigo())
    except Exception:  # noqa: BLE001 - pasta alembic ausente: nao da para comparar
        return {"pendente": False, "verificavel": False}
    return {
        "pendente": no_banco != no_codigo,
        "verificavel": True,
        "versao_banco": sorted(no_banco),
        "versao_codigo": sorted(no_codigo),
    }
