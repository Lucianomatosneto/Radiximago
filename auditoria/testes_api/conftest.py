"""
Configuração dos testes de auditoria da API (HTTPX/TestClient).

Estes testes ficam FORA de backend/tests de propósito: são da Central de Auditoria,
independentes do desenvolvimento. Não alteram o sistema.

Segurança: recusam rodar se o banco não tiver "test" no nome (mesma regra do
backend/tests/conftest.py), para nunca tocar no banco real.
"""

import logging
import os
import re
import sys
from pathlib import Path

import pytest
from sqlalchemy.engine import make_url

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "backend"))

# Variáveis mínimas para o app iniciar. Valores inventados: nunca use credenciais reais.
os.environ.setdefault("JWT_SECRET_KEY", "x" * 64)
os.environ.setdefault("ORTHANC_PASSWORD", "auditoria_descartavel")

from app.core.config import settings  # noqa: E402

if not re.search(r"test", make_url(settings.DATABASE_URL).database or "", re.IGNORECASE):
    sys.exit("RECUSADO: a auditoria só roda em banco de TESTE (nome precisa conter 'test').")

logging.disable(logging.CRITICAL)  # os logs JSON do app poluem a saída dos testes


@pytest.fixture(scope="session")
def cliente():
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture(scope="session")
def mapa_openapi():
    from app.main import app

    return app.openapi()
