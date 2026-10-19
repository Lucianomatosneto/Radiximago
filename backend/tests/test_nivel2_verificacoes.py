"""
Verificacoes do OWASP ASVS 5.0 - Nivel 2 (itens que a inspecao de codigo
indicava como atendidos, mas sem prova). Cada teste cita o requisito.

Dois tipos de teste:
- de COMPORTAMENTO: chamam a API como um usuario (ou atacante) faria;
- ESTATICOS: leem o codigo-fonte procurando construcoes perigosas (ex.:
  pickle, eval, scripts de terceiros). Eles protegem o futuro: se alguem
  introduzir uma dessas construcoes, o teste falha.
"""

import ast
import re
import uuid
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.security import gerar_hash_senha, pwd_context
from app.main import app
from app.modules import orthanc_client
from app.modules.audit_logs import AuditLog
from app.modules.users import UserRole
from tests.conftest import SENHA_TESTE, cabecalho_auth, obter_token

BACKEND = Path(__file__).resolve().parents[1] / "app"
FRONTEND = Path(__file__).resolve().parents[2] / "frontend" / "src"
TEM_FRONTEND = FRONTEND.is_dir()  # no container do backend so existe a pasta backend


def _codigo_python():
    for arquivo in BACKEND.rglob("*.py"):
        yield arquivo, arquivo.read_text(encoding="utf-8-sig")


def _codigo_frontend():
    for arquivo in FRONTEND.rglob("*"):
        if arquivo.suffix in (".ts", ".tsx"):
            yield arquivo, arquivo.read_text(encoding="utf-8")


def _entrar(client, perfil=UserRole.curador, criar_usuario=None):
    usuario = criar_usuario(perfil=perfil)
    client.cookies.clear()
    return usuario, cabecalho_auth(obter_token(client, usuario.email))


# ---------------------------------------------------------------- V1 codificacao
def test_1_1_1_entrada_decodificada_uma_vez_so(client, criar_usuario, criar_ficha):
    """'%41' digitado pelo usuario continua '%41' (nao vira 'A' numa 2a decodificacao)."""
    _, cab = _entrar(client, UserRole.estudante, criar_usuario)
    ficha = criar_ficha()
    r = client.post(f"/annotations/{ficha.id}", json={"texto": "%41%2527 e &lt;b&gt;"}, headers=cab)
    assert r.status_code in (200, 201), r.text
    assert r.json()["texto"] == "%41%2527 e &lt;b&gt;"


def test_1_1_2_saida_e_dado_e_nao_codigo(client, criar_usuario, criar_ficha):
    """Texto com <script> volta como DADO em JSON; quem exibe (React) escapa no ultimo passo."""
    _, cab = _entrar(client, UserRole.estudante, criar_usuario)
    ficha = criar_ficha()
    r = client.post(f"/annotations/{ficha.id}", json={"texto": "<script>alert(1)</script>"}, headers=cab)
    assert r.headers["content-type"].startswith("application/json")
    assert r.json()["texto"] == "<script>alert(1)</script>"
    if TEM_FRONTEND:
        perigosos = [str(a) for a, c in _codigo_frontend() if re.search(r"\.innerHTML\s*=|document\.write\(", c)]
        assert not perigosos, f"escrita direta de HTML no frontend: {perigosos}"


