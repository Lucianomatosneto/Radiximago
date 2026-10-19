"""
Sessoes e conta - OWASP ASVS 5.0:
- 7.5.2: o usuario ve os proprios acessos (aparelho, origem, ultimo uso) e
  encerra um ou todos os outros - nunca os de outra pessoa;
- 7.4.5: o administrador encerra as sessoes de um usuario ou de todos;
- 7.5.1: alterar dado que afeta a autenticacao (senha) exige a senha atual;
  o e-mail nao pode ser trocado por ninguem;
- 9.2.2 / 9.2.3: so vale token do TIPO sessao, emitido PELO Radix e PARA a
  API do Radix.
"""

import time

import jwt
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.security import decodificar_token
from app.core.sessao import NOME_COOKIE_TOKEN
from app.main import app
from app.modules.sessoes import resumo_do_aparelho
from app.modules.users import UserRole
from tests.conftest import SENHA_TESTE, cabecalho_auth, completar_segundo_fator

CHROME_WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"
FIREFOX_ANDROID = "Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0"


def _entrar(email: str, navegador: str) -> TestClient:
    """Um 'aparelho': cliente proprio, com seu navegador e seu cookie."""
    aparelho = TestClient(app, headers={"User-Agent": navegador})
    r = aparelho.post("/auth/login", data={"username": email, "password": SENHA_TESTE})
    r = completar_segundo_fator(aparelho, email, r)  # perfis com poder: login em duas etapas
    assert r.status_code == 200, r.text
    return aparelho


def test_resumo_do_aparelho_guarda_so_o_necessario():
    assert resumo_do_aparelho(CHROME_WINDOWS) == "Chrome · Windows"
    assert resumo_do_aparelho(FIREFOX_ANDROID) == "Firefox · Android"
    assert resumo_do_aparelho(None) is None
    assert len(resumo_do_aparelho("x" * 500)) < 80


def test_7_5_2_usuario_ve_e_encerra_os_proprios_acessos(criar_usuario):
    usuario = criar_usuario(perfil=UserRole.estudante)
    computador = _entrar(usuario.email, CHROME_WINDOWS)
    celular = _entrar(usuario.email, FIREFOX_ANDROID)

    lista = computador.get("/auth/sessoes").json()
    assert {s["aparelho"] for s in lista} == {"Chrome · Windows", "Firefox · Android"}
    atual = [s for s in lista if s["atual"]]
    assert len(atual) == 1 and atual[0]["aparelho"] == "Chrome · Windows"
    assert all(len(s["id"]) == 16 for s in lista)  # so o resumo, nunca o identificador real
    outra = next(s for s in lista if not s["atual"])

    # nao encerra o acesso atual por aqui (para isso existe "Sair")
    assert computador.post(f"/auth/sessoes/{atual[0]['id']}/encerrar").status_code == 409
    # encerra o celular: ele perde o acesso na hora
    assert computador.post(f"/auth/sessoes/{outra['id']}/encerrar").status_code == 200
    assert celular.get("/auth/me").status_code == 401
    assert computador.get("/auth/me").status_code == 200


def test_7_5_2_encerrar_todos_os_outros_e_nunca_os_de_outra_pessoa(criar_usuario):
    usuario = criar_usuario(perfil=UserRole.estudante)
    intruso = criar_usuario(perfil=UserRole.estudante)
    meu = _entrar(usuario.email, CHROME_WINDOWS)
    outro_meu = _entrar(usuario.email, FIREFOX_ANDROID)
    dele = _entrar(intruso.email, CHROME_WINDOWS)

    id_do_meu = next(s["id"] for s in meu.get("/auth/sessoes").json() if s["atual"])
    assert dele.post(f"/auth/sessoes/{id_do_meu}/encerrar").status_code == 404  # sessao alheia
    assert meu.get("/auth/me").status_code == 200

    assert meu.post("/auth/sessoes/encerrar-outras").json()["encerradas"] == 1
    assert outro_meu.get("/auth/me").status_code == 401
    assert meu.get("/auth/me").status_code == 200
    assert dele.get("/auth/me").status_code == 200  # a outra pessoa nao foi afetada


