"""
Decisao de 02/11/2026 (teste de permissoes por perfil):
- SUPORTE nao faz curadoria: so le (fichas, fila, indicadores); qualquer
  gravacao (aprovar, descartar, editar, achados, vocabulario, macros, voz)
  e recusada com 403.
"""


import pytest

from app.main import app
from app.modules.audit_logs import AuditLog
from app.modules.curations import StatusCuradoria
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth
from tests.conftest import obter_token as _obter_token


def obter_token(client, email):
    app.state.limiter.reset()
    return _obter_token(client, email)


ESCRITAS_CURADORIA = [
    ("post", "/curation/{id}/approve", {"anonimizacao_validada": True}),
    ("post", "/curation/{id}/discard", {"motivo": "teste"}),
    ("post", "/curation/{id}/reabrir", {}),
    ("patch", "/curation/{id}", {}),
    ("post", "/curation/{id}/request-review", {}),
    ("post", "/curation/{id}/achados", {}),
    ("post", "/vocabulario/termos", {}),
    ("post", "/macros", {}),
]


@pytest.mark.parametrize("metodo,rota,corpo", ESCRITAS_CURADORIA)
def test_suporte_nao_grava_na_curadoria(client, criar_usuario, criar_ficha, metodo, rota, corpo):
    suporte = criar_usuario(perfil=UserRole.suporte)
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)
    h = cabecalho_auth(obter_token(client, suporte.email))
    r = getattr(client, metodo)(rota.format(id=ficha.id), headers=h, json=corpo)
    assert r.status_code == 403


@pytest.mark.parametrize("rota", ["/curation/pending", "/curation/reviews/pending", "/vocabulario", "/macros"])
def test_suporte_continua_lendo_a_curadoria(client, criar_usuario, rota):
    suporte = criar_usuario(perfil=UserRole.suporte)
    h = cabecalho_auth(obter_token(client, suporte.email))
    assert client.get(rota, headers=h).status_code == 200


def test_curador_e_admin_continuam_gravando(client, criar_usuario, criar_ficha):
    for perfil in (UserRole.curador, UserRole.administrador):
        u = criar_usuario(perfil=perfil)
        ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)
        h = cabecalho_auth(obter_token(client, u.email))
        r = client.post(f"/curation/{ficha.id}/discard", headers=h, json={"motivo": "baixa qualidade"})
        assert r.status_code == 200


# --- Aprovacao so com os campos minimos (decisao de 02/11/2026) ---------------

def test_aprovacao_exige_campos_minimos_no_servidor(client, criar_usuario, criar_ficha, db):
    from tests.conftest import completar_ficha

    curador = criar_usuario(perfil=UserRole.curador)
    h = cabecalho_auth(obter_token(client, curador.email))
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)
    ficha.descricao_didatica = None
    db.commit()

    r = client.post(f"/curation/{ficha.id}/approve", headers=h, json={"anonimizacao_validada": True})
    assert r.status_code == 422
    detalhe = r.json()["detail"]
    for falta in ("dente ou região", "achado", "qualidade técnica", "descrição didática"):
        assert falta in detalhe
    assert "tipo de radiografia" not in detalhe  # esse a ficha ja tem

    db.expire_all()
    negadas = db.query(AuditLog).filter(AuditLog.acao == "aprovacao", AuditLog.resultado == "negado",
                                        AuditLog.entidade_id == ficha.id).count()
    assert negadas == 1
    # a imagem continua fora da busca dos estudantes
    estudante = criar_usuario(perfil=UserRole.estudante)
    he = cabecalho_auth(obter_token(client, estudante.email))
    ids = {i["curation_id"] for i in client.get("/search", headers=he, params={"limit": 200}).json()["itens"]}
    assert ficha.id not in ids

    completar_ficha(db, ficha)
    assert client.post(f"/curation/{ficha.id}/approve", headers=h, json={"anonimizacao_validada": True}).status_code == 200


# --- Script de limpeza dos dados DEMO -----------------------------------------

def test_limpeza_demo_simula_exclui_so_o_demo_e_preserva_auditoria(client, criar_usuario, db):
    import uuid

    from scripts.limpar_dados_demo import ACAO_AUDITORIA, executar, planejar

    aluno_demo = criar_usuario()
    aluno_demo.email = f"demo-{uuid.uuid4().hex[:8]}@radiximago.example.com"
    aluno_real = criar_usuario()
    db.commit()
    obter_token(client, aluno_demo.email)

    # SIMULACAO: levanta o plano e nao muda nada
    plano = planejar(db)
    assert aluno_demo.id in [u.id for u in plano["usuarios"]] and aluno_real.id not in [u.id for u in plano["usuarios"]]
    db.refresh(aluno_demo)
    assert aluno_demo.excluido is False

    # EXECUTAR: exclui (soft-delete) so o usuario demo
    antes = db.query(AuditLog).filter(AuditLog.usuario_id == aluno_demo.id).count()
    assert antes >= 1
    resumo = executar(db, plano)
    assert resumo["usuarios"] >= 1
    db.expire_all()
    aluno_demo = db.get(type(aluno_demo), aluno_demo.id)
    assert aluno_demo.excluido is True and aluno_demo.ativo is False and aluno_demo.excluido_em is not None
    assert db.get(type(aluno_real), aluno_real.id).excluido is False
    # a auditoria continua inteira e a propria limpeza fica registrada
    assert db.query(AuditLog).filter(AuditLog.usuario_id == aluno_demo.id).count() >= antes
    linha = db.query(AuditLog).filter(AuditLog.acao == ACAO_AUDITORIA).order_by(AuditLog.id.desc()).first()
    assert linha is not None and "usuarios=" in linha.detalhes
