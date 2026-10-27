"""
Conexao com o servidor de e-mail (27/10/2026):
- a "senha de app" do Gmail vale com ou sem os espacos dos 4 blocos;
- porta 465 usa conexao criptografada desde o inicio (SMTP_SSL); a 587 usa
  STARTTLS.
"""

import smtplib

from app.core import email as modulo_email
from app.core.config import settings


def test_senha_de_app_sem_espacos(monkeypatch):
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "abcd efgh ijkl mnop")
    assert modulo_email.senha_smtp() == "abcdefghijklmnop"


def test_porta_465_usa_ssl_e_587_usa_starttls(monkeypatch):
    chamadas = []

    class Falso:
        def __init__(self, host, porta, timeout=None):
            chamadas.append((type(self).__name__, porta))

        def ehlo(self):
            chamadas.append("ehlo")

        def starttls(self):
            chamadas.append("starttls")

        def close(self):
            pass

    class SSL(Falso):
        pass

    class Comum(Falso):
        pass

    monkeypatch.setattr(smtplib, "SMTP_SSL", SSL)
    monkeypatch.setattr(smtplib, "SMTP", Comum)
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.exemplo-radix.com.br")
    monkeypatch.setattr(settings, "SMTP_USE_TLS", True)

    monkeypatch.setattr(settings, "SMTP_PORT", 465)
    modulo_email.abrir_conexao_smtp()
    assert chamadas == [("SSL", 465)]

    chamadas.clear()
    monkeypatch.setattr(settings, "SMTP_PORT", 587)
    modulo_email.abrir_conexao_smtp()
    assert chamadas == [("Comum", 587), "ehlo", "starttls", "ehlo"]
