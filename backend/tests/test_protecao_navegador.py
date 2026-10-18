"""
Protecao no navegador (app/core/cabecalhos.py) - OWASP ASVS 5.0:
- 3.2.1 / 3.4.4: nosniff e CSP restrita (arquivo enviado nunca vira pagina/script);
- 3.4.5: Referrer-Policy; 3.4.6: a API nao pode ser embutida em iframe;
- 3.5.1 / 3.5.2: pedido que altera dados vindo de OUTRO site e recusado,
  inclusive formulario simples (sem "preflight" do CORS).
"""

from app.core.cabecalhos import ORIGENS_PERMITIDAS
from app.core.sessao import NOME_COOKIE_TOKEN
from app.modules.users import UserRole
from tests.conftest import SENHA_TESTE, cabecalho_auth, obter_token

SITE_ATACANTE = "http://site-malicioso.example"


def _confere_cabecalhos(r):
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["referrer-policy"] == "no-referrer"
    assert r.headers["x-frame-options"] == "DENY"


def test_cabecalhos_em_json_e_em_erro(client):
    r = client.get("/auth/me")  # sem login: 401
    assert r.status_code == 401
    _confere_cabecalhos(r)
    assert "frame-ancestors 'none'" in r.headers["content-security-policy"]
    assert "default-src 'none'" in r.headers["content-security-policy"]


def test_documentacao_continua_funcionando(client):
    r = client.get("/docs")
    assert r.status_code == 200
    _confere_cabecalhos(r)
    assert "content-security-policy" not in r.headers  # Swagger usa scripts


def test_arquivo_enviado_servido_em_sandbox(client, criar_usuario):
    import io
    from PIL import Image
    usuario = criar_usuario(perfil=UserRole.estudante)
    client.cookies.clear()
    token = obter_token(client, usuario.email)
    png = io.BytesIO(); Image.new("RGB", (8, 8), (0, 120, 200)).save(png, format="PNG")
    r = client.post("/users/me/avatar", files={"arquivo": ("foto.png", png.getvalue(), "image/png")},
                    headers=cabecalho_auth(token))
    assert r.status_code == 200, r.text
    r = client.get(r.json()["foto_perfil_url"])
    assert r.status_code == 200 and r.headers["content-type"].startswith("image/")
    _confere_cabecalhos(r)
    assert "sandbox" in r.headers["content-security-policy"]
    client.cookies.clear()


def test_login_por_formulario_de_outro_site_e_recusado(client, criar_usuario):
    """3.5.2: formulario HTML simples (nao dispara preflight) vindo de outro site."""
    usuario = criar_usuario(perfil=UserRole.estudante)
    client.cookies.clear()
    r = client.post("/auth/login", data={"username": usuario.email, "password": SENHA_TESTE},
                    headers={"Origin": SITE_ATACANTE})
    assert r.status_code == 403
    assert "access_token" not in r.cookies
    _confere_cabecalhos(r)
    r = client.post("/auth/login", data={"username": usuario.email, "password": SENHA_TESTE},
                    headers={"Origin": "null"})
    assert r.status_code == 403
    client.cookies.clear()


def test_acao_logada_vinda_de_outro_site_e_recusada(client, criar_usuario):
    """3.5.1: mesmo com o cookie de login, outro site nao consegue agir em nome do usuario."""
    usuario = criar_usuario(perfil=UserRole.estudante)
    client.cookies.clear()
    token = obter_token(client, usuario.email)
    client.cookies.set(NOME_COOKIE_TOKEN, token)  # cookie de login fica no "navegador"
    r = client.post("/auth/logout", headers={"Origin": SITE_ATACANTE})
    assert r.status_code == 403
    r = client.post("/auth/logout", headers={"Sec-Fetch-Site": "cross-site"})
    assert r.status_code == 403
    assert client.get("/auth/me").status_code == 200  # sessao intacta
    client.cookies.clear()


def test_tela_do_radix_e_clientes_sem_navegador_continuam_funcionando(client, criar_usuario):
    usuario = criar_usuario(perfil=UserRole.estudante)
    client.cookies.clear()
    r = client.post("/auth/login", data={"username": usuario.email, "password": SENHA_TESTE},
                    headers={"Origin": ORIGENS_PERMITIDAS[0], "Sec-Fetch-Site": "same-site"})
    assert r.status_code == 200
    # leitura (GET) vinda de outro site nao e bloqueada aqui: quem protege e o CORS
    assert client.get("/auth/me", headers={"Origin": SITE_ATACANTE}).status_code == 200
    # sem Origin (script, teste, servidor Next.js): segue a regra normal de login
    r = client.post("/auth/logout")
    assert r.status_code == 200
    client.cookies.clear()


def test_preflight_do_cors_continua_respondendo(client):
    r = client.options("/auth/login", headers={
        "Origin": ORIGENS_PERMITIDAS[0], "Access-Control-Request-Method": "POST"})
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == ORIGENS_PERMITIDAS[0]
