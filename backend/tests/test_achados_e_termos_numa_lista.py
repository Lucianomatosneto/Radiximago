"""
08/11/2026 - achados das marcacoes e termos do vocabulario numa LISTA SO
(pedido do Luciano):
- a marcacao pode ter como achado um termo do vocabulario (termo_id): fica
  "outro" + o nome do termo, e a ficha passa a estar LIGADA ao termo (e o
  que faz a imagem aparecer na Pesquisa avancada por ele);
- "Outros": o curador acrescenta um termo novo escolhendo se ele aparece
  na Pesquisa avancada (na_busca) e se fica como opcao nas proximas
  curadorias (nas_curadorias); fica na auditoria.
"""

import uuid

from app.modules.achados import Achado
from app.modules.audit_logs import AuditLog
from app.modules.curations import StatusCuradoria
from app.modules.users import UserRole
from app.modules.vocabulario import CurationTermo, TermoVocabulario
from tests.conftest import cabecalho_auth, obter_token


def _ids(client, h, **params):
    r = client.get("/search", params={"limit": 200, **params}, headers=h)
    return r.status_code, {i["curation_id"] for i in r.json().get("itens", [])} if r.status_code == 200 else set()


def _limpar(db, ficha_ids, termo_ids):
    db.query(Achado).filter(Achado.curation_id.in_(ficha_ids)).delete(synchronize_session=False)
    db.query(CurationTermo).filter(CurationTermo.termo_id.in_(termo_ids)).delete(synchronize_session=False)
    db.query(TermoVocabulario).filter(TermoVocabulario.id.in_(termo_ids)).delete(synchronize_session=False)
    db.commit()


def test_outros_cria_termo_com_as_escolhas_do_curador(client, criar_usuario, db):
    curador = criar_usuario(perfil=UserRole.curador)
    professor = criar_usuario(perfil=UserRole.professor)
    h = cabecalho_auth(obter_token(client, curador.email))
    nome = f"Nodulo teste {uuid.uuid4().hex[:6]}"

    r = client.post("/vocabulario/termos", headers=h, json={"termo": nome, "na_busca": False, "nas_curadorias": True})
    assert r.status_code == 200, r.text
    termo = r.json()
    assert termo["na_busca"] is False and termo["nas_curadorias"] is True
    lista = {t["id"]: t for t in client.get("/vocabulario", headers=h).json()["termos"]}
    assert lista[termo["id"]]["na_busca"] is False

    # padrao (sem escolher): aparece nos dois
    r2 = client.post("/vocabulario/termos", headers=h, json={"termo": nome + " b"}).json()
    assert r2["na_busca"] is True and r2["nas_curadorias"] is True
    # mudar depois (tela Vocabulario)
    assert client.patch(f"/vocabulario/termos/{termo['id']}", headers=h, json={"na_busca": True}).json()["na_busca"] is True
    # o professor nao acrescenta termos
    hp = cabecalho_auth(obter_token(client, professor.email))
    assert client.post("/vocabulario/termos", headers=hp, json={"termo": nome + " c"}).status_code == 403

    acoes = {a for (a,) in db.query(AuditLog.acao).filter(AuditLog.usuario_id == curador.id)}
    assert {"vocabulario_termo_criado", "vocabulario_termo_editado"} <= acoes
    _limpar(db, [], [termo["id"], r2["id"]])


def test_marcacao_com_termo_liga_a_ficha_e_aparece_na_busca(client, criar_usuario, criar_ficha, db):
    curador = criar_usuario(perfil=UserRole.curador)
    h = cabecalho_auth(obter_token(client, curador.email))
    nome = f"Lesao teste {uuid.uuid4().hex[:6]}"
    termo = client.post("/vocabulario/termos", headers=h, json={"termo": nome}).json()
    privado = client.post("/vocabulario/termos", headers=h,
                          json={"termo": nome + " so aqui", "na_busca": False, "nas_curadorias": False}).json()
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)
    m1 = {"id": "m1", "tipo": "oval", "x": 0.1, "y": 0.1, "largura": 0.1, "altura": 0.1, "achado": "outro", "achado_descricao": nome}
    m2 = {"id": "m2", "tipo": "oval", "x": 0.5, "y": 0.5, "largura": 0.1, "altura": 0.1, "achado": "outro", "achado_descricao": nome}

    r = client.patch(f"/curation/{ficha.id}", headers=h, json={
        "marcacoes": [m1, m2],
        "achados": [
            {"tipo": "outro", "termo_id": termo["id"], "dentes": [36], "marcacoes": [m1]},
            {"tipo": "outro", "termo_id": privado["id"], "marcacoes": [m2]},
        ],
    })
    assert r.status_code == 200, r.text
    dados = client.get(f"/curation/{ficha.id}", headers=h).json()
    assert [(a["tipo"], a["termo_id"], a["descricao"]) for a in dados["achados"]] == [
        ("outro", termo["id"], nome), ("outro", privado["id"], nome + " so aqui")]
    ligados = {t for (t,) in db.query(CurationTermo.termo_id).filter(CurationTermo.curation_id == ficha.id)}
    assert {termo["id"], privado["id"]} <= ligados
    assert "outro" not in (r.json()["alteracoes_observadas"] or [])

    # termo inexistente
    assert client.patch(f"/curation/{ficha.id}", headers=h, json={
        "achados": [{"tipo": "outro", "termo_id": 999999}]}).status_code == 422

    # a marcacao com o termo "so aqui" saiu: a ficha deixa de estar ligada a ele
    assert client.patch(f"/curation/{ficha.id}", headers=h, json={
        "marcacoes": [m1], "achados": [{"tipo": "outro", "termo_id": termo["id"], "dentes": [36], "marcacoes": [m1]}],
    }).status_code == 200
    ligados = {t for (t,) in db.query(CurationTermo.termo_id).filter(CurationTermo.curation_id == ficha.id)}
    assert termo["id"] in ligados and privado["id"] not in ligados

    # aprovada: a busca pelo termo encontra; o termo "so aqui" nao e oferecido na busca
    client.patch(f"/curation/{ficha.id}", headers=h, json={
        "anonimizacao_validada": True, "qualidade_tecnica": "boa", "dentes": [36],
        "descricao_didatica": "Ficha de teste", "tipo_radiografia": "periapical"})
    assert client.post(f"/curation/{ficha.id}/approve", headers=h, json={"anonimizacao_validada": True}).status_code == 200
    codigo, ids = _ids(client, h, termos=f"vocab:{termo['id']}")
    assert codigo == 200 and ficha.id in ids
    codigo, _ = _ids(client, h, termos=f"vocab:{privado['id']}")
    assert codigo == 422
    _limpar(db, [ficha.id], [termo["id"], privado["id"]])