def test_1_3_6_e_13_2_4_servidor_so_chama_enderecos_da_configuracao():
    """SSRF: nenhuma chamada HTTP de saida monta o endereco com dado do usuario."""
    chamadas = []
    for arquivo, codigo in _codigo_python():
        for no in ast.walk(ast.parse(codigo)):
            if (isinstance(no, ast.Call) and isinstance(no.func, ast.Attribute)
                    and no.func.attr in ("get", "post", "put", "delete", "request", "stream")
                    and isinstance(no.func.value, ast.Name) and no.func.value.id in ("httpx", "requests", "_client")):
                destino = ast.unparse(no.args[0]) if no.args else ""
                chamadas.append((arquivo.name, destino))
    assert len(chamadas) >= 5, "a varredura deveria encontrar as chamadas ao Orthanc/Whisper"
    for nome, destino in chamadas:
        # o endereco sempre comeca por um endereco-base da configuracao (ou pela variavel url montada a partir dele)
        assert re.match(r"(f['\"]\{settings\.(ORTHANC_URL|WHISPER_URL)\}|url\b)", destino), (nome, destino)
    # os enderecos-base vem SO da configuracao (.env)
    texto = (BACKEND / "modules" / "orthanc_client.py").read_text(encoding="utf-8")
    assert "settings.ORTHANC_URL" in texto


def test_1_3_7_e_1_3_11_email_escapa_dados_do_usuario(monkeypatch):
    from app.core import email as modulo
    enviados = []
    monkeypatch.setattr(modulo, "enviar_email", lambda destinatario, assunto, html, *a, **k: enviados.append(html))
    modulo.enviar_email_acesso_rejeitado("x@teste.example", "<img src=x onerror=alert(1)>", "<b>motivo</b>")
    assert "<img" not in enviados[0] and "&lt;img" in enviados[0]


def test_1_3_11_email_com_quebra_de_linha_e_recusado(client):
    """Injecao de cabecalho SMTP ('\\r\\nBcc:'): o e-mail e recusado antes de chegar ao envio."""
    r = client.post("/auth/forgot-password", json={"email": "vitima@teste.example\r\nBcc: atacante@teste.example"})
    assert r.status_code == 422


def test_1_3_10_e_1_5_2_sem_format_string_dinamica_nem_desserializacao_insegura():
    proibidos = re.compile(r"\bpickle\.|\bmarshal\.|yaml\.load\(|\beval\(|\bexec\(|shelve\.|jsonpickle")
    achados = [f"{a.name}: {l.strip()}" for a, c in _codigo_python() for l in c.splitlines()
               if proibidos.search(l) and not l.strip().startswith("#")]
    assert not achados, achados
    # .format() so com textos fixos do proprio codigo (nunca sobre texto vindo do usuario)
    for arquivo, codigo in _codigo_python():
        for no in ast.walk(ast.parse(codigo)):
            if isinstance(no, ast.Call) and isinstance(no.func, ast.Attribute) and no.func.attr == "format":
                assert isinstance(no.func.value, ast.Constant), f"{arquivo.name}:{no.lineno} .format() sobre texto variavel"


# ---------------------------------------------------------------- V2 negocio
def test_2_3_3_operacao_invalida_nao_grava_nada_pela_metade(client, criar_usuario, criar_ficha, db):
    _, cab = _entrar(client, UserRole.curador, criar_usuario)
    ficha = criar_ficha(status="pendente", descricao_didatica="texto original")
    r = client.patch(f"/curation/{ficha.id}", headers=cab, json={
        "descricao_didatica": "texto NOVO que nao deveria ficar",
        "achados": [{"tipo": "outro", "dentes": [11]}],  # "outro" sem descricao -> invalido
    })
    assert r.status_code == 422
    db.expire_all()
    assert ficha.descricao_didatica == "texto original"


# ---------------------------------------------------------------- V3 navegador
@pytest.mark.skipif(not TEM_FRONTEND, reason="pasta frontend indisponivel neste ambiente")
def test_3_7_1_sem_tecnologias_obsoletas_de_navegador():
    achados = [str(a) for a, c in _codigo_frontend() if re.search(r"<(applet|object|embed)\b|\.swf\b|ActiveXObject", c)]
    assert not achados, achados


@pytest.mark.skipif(not TEM_FRONTEND, reason="pasta frontend indisponivel neste ambiente")
def test_3_7_2_sem_redirecionamento_para_endereco_externo_vindo_da_url():
    """Nada como window.location = searchParams.get('next') (redirecionamento aberto)."""
    padrao = re.compile(r"(location\.(href|assign|replace)|router\.(push|replace))\s*[\(=]\s*[^'\"`/\s)]*(searchParams|params\.get|query)")
    achados = [f"{a.name}: {l.strip()}" for a, c in _codigo_frontend() for l in c.splitlines() if padrao.search(l)]
    assert not achados, achados


