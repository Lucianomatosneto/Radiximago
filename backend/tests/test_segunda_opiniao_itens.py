"""
Segunda opiniao ITEM POR ITEM (out/2026): o revisor anota cada item da
ficha e da uma avaliacao geral (escala tipo RADPEER); quem pediu acrescenta
ou dispensa cada anotacao, com historico e auditoria.
"""

from app.modules.audit_logs import AuditLog
from app.modules.curations import Curation, CurationHistory, StatusCuradoria
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


def _preparar(client, criar_usuario, criar_ficha):
    solicitante = criar_usuario(perfil=UserRole.curador)
    revisor = criar_usuario(perfil=UserRole.curador)
    t_sol = obter_token(client, solicitante.email)
    t_rev = obter_token(client, revisor.email)
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value, descricao_didatica="Texto original.")
    r = client.post(f"/curation/{ficha.id}/request-review", headers=cabecalho_auth(t_sol),
                    json={"motivo": "Dúvida no achado.", "primeiro_parecer": "Acho que é cárie."})
    assert r.status_code == 200
    return solicitante, revisor, t_sol, t_rev, ficha, r.json()["review_id"]


def _responder(client, token, review_id, **extra):
    corpo = {
        "classificacao": "discordancia_importante",
        "parecer_revisor": "Rever o achado principal.",
        "anotacoes": [
            {"item": "tipo_radiografia", "avaliacao": "concordo"},
            {"item": "achado_principal", "avaliacao": "discordo", "valor_sugerido": "lesao_periapical",
             "nota": "Rarefação no ápice."},
            {"item": "dentes", "avaliacao": "ajustar", "valor_sugerido": [21, 11, 11]},
            {"item": "descricao_didatica", "avaliacao": "ajustar", "nota": "Citar a lâmina dura."},
            {"item": "achado_2", "avaliacao": "discordo", "nota": "Este achado não aparece na imagem."},
        ],
    }
    corpo.update(extra)
    return client.post(f"/curation/reviews/{review_id}/respond", headers=cabecalho_auth(token), json=corpo)


def test_revisor_anota_item_por_item_e_detalhe_mostra_tudo(client, criar_usuario, criar_ficha):
    solicitante, revisor, t_sol, t_rev, ficha, review_id = _preparar(client, criar_usuario, criar_ficha)

    # fila: mostra quem pediu e que o proprio solicitante nao pode responder
    fila = client.get("/curation/reviews/pending", headers=cabecalho_auth(t_sol)).json()["itens"]
    item = next(i for i in fila if i["id"] == review_id)
    assert item["solicitante"]["nome"] == solicitante.nome and item["pode_responder"] is False
    fila = client.get("/curation/reviews/pending", headers=cabecalho_auth(t_rev)).json()["itens"]
    assert next(i for i in fila if i["id"] == review_id)["pode_responder"] is True

    r = _responder(client, t_rev, review_id)
    assert r.status_code == 200, r.text
    assert r.json()["concordancia"] == "discorda" and r.json()["anotacoes"] == 4  # "concordo" sem texto nao e guardado

    d = client.get(f"/curation/reviews/{review_id}/detalhe", headers=cabecalho_auth(t_sol)).json()
    assert d["classificacao"] == "discordancia_importante"
    assert d["solicitante"]["id"] == solicitante.id and d["revisor"]["id"] == revisor.id
    assert d["pode_incorporar"] is True and d["pode_responder"] is False
    por_item = {a["item"]: a for a in d["anotacoes"]}
    assert por_item["dentes"]["valor_sugerido"] == [11, 21]  # normalizado
    assert por_item["achado_2"]["rotulo"] == "Achado 2"
    assert all(a["situacao"] == "pendente" for a in d["anotacoes"])
    # o revisor ve, mas nao decide
    assert client.get(f"/curation/reviews/{review_id}/detalhe", headers=cabecalho_auth(t_rev)).json()["pode_incorporar"] is False

    respondidas = client.get("/curation/reviews/answered", headers=cabecalho_auth(t_sol)).json()["itens"]
    assert respondidas[0]["anotacoes_pendentes"] == 4 and respondidas[0]["revisor"]["nome"] == revisor.nome


def test_acrescentar_aplica_na_ficha_com_historico_e_auditoria(client, criar_usuario, criar_ficha, db):
    solicitante, revisor, t_sol, t_rev, ficha, review_id = _preparar(client, criar_usuario, criar_ficha)
    _responder(client, t_rev, review_id)
    notas = {a["item"]: a for a in client.get(f"/curation/reviews/{review_id}/detalhe",
                                              headers=cabecalho_auth(t_sol)).json()["anotacoes"]}
    h = cabecalho_auth(t_sol)

    def acrescentar(item):
        return client.post(f"/curation/reviews/{review_id}/anotacoes/{notas[item]['id']}/incorporar", headers=h)

    assert acrescentar("achado_principal").status_code == 200
    assert acrescentar("dentes").status_code == 200
    assert acrescentar("descricao_didatica").status_code == 200
    assert acrescentar("achado_2").status_code == 200
    # a mesma anotacao nao entra duas vezes
    assert acrescentar("dentes").status_code == 409

    db.expire_all()
    f = db.query(Curation).filter(Curation.id == ficha.id).one()
    assert f.achado_principal == "lesao_periapical"
    assert f.dentes == [11, 21]
    assert f.descricao_didatica.startswith("Texto original.") and "Citar a lâmina dura." in f.descricao_didatica
    assert "Achado 2] Este achado não aparece na imagem." in f.observacoes_internas
    assert "Achado principal] Rarefação no ápice." in f.observacoes_internas
    assert db.query(CurationHistory).filter(CurationHistory.curation_id == ficha.id,
                                            CurationHistory.acao == "incorporacao_segunda_opiniao").count() == 4
    assert db.query(AuditLog).filter(AuditLog.acao == "anotacao_segunda_opiniao_incorporada",
                                     AuditLog.usuario_id == solicitante.id).count() == 4

    d = client.get(f"/curation/reviews/{review_id}/detalhe", headers=h).json()
    assert sum(a["situacao"] == "incorporada" for a in d["anotacoes"]) == 4


