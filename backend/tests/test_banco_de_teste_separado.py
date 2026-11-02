"""
B3 da auditoria do administrador (01/11/2026): os testes automaticos nunca
rodam no banco do sistema. Confere a regra do conftest e o script que
prepara o banco separado.
"""

import subprocess
import sys
from pathlib import Path

from scripts.rodar_testes import url_do_banco_de_teste
from tests.conftest import _banco_e_de_teste

BACKEND = Path(__file__).resolve().parents[1]


def test_nome_do_banco_de_teste():
    assert url_do_banco_de_teste("postgresql://u:s@radix-postgres:5432/radix_imago").endswith("/radix_imago_teste")
    # ja e de teste: nao acrescenta outro sufixo
    assert url_do_banco_de_teste("postgresql://u:s@localhost:5432/radixtest").endswith("/radixtest")
    # senha e endereco preservados (so o nome muda)
    assert url_do_banco_de_teste("postgresql://u:s@h:5432/x").startswith("postgresql://u:s@h:5432/")


def test_reconhece_banco_do_sistema():
    assert not _banco_e_de_teste("postgresql://u:s@radix-postgres:5432/radix_imago")
    assert _banco_e_de_teste("postgresql://u:s@radix-postgres:5432/radix_imago_teste")
    assert _banco_e_de_teste("postgresql://u:s@localhost:5432/radixtest")


def test_pytest_no_banco_do_sistema_e_recusado():
    ambiente = {"DATABASE_URL": "postgresql://u:s@127.0.0.1:1/radix_imago", "PATH": "/usr/bin:/bin"}
    import os
    ambiente = {**os.environ, **ambiente}
    ambiente.pop("RADIX_PERMITIR_TESTES_NO_BANCO", None)
    r = subprocess.run(
        [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", "tests/test_banco_de_teste_separado.py::test_nome_do_banco_de_teste"],
        cwd=BACKEND, env=ambiente, capture_output=True, text=True, timeout=120,
    )
    assert r.returncode != 0
    assert "RECUSADO" in (r.stdout + r.stderr)
