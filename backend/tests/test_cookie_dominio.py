"""Cookie de login com dominio (producao: app./api./viewer. radiximago.com.br)."""
from fastapi import Response

from app.core import sessao


def _cabecalho(resp: Response) -> str:
    return resp.headers.get("set-cookie", "")


def test_sem_dominio_em_desenvolvimento(monkeypatch):
    monkeypatch.setattr(sessao, "COOKIE_DOMAIN", None)
    r = Response()
    sessao.definir_cookie_token(r, "abc")
    assert "domain=" not in _cabecalho(r).lower()
    assert "httponly" in _cabecalho(r).lower()


def test_com_dominio_vale_para_subdominios(monkeypatch):
    monkeypatch.setattr(sessao, "COOKIE_DOMAIN", ".radiximago.com.br")
    r = Response()
    sessao.definir_cookie_token(r, "abc")
    c = _cabecalho(r).lower()
    assert "domain=.radiximago.com.br" in c
    assert "httponly" in c and "samesite=lax" in c
