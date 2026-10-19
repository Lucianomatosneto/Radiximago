"""
Nivel 2 do OWASP ASVS 5.0 - grupo 4 (regras e anti-abuso), parte que nao e
limite de frequencia (essa fica em test_anti_abuso.py):

- 5.4.1  nome de arquivo definido pelo servidor em Content-Disposition;
- 3.4.3  politica de conteudo (CSP) das telas;
- 1.3.3  dado limitado/neutralizado antes de contextos perigosos
         (auditoria, e-mail HTML, cabecalho HTTP);
- 2.2.3  combinacoes de campos coerentes;
- 8.2.3  acesso por campo na ESCRITA (anti-"BOPLA": ninguem altera campo
         que nao pode mandando-o a mais no pedido).
"""

import ast
import os
import re
from pathlib import Path

import pytest

from app.core.cabecalhos import disposicao_de_arquivo
from app.core.limites import EMAIL_MAX
from app.main import app
from app.modules import search_router
from app.modules.audit_logs import AuditLog
from app.modules.curations import StatusCuradoria
from app.modules.users import User, UserRole
from tests.conftest import cabecalho_auth, obter_token
from tests.test_avatar_upload import _png_minimo

APP = Path(__file__).resolve().parents[1] / "app"
FRONTEND = Path(__file__).resolve().parents[2] / "frontend"


# --- 5.4.1 ----------------------------------------------------------------

def test_5_4_1_nome_do_arquivo_nao_quebra_o_cabecalho():
    assert disposicao_de_arquivo("radix-imago-12.png") == 'inline; filename="radix-imago-12.png"'
    assert disposicao_de_arquivo("a.zip", baixar=True) == 'attachment; filename="a.zip"'
    perigoso = disposicao_de_arquivo('x"; filename="mal.exe\r\nSet-Cookie: a=b')
    assert perigoso.count('"') == 2 and "\r" not in perigoso and "\n" not in perigoso


def test_5_4_1_toda_resposta_de_arquivo_define_o_nome():
    """Analise do codigo: todo Response(content=...) da API leva Content-Disposition."""
    faltando = []
    for arquivo in APP.rglob("*.py"):
        arvore = ast.parse(arquivo.read_text(encoding="utf-8-sig"))
        for no in ast.walk(arvore):
            if isinstance(no, ast.Call) and getattr(no.func, "id", "") == "Response":
                chaves = {k.arg for k in no.keywords}
                if "content" in chaves and "Content-Disposition" not in ast.unparse(no):
                    faltando.append(f"{arquivo.name}:{no.lineno}")
    assert not faltando, faltando


def test_5_4_1_miniatura_e_zip_saem_com_nome_do_servidor(client, criar_usuario, criar_ficha, monkeypatch):
    usuario = criar_usuario()
    token = obter_token(client, usuario.email)
    ficha = criar_ficha()
    monkeypatch.setattr(search_router.orthanc_client, "obter_preview_instancia", lambda i: b"\x89PNG-falso")
    monkeypatch.setattr(search_router.orthanc_client, "obter_arquivo_zip_estudo", lambda i: b"PK-falso")
    monkeypatch.setattr(search_router, "_instancias_do_estudo_da_ficha", lambda f: ("estudo", ["c1", "c2"]))
    r = client.get(f"/search/{ficha.id}/preview", headers=cabecalho_auth(token))
    assert r.status_code == 200
    assert r.headers["content-disposition"] == f'inline; filename="radix-imago-{ficha.id}.png"'
    for tipo in ("imagens", "dicom"):
        r = client.get(f"/search/{ficha.id}/download/{tipo}.zip", headers=cabecalho_auth(token))
        assert r.status_code == 200
        assert r.headers["content-disposition"] == f'attachment; filename="radix-imago-{ficha.id}-{tipo}.zip"'


