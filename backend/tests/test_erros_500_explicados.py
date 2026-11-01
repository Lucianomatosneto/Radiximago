"""
Erros 500 com causa e mensagem clara (01/11/2026 - auditoria do
administrador, A2).

Causa confirmada nos registros: "column curations.regioes_imagem does not
exist" - o codigo novo rodou antes do "alembic upgrade head". Agora:
- banco sem a atualizacao -> 503 "o sistema esta sendo atualizado" +
  Retry-After, com codigo de referencia (na resposta, no registro e na
  auditoria);
- outro erro inesperado -> 500 com codigo de referencia, sem detalhe tecnico;
- Painel administrativo: "erros nas ultimas 24 h" e "atualizacao pendente";
- textos especiais na descricao (HTML, aspas, &, emoji, \\, %, controle) nao
  derrubam ficha nem busca.
"""

from fastapi.testclient import TestClient
from sqlalchemy.exc import ProgrammingError

from app.core.migracoes import estado_das_migracoes
from app.main import app
from app.modules.audit_logs import AuditLog
from app.modules.curations import StatusCuradoria
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


class _ColunaInexistente(Exception):
    pgcode = "42703"


def test_banco_desatualizado_vira_503_com_mensagem_clara(db):
    def rota():
        raise ProgrammingError("SELECT curations.regioes_imagem", {}, _ColunaInexistente("does not exist"))
    app.add_api_route("/__teste_banco_desatualizado", rota, methods=["GET"])
    r = TestClient(app, raise_server_exceptions=False).get("/__teste_banco_desatualizado")
    assert r.status_code == 503 and r.headers.get("retry-after") == "60"
    corpo = r.json()
    assert "atualização do banco" in corpo["detail"] and corpo["codigo"] in corpo["detail"]
    assert "regioes_imagem" not in r.text  # nada tecnico para o usuario
    ultimo = db.query(AuditLog).filter(AuditLog.acao == "erro_inesperado").order_by(AuditLog.id.desc()).first()
    assert corpo["codigo"] in ultimo.detalhes and "banco_desatualizado" in ultimo.detalhes


def test_erro_inesperado_traz_codigo_de_referencia():
    def rota():
        raise RuntimeError("detalhe interno")
    app.add_api_route("/__teste_erro_codigo", rota, methods=["GET"])
    r = TestClient(app, raise_server_exceptions=False).get("/__teste_erro_codigo")
    assert r.status_code == 500 and r.json()["codigo"] in r.json()["detail"]
    assert "detalhe interno" not in r.text


def test_migracoes_em_dia_e_painel(client, db, criar_usuario):
    assert estado_das_migracoes(db)["pendente"] is False  # banco de testes em dia
    cab = cabecalho_auth(obter_token(client, criar_usuario(perfil=UserRole.administrador).email))
    dados = client.get("/admin/stats", headers=cab).json()
    assert dados["migracao_pendente"] is False and isinstance(dados["erros_24h"], int)


def test_texto_especial_nao_derruba_ficha_nem_busca(client, criar_usuario, criar_ficha):
    texto = 'QA TESTE <b>negrito</b> <img src=x onerror=window.__xss=1> "aspas" & ação 😀 \\ % \x01 fim'
    f = criar_ficha(status=StatusCuradoria.EM_ANALISE.value, tipo_radiografia="panoramica")
    cab = cabecalho_auth(obter_token(client, criar_usuario(perfil=UserRole.curador).email))
    assert client.patch(f"/curation/{f.id}", json={"descricao_didatica": texto, "observacoes_internas": texto}, headers=cab).status_code == 200
    assert client.get(f"/curation/{f.id}", headers=cab).status_code == 200
    for termo in ("texto:negrito", "texto:ação", "texto:%", "texto:\\"):
        assert client.get("/search", params={"termos": termo}, headers=cab).status_code == 200, termo


def test_orthanc_fora_vira_502_claro(client, criar_usuario, criar_ficha, monkeypatch):
    """Reteste do administrador: GET /curation/61/preview deu 500 com o
    Orthanc ocupado. Agora: 502 'o servidor de imagens nao respondeu'."""
    import httpx

    from app.modules import orthanc_client

    def falha(*a, **k):
        raise httpx.ConnectError("Orthanc fora")
    monkeypatch.setattr(orthanc_client, "obter_preview_instancia", falha)
    f = criar_ficha()
    cab = cabecalho_auth(obter_token(client, criar_usuario(perfil=UserRole.curador).email))
    r = TestClient(app, raise_server_exceptions=False).get(
        f"/curation/{f.orthanc_reference_id}/preview", headers=cab)
    assert r.status_code == 502 and "servidor de imagens" in r.json()["detail"]
    assert "Orthanc fora" not in r.text