# ---------------------------------------------------------------- V5 arquivos
def test_5_2_3_arquivo_compactado_nao_e_aceito(client, criar_usuario):
    _, cab = _entrar(client, UserRole.curador, criar_usuario)
    import io
    import zipfile
    pacote = io.BytesIO()
    with zipfile.ZipFile(pacote, "w") as z:
        z.writestr("imagem.dcm", b"\x00" * 1000)
    for nome, conteudo in (("imagens.zip", pacote.getvalue()), ("imagem.dcm", pacote.getvalue()),
                           ("x.gz", b"\x1f\x8b" + b"\x00" * 50), ("lixo.dcm", b"\x00" * 300)):
        r = client.post("/images/upload", files={"arquivo": (nome, conteudo, "application/octet-stream")}, headers=cab)
        assert r.status_code == 422, (nome, r.status_code, r.text)  # recusado ANTES de chegar ao Orthanc


def test_5_4_2_e_13_4_3_nome_servido_gerado_e_sem_listagem_de_pastas(client, criar_usuario):
    import io
    from PIL import Image
    _, cab = _entrar(client, UserRole.estudante, criar_usuario)
    png = io.BytesIO(); Image.new("RGB", (4, 4)).save(png, format="PNG")
    r = client.post("/users/me/avatar", files={"arquivo": ('a"b<c>.png', png.getvalue(), "image/png")}, headers=cab)
    url = r.json()["foto_perfil_url"]
    assert re.fullmatch(r"/uploads/avatars/\d+-[0-9a-f]{32}\.png", url), url  # id do usuario + aleatorio
    for pasta in ("/uploads/", "/uploads/avatars/", "/uploads/avatars"):
        assert client.get(pasta).status_code == 404  # sem listagem do conteudo


# ---------------------------------------------------------------- V6 autenticacao
def test_6_1_3_e_6_3_4_um_unico_caminho_de_login():
    """So o login (auth.py) e a renovacao da sessao (sessao.py) emitem o cookie de sessao."""
    emissores = sorted({a.name for a, c in _codigo_python() if re.search(r"set_cookie\(\s*(key=)?NOME_COOKIE_TOKEN", c)})
    assert emissores == ["sessao.py"], emissores  # um unico lugar cria o cookie (definir_cookie_token)
    chamadores = sorted({a.name for a, c in _codigo_python() if "definir_cookie_token(" in c and "def definir_cookie_token" not in c})
    assert set(chamadores) <= {"auth.py", "sessao.py"}, chamadores
    criadores = sorted({a.name for a, c in _codigo_python() if "criar_token_acesso(" in c and "def criar_token_acesso" not in c})
    assert set(criadores) <= {"auth.py", "sessao.py"}, criadores


def test_6_2_10_senha_antiga_continua_valendo_sem_troca_obrigatoria(client, criar_usuario, db):
    from datetime import datetime, timedelta, timezone
    usuario = criar_usuario()
    usuario.criado_em = datetime.now(timezone.utc) - timedelta(days=3 * 365)
    db.commit()
    client.cookies.clear()
    assert obter_token(client, usuario.email)  # entra normalmente, sem "sua senha expirou"
    colunas = " ".join(c.name for c in usuario.__table__.columns)
    assert "expira" not in colunas.replace("reset_token_expira_em", "")


