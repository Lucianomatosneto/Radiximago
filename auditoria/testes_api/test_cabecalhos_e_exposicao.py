"""
AUDITORIA DE CABEÇALHOS DE SEGURANÇA E EXPOSIÇÃO.

"Cabeçalhos" são instruções que o servidor manda ao navegador para ele se proteger
(não deixar o site ser colocado dentro de outro, não adivinhar tipos de arquivo etc.).
"""

from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]


def test_cabecalhos_de_protecao_na_api(cliente):
    r = cliente.get("/termos")
    h = {k.lower(): v for k, v in r.headers.items()}
    assert h.get("x-content-type-options") == "nosniff"
    assert h.get("x-frame-options") == "DENY"
    assert h.get("referrer-policy") == "no-referrer"
    assert "default-src 'none'" in h.get("content-security-policy", "")
    assert h.get("cache-control") == "no-store"


def test_erro_nao_vaza_detalhes_internos(cliente):
    """Uma rota inexistente não pode devolver trecho de código, caminho de arquivo ou rastro de erro."""
    r = cliente.get("/rota-que-nao-existe-auditoria")
    corpo = r.text.lower()
    for sinal in ("traceback", "/home/", "site-packages", "sqlalchemy", "psycopg2"):
        assert sinal not in corpo, f"Resposta de erro expõe '{sinal}'"


def test_https_estrito_configurado_no_proxy_de_producao():
    """A API não envia HSTS sozinha; quem envia é o Caddy (proxy de produção)."""
    caddy = (RAIZ / "caddy" / "Caddyfile").read_text(encoding="utf-8")
    assert "Strict-Transport-Security" in caddy


def test_login_nao_aceita_get(cliente):
    assert cliente.get("/auth/login").status_code in (405, 401, 403, 404)


def test_cors_recusa_origem_desconhecida(cliente):
    """Um site qualquer da internet não pode ser autorizado a falar com a API usando o login do usuário."""
    r = cliente.options(
        "/auth/login",
        headers={"Origin": "https://site-malicioso.example", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in {k.lower() for k in r.headers}


def test_cors_aceita_a_origem_do_frontend(cliente):
    from app.core.cabecalhos import ORIGENS_PERMITIDAS

    origem = ORIGENS_PERMITIDAS[0]
    r = cliente.options("/auth/login", headers={"Origin": origem, "Access-Control-Request-Method": "POST"})
    assert r.headers.get("access-control-allow-origin") == origem
