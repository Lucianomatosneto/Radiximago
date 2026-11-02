"""
E-mail: nova tentativa em falha passageira (01/11/2026 - auditoria do
administrador, M4). Em 27/10 quatro e-mails de redefinicao de senha nao
sairam por "SMTPServerDisconnected". Agora:
- desconexao / tempo esgotado / resposta 4xx -> tenta de novo mais 2 vezes;
- senha recusada (535) ou endereco recusado (5xx) -> falha na hora;
- Painel administrativo mostra as falhas dos ultimos 7 dias.
"""

import smtplib
from contextlib import contextmanager

import pytest

from app.core import email as modulo_email
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


class _ServidorFalso:
    def __init__(self, erros):
        self.erros = erros
        self.enviados = 0

    @contextmanager
    def abrir(self, timeout=15):  # noqa: ARG002
        erro = self.erros.pop(0) if self.erros else None
        if erro:
            raise erro
        yield self

    def login(self, *a):
        pass

    def sendmail(self, *a):
        self.enviados += 1


@pytest.fixture()
def smtp(monkeypatch):
    monkeypatch.setattr(modulo_email.settings, "SMTP_HOST", "smtp.teste.example")
    monkeypatch.setattr(modulo_email.settings, "SMTP_USER", "")
    monkeypatch.setattr(modulo_email.time, "sleep", lambda s: None)

    def criar(erros):
        falso = _ServidorFalso(list(erros))
        monkeypatch.setattr(modulo_email, "abrir_conexao_smtp", falso.abrir)
        return falso
    return criar


def test_desconexao_passageira_tenta_de_novo_e_envia(smtp):
    falso = smtp([smtplib.SMTPServerDisconnected("caiu"), TimeoutError("lento")])
    modulo_email.enviar_email("a@teste.example", "Assunto", "<p>oi</p>")
    assert falso.enviados == 1


def test_desiste_depois_de_3_tentativas(smtp):
    smtp([smtplib.SMTPServerDisconnected("caiu")] * 3)
    with pytest.raises(smtplib.SMTPServerDisconnected):
        modulo_email.enviar_email("a@teste.example", "Assunto", "<p>oi</p>")


def test_senha_recusada_nao_repete(smtp):
    falso = smtp([smtplib.SMTPAuthenticationError(535, b"senha recusada"), None])
    with pytest.raises(smtplib.SMTPAuthenticationError):
        modulo_email.enviar_email("a@teste.example", "Assunto", "<p>oi</p>")
    assert falso.enviados == 0 and len(falso.erros) == 1  # nao tentou de novo


def test_painel_mostra_falhas_de_email(client, criar_usuario):
    cab = cabecalho_auth(obter_token(client, criar_usuario(perfil=UserRole.administrador).email))
    dados = client.get("/admin/stats", headers=cab).json()
    assert isinstance(dados["falhas_email_7d"], int) and "ultima_falha_email" in dados
