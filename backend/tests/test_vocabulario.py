"""
Busca por palavras (texto livre) e vocabulario controlado:
- acha sem acento, no plural, com pequeno erro e no "Outro" das marcacoes;
- termos livres ("Outro") mais repetidos; promover a termo; sinonimos;
- fichas candidatas, ligar ao termo e filtrar por termo na Pesquisa;
- permissoes (estudante nao gerencia o vocabulario);
- PATCH da ficha com termos e origem por voz (auditoria).
"""

import uuid

from app.modules.audit_logs import AuditLog
from app.modules.curations import StatusCuradoria
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


def _ficha_com_texto(db, criar_ficha, achado_principal=None, achados_detalhe=None, marcacoes=None, descricao=None):
    ficha = criar_ficha(status=StatusCuradoria.APROVADA.value, descricao_didatica=descricao)
    ficha.achado_principal = achado_principal
    ficha.achados_detalhe = achados_detalhe
    ficha.marcacoes = marcacoes or []
    db.commit()
    return ficha


def _ids(resposta):
    assert resposta.status_code == 200, resposta.text
    return {item["curation_id"] for item in resposta.json()["itens"]}


def test_busca_por_palavras_variacoes(client, criar_usuario, criar_ficha, db):
    marca = uuid.uuid4().hex[:6]
    usuario = criar_usuario()
    token = obter_token(client, usuario.email)
    f1 = _ficha_com_texto(db, criar_ficha, "outro", f"Reabsorção radicular externa {marca}")
    f2 = _ficha_com_texto(
        db, criar_ficha,
        marcacoes=[{"id": "a", "tipo": "oval", "achado": "outro", "achado_descricao": f"calcificação pulpar {marca}"}],
    )
    f3 = _ficha_com_texto(db, criar_ficha, descricao=f"ficha sem relação {marca}")

    def buscar(texto):
        return _ids(client.get("/search", params={"texto": texto, "limit": 200}, headers=cabecalho_auth(token)))

    assert f1.id in buscar("reabsorcao radicular")          # sem acento
    assert f1.id in buscar("REABSORÇÕES")                   # maiusculas + plural (radical)
    assert f1.id in buscar("reabsorsao radicular externa")  # erro de digitacao
    assert f2.id in buscar("calcificacao pulpar")           # texto do "Outro" de marcacao
    resultado = buscar("calcificacao pulpar")
    assert f1.id not in resultado and f3.id not in resultado


