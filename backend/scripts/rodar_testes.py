"""
Roda a suite de testes num banco SEPARADO (B3 da auditoria do
administrador, 01/11/2026).

Por que: os testes criam e apagam usuarios, fichas e registros. Rodados
direto no banco do sistema (radix_imago), deixavam "Usuario de Teste (suite
automatizada)" e registros de auditoria de teste misturados com os dados
de verdade. Agora o conftest.py RECUSA rodar num banco cujo nome nao tenha
"test"/"teste", e este script prepara e usa um banco proprio:
<nome do banco>_teste (ex.: radix_imago_teste), no mesmo Postgres.

Uso (PowerShell, na pasta do projeto, com o Docker ligado):
    docker compose exec radix-api python scripts/rodar_testes.py
    docker compose exec radix-api python scripts/rodar_testes.py tests/test_auth.py -q

O que faz, nesta ordem:
 1. le o DATABASE_URL do sistema e troca SO o nome do banco;
 2. cria o banco de teste se ele ainda nao existir (nunca apaga nada);
 3. aplica as migracoes nele (alembic upgrade head);
 4. roda o pytest apontando para ele (argumentos extras vao para o pytest).
O banco do sistema nao e tocado em nenhum passo.
"""

import os
import subprocess
import sys
from pathlib import Path

# permite "python scripts/rodar_testes.py" a partir da pasta backend (/app)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app.core.config import settings


def url_do_banco_de_teste(url_sistema: str) -> str:
    url = make_url(url_sistema)
    nome = url.database or "radix"
    if "test" not in nome:
        nome = f"{nome}_teste"
    return url.set(database=nome).render_as_string(hide_password=False)


def criar_se_nao_existir(url_teste: str) -> None:
    url = make_url(url_teste)
    nome = url.database
    # conecta no banco de manutencao "postgres" so para o CREATE DATABASE
    motor = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with motor.connect() as conexao:
        existe = conexao.execute(text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": nome}).scalar()
        if not existe:
            conexao.execute(text(f'CREATE DATABASE "{nome}"'))
            print(f"Banco de teste criado: {nome}")
    motor.dispose()


def main() -> int:
    url_teste = url_do_banco_de_teste(settings.DATABASE_URL)
    print(f"Banco de teste: {make_url(url_teste).database} (o banco do sistema nao e usado)")
    criar_se_nao_existir(url_teste)
    ambiente = {**os.environ, "DATABASE_URL": url_teste}
    subprocess.run(["alembic", "upgrade", "head"], check=True, env=ambiente)
    return subprocess.run([sys.executable, "-m", "pytest", *(sys.argv[1:] or ["-q"])], env=ambiente).returncode


if __name__ == "__main__":
    sys.exit(main())
