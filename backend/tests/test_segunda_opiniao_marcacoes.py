"""
SEGUNDA OPINIAO: O REVISOR DESENHA MARCACOES NOVAS (pedido do video,
22/11/2026).

No item "Marcacoes na imagem", com "Ajustar" ou "Discordo", o revisor pode
desenhar marcacoes onde quiser na imagem; elas vao como valor sugerido do
item e aparecem destacadas para quem pediu. Quem pediu escolhe:
- "acrescentar": as marcacoes sugeridas entram na ficha, DEPOIS das que ja
  existiam (a ficha oficial so muda com a decisao de quem pediu);
- "dispensar": nada muda.
Regras: cada marcacao e validada como as da curadoria (forma, coordenadas
de 0 a 1); no maximo MAX_MARCACOES no total; o detalhe devolve as sugeridas.
Dados inventados.
"""

from app.core.limites import MAX_MARCACOES
from app.modules.curations import Curation, StatusCuradoria
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token

OVAL = {"id": "rev-1", "tipo": "oval", "x": 0.2, "y": 0.3, "largura": 0.1, "altura": 0.1, "achado": "lesao_periapical"}
SETA = {"id": "rev-2", "tipo": "seta", "x1": 0.5, "y1": 0.5, "x2": 0.6, "y2": 0.4}


def _preparar(client, criar_usuario, criar_ficha, db):
    sol = criar_usuario(perfil=UserRole.curador)
    rev = criar_usuario(perfil=UserRole.curador)
    t_sol, t_rev = obter_token(client, sol.email), obter_token(client, rev.email)
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)
    ficha.marcacoes = [{"id": "cur-1", "tipo": "retangulo", "x": 0.1, "y": 0.1, "largura": 0.2, "altura": 0.2}]
    db.commit()
    r = client.post(f"/curation/{ficha.id}/request-review", headers=cabecalho_auth(t_sol), json={"motivo": "Confira a lesão."})
    return t_sol, t_rev, ficha, r.json()["review_id"]


def _responder(client, t_rev, review_id, marcacoes, avaliacao="ajustar"):
    return client.post(f"/curation/reviews/{review_id}/respond", headers=cabecalho_auth(t_rev), json={
        "classificacao": "discordancia_menor",
        "anotacoes": [{"item": "marcacoes", "avaliacao": avaliacao, "nota": "Faltou a lesão apical.", "valor_sugerido": marcacoes}],
    })


def test_revisor_sugere_marcacoes_e_quem_pediu_acrescenta(client, criar_usuario, criar_ficha, db):
    t_sol, t_rev, ficha, review_id = _preparar(client, criar_usuario, criar_ficha, db)
    r = _responder(client, t_rev, review_id, [OVAL, SETA])
    assert r.status_code == 200, r.text
    d = client.get(f"/curation/reviews/{review_id}/detalhe", headers=cabecalho_auth(t_sol)).json()
    nota = next(a for a in d["anotacoes"] if a["item"] == "marcacoes")
    assert nota["tipo_item"] == "marcacoes"
    assert [m["id"] for m in nota["valor_sugerido"]] == ["rev-1", "rev-2"]

    assert client.post(f"/curation/reviews/{review_id}/anotacoes/{nota['id']}/incorporar", headers=cabecalho_auth(t_sol)).status_code == 200
    db.expire_all()
    f = db.query(Curation).filter(Curation.id == ficha.id).one()
    assert [m["id"] for m in f.marcacoes] == ["cur-1", "rev-1", "rev-2"]
    assert "Faltou a lesão apical." in (f.observacoes_internas or "")


def test_dispensar_nao_muda_as_marcacoes(client, criar_usuario, criar_ficha, db):
    t_sol, t_rev, ficha, review_id = _preparar(client, criar_usuario, criar_ficha, db)
    _responder(client, t_rev, review_id, [OVAL], avaliacao="discordo")
    nota = next(a for a in client.get(f"/curation/reviews/{review_id}/detalhe", headers=cabecalho_auth(t_sol)).json()["anotacoes"]
                if a["item"] == "marcacoes")
    assert client.post(f"/curation/reviews/{review_id}/anotacoes/{nota['id']}/dispensar", headers=cabecalho_auth(t_sol)).status_code == 200
    db.expire_all()
    assert [m["id"] for m in db.query(Curation).filter(Curation.id == ficha.id).one().marcacoes] == ["cur-1"]


def test_marcacao_invalida_e_recusada(client, criar_usuario, criar_ficha, db):
    _t_sol, t_rev, _ficha, review_id = _preparar(client, criar_usuario, criar_ficha, db)
    torta = {"id": "x", "tipo": "oval", "x": 1.5, "y": 0.2, "largura": 0.1, "altura": 0.1}
    assert _responder(client, t_rev, review_id, [torta]).status_code == 422
    sem_ponta = {"id": "y", "tipo": "seta", "x1": 0.1, "y1": 0.1}
    assert _responder(client, t_rev, review_id, [sem_ponta]).status_code == 422


def test_limite_total_de_marcacoes(client, criar_usuario, criar_ficha, db):
    _t_sol, t_rev, _ficha, review_id = _preparar(client, criar_usuario, criar_ficha, db)
    muitas = [{**OVAL, "id": f"m{i}"} for i in range(MAX_MARCACOES + 1)]
    assert _responder(client, t_rev, review_id, muitas).status_code == 422


def test_so_o_item_marcacoes_aceita_marcacoes(client, criar_usuario, criar_ficha, db):
    _t_sol, t_rev, _ficha, review_id = _preparar(client, criar_usuario, criar_ficha, db)
    r = client.post(f"/curation/reviews/{review_id}/respond", headers=cabecalho_auth(t_rev), json={
        "classificacao": "discordancia_menor",
        "anotacoes": [{"item": "descricao_didatica", "avaliacao": "ajustar", "nota": "x", "valor_sugerido": [OVAL]}],
    })
    assert r.status_code == 422