def test_5_4_1_foto_de_perfil_ignora_o_nome_enviado(client, criar_usuario):
    usuario = criar_usuario()
    token = obter_token(client, usuario.email)
    r = client.post(
        "/users/me/avatar",
        headers=cabecalho_auth(token),
        files={"arquivo": ('../../mal"nome.png', _png_minimo(), "image/png")},
    )
    assert r.status_code == 200, r.text
    url = r.json()["foto_perfil_url"]
    try:
        assert "mal" not in url and ".." not in url
        foto = client.get(url)
        assert foto.status_code == 200
        nome = url.rsplit("/", 1)[-1]
        assert foto.headers["content-disposition"] == f'inline; filename="{nome}"'
    finally:
        caminho = APP.parent / "uploads" / "avatars" / os.path.basename(url)
        if caminho.is_file():
            caminho.unlink()


# --- 3.4.3 ----------------------------------------------------------------

@pytest.mark.skipif(not FRONTEND.is_dir(), reason="pasta frontend indisponivel neste ambiente")
def test_3_4_3_telas_com_politica_de_conteudo_completa():
    config = (FRONTEND / "next.config.mjs").read_text(encoding="utf-8")
    for diretiva in ("default-src 'self'", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'",
                     "form-action 'self'", "frame-src ${ORIGEM_OHIF}"):
        assert diretiva in config, diretiva
    assert "{ key: 'Content-Security-Policy', value: POLITICA_DE_CONTEUDO }" in config
    # nada de curinga ("*" ou "https:") liberando qualquer site
    politica = config.split("POLITICA_DE_CONTEUDO = [", 1)[1].split("].join", 1)[0]
    assert not re.search(r"(?<![\w-])\*(?![\w.])|\bhttps?:(?!//)", politica), politica


# --- 1.3.3 ----------------------------------------------------------------

def test_1_3_3_login_com_email_gigante_nao_vai_para_a_auditoria(client, db):
    enorme = "a" * 100_000 + "@teste.example"
    r = client.post("/auth/login", data={"username": enorme, "password": "x"})
    assert r.status_code == 422
    assert db.query(AuditLog).filter(AuditLog.detalhes.like("%aaaaaaaaaa%" * 3)).count() == 0
    r = client.post("/auth/login", data={"username": "nao-existe@teste.example", "password": "p" * 100_000})
    assert r.status_code == 422


def test_1_3_3_todo_texto_recebido_tem_tamanho_maximo():
    """Contrato da API: todo campo de texto de entrada (corpo, endereco e consulta)
    tem limite, lista fechada ou e arquivo (cujo tamanho a rota confere)."""
    spec = app.openapi()
    comps = spec["components"]["schemas"]

    def refs(o):
        if isinstance(o, dict):
            for k, v in o.items():
                yield from ([v.split("/")[-1]] if k == "$ref" else refs(v))
        elif isinstance(o, list):
            for v in o:
                yield from refs(v)

    def sem_limite(esquema: dict) -> bool:
        return (
            esquema.get("type") == "string"
            and not ({"maxLength", "enum", "const", "contentMediaType"} & esquema.keys())
            # datas, e-mail e arquivo sao convertidos/conferidos antes de chegar a rota
            and esquema.get("format") not in ("binary", "date", "date-time", "email")
        )

    # formulario padrao de login (OAuth2): conferido na rota (teste acima)
    excecoes = {("Body_login_auth_login_post", c) for c in ("username", "password", "scope", "client_id", "client_secret", "grant_type")}
    problemas = []
    for caminho, operacoes in spec["paths"].items():
        for metodo, op in operacoes.items():
            for p in op.get("parameters", []):
                for alt in p.get("schema", {}).get("anyOf", [p.get("schema", {})]):
                    if sem_limite(alt):
                        problemas.append(f"{metodo} {caminho} ?{p['name']}")
            pendentes, vistos = list(refs(op.get("requestBody", {}))), set()
            while pendentes:
                nome = pendentes.pop()
                if nome in vistos:
                    continue
                vistos.add(nome)
                pendentes += list(refs(comps[nome]))
                for campo, prop in comps[nome].get("properties", {}).items():
                    for alt in prop.get("anyOf", [prop]):
                        if sem_limite(alt) and (nome, campo) not in excecoes:
                            problemas.append(f"{nome}.{campo}")
                        if alt.get("type") == "array" and "maxItems" not in alt:
                            problemas.append(f"{nome}.{campo}[]")
    assert not problemas, problemas