def test_so_quem_pediu_decide_e_dispensar_nao_muda_a_ficha(client, criar_usuario, criar_ficha, db):
    solicitante, revisor, t_sol, t_rev, ficha, review_id = _preparar(client, criar_usuario, criar_ficha)
    _responder(client, t_rev, review_id)
    nota = client.get(f"/curation/reviews/{review_id}/detalhe", headers=cabecalho_auth(t_sol)).json()["anotacoes"][0]
    url = f"/curation/reviews/{review_id}/anotacoes/{nota['id']}"

    assert client.post(f"{url}/incorporar", headers=cabecalho_auth(t_rev)).status_code == 403
    outro = criar_usuario(perfil=UserRole.curador)
    assert client.post(f"{url}/dispensar", headers=cabecalho_auth(obter_token(client, outro.email))).status_code == 403

    antes = db.query(Curation).filter(Curation.id == ficha.id).one().achado_principal
    r = client.post(f"{url}/dispensar", headers=cabecalho_auth(t_sol))
    assert r.status_code == 200 and r.json()["anotacao"]["situacao"] == "dispensada"
    db.expire_all()
    assert db.query(Curation).filter(Curation.id == ficha.id).one().achado_principal == antes
    # mudou de ideia: ainda pode acrescentar depois de dispensar
    assert client.post(f"{url}/incorporar", headers=cabecalho_auth(t_sol)).status_code == 200

    # depois da decisao final, nada mais muda
    client.post(f"/curation/{ficha.id}/apply-review-decision", headers=cabecalho_auth(t_sol),
                json={"decisao": "descartar", "motivo": "Revisado."})
    outra = client.get(f"/curation/reviews/{review_id}/detalhe", headers=cabecalho_auth(t_sol)).json()["anotacoes"][1]
    r = client.post(f"/curation/reviews/{review_id}/anotacoes/{outra['id']}/incorporar", headers=cabecalho_auth(t_sol))
    assert r.status_code == 409


def test_respostas_invalidas_sao_recusadas(client, criar_usuario, criar_ficha):
    solicitante, revisor, t_sol, t_rev, ficha, review_id = _preparar(client, criar_usuario, criar_ficha)
    ruins = [
        {"anotacoes": [{"item": "campo_inventado", "avaliacao": "discordo", "nota": "x"}]},
        {"anotacoes": [{"item": "tipo_radiografia", "avaliacao": "discordo", "valor_sugerido": "raio_x"}]},
        {"anotacoes": [{"item": "dentes", "avaliacao": "ajustar", "valor_sugerido": [99]}]},
        {"anotacoes": [{"item": "faixa_etaria", "avaliacao": "ajustar", "valor_sugerido": "adulto"}]},
        {"anotacoes": [{"item": "genero", "avaliacao": "discordo"}]},  # sem explicacao
        {"anotacoes": [{"item": "dentes", "avaliacao": "ajustar", "nota": "a"},
                       {"item": "dentes", "avaliacao": "ajustar", "nota": "b"}]},
        {"classificacao": "mais_ou_menos", "anotacoes": []},
    ]
    for corpo in ruins:
        r = client.post(f"/curation/reviews/{review_id}/respond", headers=cabecalho_auth(t_rev),
                        json={"classificacao": "discordancia_menor", **corpo})
        assert r.status_code == 422, (corpo, r.text)
    # nada foi gravado: ainda aguardando resposta
    d = client.get(f"/curation/reviews/{review_id}/detalhe", headers=cabecalho_auth(t_rev)).json()
    assert d["status"] == "solicitada" and d["anotacoes"] == [] and d["pode_responder"] is True


def test_resposta_antiga_so_com_concordancia_continua_valendo(client, criar_usuario, criar_ficha):
    solicitante, revisor, t_sol, t_rev, ficha, review_id = _preparar(client, criar_usuario, criar_ficha)
    r = client.post(f"/curation/reviews/{review_id}/respond", headers=cabecalho_auth(t_rev), json={"concordancia": "concorda"})
    assert r.status_code == 200
    d = client.get(f"/curation/reviews/{review_id}/detalhe", headers=cabecalho_auth(t_sol)).json()
    assert d["concordancia"] == "concorda" and d["classificacao"] is None and d["anotacoes"] == []