# ---------------------------------------------------------------- V7 sessao
@pytest.mark.skipif(not TEM_FRONTEND, reason="pasta frontend indisponivel neste ambiente")
def test_7_4_4_botao_sair_em_todas_as_telas_logadas():
    """O botao Sair fica na barra superior e no menu lateral, presentes no layout das telas logadas."""
    topbar = (FRONTEND / "components" / "Topbar.tsx").read_text(encoding="utf-8")
    assert "/auth/logout" in topbar
    paginas = [p for p in (FRONTEND / "app").rglob("page.tsx")]
    # telas sem login; "erro-tecnico" e uma pagina isolada sem dados (so o botao "voltar ao painel")
    publicas = {"login", "esqueci-senha", "redefinir-senha", "solicitar-acesso", "confirmar-email", "conheca", "app", "erro-tecnico"}
    sem_layout = [str(p.relative_to(FRONTEND)) for p in paginas
                  if p.parent.name not in publicas and "Topbar" not in p.read_text(encoding="utf-8")
                  and "AppShell" not in p.read_text(encoding="utf-8") and "Layout" not in p.read_text(encoding="utf-8")]
    layout_raiz = (FRONTEND / "app" / "layout.tsx").read_text(encoding="utf-8")
    assert not sem_layout or "Topbar" in layout_raiz or "AppShell" in layout_raiz, sem_layout


# ---------------------------------------------------------------- V11 criptografia
def test_11_4_2_e_11_2_1_senhas_com_argon2id_parametros_owasp():
    """Desde 19/10/2026: Argon2id com o minimo da OWASP (19 MiB, 2 passadas, 1 linha)."""
    h = gerar_hash_senha("frase qualquer de teste")
    assert h.startswith("$argon2id$v=19$m=19456,t=2,p=1$")
    assert pwd_context.identify(h) == "argon2"


def test_11_4_3_e_11_5_1_codigos_aleatorios_fortes_e_resumo_sha256():
    import secrets
    from app.modules.auth import _resumo_token
    codigo = secrets.token_urlsafe(32)
    assert len(codigo) >= 43  # 32 bytes = 256 bits
    assert re.fullmatch(r"[0-9a-f]{64}", _resumo_token(codigo))  # SHA-256
    usos_random = [f"{a.name}: {l.strip()}" for a, c in _codigo_python() for l in c.splitlines()
                   if re.search(r"\brandom\.(random|randint|choice|getrandbits)\(", l)]
    assert not usos_random, f"gerador nao criptografico em uso: {usos_random}"


def test_11_2_3_chave_do_jwt_com_pelo_menos_256_bits_e_algoritmo_fixo():
    from app.core.config import settings
    from app.core.security import decodificar_token
    import jwt
    assert settings.JWT_ALGORITHM == "HS256"
    with pytest.raises(jwt.exceptions.InvalidKeyError):
        jwt.encode({"sub": "1"}, "", algorithm="HS256")  # a biblioteca nem permite chave vazia
    sem_assinatura = jwt.encode({"sub": "1"}, None, algorithm="none")  # ataque "alg: none"
    assert decodificar_token(sem_assinatura) is None
    chave_curta = jwt.encode({"sub": "1"}, "x", algorithm="HS256")
    assert decodificar_token(chave_curta) is None


# ---------------------------------------------------------------- V13 configuracao
def test_13_2_1_api_se_autentica_no_orthanc():
    assert orthanc_client._client.auth is not None


def test_13_2_1_api_se_autentica_no_servico_de_voz():
    """Toda chamada ao Whisper leva a chave; o lado do servico e testado em whisper/test_app.py."""
    voz = (BACKEND / "modules" / "voz_router.py").read_text(encoding="utf-8")
    chamadas = re.findall(r"httpx\.(?:get|post)\(\s*f\"\{settings\.WHISPER_URL\}[^)]*?\)", voz, re.S)
    assert len(chamadas) == 3, chamadas
    assert all("headers=_cabecalhos()" in c for c in chamadas), chamadas
    compose = BACKEND.parent.parent / "docker-compose.yml"
    if compose.is_file():  # no container do backend o docker-compose.yml nao existe
        assert "RADIX_WHISPER_CHAVE=${WHISPER_CHAVE" in compose.read_text(encoding="utf-8")


