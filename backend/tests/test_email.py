"""
Conteudo do e-mail de redefinicao de senha em PT/EN. SMTP_HOST fica vazio
neste ambiente (ver app/core/config.py) - o envio real e pulado e o
conteudo so vai pro log (ver app/core/email.py), entao o teste verifica
o log em vez de uma caixa de entrada real.
"""

import logging

from app.core.email import enviar_email_redefinicao_senha


def test_email_redefinicao_senha_em_portugues(caplog):
    with caplog.at_level(logging.INFO, logger="radix_imago.email"):
        enviar_email_redefinicao_senha(
            "usuario@teste.example", "Fulano", "http://localhost:3000/redefinir-senha?token=abc", idioma="pt"
        )

    registro = caplog.records[-1]
    assert "Redefinição de senha - Rádix Imago" in registro.args[1]
    assert "Recebemos uma solicitação" in registro.args[2]


def test_email_redefinicao_senha_em_ingles(caplog):
    with caplog.at_level(logging.INFO, logger="radix_imago.email"):
        enviar_email_redefinicao_senha(
            "usuario@teste.example", "Fulano", "http://localhost:3000/redefinir-senha?token=abc", idioma="en"
        )

    registro = caplog.records[-1]
    assert "Password reset - Radix Imago" in registro.args[1]
    assert "We received a request" in registro.args[2]


def test_email_redefinicao_senha_idioma_padrao_e_portugues(caplog):
    with caplog.at_level(logging.INFO, logger="radix_imago.email"):
        enviar_email_redefinicao_senha(
            "usuario@teste.example", "Fulano", "http://localhost:3000/redefinir-senha?token=abc"
        )

    registro = caplog.records[-1]
    assert "Redefinição de senha - Rádix Imago" in registro.args[1]
