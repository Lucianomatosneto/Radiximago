"""Endurecimento para a internet (02/11/2026): o que NAO pode ficar exposto em producao.

Leem os arquivos de implantacao (Caddyfile, docker-compose.prod.yml) e o codigo da
API. Se a pasta nao estiver montada no ambiente de teste, o teste e pulado.
"""

from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]


def _ler(caminho: str) -> str:
    arquivo = RAIZ / caminho
    if not arquivo.exists():
        pytest.skip(f"{caminho} nao esta montado neste ambiente de teste")
    return arquivo.read_text(encoding="utf-8")


def test_caddy_nao_publica_saude_detalhada_da_api():
    texto = _ler("caddy/Caddyfile")
    bloco = texto[texto.index("api.radiximago.com.br {"):]
    assert "/health/database" in bloco and "/health/orthanc" in bloco
    assert "respond @saude_interna 404" in bloco
    # o bloqueio vem ANTES de repassar para a API
    assert bloco.index("respond @saude_interna 404") < bloco.index("reverse_proxy radix-api:8000")
    # /health simples continua liberado (nao esta na lista bloqueada)
    assert "path /health/database /health/orthanc" in bloco


def test_producao_fecha_portas_do_orthanc_e_da_api():
    texto = _ler("docker-compose.prod.yml")
    for servico in ("radix-orthanc:", "radix-orthanc-cors:", "radix-ohif:", "radix-api:", "radix-frontend:"):
        i = texto.index(f"  {servico}")
        fim = texto.find("\n  radix-", i + 5)
        trecho = texto[i:fim if fim != -1 else len(texto)]
        assert "ports: !reset []" in trecho, f"{servico} deixa porta aberta em producao"


def test_documentacao_da_api_fica_desligada_em_producao():
    codigo = (RAIZ / "backend" / "app" / "main.py")
    texto = codigo.read_text(encoding="utf-8") if codigo.exists() else _ler("backend/app/main.py")
    assert '_DOCUMENTACAO_LIGADA = settings.ENVIRONMENT != "production"' in texto
    for rota in ("docs_url", "redoc_url", "openapi_url"):
        assert f'{rota}="/' in texto and "if _DOCUMENTACAO_LIGADA else None" in texto
