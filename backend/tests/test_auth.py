"""
Testes de autenticacao, autorizacao por perfil e rate limiting.
"""

from app.modules.users import UserRole
from tests.conftest import SENHA_TESTE, cabecalho_auth, obter_token


def test_login_com_sucesso(client, criar_usuario):
    usuario = criar_usuario(perfil=UserRole.estudante)

    resposta = client.post(
        "/auth/login", data={"username": usuario.email, "password": SENHA_TESTE}
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["access_token"]
    assert corpo["token_type"] == "bearer"
    assert corpo["perfil"] == "estudante"


def test_login_com_senha_errada(client, criar_usuario):
    usuario = criar_usuario()

    resposta = client.post(
        "/auth/login", data={"username": usuario.email, "password": "senha-errada"}
    )

    assert resposta.status_code == 401


def test_login_com_email_inexistente(client):
    resposta = client.post(
        "/auth/login",
        data={"username": "ninguem-com-esse-email@teste.example", "password": "qualquer"},
    )

    assert resposta.status_code == 401


def test_login_usuario_bloqueado(client, criar_usuario):
    usuario = criar_usuario(bloqueado=True)

    resposta = client.post(
        "/auth/login", data={"username": usuario.email, "password": SENHA_TESTE}
    )

    assert resposta.status_code == 403


def test_login_usuario_inativo(client, criar_usuario):
    usuario = criar_usuario(ativo=False)

    resposta = client.post(
        "/auth/login", data={"username": usuario.email, "password": SENHA_TESTE}
    )

    assert resposta.status_code == 403


def test_login_usuario_excluido_nao_encontrado(client, criar_usuario):
    # Soft-delete: o /auth/login exclui usuarios excluidos da busca, como
    # se o e-mail nao existisse (permite reaproveitar o e-mail depois).
    usuario = criar_usuario(excluido=True)

    resposta = client.post(
        "/auth/login", data={"username": usuario.email, "password": SENHA_TESTE}
    )

    assert resposta.status_code == 401


def test_meu_perfil_com_token_valido(client, criar_usuario):
    usuario = criar_usuario(perfil=UserRole.curador)
    token = obter_token(client, usuario.email)

    resposta = client.get("/auth/me", headers=cabecalho_auth(token))

    assert resposta.status_code == 200
    assert resposta.json()["email"] == usuario.email
    assert resposta.json()["perfil"] == "curador"


def test_endpoint_protegido_sem_token(client):
    resposta = client.get("/auth/me")
    assert resposta.status_code == 401


def test_endpoint_protegido_com_token_invalido(client):
    resposta = client.get("/auth/me", headers=cabecalho_auth("token-inventado"))
    assert resposta.status_code == 401


def test_estudante_nao_acessa_endpoint_administrativo(client, criar_usuario):
    usuario = criar_usuario(perfil=UserRole.estudante)
    token = obter_token(client, usuario.email)

    resposta = client.get("/users/access-requests", headers=cabecalho_auth(token))

    assert resposta.status_code == 403


def test_admin_acessa_endpoint_administrativo(client, criar_usuario):
    usuario = criar_usuario(perfil=UserRole.administrador)
    token = obter_token(client, usuario.email)

    resposta = client.get("/users/access-requests", headers=cabecalho_auth(token))

    assert resposta.status_code == 200


def test_curador_acessa_indicadores_mas_nao_endpoint_admin(client, criar_usuario):
    usuario = criar_usuario(perfil=UserRole.curador)
    token = obter_token(client, usuario.email)

    # /admin/stats foi liberado pra curador tambem (usado pela tela de
    # Relatorios) - ver commit "navegação por perfil de usuário".
    resposta_stats = client.get("/admin/stats", headers=cabecalho_auth(token))
    assert resposta_stats.status_code == 200

    # mas endpoints exclusivos de admin continuam bloqueados pra curador
    resposta_admin = client.get("/users/access-requests", headers=cabecalho_auth(token))
    assert resposta_admin.status_code == 403


def test_rate_limit_no_login(client, criar_usuario):
    usuario = criar_usuario()

    respostas = [
        client.post("/auth/login", data={"username": usuario.email, "password": "errada"})
        for _ in range(5)
    ]
    assert all(r.status_code == 401 for r in respostas)

    sexta_tentativa = client.post(
        "/auth/login", data={"username": usuario.email, "password": "errada"}
    )
    assert sexta_tentativa.status_code == 429
