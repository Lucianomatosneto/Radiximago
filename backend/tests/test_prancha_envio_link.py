"""
Etapa E da separacao (08/11/2026): a prancha para OUTRAS pessoas vai so
como LINK que exige login (decisao do Luciano); qualquer perfil envia para
qualquer usuario cadastrado e ativo. Em todas as saidas a pessoa escolhe
1, 2 ou 3 por folha e QUAIS dados acompanham a imagem.
"""

from app.core import email as modulo_email
from app.modules import prancha, prancha_router
from app.modules.audit_logs import AuditLog
from app.modules.curations import StatusCuradoria
from app.modules.prancha_envios import PranchaEnviada
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token
from tests.test_prancha import _paginas_do_pdf, _png

_CABS: dict[int, dict] = {}


def _cab(client, u):
    if u.id not in _CABS:
        from app.main import app
        app.state.limiter.reset()
        _CABS[u.id] = cabecalho_auth(obter_token(client, u.email))
    return _CABS[u.id]


class _Ficha:
    tipo_radiografia = "periapical"
    qualidade_tecnica = "boa"
    dentes = [36]
    achado_principal = "carie"
    alteracoes_observadas = ["carie_dentina"]
    achados_detalhe = None
    descricao_didatica = "Texto didatico"


def test_escolha_dos_dados_que_acompanham_a_imagem():
    marc = [{"achado": "carie", "cor": "#ff0000"}]
    todos = [l.rotulo for l in prancha.descrever_ficha(_Ficha(), marc)]
    assert "Tipo" in todos and "Dentes" in todos and "Descrição didática" in todos and "Marcação 1" in todos
    so_descricao = [l.rotulo for l in prancha.descrever_ficha(_Ficha(), marc, ["descricao"])]
    assert so_descricao == ["Descrição didática"]
    sem_marcadores = [l.rotulo for l in prancha.descrever_ficha(_Ficha(), marc, ["tipo", "regiao", "achados"])]
    assert "Marcação 1" not in sem_marcadores and "Descrição didática" not in sem_marcadores
    assert prancha.montar_paginas([prancha.ItemPrancha(1, 1, _png(), [])], por_folha=1)


def test_uma_por_folha_e_campos_invalidos(client, criar_usuario, criar_ficha, monkeypatch):
    aluno = criar_usuario()
    fichas = [criar_ficha() for _ in range(2)]
    monkeypatch.setattr(prancha_router.orthanc_client, "obter_preview_instancia", lambda i: _png())
    h = _cab(client, aluno)
    r = client.post("/prancha/arquivo", headers=h, json={
        "curation_ids": [f.id for f in fichas], "por_folha": 1, "campos": ["tipo", "descricao"]})
    assert r.status_code == 200, r.text
    assert _paginas_do_pdf(r.content) == 2
    assert client.post("/prancha/arquivo", headers=h, json={
        "curation_ids": [fichas[0].id], "campos": ["senha"]}).status_code == 422


def test_estudante_envia_link_a_qualquer_usuario_e_so_ele_abre(client, db, criar_usuario, criar_ficha, monkeypatch):
    aluno, colega, prof = criar_usuario(), criar_usuario(), criar_usuario(perfil=UserRole.professor)
    estranho, bloqueado = criar_usuario(), criar_usuario(bloqueado=True)
    fichas = [criar_ficha(descricao_didatica="link-etapa-e") for _ in range(2)]
    monkeypatch.setattr(prancha_router.orthanc_client, "obter_preview_instancia", lambda i: _png())
    emails = []
    monkeypatch.setattr(modulo_email, "enviar_email", lambda para, assunto, html, **k: emails.append((para, html, k)))

    h = _cab(client, aluno)
    achados = client.get("/prancha/pessoas", headers=h, params={"busca": "suite"}).json()["pessoas"]
    ids_achados = {p["id"] for p in achados}
    assert aluno.id not in ids_achados and bloqueado.id not in ids_achados
    assert all("•••" in p["email"] for p in achados)
    assert client.get("/prancha/pessoas", headers=h, params={"busca": "ab"}).json()["pessoas"] == []

    r = client.post("/prancha/enviar", headers=h, json={
        "curation_ids": [f.id for f in fichas], "por_folha": 3, "campos": ["descricao"], "com_marcacoes": False,
        "pessoas": [colega.id, prof.id, bloqueado.id, aluno.id], "recado": "Olhem a lesao",
    })
    assert r.status_code == 200, r.text
    assert r.json()["enviadas"] == 2
    assert sorted(p for p, _, _ in emails) == sorted([colega.email, prof.email])
    para, html, extras = emails[0]
    assert "/pranchas-recebidas?abrir=" in html and "Olhem a lesao" not in html   # so o link; o recado fica no Radix
    assert not extras.get("anexo_bytes")                                          # nenhuma imagem anexada

    recebidas = client.get("/prancha/recebidas", headers=_cab(client, colega)).json()["pranchas"]
    assert len(recebidas) == 1 and recebidas[0]["recado"] == "Olhem a lesao" and recebidas[0]["visto"] is False
    envio_id = recebidas[0]["id"]

    assert client.get(f"/prancha/recebidas/{envio_id}/arquivo", headers=_cab(client, estranho)).status_code == 404
    assert client.get(f"/prancha/recebidas/{envio_id}/arquivo").status_code == 401
    r = client.get(f"/prancha/recebidas/{envio_id}/arquivo", headers=_cab(client, colega))
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    assert client.get("/prancha/recebidas", headers=_cab(client, colega)).json()["pranchas"][0]["visto"] is True

    acoes = {a for (a,) in db.query(AuditLog.acao).filter(AuditLog.usuario_id.in_([aluno.id, colega.id]))}
    assert {"prancha_enviada_link", "prancha_recebida_aberta"} <= acoes

    # imagem que deixou de estar aprovada sai da prancha; sem nenhuma, avisa
    for f in fichas:
        f.status = StatusCuradoria.EM_ANALISE.value
    db.commit()
    assert client.get(f"/prancha/recebidas/{envio_id}/arquivo", headers=_cab(client, colega)).status_code == 410


def test_envio_exige_alguem_e_imagem_aprovada(client, criar_usuario, criar_ficha):
    aluno, colega = criar_usuario(), criar_usuario()
    ficha = criar_ficha()
    pendente = criar_ficha(status="pendente")
    h = _cab(client, aluno)
    assert client.post("/prancha/enviar", headers=h, json={"curation_ids": [ficha.id], "pessoas": [aluno.id]}).status_code == 422
    assert client.post("/prancha/enviar", headers=h, json={
        "curation_ids": [pendente.id], "pessoas": [colega.id]}).status_code == 404