def test_vocabulario_promover_sinonimo_vincular_e_filtrar(client, criar_usuario, criar_ficha, db):
    marca = uuid.uuid4().hex[:6]
    curador = criar_usuario(perfil=UserRole.curador)
    estudante = criar_usuario()
    t_cur = obter_token(client, curador.email)
    t_est = obter_token(client, estudante.email)
    texto = f"nodulo pulpar {marca}"
    f1 = _ficha_com_texto(db, criar_ficha, "outro", texto)
    f2 = _ficha_com_texto(
        db, criar_ficha,
        marcacoes=[{"id": "a", "tipo": "seta", "achado": "outro", "achado_descricao": f"Nódulo pulpar {marca}"}],
    )
    f3 = _ficha_com_texto(db, criar_ficha, "outro", f"pedra pulpar {marca}")

    livres = client.get("/vocabulario/termos-livres", headers=cabecalho_auth(t_cur)).json()["itens"]
    item = next(i for i in livres if i["normalizado"] == f"nodulo pulpar {marca}")
    assert item["quantidade_fichas"] == 2

    # estudante nao gerencia o vocabulario
    assert client.post("/vocabulario/termos", json={"termo": texto}, headers=cabecalho_auth(t_est)).status_code == 403
    assert client.get("/vocabulario/termos-livres", headers=cabecalho_auth(t_est)).status_code == 403

    r = client.post(
        "/vocabulario/termos",
        json={"termo": f"Calcificação pulpar {marca}", "categoria": "achado", "codigo_decs": "D003915", "sinonimos": [texto]},
        headers=cabecalho_auth(t_cur),
    )
    assert r.status_code == 200, r.text
    termo = r.json()
    assert [s["sinonimo"] for s in termo["sinonimos"]] == [texto]
    # nao duplica (nome ou sinonimo ja existentes)
    assert client.post("/vocabulario/termos", json={"termo": texto.upper()}, headers=cabecalho_auth(t_cur)).status_code == 409

    r = client.post(f"/vocabulario/termos/{termo['id']}/sinonimos", json={"sinonimo": f"pedra pulpar {marca}"}, headers=cabecalho_auth(t_cur))
    assert r.status_code == 200 and len(r.json()["sinonimos"]) == 2

    # some da lista de termos livres (agora e sinonimo)
    livres = client.get("/vocabulario/termos-livres", headers=cabecalho_auth(t_cur)).json()["itens"]
    assert all(i["normalizado"] != f"nodulo pulpar {marca}" for i in livres)

    # buscar pelo NOME do termo encontra as fichas escritas com os sinonimos
    achadas = _ids(client.get("/search", params={"texto": f"calcificacao pulpar {marca}", "limit": 200}, headers=cabecalho_auth(t_est)))
    assert {f1.id, f2.id, f3.id} <= achadas

    candidatas = client.get(f"/vocabulario/termos/{termo['id']}/candidatas", headers=cabecalho_auth(t_cur)).json()
    assert {f1.id, f2.id, f3.id} <= {c["curation_id"] for c in candidatas["itens"]}
    r = client.post(f"/vocabulario/termos/{termo['id']}/vincular", json={"curation_ids": [f1.id, f2.id]}, headers=cabecalho_auth(t_cur))
    assert r.status_code == 200 and r.json()["vinculadas"] == sorted([f1.id, f2.id])

    filtradas = _ids(client.get("/search", params={"termo_id": termo["id"], "limit": 200}, headers=cabecalho_auth(t_est)))
    assert filtradas == {f1.id, f2.id}

    vocab = client.get("/vocabulario", headers=cabecalho_auth(t_est)).json()
    meu = next(t for t in vocab["termos"] if t["id"] == termo["id"])
    assert meu["quantidade_fichas"] == 2

    assert client.delete(f"/vocabulario/termos/{termo['id']}/fichas/{f2.id}", headers=cabecalho_auth(t_cur)).status_code == 200
    filtradas = _ids(client.get("/search", params={"termo_id": termo["id"], "limit": 200}, headers=cabecalho_auth(t_est)))
    assert filtradas == {f1.id}

    acoes = {a.acao for a in db.query(AuditLog).filter(AuditLog.usuario_id == curador.id).all()}
    assert {"vocabulario_termo_criado", "vocabulario_sinonimo_criado", "vocabulario_fichas_vinculadas"} <= acoes


def test_patch_ficha_com_termos_e_origem_voz(client, criar_usuario, criar_ficha, db):
    marca = uuid.uuid4().hex[:6]
    curador = criar_usuario(perfil=UserRole.curador)
    token = obter_token(client, curador.email)
    termo = client.post("/vocabulario/termos", json={"termo": f"Termo de teste {marca}"}, headers=cabecalho_auth(token)).json()
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)

    r = client.patch(
        f"/curation/{ficha.id}",
        json={"termos": [termo["id"]], "origem_voz": True, "descricao_didatica": "ditado"},
        headers=cabecalho_auth(token),
    )
    assert r.status_code == 200, r.text
    assert client.get(f"/curation/{ficha.id}", headers=cabecalho_auth(token)).json()["termos"] == [termo["id"]]
    assert client.patch(f"/curation/{ficha.id}", json={"termos": [999999999]}, headers=cabecalho_auth(token)).status_code == 422
    assert client.patch(f"/curation/{ficha.id}", json={"termos": []}, headers=cabecalho_auth(token)).status_code == 200
    assert client.get(f"/curation/{ficha.id}", headers=cabecalho_auth(token)).json()["termos"] == []

    acoes = [a.acao for a in db.query(AuditLog).filter(AuditLog.usuario_id == curador.id).all()]
    assert "preenchimento_por_voz" in acoes
