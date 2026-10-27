"""
Falha do servidor de e-mail (26/10/2026): antes virava "erro 500" e a tela
so dizia "tente mais tarde". Agora:
- cadastro: resposta 503 com aviso claro + registro na auditoria;
- esqueci a senha: mesma resposta generica de sempre (nao revela e-mails),
  com o registro na auditoria;
- Integracoes: teste do SMTP diz em que etapa falhou, sem enviar nada.
"""

import smtplib
import uuid

from app.modules import auth, integracoes_router
from app.modules.access_requests import AccessRequest
from app.modules.audit_logs import AuditLog
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


def _falhar(*_a, **_k):
    raise smtplib.SMTPAuthenticationError(535, b"senha recusada")


def test_cadastro_avisa_quando_o_email_falha(client, db, monkeypatch):
    monkeypatch.setattr(auth, "enviar_email_confirmacao_cadastro", _falhar)
    email = f"falha-email-{uuid.uuid4().hex[:8]}@exemplo-radix.com.br"
    try:
        r = client.post("/auth/request-access", json={
            "nome": "Pessoa Teste", "email": email, "senha": "Frase-Bem-Forte-2026", "instituicao": "UFSC",
            "perfil_solicitado": "estudante", "motivo": "teste",
        })
        assert r.status_code == 503, r.text
        assert "e-mail de confirmação" in r.json()["detail"]
        pedido = db.query(AccessRequest).filter(AccessRequest.email == email).first()
        assert pedido is not None
        assert db.query(AuditLog).filter(AuditLog.acao == "falha_envio_email", AuditLog.entidade_id == pedido.id).count() == 1
    finally:
        db.rollback()
        from sqlalchemy import text
        db.execute(text("SET LOCAL session_replication_role = replica"))
        db.query(AuditLog).filter(AuditLog.entidade == "access_request").filter(
            AuditLog.entidade_id.in_(db.query(AccessRequest.id).filter(AccessRequest.email == email).scalar_subquery())
        ).delete(synchronize_session=False)
        db.query(AccessRequest).filter(AccessRequest.email == email).delete()
        db.commit()


def test_esqueci_a_senha_continua_generico_quando_o_email_falha(client, db, criar_usuario, monkeypatch):
    monkeypatch.setattr(auth, "enviar_email_redefinicao_senha", _falhar)
    usuario = criar_usuario()
    r = client.post("/auth/forgot-password", json={"email": usuario.email})
    assert r.status_code == 200
    assert "Se esse e-mail" in r.json()["mensagem"]
    assert db.query(AuditLog).filter(AuditLog.acao == "falha_envio_email", AuditLog.usuario_id == usuario.id).count() == 1


def test_teste_do_smtp_mostra_a_etapa(client, criar_usuario, monkeypatch):
    class SmtpFalso:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def ehlo(self):
            pass

        def starttls(self):
            pass

        def login(self, *a):
            raise smtplib.SMTPAuthenticationError(535, b"x")

        def noop(self):
            pass

    monkeypatch.setattr(integracoes_router.settings, "SMTP_HOST", "smtp.exemplo")
    monkeypatch.setattr(integracoes_router.settings, "SMTP_USER", "conta")
    monkeypatch.setattr(integracoes_router.smtplib, "SMTP", SmtpFalso)
    h = cabecalho_auth(obter_token(client, criar_usuario(perfil=UserRole.administrador).email))
    r = client.get("/integracoes/email", headers=h)
    assert r.status_code == 200
    assert r.json()["status"] == "erro" and r.json()["etapa"] == "login" and r.json()["erro"] == "senha_recusada"
    estudante = cabecalho_auth(obter_token(client, criar_usuario(perfil=UserRole.estudante).email))
    assert client.get("/integracoes/email", headers=estudante).status_code == 403
