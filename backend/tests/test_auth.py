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


def test_login_trava_por_conta_apos_muitas_falhas(client, criar_usuario, db):
    """A-02: 10 senhas erradas em 15 min travam a CONTA (429), mesmo vindas de varios IPs."""
    from app.modules.audit_logs import AuditLog

    usuario = criar_usuario(perfil=UserRole.estudante)
    for _ in range(10):
        db.add(AuditLog(usuario_id=usuario.id, acao="falha_login", entidade="user",
                        entidade_id=usuario.id, resultado="negado", detalhes="Senha incorreta."))
    db.commit()

    resposta = client.post("/auth/login", data={"username": usuario.email, "password": SENHA_TESTE})

    assert resposta.status_code == 429
    assert "Retry-After" in resposta.headers


def test_login_conta_com_poucas_falhas_continua_entrando(client, criar_usuario, db):
    from app.modules.audit_logs import AuditLog

    usuario = criar_usuario(perfil=UserRole.estudante)
    for _ in range(3):
        db.add(AuditLog(usuario_id=usuario.id, acao="falha_login", entidade="user",
                        entidade_id=usuario.id, resultado="negado", detalhes="Senha incorreta."))
    db.commit()

    resposta = client.post("/auth/login", data={"username": usuario.email, "password": SENHA_TESTE})

    assert resposta.status_code == 200


def test_login_email_inexistente_gasta_verificacao_de_senha(client, monkeypatch):
    """A-03: e-mail inexistente tambem executa o calculo lento de senha (mesmo tempo de resposta)."""
    from app.modules import auth

    chamadas = []
    original = auth.verificar_senha
    monkeypatch.setattr(auth, "verificar_senha", lambda s, h: chamadas.append(h) or original(s, h))

    resposta = client.post("/auth/login", data={"username": "ninguem@teste.example", "password": "qualquer-coisa"})

    assert resposta.status_code == 401
    assert chamadas == [auth._HASH_FALSO]
