"""
Termo de ciencia apos o login (10/11/2026, decisoes do Luciano):
pedido a CADA login; sem o aceite o usuario NAO entra (o servidor recusa
tudo, menos o proprio termo, /auth/me e /auth/logout).
"""

from fastapi.testclient import TestClient

from app.main import app
from app.modules.audit_logs import AuditLog
from app.modules.termo_ciencia import CODIGO_PENDENTE, TERMO_CIENCIA_VERSAO
from tests.conftest import SENHA_TESTE, completar_segundo_fator


def _login_sem_aceite(email: str) -> TestClient:
    navegador = TestClient(app)
    r = navegador.post("/auth/login", data={"username": email, "password": SENHA_TESTE})
    r = completar_segundo_fator(navegador, email, r)
    assert r.status_code == 200, r.text
    return navegador


def test_sem_aceite_nada_responde_alem_do_termo(criar_usuario):
    app.state.limiter.reset()
    u = criar_usuario()
    nav = _login_sem_aceite(u.email)
    me = nav.get("/auth/me")
    assert me.status_code == 200 and me.json()["termo_ciencia_pendente"] is True
    assert nav.get("/auth/termo-ciencia").json() == {"pendente": True, "versao": TERMO_CIENCIA_VERSAO}
    for rota in ("/search", "/envios/meus", "/shares/recebidas", "/auth/sessoes"):
        r = nav.get(rota)
        assert r.status_code == 403 and r.json()["detail"] == CODIGO_PENDENTE, rota


def test_aceite_libera_so_esta_sessao_e_cada_login_pede_de_novo(criar_usuario, db):
    app.state.limiter.reset()
    u = criar_usuario()
    nav = _login_sem_aceite(u.email)
    assert nav.post("/auth/termo-ciencia/aceitar", json={"versao": TERMO_CIENCIA_VERSAO, "ciente": False}).status_code == 422
    assert nav.post("/auth/termo-ciencia/aceitar", json={"versao": "antiga", "ciente": True}).status_code == 409
    assert nav.post("/auth/termo-ciencia/aceitar", json={"versao": TERMO_CIENCIA_VERSAO, "ciente": True}).status_code == 200
    assert nav.get("/search").status_code == 200
    assert nav.get("/auth/me").json()["termo_ciencia_pendente"] is False
    # novo login (outro aparelho ou depois de sair): pede o aceite de novo
    outro = _login_sem_aceite(u.email)
    assert outro.get("/search").status_code == 403
    aceites = db.query(AuditLog).filter(AuditLog.usuario_id == u.id, AuditLog.acao == "termo_ciencia_aceito").all()
    assert len(aceites) == 1 and TERMO_CIENCIA_VERSAO in aceites[0].detalhes


def test_recusar_encerra_a_sessao(criar_usuario, db):
    app.state.limiter.reset()
    u = criar_usuario()
    nav = _login_sem_aceite(u.email)
    assert nav.post("/auth/termo-ciencia/recusar").status_code == 200
    assert nav.get("/auth/me").status_code == 401                      # nao entrou no sistema
    assert db.query(AuditLog).filter(AuditLog.usuario_id == u.id, AuditLog.acao == "termo_ciencia_recusado").count() == 1


def test_tela_mostra_o_termo_em_todo_o_sistema():
    from pathlib import Path

    front = Path(__file__).resolve().parents[2] / "frontend/src"
    guarda = (front / "components/TermoCiencia.tsx").read_text(encoding="utf-8")
    assert "/auth/termo-ciencia/aceitar" in guarda and "/auth/termo-ciencia/recusar" in guarda
    assert "<TermoCiencia" in (front / "app/layout.tsx").read_text(encoding="utf-8")
