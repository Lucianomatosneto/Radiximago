"""
Fluxo de "esqueci minha senha": sempre responde com a mesma mensagem
generica (nao revela se o e-mail existe), token de uso unico com
expiracao.
"""

from datetime import datetime, timedelta, timezone

import app.modules.auth as auth_module
from app.modules.auth import _resumo_token
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
    usuario.reset_token = _resumo_token("token-de-teste-valido")  # no banco fica so o resumo
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
    usuario.reset_token = _resumo_token("token-de-teste-expirado")  # no banco fica so o resumo
    usuario.reset_token_expira_em = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()

    resposta = client.post(
        "/auth/reset-password",
        json={"token": "token-de-teste-expirado", "nova_senha": "NovaSenhaForte123"},
    )

    assert resposta.status_code == 400


def test_reset_password_com_senha_curta(client, criar_usuario, db):
    usuario = criar_usuario(perfil=UserRole.estudante)
    usuario.reset_token = _resumo_token("token-de-teste-senha-curta")  # no banco fica so o resumo
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


def _link_capturado(client, monkeypatch, email):
    """Faz o pedido de "esqueci a senha" e devolve o codigo que iria no e-mail."""
    links = []
    monkeypatch.setattr(
        auth_module, "enviar_email_redefinicao_senha",
        lambda destinatario, nome, link_reset, idioma="pt": links.append(link_reset),
    )
    assert client.post("/auth/forgot-password", json={"email": email}).status_code == 200
    return links[0].split("token=", 1)[1]


def test_codigo_do_link_nao_fica_guardado_no_banco(client, criar_usuario, db, monkeypatch):
    """ASVS 6.4.1: o banco guarda so o resumo; o proprio valor guardado nao serve como link."""
    usuario = criar_usuario(perfil=UserRole.estudante)
    codigo = _link_capturado(client, monkeypatch, usuario.email)
    db.refresh(usuario)
    assert usuario.reset_token != codigo
    assert usuario.reset_token == _resumo_token(codigo)
    # quem copiar o valor do banco nao consegue redefinir a senha
    r = client.post("/auth/reset-password", json={"token": usuario.reset_token, "nova_senha": "frase longa da curadoria"})
    assert r.status_code == 400
    # o link do e-mail funciona uma vez
    r = client.post("/auth/reset-password", json={"token": codigo, "nova_senha": "frase longa da curadoria"})
    assert r.status_code == 200
    r = client.post("/auth/reset-password", json={"token": codigo, "nova_senha": "outra frase longa aqui"})
    assert r.status_code == 400


def test_redefinicao_recusa_senha_comum(client, criar_usuario, db, monkeypatch):
    usuario = criar_usuario(perfil=UserRole.estudante)
    codigo = _link_capturado(client, monkeypatch, usuario.email)
    r = client.post("/auth/reset-password", json={"token": codigo, "nova_senha": "password123"})
    assert r.status_code == 422
    assert "comum" in r.json()["detail"]