def test_13_2_1_producao_nao_liga_sem_chave_do_servico_de_voz(monkeypatch):
    from app.core.config import Settings

    base = dict(DATABASE_URL="postgresql://x", JWT_SECRET_KEY="k" * 40, ORTHANC_PASSWORD="x", ENVIRONMENT="production")
    with pytest.raises(ValueError, match="WHISPER_CHAVE"):
        Settings(**base, WHISPER_CHAVE="curta")
    assert Settings(**base, WHISPER_CHAVE="c" * 64).WHISPER_CHAVE == "c" * 64


def test_15_3_2_chamadas_de_saida_nao_seguem_redirecionamento():
    assert orthanc_client._client.follow_redirects is False
    voz = (BACKEND / "modules" / "voz_router.py").read_text(encoding="utf-8")
    assert "follow_redirects=True" not in voz


def test_14_2_2_sem_cache_de_dados_no_servidor():
    achados = [a.name for a, c in _codigo_python() if re.search(r"lru_cache|functools\.cache\b|redis|cachetools", c)]
    # unica excecao aceita: a lista fixa de senhas comuns (nao e dado de usuario)
    assert set(achados) <= {"politica_senha.py"}, achados


@pytest.mark.skipif(not TEM_FRONTEND, reason="pasta frontend indisponivel neste ambiente")
def test_14_2_3_sem_rastreadores_de_terceiros():
    padrao = re.compile(r"googletagmanager|google-analytics|gtag\(|hotjar|facebook\.net|clarity\.ms|segment\.(com|io)|mixpanel|sentry", re.I)
    achados = [str(a) for a, c in _codigo_frontend() if padrao.search(c)]
    externos = [f"{a.name}: {m}" for a, c in _codigo_frontend() for m in re.findall(r"<script[^>]+src=['\"](https?://[^'\"]+)", c)]
    assert not achados and not externos, (achados, externos)


@pytest.mark.skipif(not TEM_FRONTEND, reason="pasta frontend indisponivel neste ambiente")
def test_14_3_3_navegador_guarda_so_preferencias():
    chaves = set()
    for a, c in _codigo_frontend():
        chaves |= set(re.findall(r"(?:local|session)Storage\.setItem\(\s*([A-Z_a-z'\"][^,]*),", c))
    permitidas = {"CHAVE", "CHAVE_VISTO"}  # tema e "guia de laudo ja visto"
    assert chaves <= permitidas, chaves
    tema = (FRONTEND / "lib" / "tema.ts").read_text(encoding="utf-8")
    guia = (FRONTEND / "components" / "curadoria" / "GuiaLaudo.tsx").read_text(encoding="utf-8")
    assert re.search(r"CHAVE\s*=\s*['\"]tema['\"]", tema)
    assert "CHAVE_VISTO" in guia


# ---------------------------------------------------------------- V15 codigo seguro
def test_15_3_3_atribuicao_em_massa_nao_muda_perfil_nem_status(client, criar_usuario, criar_ficha, db):
    admin, cab_admin = _entrar(client, UserRole.administrador, criar_usuario)
    alvo = criar_usuario(perfil=UserRole.estudante)
    r = client.patch(f"/users/{alvo.id}", headers=cab_admin,
                     json={"nome": "Nome Novo", "perfil": "administrador", "bloqueado": True, "senha_hash": "x"})
    assert r.status_code == 200, r.text
    db.expire_all()
    assert alvo.nome == "Nome Novo" and alvo.perfil == UserRole.estudante and not alvo.bloqueado
    _, cab = _entrar(client, UserRole.curador, criar_usuario)
    ficha = criar_ficha(status="pendente")
    r = client.patch(f"/curation/{ficha.id}", headers=cab, json={"status": "aprovada", "curador_id": admin.id})
    db.expire_all()
    assert ficha.status == "pendente" and ficha.curador_id != admin.id


