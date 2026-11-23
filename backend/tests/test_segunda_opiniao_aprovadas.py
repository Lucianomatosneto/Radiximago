"""
SEGUNDA OPINIAO DE FICHA JA APROVADA (pedido do video, 22/11/2026).

Em Minhas imagens, o curador ou o administrador escolhe imagens que ja estao
no banco (ficha aprovada) e pede segunda opiniao para todas de uma vez.
Regras:
- a ficha CONTINUA aprovada (e na Pesquisa) enquanto a revisao acontece;
- quem pediu pode acrescentar as anotacoes do revisor a ficha aprovada;
- a decisao final: "aprovar" mantem a ficha aprovada; "descartar" ARQUIVA
  a ficha (sai de circulacao, nada e apagado - mesma regra do Bloco 6 para
  fichas aprovadas), com motivo;
- descartada e arquivada continuam sem segunda opiniao; uma em aberto por
  ficha, como antes.
Dados inventados.
"""

from app.modules.curations import Curation, CurationHistory, CurationReview, StatusCuradoria, StatusRevisao
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, completar_ficha, obter_token


def _aprovada(criar_ficha, db):
    ficha = criar_ficha(status=StatusCuradoria.APROVADA.value)
    ficha.anonimizacao_validada = True
    completar_ficha(db, ficha)
    return ficha


def _pessoas(client, criar_usuario):
    sol = criar_usuario(perfil=UserRole.curador)
    rev = criar_usuario(perfil=UserRole.curador)
    return obter_token(client, sol.email), obter_token(client, rev.email)


def _pedir(client, token, ficha_id):
    return client.post(f"/curation/{ficha_id}/request-review", headers=cabecalho_auth(token),
                       json={"motivo": "Revisar ficha do banco."})


def _responder(client, token, review_id):
    return client.post(f"/curation/reviews/{review_id}/respond", headers=cabecalho_auth(token), json={
        "classificacao": "discordancia_menor",
        "anotacoes": [{"item": "descricao_didatica", "avaliacao": "ajustar", "nota": "Citar o dente 36."}],
    })


def _status(db, ficha_id):
    db.expire_all()
    return db.query(Curation).filter(Curation.id == ficha_id).one().status


def test_pedir_para_aprovada_mantem_a_ficha_aprovada(client, criar_usuario, criar_ficha, db):
    t_sol, _t_rev = _pessoas(client, criar_usuario)
    ficha = _aprovada(criar_ficha, db)
    r = _pedir(client, t_sol, ficha.id)
    assert r.status_code == 200, r.text
    assert r.json()["status_ficha"] == "aprovada"
    assert _status(db, ficha.id) == StatusCuradoria.APROVADA.value
    hist = db.query(CurationHistory).filter(CurationHistory.curation_id == ficha.id).order_by(CurationHistory.id.desc()).first()
    assert hist.acao == "solicitacao_segunda_opiniao"
    assert (hist.status_anterior, hist.status_novo) == ("aprovada", "aprovada")


def test_segundo_pedido_em_aberto_e_recusado(client, criar_usuario, criar_ficha, db):
    t_sol, _t_rev = _pessoas(client, criar_usuario)
    ficha = _aprovada(criar_ficha, db)
    assert _pedir(client, t_sol, ficha.id).status_code == 200
    assert _pedir(client, t_sol, ficha.id).status_code == 409


def test_descartada_e_arquivada_continuam_sem_segunda_opiniao(client, criar_usuario, criar_ficha, db):
    t_sol, _t_rev = _pessoas(client, criar_usuario)
    for status in (StatusCuradoria.DESCARTADA.value, StatusCuradoria.ARQUIVADA.value):
        ficha = criar_ficha(status=status)
        assert _pedir(client, t_sol, ficha.id).status_code == 409


def test_quem_pediu_acrescenta_anotacao_na_ficha_aprovada(client, criar_usuario, criar_ficha, db):
    t_sol, t_rev = _pessoas(client, criar_usuario)
    ficha = _aprovada(criar_ficha, db)
    review_id = _pedir(client, t_sol, ficha.id).json()["review_id"]
    assert _responder(client, t_rev, review_id).status_code == 200
    d = client.get(f"/curation/reviews/{review_id}/detalhe", headers=cabecalho_auth(t_sol)).json()
    assert d["pode_incorporar"] is True
    nota = d["anotacoes"][0]
    r = client.post(f"/curation/reviews/{review_id}/anotacoes/{nota['id']}/incorporar", headers=cabecalho_auth(t_sol))
    assert r.status_code == 200, r.text
    db.expire_all()
    f = db.query(Curation).filter(Curation.id == ficha.id).one()
    assert "Citar o dente 36." in f.descricao_didatica
    assert f.status == StatusCuradoria.APROVADA.value


def test_decisao_aprovar_mantem_aprovada_e_fecha_a_revisao(client, criar_usuario, criar_ficha, db):
    t_sol, t_rev = _pessoas(client, criar_usuario)
    ficha = _aprovada(criar_ficha, db)
    review_id = _pedir(client, t_sol, ficha.id).json()["review_id"]
    _responder(client, t_rev, review_id)
    r = client.post(f"/curation/{ficha.id}/apply-review-decision", headers=cabecalho_auth(t_sol),
                    json={"decisao": "aprovar", "anonimizacao_validada": True})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "aprovada"
    db.expire_all()
    assert db.get(CurationReview, review_id).status == StatusRevisao.FINALIZADA.value
    # fechada: pode pedir outra depois
    assert _pedir(client, t_sol, ficha.id).status_code == 200


def test_decisao_descartar_arquiva_a_ficha_aprovada(client, criar_usuario, criar_ficha, db):
    t_sol, t_rev = _pessoas(client, criar_usuario)
    ficha = _aprovada(criar_ficha, db)
    review_id = _pedir(client, t_sol, ficha.id).json()["review_id"]
    _responder(client, t_rev, review_id)
    sem_motivo = client.post(f"/curation/{ficha.id}/apply-review-decision", headers=cabecalho_auth(t_sol),
                             json={"decisao": "descartar"})
    assert sem_motivo.status_code == 422
    r = client.post(f"/curation/{ficha.id}/apply-review-decision", headers=cabecalho_auth(t_sol),
                    json={"decisao": "descartar", "motivo": "Imagem com artefato."})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "arquivada"
    assert _status(db, ficha.id) == StatusCuradoria.ARQUIVADA.value


def test_decisao_em_ficha_aprovada_sem_revisao_respondida_continua_recusada(client, criar_usuario, criar_ficha, db):
    t_sol, _t_rev = _pessoas(client, criar_usuario)
    ficha = _aprovada(criar_ficha, db)
    r = client.post(f"/curation/{ficha.id}/apply-review-decision", headers=cabecalho_auth(t_sol),
                    json={"decisao": "aprovar", "anonimizacao_validada": True})
    assert r.status_code == 409
