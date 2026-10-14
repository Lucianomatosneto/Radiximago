"""
Secao unica "Achados" na ficha (PATCH /curation/{id} com `achados`):
- substitui os achados estruturados e DERIVA alteracoes_observadas e
  dentes da ficha (a Pesquisa avancada continua funcionando);
- busca "achado + dente" encontra a ficha aprovada;
- "sem alteracoes" vira achado_principal = normal e e recusado com achados;
- validacoes (dente invalido, "outro" sem descricao).
"""

from app.modules.achados import Achado
from app.modules.curations import StatusCuradoria
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


def test_achados_unificados_derivam_resumo_e_busca(client, criar_usuario, criar_ficha, db):
    curador = criar_usuario(perfil=UserRole.curador)
    h = cabecalho_auth(obter_token(client, curador.email))
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)
    marcacao = {"id": "m1", "tipo": "oval", "x": 0.1, "y": 0.1, "largura": 0.1, "altura": 0.1, "achado": "lesao_periapical"}

    r = client.patch(f"/curation/{ficha.id}", headers=h, json={
        "dentes": [11],
        "marcacoes": [marcacao],
        "achados": [
            {"tipo": "lesao_periapical", "dentes": [36], "regiao_anatomica": "regiao_periapical", "marcacoes": [marcacao]},
            {"tipo": "carie_dentina", "dentes": [37, 37]},
            {"tipo": "lesao_periapical", "dentes": [46]},
        ],
    })
    assert r.status_code == 200, r.text
    assert r.json()["alteracoes_observadas"] == ["lesao_periapical", "carie_dentina"]
    assert r.json()["dentes"] == [11, 36, 37, 46]

    dados = client.get(f"/curation/{ficha.id}", headers=h).json()
    assert [a["tipo"] for a in dados["achados"]] == ["lesao_periapical", "carie_dentina", "lesao_periapical"]
    assert dados["achados"][0]["marcacoes"][0]["id"] == "m1"
    assert dados["achados"][1]["dentes"] == [37]
    assert dados["sem_alteracoes"] is False

    # substitui (nao acumula)
    assert client.patch(f"/curation/{ficha.id}", headers=h, json={"achados": [{"tipo": "cisto", "dentes": [36]}]}).status_code == 200
    assert db.query(Achado).filter(Achado.curation_id == ficha.id).count() == 1

    # aprovada: busca achado + dente (correlacionada) encontra
    client.patch(f"/curation/{ficha.id}", headers=h, json={"anonimizacao_validada": True})
    assert client.post(f"/curation/{ficha.id}/approve", headers=h, json={"anonimizacao_validada": True}).status_code == 200
    ids = {i["curation_id"] for i in client.get("/search", headers=h, params={"achado": "cisto", "dentes": [36], "limit": 200}).json()["itens"]}
    assert ficha.id in ids
    ids = {i["curation_id"] for i in client.get("/search", headers=h, params={"achado": "cisto", "dentes": [37], "limit": 200}).json()["itens"]}
    assert ficha.id not in ids
    db.query(Achado).filter(Achado.curation_id == ficha.id).delete()
    db.commit()


def test_sem_alteracoes_e_validacoes(client, criar_usuario, criar_ficha, db):
    curador = criar_usuario(perfil=UserRole.curador)
    h = cabecalho_auth(obter_token(client, curador.email))
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)

    assert client.patch(f"/curation/{ficha.id}", headers=h, json={"achados": [], "sem_alteracoes": True}).status_code == 200
    assert client.get(f"/curation/{ficha.id}", headers=h).json()["sem_alteracoes"] is True
    # com achado: recusado
    r = client.patch(f"/curation/{ficha.id}", headers=h, json={"achados": [{"tipo": "cisto"}], "sem_alteracoes": True})
    assert r.status_code == 422
    # achado novo tira o "normal"
    assert client.patch(f"/curation/{ficha.id}", headers=h, json={"achados": [{"tipo": "cisto"}]}).status_code == 200
    assert client.get(f"/curation/{ficha.id}", headers=h).json()["sem_alteracoes"] is False

    assert client.patch(f"/curation/{ficha.id}", headers=h, json={"achados": [{"tipo": "cisto", "dentes": [99]}]}).status_code == 422
    assert client.patch(f"/curation/{ficha.id}", headers=h, json={"achados": [{"tipo": "outro"}]}).status_code == 422
    db.query(Achado).filter(Achado.curation_id == ficha.id).delete()
    db.commit()


def test_erros_tecnicos_na_ficha_e_tomografia(client, criar_usuario, criar_ficha, db):
    from app.modules.achados import ErroTecnico
    curador = criar_usuario(perfil=UserRole.curador)
    h = cabecalho_auth(obter_token(client, curador.email))
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)

    r = client.patch(f"/curation/{ficha.id}", headers=h, json={
        "tipo_radiografia": "tomografia",
        "erros_tecnicos": ["tc_beam_hardening", "tc_truncamento", "tc_beam_hardening"],
    })
    assert r.status_code == 200, r.text
    dados = client.get(f"/curation/{ficha.id}", headers=h).json()
    assert dados["tipo_radiografia"] == "tomografia"
    assert dados["erros_tecnicos"] == ["tc_beam_hardening", "tc_truncamento"]
    assert client.patch(f"/curation/{ficha.id}", headers=h, json={"erros_tecnicos": []}).status_code == 200
    assert client.get(f"/curation/{ficha.id}", headers=h).json()["erros_tecnicos"] == []
    assert client.patch(f"/curation/{ficha.id}", headers=h, json={"erros_tecnicos": ["inventado"]}).status_code == 422
    db.query(ErroTecnico).filter(ErroTecnico.curation_id == ficha.id).delete()
    db.commit()
