"""
- OWASP ASVS 2.2.1: textos e listas tem tamanho maximo (app/core/limites.py);
  acima do limite a API responde 422 com mensagem clara, nunca erro 500.
- OWASP ASVS 14.2.1: o codigo dos links enviados por e-mail vai depois do
  "#" (nunca chega a servidores/logs), nao na parte "?..." do endereco.
"""

import uuid

import app.modules.auth as auth_module
from app.core.database import SessionLocal
from app.core.limites import MAX_DENTES, NOME_MAX, TEXTO_LONGO_MAX, TEXTO_MEDIO_MAX
from app.modules.access_requests import AccessRequest
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


def _curador(client, criar_usuario):
    usuario = criar_usuario(perfil=UserRole.curador)
    client.cookies.clear()
    return cabecalho_auth(obter_token(client, usuario.email))


def test_texto_da_ficha_no_limite_passa_e_acima_e_recusado(client, criar_usuario, criar_ficha):
    cab = _curador(client, criar_usuario)
    ficha = criar_ficha(status="pendente")
    r = client.patch(f"/curation/{ficha.id}", json={"descricao_didatica": "a" * TEXTO_LONGO_MAX}, headers=cab)
    assert r.status_code == 200, r.text
    r = client.patch(f"/curation/{ficha.id}", json={"descricao_didatica": "a" * (TEXTO_LONGO_MAX + 1)}, headers=cab)
    assert r.status_code == 422
    r = client.patch(f"/curation/{ficha.id}", json={"observacoes_internas": "b" * (TEXTO_LONGO_MAX + 1)}, headers=cab)
    assert r.status_code == 422
    client.cookies.clear()


def test_listas_da_ficha_tem_tamanho_maximo(client, criar_usuario, criar_ficha):
    cab = _curador(client, criar_usuario)
    ficha = criar_ficha(status="pendente")
    r = client.patch(f"/curation/{ficha.id}", json={"dentes": [11] * (MAX_DENTES + 1)}, headers=cab)
    assert r.status_code == 422
    client.cookies.clear()


def test_motivo_de_descarte_e_revisao_limitados(client, criar_usuario, criar_ficha):
    cab = _curador(client, criar_usuario)
    ficha = criar_ficha(status="pendente")
    r = client.post(f"/curation/{ficha.id}/discard", json={"motivo": "x" * (TEXTO_MEDIO_MAX + 1)}, headers=cab)
    assert r.status_code == 422
    client.cookies.clear()


def test_nome_maior_que_a_coluna_do_banco_vira_422_e_nao_500(client):
    r = client.post("/auth/request-access", json={
        "nome": "N" * (NOME_MAX + 1), "email": f"limite-{uuid.uuid4().hex[:8]}@teste.example",
        "senha": "frase longa e segura", "perfil_solicitado": "estudante"})
    assert r.status_code == 422


def test_links_do_email_levam_o_codigo_depois_do_jogo_da_velha(client, criar_usuario, monkeypatch):
    usuario = criar_usuario(perfil=UserRole.estudante)
    links = []
    monkeypatch.setattr(auth_module, "enviar_email_redefinicao_senha",
                        lambda destinatario, nome, link_reset, idioma="pt": links.append(link_reset))
    assert client.post("/auth/forgot-password", json={"email": usuario.email}).status_code == 200
    assert "/redefinir-senha#token=" in links[0] and "?" not in links[0]


def test_link_de_confirmacao_de_cadastro_tambem_usa_o_jogo_da_velha(client, monkeypatch):
    links = []
    monkeypatch.setattr(auth_module, "enviar_email_confirmacao_cadastro",
                        lambda destinatario, nome, link, *a, **k: links.append(link))
    email = f"link-{uuid.uuid4().hex[:8]}@teste.example"
    try:
        r = client.post("/auth/request-access", json={
            "nome": "Pessoa Teste", "email": email,
            "senha": "frase longa e segura", "perfil_solicitado": "estudante"})
        assert r.status_code == 201, r.text
        assert "/confirmar-email#token=" in links[0] and "?" not in links[0]
    finally:  # nao deixa o pedido de teste no banco
        db = SessionLocal()
        db.query(AccessRequest).filter(AccessRequest.email == email).delete()
        db.commit()
        db.close()
