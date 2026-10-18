"""
Sessoes revogaveis (app/modules/sessoes.py) - OWASP ASVS 5.0:
- 7.4.1: depois de "Sair", uma copia do token nao vale mais;
- 7.2.4: um novo login no mesmo navegador encerra a sessao anterior;
- 7.4.3: trocar/redefinir a senha encerra as sessoes dos outros aparelhos;
- 14.3.1: o logout pede ao navegador para descartar o cache.
"""

import time
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.core.security import criar_token_acesso, decodificar_token
from app.core.sessao import NOME_COOKIE_TOKEN, token_renovado
from app.main import app
from app.modules.auth import _resumo_token
from app.modules.sessoes import SessaoUsuario
from app.modules.users import UserRole
from tests.conftest import SENHA_TESTE, cabecalho_auth


def _entrar(cliente: TestClient, email: str, senha: str = SENHA_TESTE) -> str:
    """Login como um navegador: o cookie fica guardado no cliente."""
    r = cliente.post("/auth/login", data={"username": email, "password": senha})
    assert r.status_code == 200, r.text
    return cliente.cookies.get(NOME_COOKIE_TOKEN)


def _vale(token: str) -> int:
    return TestClient(app).get("/auth/me", headers=cabecalho_auth(token)).status_code


def test_logout_invalida_copia_do_token(criar_usuario, db):
    usuario = criar_usuario()
    navegador = TestClient(app)
    token = _entrar(navegador, usuario.email)
    assert _vale(token) == 200
    r = navegador.post("/auth/logout")
    assert r.status_code == 200
    assert r.headers.get("clear-site-data") == '"cache"'
    # a copia guardada do token nao serve mais
    assert _vale(token) == 401
    sessao = db.get(SessaoUsuario, decodificar_token(token)["jti"])
    db.refresh(sessao)
    assert sessao.encerrada_em is not None and sessao.motivo_encerramento == "logout"


def test_novo_login_no_mesmo_navegador_encerra_o_anterior(criar_usuario):
    usuario = criar_usuario()
    navegador = TestClient(app)
    outro_aparelho = TestClient(app)
    antigo = _entrar(navegador, usuario.email)
    do_celular = _entrar(outro_aparelho, usuario.email)
    novo = _entrar(navegador, usuario.email)
    assert antigo != novo
    assert _vale(antigo) == 401  # encerrado pelo novo login deste navegador
    assert _vale(novo) == 200
    assert _vale(do_celular) == 200  # outro aparelho continua (sessoes simultaneas permitidas)


def test_troca_de_senha_encerra_os_outros_aparelhos(criar_usuario):
    usuario = criar_usuario()
    computador = TestClient(app)
    notebook = TestClient(app)
    atual = _entrar(computador, usuario.email)
    outro = _entrar(notebook, usuario.email)
    r = computador.post("/auth/change-password", json={"senha_atual": SENHA_TESTE, "nova_senha": "nova-senha-123"})
    assert r.status_code == 200, r.text
    assert _vale(atual) == 200  # quem trocou continua
    assert _vale(outro) == 401


def test_redefinicao_de_senha_encerra_todas_as_sessoes(criar_usuario, client, db):
    usuario = criar_usuario()
    computador = TestClient(app)
    token = _entrar(computador, usuario.email)
    # o banco guarda so o resumo do codigo: o teste grava um codigo conhecido
    usuario.reset_token = _resumo_token("codigo-conhecido-do-teste")
    usuario.reset_token_expira_em = datetime.now(timezone.utc) + timedelta(minutes=30)
    db.commit()
    r = client.post("/auth/reset-password", json={"token": "codigo-conhecido-do-teste", "nova_senha": "outra-senha-456"})
    assert r.status_code == 200, r.text
    assert _vale(token) == 401


def test_token_sem_sessao_e_recusado(criar_usuario):
    usuario = criar_usuario()
    sem_jti = criar_token_acesso({"sub": str(usuario.id), "perfil": usuario.perfil.value, "inicio": int(time.time())})
    assert _vale(sem_jti) == 401
    inventado = criar_token_acesso({"sub": str(usuario.id), "perfil": usuario.perfil.value, "jti": "inventado"})
    assert _vale(inventado) == 401


def test_sessao_de_outro_usuario_nao_serve(criar_usuario):
    a = criar_usuario()
    b = criar_usuario()
    token_a = _entrar(TestClient(app), a.email)
    jti_a = decodificar_token(token_a)["jti"]
    # token com o sub de B mas a sessao (jti) de A
    misturado = criar_token_acesso({"sub": str(b.id), "perfil": b.perfil.value, "jti": jti_a})
    assert _vale(misturado) == 401


def test_renovacao_mantem_a_mesma_sessao():
    agora = 1_000_000.0
    payload = {"sub": "7", "inicio": int(agora - 60), "exp": agora + 10, "jti": "sessao-abc"}
    novo = token_renovado(payload, 7, "curador", agora)
    import jwt as _jwt  # leitura sem conferir o relogio (exp calculado a partir de "agora" ficticio)
    assert _jwt.decode(novo, options={"verify_signature": False})["jti"] == "sessao-abc"


def test_portaria_das_imagens_respeita_sessao_encerrada(criar_usuario):
    usuario = criar_usuario(perfil=UserRole.administrador)
    navegador = TestClient(app)
    token = _entrar(navegador, usuario.email)
    cab = {**cabecalho_auth(token), "X-Original-URI": "/instances", "X-Original-Method": "GET"}
    assert TestClient(app).get("/visualizador/autorizar", headers=cab).status_code == 204
    navegador.post("/auth/logout")
    assert TestClient(app).get("/visualizador/autorizar", headers=cab).status_code == 401


def test_respostas_json_nao_ficam_em_cache(criar_usuario):
    usuario = criar_usuario()
    navegador = TestClient(app)
    _entrar(navegador, usuario.email)
    r = navegador.get("/auth/me")
    assert r.status_code == 200
    assert r.headers.get("cache-control") == "no-store"