def test_1_3_3_links_dos_emails_escapados():
    """Todo valor colocado em href dos e-mails passa por escape (contexto HTML)."""
    codigo = (APP / "core" / "email.py").read_text(encoding="utf-8")
    hrefs = re.findall(r'href="\{([^}]*)\}', codigo)
    assert hrefs and all(h.startswith("escape(") for h in hrefs), hrefs


# --- 2.2.3 ----------------------------------------------------------------

def test_2_2_3_busca_com_faixa_de_idade_invertida(client, criar_usuario):
    usuario = criar_usuario()
    token = obter_token(client, usuario.email)
    r = client.get("/search?idade_min=40&idade_max=20", headers=cabecalho_auth(token))
    assert r.status_code == 422
    assert client.get("/search?idade_min=20&idade_max=40", headers=cabecalho_auth(token)).status_code == 200


def test_2_2_3_marcacao_sem_as_coordenadas_do_proprio_formato(client, criar_usuario, criar_ficha):
    curador = criar_usuario(perfil=UserRole.curador)
    token = obter_token(client, curador.email)
    ficha = criar_ficha(status=StatusCuradoria.PENDENTE.value)
    seta_sem_ponta = {"id": "m1", "tipo": "seta", "x1": 0.1, "y1": 0.1}
    oval_sem_tamanho = {"id": "m2", "tipo": "oval", "x": 0.2, "y": 0.2}
    for marca in (seta_sem_ponta, oval_sem_tamanho):
        r = client.patch(f"/curation/{ficha.id}", json={"marcacoes": [marca]}, headers=cabecalho_auth(token))
        assert r.status_code == 422, marca
    certa = {"id": "m3", "tipo": "seta", "x1": 0.1, "y1": 0.1, "x2": 0.3, "y2": 0.3}
    r = client.patch(f"/curation/{ficha.id}", json={"marcacoes": [certa]}, headers=cabecalho_auth(token))
    assert r.status_code == 200, r.text


def test_2_2_3_idade_da_ficha_coerente_com_o_valor_ja_gravado(client, criar_usuario, criar_ficha):
    curador = criar_usuario(perfil=UserRole.curador)
    token = obter_token(client, curador.email)
    ficha = criar_ficha(status=StatusCuradoria.PENDENTE.value)
    assert client.patch(f"/curation/{ficha.id}", json={"idade_min": 30, "idade_max": 40}, headers=cabecalho_auth(token)).status_code == 200
    # so um lado enviado: comparado com o outro, ja gravado
    assert client.patch(f"/curation/{ficha.id}", json={"idade_min": 50}, headers=cabecalho_auth(token)).status_code == 422


# --- 8.2.3 ----------------------------------------------------------------

# Campos "sensiveis" (quem e, que perfil tem, em que estado esta, de quem e)
# e as UNICAS entradas que podem recebe-los. Campo novo desse tipo num pedido
# faz este teste falhar ate alguem revisar quem pode envia-lo.
CAMPOS_SENSIVEIS = {
    "status", "perfil", "perfil_solicitado", "perfil_concedido", "curador_id", "senha_hash", "ativo",
    "bloqueado", "excluido", "usuario_id", "criado_por_id", "remetente_id", "destinatario_id", "id",
    "curation_id", "revisor_id", "solicitante_id", "email",
}
PERMITIDOS = {
    ("SolicitarRedefinicao", "email"),          # publico: o proprio e-mail
    ("SolicitarAcesso", "email"),               # publico: o proprio e-mail
    ("SolicitarAcesso", "perfil_solicitado"),   # so intencao (curador/estudante); quem decide e o admin
    ("AprovarSolicitacao", "perfil_concedido"), # so administrador
    ("UsuarioCriar", "email"),                  # so administrador
    ("UsuarioCriar", "perfil"),                 # so administrador
    ("Marcacao", "id"),                         # identificador do desenho, criado na tela
    ("CompartilharEntrada", "email"),           # e-mail do destinatario
    ("TermoEdicao", "ativo"),                   # curadoria: desativar termo do vocabulario
    ("MacroEdicao", "ativo"),                   # curadoria: desativar macro
}