@pytest.mark.skipif(not TEM_FRONTEND, reason="pasta frontend indisponivel neste ambiente")
def test_15_3_5_comparacoes_estritas_e_typescript_estrito():
    import json
    config = json.loads(re.sub(r"//.*", "", (FRONTEND.parent / "tsconfig.json").read_text(encoding="utf-8")))
    assert config["compilerOptions"]["strict"] is True
    frouxas = [f"{a.name}: {l.strip()}" for a, c in _codigo_frontend() for l in c.splitlines()
               if re.search(r"[^=!<>]==[^=]|!=[^=]", l) and not l.strip().startswith(("//", "*"))]
    assert not frouxas, frouxas[:5]


@pytest.mark.skipif(not TEM_FRONTEND, reason="pasta frontend indisponivel neste ambiente")
def test_15_3_6_sem_fusao_profunda_de_objetos_vindos_de_fora():
    padrao = re.compile(r"__proto__|lodash\.merge|deepmerge|_\.merge\(|\$\.extend\(\s*true")
    achados = [f"{a.name}: {l.strip()}" for a, c in _codigo_frontend() for l in c.splitlines() if padrao.search(l)]
    assert not achados, achados


def test_15_3_7_parametro_repetido_nao_causa_erro_nem_ambiguidade(client, criar_usuario):
    _, cab = _entrar(client, UserRole.estudante, criar_usuario)
    r = client.get("/search?tipo_radiografia=periapical&tipo_radiografia=panoramica&limit=5", headers=cab)
    assert r.status_code in (200, 422)
    r2 = client.get("/search?limit=5&limit=100000", headers=cab)
    assert r2.status_code in (200, 422)  # nunca 500 nem "limite ignorado"
    if r2.status_code == 200:
        assert len(r2.json().get("resultados", r2.json() if isinstance(r2.json(), list) else [])) <= 200


# ---------------------------------------------------------------- V16 registros
def test_16_2_2_horarios_com_fuso_horario():
    from app.modules.audit_logs import AuditLog as Modelo
    assert Modelo.__table__.c.criado_em.type.timezone is True


def test_16_3_1_e_16_2_5_login_registrado_sem_guardar_a_senha(client, criar_usuario, db):
    usuario = criar_usuario()
    client.cookies.clear()
    senha_errada = "SenhaErradaQueNaoPodeAparecer-" + uuid.uuid4().hex[:6]
    client.post("/auth/login", data={"username": usuario.email, "password": senha_errada})
    obter_token(client, usuario.email)
    registros = db.query(AuditLog).filter(AuditLog.usuario_id == usuario.id).all()
    acoes = {r.acao for r in registros}
    assert {"login", "falha_login"} <= acoes
    for r in registros:
        assert senha_errada not in (r.detalhes or "") and SENHA_TESTE not in (r.detalhes or "")
    client.cookies.clear()


def test_16_4_1_quebra_de_linha_nao_cria_registro_falso(client, db):
    """Login com e-mail inexistente contendo quebra de linha: um registro so, sem 'linha forjada'."""
    antes = db.query(AuditLog).filter(AuditLog.acao == "falha_login").count()
    client.post("/auth/login", data={"username": "x@teste.example\n2026-01-01 login admin sucesso", "password": "y"})
    depois = db.query(AuditLog).filter(AuditLog.acao == "falha_login").count()
    assert depois - antes <= 1


def test_16_5_1_erro_inesperado_responde_mensagem_generica():
    def rota_que_quebra():
        raise RuntimeError("segredo interno: senha=abc /app/codigo.py linha 42")
    app.add_api_route("/__teste_erro_interno", rota_que_quebra, methods=["GET"])
    try:
        r = TestClient(app, raise_server_exceptions=False).get("/__teste_erro_interno")
        assert r.status_code == 500
        assert "segredo" not in r.text and "Traceback" not in r.text and ".py" not in r.text
    finally:
        app.router.routes[:] = [rt for rt in app.router.routes if getattr(rt, "path", "") != "/__teste_erro_interno"]


