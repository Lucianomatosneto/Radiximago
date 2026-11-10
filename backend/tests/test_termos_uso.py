"""
Termos de Uso, anexo por perfil e Politica de Privacidade (10/11/2026,
decisoes do Luciano): aceite obrigatorio no primeiro acesso e a cada nova
versao; textos sempre disponiveis, tambem sem login.
"""

from fastapi.testclient import TestClient

from app.main import app
from app.modules import termos_uso
from app.modules.audit_logs import AuditLog
from app.modules.termos_uso import CODIGO_PENDENTE, TERMOS_VERSAO, AceiteTermosUso
from app.modules.users import UserRole
from tests.conftest import SENHA_TESTE, completar_segundo_fator


def _login(email: str) -> TestClient:
    app.state.limiter.reset()
    nav = TestClient(app)
    r = completar_segundo_fator(nav, email, nav.post("/auth/login", data={"username": email, "password": SENHA_TESTE}))
    assert r.status_code == 200, r.text
    return nav


def _aceitar(nav, perfil, versao=TERMOS_VERSAO, concordo=True):
    return nav.post("/termos/aceitar", json={"versao": versao, "anexo": perfil, "li_e_concordo": concordo})


def test_textos_publicos_sem_login_com_anexo_de_cada_perfil(client):
    r = TestClient(app).get("/termos")
    assert r.status_code == 200
    d = r.json()
    assert d["versao"] == TERMOS_VERSAO and "Termos de Uso" in d["termos_uso"] and "Política de Privacidade" in d["privacidade"]
    assert set(d["perfis"]) == {p.value for p in UserRole}
    for texto in [d["termos_uso"], d["privacidade"], *d["perfis"].values()]:
        assert "{versao}" not in texto and "{vigencia}" not in texto
    # pontos que nao podem faltar
    assert "não tem finalidade assistencial nem diagnóstica" in d["termos_uso"]
    assert "privacidade@radiximago.com.br" in d["privacidade"] and "art. 18" in d["privacidade"]
    assert "anonimização" in d["perfis"]["curador"].lower()


def test_primeiro_acesso_bloqueia_ate_aceitar_e_depois_vem_o_termo_de_ciencia(criar_usuario, db):
    u = criar_usuario(perfil=UserRole.professor)
    nav = _login(u.email)
    assert nav.get("/auth/me").json()["termos_uso_pendentes"] is True
    r = nav.get("/search")
    assert r.status_code == 403 and r.json()["detail"] == CODIGO_PENDENTE
    meus = nav.get("/termos/meus").json()
    assert meus["pendente"] is True and meus["primeiro_aceite"] is True and meus["perfil"] == "professor"
    assert meus["documentos"]["anexo_perfil"].startswith("# Anexo — Perfil Professor")

    assert _aceitar(nav, "professor", concordo=False).status_code == 422
    assert _aceitar(nav, "professor", versao="0.1").status_code == 409
    assert _aceitar(nav, "estudante").status_code == 409            # anexo de outro perfil
    assert _aceitar(nav, "professor").status_code == 200
    # agora falta o termo de ciencia desta sessao
    assert nav.get("/search").json()["detail"] == "termo_ciencia_pendente"

    aceite = db.query(AceiteTermosUso).filter(AceiteTermosUso.usuario_id == u.id).one()
    assert aceite.versao == TERMOS_VERSAO and aceite.perfil == "professor"
    assert aceite.resumo_textos == termos_uso.resumo_do_perfil("professor") and len(aceite.resumo_textos) == 64
    assert db.query(AuditLog).filter(AuditLog.usuario_id == u.id, AuditLog.acao == "termos_uso_aceitos").count() == 1

    # no proximo login os termos ja estao aceitos (so o termo de ciencia volta)
    outro = _login(u.email)
    assert outro.get("/termos/meus").json()["pendente"] is False
    assert outro.get("/search").json()["detail"] == "termo_ciencia_pendente"


def test_nova_versao_ou_novo_perfil_pedem_novo_aceite(criar_usuario, db, monkeypatch):
    u = criar_usuario()
    nav = _login(u.email)
    assert _aceitar(nav, "estudante").status_code == 200
    monkeypatch.setattr(termos_uso, "TERMOS_VERSAO", "9.9")
    assert nav.get("/termos/meus").json()["pendente"] is True
    assert nav.get("/search").json()["detail"] == CODIGO_PENDENTE
    assert _aceitar(nav, "estudante", versao="9.9").status_code == 200
    monkeypatch.undo()

    u.perfil = UserRole.curador                                  # o administrador trocou o perfil
    db.commit()
    meus = nav.get("/termos/meus").json()
    assert meus["pendente"] is True and meus["primeiro_aceite"] is False
    assert [h["versao"] for h in meus["historico"]] == ["9.9", TERMOS_VERSAO]


def test_recusar_encerra_a_sessao(criar_usuario, db):
    u = criar_usuario()
    nav = _login(u.email)
    assert nav.post("/termos/recusar").status_code == 200
    assert nav.get("/auth/me").status_code == 401
    assert db.query(AuditLog).filter(AuditLog.usuario_id == u.id, AuditLog.acao == "termos_uso_recusados").count() == 1


def test_telas_dos_termos():
    from pathlib import Path

    front = Path(__file__).resolve().parents[2] / "frontend/src"
    pagina = (front / "app/termos/page.tsx").read_text(encoding="utf-8")
    assert "/termos" in pagina and "window.print" in pagina
    guarda = (front / "components/TermoCiencia.tsx").read_text(encoding="utf-8")
    assert "/termos/meus" in guarda and "<AceiteTermosUso" in guarda
    janela = (front / "components/termos/AceiteTermosUso.tsx").read_text(encoding="utf-8")
    assert "/termos/aceitar" in janela and "/termos/recusar" in janela and "leuAteOFim" in janela
    assert "/termos" in (front / "app/login/page.tsx").read_text(encoding="utf-8")
