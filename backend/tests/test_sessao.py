"""
Sessao deslizante (app/core/sessao.py): quem esta usando o sistema nao e
deslogado no meio do trabalho; quem fica parado perde a sessao; ninguem
passa do limite absoluto sem entrar de novo.
"""

import time

from app.core.config import settings
from app.core.security import criar_token_acesso, decodificar_token
from app.core.sessao import NOME_COOKIE_TOKEN, token_renovado
from app.modules.users import UserRole
from tests.conftest import SENHA_TESTE


def _token(usuario, faltando_s: float, inicio_ha_s: float) -> str:
    agora = time.time()
    validade_min = settings.JWT_EXPIRE_MINUTES
    # criar_token_acesso usa "exp" = agora + validade; ajusta para faltar X s
    return criar_token_acesso(
        {"sub": str(usuario.id), "perfil": usuario.perfil.value, "inicio": int(agora - inicio_ha_s)},
        expira_em=max(1, int(faltando_s // 60)) if faltando_s < validade_min * 60 else validade_min,
    )


def _cookie_renovado(resposta) -> str | None:
    for valor in resposta.headers.get_list("set-cookie"):
        if valor.startswith(NOME_COOKIE_TOKEN + "="):
            return valor.split(";", 1)[0].split("=", 1)[1]
    return None


def test_login_novo_nao_renova_a_cada_pedido(client, criar_usuario):
    usuario = criar_usuario(perfil=UserRole.curador)
    client.cookies.clear()
    r = client.post("/auth/login", data={"username": usuario.email, "password": SENHA_TESTE})
    assert r.status_code == 200
    assert isinstance(decodificar_token(_cookie_renovado(r))["inicio"], int)
    r = client.get("/auth/me")
    assert r.status_code == 200
    assert _cookie_renovado(r) is None  # token ainda novo: nada a renovar


def test_sessao_em_uso_e_renovada_mantendo_horario_do_login(client, criar_usuario):
    usuario = criar_usuario(perfil=UserRole.curador)
    client.cookies.clear()
    client.cookies.set(NOME_COOKIE_TOKEN, _token(usuario, faltando_s=5 * 60, inicio_ha_s=2 * 3600))
    r = client.get("/auth/me")
    assert r.status_code == 200
    novo = _cookie_renovado(r)
    assert novo, "sessao em uso deveria ser renovada"
    dados = decodificar_token(novo)
    assert dados["sub"] == str(usuario.id)
    assert dados["exp"] - time.time() > settings.JWT_EXPIRE_MINUTES * 60 - 30
    assert abs(dados["inicio"] - (time.time() - 2 * 3600)) < 5  # nao "empurra" o login
    client.cookies.clear()


def test_limite_absoluto_nao_renova(client, criar_usuario):
    usuario = criar_usuario(perfil=UserRole.curador)
    client.cookies.clear()
    client.cookies.set(
        NOME_COOKIE_TOKEN, _token(usuario, faltando_s=5 * 60, inicio_ha_s=settings.SESSAO_MAXIMA_HORAS * 3600 + 60)
    )
    r = client.get("/auth/me")
    assert r.status_code == 200  # ainda vale ate expirar...
    assert _cookie_renovado(r) is None  # ...mas nao e mais renovada
    client.cookies.clear()


def test_usuario_bloqueado_e_rota_publica_nao_renovam(client, criar_usuario, db):
    usuario = criar_usuario(perfil=UserRole.curador)
    token = _token(usuario, faltando_s=5 * 60, inicio_ha_s=600)
    client.cookies.clear()
    client.cookies.set(NOME_COOKIE_TOKEN, token)
    # rota sem login (documentacao da API): nao renova
    assert _cookie_renovado(client.get("/openapi.json")) is None
    usuario.bloqueado = True
    db.commit()
    r = client.get("/auth/me")
    assert r.status_code == 401
    assert _cookie_renovado(r) is None
    client.cookies.clear()


def test_logout_apaga_e_nao_recria_o_cookie(client, criar_usuario):
    usuario = criar_usuario(perfil=UserRole.curador)
    client.cookies.clear()
    client.cookies.set(NOME_COOKIE_TOKEN, _token(usuario, faltando_s=5 * 60, inicio_ha_s=600))
    r = client.post("/auth/logout")
    assert r.status_code == 200
    cookies = [v for v in r.headers.get_list("set-cookie") if v.startswith(NOME_COOKIE_TOKEN + "=")]
    assert len(cookies) == 1 and ('Max-Age=0' in cookies[0] or 'expires=' in cookies[0].lower())
    client.cookies.clear()


def test_token_renovado_regras():
    agora = 1_000_000.0
    meia = settings.JWT_EXPIRE_MINUTES * 60 / 2
    base = {"sub": "7", "inicio": int(agora - 60)}
    assert token_renovado({**base, "exp": agora + meia + 10}, 7, "curador", agora) is None
    assert token_renovado({**base, "exp": agora + meia - 10}, 7, "curador", agora)
    assert token_renovado({**base, "exp": agora + 10}, 8, "curador", agora) is None  # outro usuario
