"""
Fluxo de "esqueci minha senha": sempre responde com a mesma mensagem
generica (nao revela se o e-mail existe), token de uso unico com
expiracao.
"""

from datetime import datetime, timedelta, timezone

import app.modules.auth as auth_module
from app.modules.users import UserRole
from tests.conftest import SENHA_TESTE, obter_token


def test_forgot_password_usuario_existente_gera_token(client, criar_usuario, db):
    usuario = criar_usuario(perfil=UserRole.estudante)

    resposta = client.post("/auth/forgot-password", json={"email": usuario.email})

    assert resposta.status_code == 200
    assert "instruç" in resposta.json()["mensagem"].lower() or "Se esse" in resposta.json()["mensagem"]

    db.refresh(usuario)
    assert usuario.reset_token is not None
    assert usuario.reset_token_expira_em is not None


def test_forgot_password_email_inexistente_mesma_mensagem(client):
    resposta_existe = client.post(
        "/auth/forgot-password", json={"email": "ninguem-com-esse-email@teste.example"}
    )
    assert resposta_existe.status_code == 200
    assert "instruç" in resposta_existe.json()["mensagem"].lower() or "Se esse" in resposta_existe.json()["mensagem"]


def test_forgot_password_usuario_bloqueado_nao_gera_token(client, criar_usuario, db):
    usuario = criar_usuario(bloqueado=True)

    resposta = client.post("/auth/forgot-password", json={"email": usuario.email})

    assert resposta.status_code == 200
    db.refresh(usuario)
    assert usuario.reset_token is None


def test_reset_password_com_token_valido(client, criar_usuario, db):
    usuario = criar_usuario(perfil=UserRole.estudante)
    usuario.reset_token = "token-de-teste-valido"
    usuario.reset_token_expira_em = datetime.now(timezone.utc) + timedelta(minutes=30)
    db.commit()

    resposta = client.post(
        "/auth/reset-password",
        json={"token": "token-de-teste-valido", "nova_senha": "NovaSenhaForte123"},
    )

    assert resposta.status_code == 200

    # a senha nova realmente passa a valer
    token_login = obter_token(client, usuario.email, senha="NovaSenhaForte123")
    assert token_login

    # e o token de reset de uso unico e consumido (nao reutilizavel)
    segunda_tentativa = client.post(
        "/auth/reset-password",
        json={"token": "token-de-teste-valido", "nova_senha": "OutraSenha456"},
    )
    assert segunda_tentativa.status_code == 400


def test_reset_password_com_token_inexistente(client):
    resposta = client.post(
        "/auth/reset-password",
        json={"token": "token-que-nunca-existiu", "nova_senha": "NovaSenhaForte123"},
    )
    assert resposta.status_code == 400


def test_reset_password_com_token_expirado(client, criar_usuario, db):
    usuario = criar_usuario(perfil=UserRole.estudante)
    usuario.reset_token = "token-de-teste-expirado"
    usuario.reset_token_expira_em = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()

    resposta = client.post(
        "/auth/reset-password",
        json={"token": "token-de-teste-expirado", "nova_senha": "NovaSenhaForte123"},
    )

    assert resposta.status_code == 400


def test_reset_password_com_senha_curta(client, criar_usuario, db):
    usuario = criar_usuario(perfil=UserRole.estudante)
    usuario.reset_token = "token-de-teste-senha-curta"
    usuario.reset_token_expira_em = datetime.now(timezone.utc) + timedelta(minutes=30)
    db.commit()

    resposta = client.post(
        "/auth/reset-password",
        json={"token": "token-de-teste-senha-curta", "nova_senha": "curta"},
    )

    assert resposta.status_code == 422


def test_forgot_password_idioma_en_repassado_ao_email(client, criar_usuario, monkeypatch):
    usuario = criar_usuario(perfil=UserRole.estudante)
    chamadas = []
    monkeypatch.setattr(
        auth_module,
        "enviar_email_redefinicao_senha",
        lambda destinatario, nome, link_reset, idioma="pt": chamadas.append(idioma),
    )

    resposta = client.post(
        "/auth/forgot-password", json={"email": usuario.email, "idioma": "en"}
    )

    assert resposta.status_code == 200
    assert chamadas == ["en"]


def test_forgot_password_sem_idioma_usa_pt_por_padrao(client, criar_usuario, monkeypatch):
    usuario = criar_usuario(perfil=UserRole.estudante)
    chamadas = []
    monkeypatch.setattr(
        auth_module,
        "enviar_email_redefinicao_senha",
        lambda destinatario, nome, link_reset, idioma="pt": chamadas.append(idioma),
    )

    resposta = client.post("/auth/forgot-password", json={"email": usuario.email})

    assert resposta.status_code == 200
    assert chamadas == ["pt"]


def test_forgot_password_idioma_invalido_cai_para_pt(client, criar_usuario, monkeypatch):
    usuario = criar_usuario(perfil=UserRole.estudante)
    chamadas = []
    monkeypatch.setattr(
        auth_module,
        "enviar_email_redefinicao_senha",
        lambda destinatario, nome, link_reset, idioma="pt": chamadas.append(idioma),
    )

    resposta = client.post(
        "/auth/forgot-password", json={"email": usuario.email, "idioma": "fr"}
    )

    assert resposta.status_code == 200
    assert chamadas == ["pt"]