def test_7_4_5_administrador_encerra_sessoes_de_um_usuario(criar_usuario):
    admin = criar_usuario(perfil=UserRole.administrador)
    alvo = criar_usuario(perfil=UserRole.curador)
    painel = _entrar(admin.email, CHROME_WINDOWS)
    a1, a2 = _entrar(alvo.email, CHROME_WINDOWS), _entrar(alvo.email, FIREFOX_ANDROID)

    assert a1.post(f"/users/{alvo.id}/encerrar-sessoes").status_code == 403  # so administrador
    r = painel.post(f"/users/{alvo.id}/encerrar-sessoes")
    assert r.status_code == 200 and r.json()["encerradas"] == 2
    assert a1.get("/auth/me").status_code == 401 and a2.get("/auth/me").status_code == 401
    assert painel.get("/auth/me").status_code == 200


def test_7_4_5_administrador_encerra_sessoes_de_todos_menos_a_dele(criar_usuario):
    admin = criar_usuario(perfil=UserRole.administrador)
    pessoa = criar_usuario(perfil=UserRole.estudante)
    painel = _entrar(admin.email, CHROME_WINDOWS)
    outro_aparelho_do_admin = _entrar(admin.email, FIREFOX_ANDROID)
    estudante = _entrar(pessoa.email, CHROME_WINDOWS)

    assert estudante.post("/admin/sessoes/encerrar-todas").status_code == 403
    assert painel.post("/admin/sessoes/encerrar-todas").json()["encerradas"] >= 2
    assert estudante.get("/auth/me").status_code == 401
    assert outro_aparelho_do_admin.get("/auth/me").status_code == 401
    assert painel.get("/auth/me").status_code == 200


def test_7_5_1_senha_so_muda_com_a_senha_atual_e_email_nao_muda(client, criar_usuario, db):
    usuario = criar_usuario(perfil=UserRole.estudante)
    admin = criar_usuario(perfil=UserRole.administrador)
    aparelho = _entrar(usuario.email, CHROME_WINDOWS)
    r = aparelho.post("/auth/change-password", json={"senha_atual": "senha-errada", "nova_senha": "frase nova bem longa"})
    assert r.status_code == 401
    # nem o administrador troca o e-mail (o campo nao existe na edicao)
    painel = _entrar(admin.email, CHROME_WINDOWS)
    email_antes = usuario.email
    painel.patch(f"/users/{usuario.id}", json={"email": "outro@teste.example", "nome": "Nome Novo"})
    db.refresh(usuario)
    assert usuario.email == email_antes and usuario.nome == "Nome Novo"


def _token(**campos):
    base = {"sub": "1", "exp": int(time.time()) + 600, "jti": "x"}
    base.update(campos)
    return jwt.encode({k: v for k, v in base.items() if v is not None}, settings.JWT_SECRET_KEY, algorithm="HS256")


def test_9_2_2_e_9_2_3_so_aceita_token_de_sessao_do_radix_para_a_api():
    ok = _token(iss="radix-imago", aud="radix-imago-api", tipo="sessao")
    assert decodificar_token(ok) is not None
    # mesma chave, mas sem dizer para quem/quem emitiu/para que serve: recusado
    assert decodificar_token(_token()) is None
    assert decodificar_token(_token(iss="radix-imago", aud="outro-servico", tipo="sessao")) is None
    assert decodificar_token(_token(iss="outro-sistema", aud="radix-imago-api", tipo="sessao")) is None
    assert decodificar_token(_token(iss="radix-imago", aud="radix-imago-api", tipo="redefinicao")) is None


def test_login_real_emite_token_com_emissor_publico_e_tipo(criar_usuario):
    usuario = criar_usuario(perfil=UserRole.estudante)
    aparelho = _entrar(usuario.email, CHROME_WINDOWS)
    dados = jwt.decode(aparelho.cookies.get(NOME_COOKIE_TOKEN), options={"verify_signature": False})
    assert (dados["iss"], dados["aud"], dados["tipo"]) == ("radix-imago", "radix-imago-api", "sessao")
    assert aparelho.get("/auth/me", headers=cabecalho_auth(aparelho.cookies.get(NOME_COOKIE_TOKEN))).status_code == 200