def test_16_5_2_orthanc_fora_do_ar_nao_derruba_a_api(client, monkeypatch):
    def fora(*a, **k):
        raise httpx.ConnectError("Orthanc indisponivel")
    monkeypatch.setattr(orthanc_client, "listar_instancias", fora)
    r = client.get("/health/orthanc")
    assert r.status_code == 200 and r.json()["status"] == "erro"
    assert client.get("/health").status_code == 200


def test_16_5_3_falha_na_anonimizacao_nao_registra_imagem_e_apaga_original(monkeypatch, db):
    """Fail closed: se a anonimizacao falha, o original identificavel e apagado e nada e registrado."""
    from app.modules import images_router
    from app.modules.orthanc_references import OrthancReference
    apagados = []
    monkeypatch.setattr(images_router.orthanc_client, "anonimizar_instancia",
                        lambda oid: (_ for _ in ()).throw(RuntimeError("falhou")))
    monkeypatch.setattr(images_router.orthanc_client, "excluir_instancia", lambda oid: apagados.append(oid))
    monkeypatch.setattr(images_router, "_determinar_origem", lambda oid: "externa")
    oid = f"suite-falha-{uuid.uuid4().hex[:8]}"
    with pytest.raises(RuntimeError):
        images_router._registrar_referencia_se_nova(db, oid)
    assert apagados == [oid]
    assert db.query(OrthancReference).filter(OrthancReference.orthanc_id == oid).count() == 0


# ------------------------------------------------ reforcos de 18/10 (grupo 1)
def test_11_2_3_chave_curta_impede_producao_de_ligar(monkeypatch):
    """Antes so se testava a biblioteca; agora a CONFIGURACAO e conferida."""
    from app.core.config import JWT_CHAVE_MIN_BYTES, Settings
    base = {"DATABASE_URL": "postgresql://x/y", "ORTHANC_PASSWORD": "x", "WHISPER_CHAVE": "c" * 64}
    with pytest.raises(ValueError, match="JWT_SECRET_KEY"):
        Settings(JWT_SECRET_KEY="curta", ENVIRONMENT="production", **base)
    with pytest.warns(UserWarning):
        Settings(JWT_SECRET_KEY="curta", ENVIRONMENT="development", **base)
    ok = Settings(JWT_SECRET_KEY="k" * JWT_CHAVE_MIN_BYTES, ENVIRONMENT="production", **base)
    assert ok.JWT_SECRET_KEY


def test_16_2_5_sem_smtp_em_producao_o_codigo_do_link_nao_vai_para_o_registro(monkeypatch, caplog):
    from app.core import email as modulo_email
    monkeypatch.setattr(modulo_email.settings, "SMTP_HOST", "")
    monkeypatch.setattr(modulo_email.settings, "ENVIRONMENT", "production")
    with caplog.at_level("INFO"):
        modulo_email.enviar_email("a@b.c", "Redefinir senha", "<a href='x#token=CODIGO-SECRETO'>link</a>")
    assert "CODIGO-SECRETO" not in caplog.text and "NAO enviado" in caplog.text


def test_11_2_2_senha_em_padrao_antigo_e_regravada_no_login(client, criar_usuario, db):
    """Agilidade criptografica: resumo com custo antigo vira o padrao atual no proximo login."""
    from passlib.hash import bcrypt as bcrypt_hash
    from tests.conftest import SENHA_TESTE
    usuario = criar_usuario(perfil=UserRole.estudante)
    usuario.senha_hash = bcrypt_hash.using(rounds=4).hash(SENHA_TESTE)
    db.commit()
    client.cookies.clear()
    assert client.post("/auth/login", data={"username": usuario.email, "password": SENHA_TESTE}).status_code == 200
    db.refresh(usuario)
    assert usuario.senha_hash.startswith("$argon2id$")  # bcrypt antigo regravado no padrao atual
    client.cookies.clear()