def test_8_2_3_campos_sensiveis_so_entram_onde_foi_decidido():
    spec = app.openapi()
    comps = spec["components"]["schemas"]
    achados = set()
    for nome, esquema in comps.items():
        for campo in CAMPOS_SENSIVEIS & set(esquema.get("properties", {})):
            achados.add((nome, campo))
    corpos = set()
    for operacoes in spec["paths"].values():
        for op in operacoes.values():
            corpos |= set(re.findall(r"#/components/schemas/(\w+)", str(op.get("requestBody", {}))))
    # fecha a lista com os esquemas aninhados
    pendentes = list(corpos)
    while pendentes:
        for filho in re.findall(r"#/components/schemas/(\w+)", str(comps[pendentes.pop()])):
            if filho not in corpos:
                corpos.add(filho)
                pendentes.append(filho)
    de_entrada = {(n, c) for n, c in achados if n in corpos}
    assert de_entrada == PERMITIDOS, de_entrada ^ PERMITIDOS


def test_8_2_3_curador_nao_aprova_nem_troca_o_dono_mandando_campo_a_mais(client, criar_usuario, criar_ficha, db):
    curador, outro = criar_usuario(perfil=UserRole.curador), criar_usuario(perfil=UserRole.curador)
    token = obter_token(client, curador.email)
    ficha = criar_ficha(status=StatusCuradoria.PENDENTE.value)
    r = client.patch(
        f"/curation/{ficha.id}",
        json={"status": "aprovada", "curador_id": outro.id, "anonimizacao_validada": False, "descricao_didatica": "ok"},
        headers=cabecalho_auth(token),
    )
    assert r.status_code == 200, r.text
    db.refresh(ficha)
    assert ficha.status != StatusCuradoria.APROVADA.value
    assert ficha.curador_id != outro.id


def test_8_2_3_ninguem_se_promove(client, criar_usuario, db):
    estudante = criar_usuario()
    token = obter_token(client, estudante.email)
    # rota de administrador
    r = client.patch(f"/users/{estudante.id}", json={"nome": "Novo", "perfil": "administrador"}, headers=cabecalho_auth(token))
    assert r.status_code == 403
    # pedido de acesso publico nao aceita perfil de administrador
    r = client.post("/auth/request-access", json={
        "nome": "Teste", "email": "promocao@teste.example", "senha": "frase longa e segura 2026",
        "perfil_solicitado": "administrador"})
    assert r.status_code == 422
    db.refresh(estudante)
    assert db.get(User, estudante.id).perfil == UserRole.estudante


def test_8_2_3_admin_editando_usuario_nao_muda_perfil_por_campo_a_mais(client, criar_usuario, db):
    admin, alvo = criar_usuario(perfil=UserRole.administrador), criar_usuario()
    token = obter_token(client, admin.email)
    r = client.patch(f"/users/{alvo.id}", json={"nome": "Nome Novo", "bloqueado": True, "email": "x" * 3 + "@y.example"},
                     headers=cabecalho_auth(token))
    assert r.status_code == 200, r.text
    db.expire_all()
    atual = db.get(User, alvo.id)
    assert atual.nome == "Nome Novo" and atual.bloqueado is False and atual.email == alvo.email
    assert len(atual.email) <= EMAIL_MAX


@pytest.mark.skipif(not FRONTEND.is_dir(), reason="pasta frontend indisponivel neste ambiente")
def test_2_3_2_tela_avisa_o_mesmo_teto_do_servidor():
    from app.core.rate_limit import MAX_IMAGENS_EMAIL_LOTE

    tela = (FRONTEND / "src" / "app" / "minhas-imagens" / "page.tsx").read_text(encoding="utf-8")
    assert f"const MAX_IMAGENS_EMAIL_LOTE = {MAX_IMAGENS_EMAIL_LOTE}\n" in tela
