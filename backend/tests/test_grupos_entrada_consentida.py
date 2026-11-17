"""
GRUPOS COM ENTRADA CONSENTIDA - Etapa 1 (17/11/2026).

Decisao do Luciano (D1): ninguem e colocado direto num grupo. So ha dois
caminhos, sempre com as duas partes de acordo:
  (a) o estudante PEDE para entrar e o dono AUTORIZA;
  (b) o dono CONVIDA e a pessoa ACEITA.
Outras regras conferidas aqui:
  - criam grupos: professor, pesquisador, curador e administrador (D5);
  - so estudantes procuram grupos e pedem para entrar (D7);
  - a busca mostra so o nome do grupo e quem o criou (D2);
  - o dono ve todos os participantes; o participante nao ve os colegas (D2);
  - convite e pedido cruzados: a pessoa entra na hora;
  - convites e pedidos sem resposta vencem em 30 dias;
  - so um convite ou pedido pendente por pessoa em cada grupo;
  - busca com pelo menos 3 letras, no maximo 20 resultados e limite por minuto;
  - tudo vai para a auditoria.
Dados inventados (usuarios da suite de testes).
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.modules.audit_logs import AuditLog
from app.modules.grupos import GrupoEntrada, GrupoEnvio, GrupoEnvioMembro
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


@pytest.fixture()
def limpar_grupos(db):
    criados: list[int] = []
    yield criados
    for gid in criados:
        g = db.get(GrupoEnvio, gid)
        if g:
            db.delete(g)
    db.commit()


_CABS: dict[int, dict] = {}


def _cab(client, u):
    # um login por pessoa (o limite de tentativas de login vale nos testes)
    if u.id not in _CABS:
        from app.main import app
        app.state.limiter.reset()
        _CABS[u.id] = cabecalho_auth(obter_token(client, u.email))
    return _CABS[u.id]


def _nome(prefixo: str = "Grupo") -> str:
    return f"{prefixo} {uuid.uuid4().hex[:10]}"


def _criar(client, cab, limpar, nome=None, **extra) -> dict:
    r = client.post("/grupos", headers=cab, json={"nome": nome or _nome(), **extra})
    assert r.status_code == 200, r.text
    limpar.append(r.json()["id"])
    return r.json()


def _meu_grupo(client, cab, gid) -> dict:
    return next(g for g in client.get("/grupos", headers=cab).json()["grupos"] if g["id"] == gid)


def _convite_recebido(client, cab, gid) -> dict | None:
    return next((c for c in client.get("/grupos/convites-recebidos", headers=cab).json()["convites"]
                 if c["grupo"]["id"] == gid), None)


# --- (b) o dono convida e a pessoa aceita ---------------------------------

def test_convite_so_vira_participacao_quando_a_pessoa_aceita(client, criar_usuario, limpar_grupos, db):
    prof = criar_usuario(perfil=UserRole.professor)
    a1, a2 = criar_usuario(), criar_usuario()
    cab = _cab(client, prof)

    grupo = _criar(client, cab, limpar_grupos, membros_ids=[a1.id, a2.id])
    assert grupo["membros"] == []                                   # ninguem entra direto
    assert {c["pessoa"]["id"] for c in grupo["convites"]} == {a1.id, a2.id}
    assert all("•••" in c["pessoa"]["email"] for c in grupo["convites"])   # e-mail mascarado

    convite = _convite_recebido(client, _cab(client, a1), grupo["id"])
    assert convite is not None and convite["grupo"]["nome"] == grupo["nome"]
    assert convite["convidado_por"] == prof.nome
    r = client.post(f"/grupos/convites-recebidos/{convite['id']}/aceitar", headers=_cab(client, a1))
    assert r.status_code == 200, r.text

    convite2 = _convite_recebido(client, _cab(client, a2), grupo["id"])
    assert client.post(f"/grupos/convites-recebidos/{convite2['id']}/recusar", headers=_cab(client, a2)).status_code == 200

    visto = _meu_grupo(client, cab, grupo["id"])
    assert [m["id"] for m in visto["membros"]] == [a1.id]
    assert visto["membros"][0]["origem"] == "convite" and visto["membros"][0]["entrou_em"]
    assert visto["convites"] == []
    # convite respondido nao aparece mais nem pode ser respondido de novo
    assert _convite_recebido(client, _cab(client, a2), grupo["id"]) is None
    assert client.post(f"/grupos/convites-recebidos/{convite2['id']}/aceitar", headers=_cab(client, a2)).status_code == 404

    acoes = {a for (a,) in db.query(AuditLog.acao).filter(AuditLog.entidade_id == grupo["id"],
                                                          AuditLog.entidade == "grupo_envio")}
    assert {"grupo_envio_criado", "grupo_convite_enviado", "grupo_convite_aceito", "grupo_convite_recusado"} <= acoes


def test_ninguem_aceita_convite_feito_para_outra_pessoa(client, criar_usuario, limpar_grupos):
    prof = criar_usuario(perfil=UserRole.professor)
    a1, intruso = criar_usuario(), criar_usuario()
    grupo = _criar(client, _cab(client, prof), limpar_grupos, membros_ids=[a1.id])
    convite_id = grupo["convites"][0]["id"]
    assert client.post(f"/grupos/convites-recebidos/{convite_id}/aceitar", headers=_cab(client, intruso)).status_code == 404
    assert client.post(f"/grupos/convites-recebidos/{convite_id}/recusar", headers=_cab(client, intruso)).status_code == 404
    assert _meu_grupo(client, _cab(client, prof), grupo["id"])["membros"] == []


def test_dono_convida_depois_e_cancela_convite(client, criar_usuario, limpar_grupos, db):
    prof = criar_usuario(perfil=UserRole.professor)
    a1, bloqueado = criar_usuario(), criar_usuario(bloqueado=True)
    cab = _cab(client, prof)
    grupo = _criar(client, cab, limpar_grupos)

    r = client.post(f"/grupos/{grupo['id']}/convites", headers=cab, json={"usuario_id": a1.id})
    assert r.status_code == 200 and r.json()["situacao"] == "convite_pendente"
    # o mesmo convite de novo: so um pendente por pessoa
    assert client.post(f"/grupos/{grupo['id']}/convites", headers=cab, json={"usuario_id": a1.id}).status_code == 409
    # pessoa bloqueada e o proprio dono nao sao convidados
    assert client.post(f"/grupos/{grupo['id']}/convites", headers=cab, json={"usuario_id": bloqueado.id}).status_code == 404
    assert client.post(f"/grupos/{grupo['id']}/convites", headers=cab, json={"usuario_id": prof.id}).status_code == 404

    convite_id = _meu_grupo(client, cab, grupo["id"])["convites"][0]["id"]
    assert client.delete(f"/grupos/{grupo['id']}/convites/{convite_id}", headers=cab).status_code == 200
    assert _convite_recebido(client, _cab(client, a1), grupo["id"]) is None
    assert db.get(GrupoEntrada, convite_id).estado == "cancelado"


# --- (a) o estudante pede e o dono autoriza --------------------------------

def test_pedido_so_vira_participacao_quando_o_dono_autoriza(client, criar_usuario, limpar_grupos, db):
    prof = criar_usuario(perfil=UserRole.professor)
    aluno, outro = criar_usuario(), criar_usuario()
    cab = _cab(client, prof)
    nome = _nome("Radiologia Odontologica")
    grupo = _criar(client, cab, limpar_grupos, nome=nome)
    assert grupo["aceita_pedidos"] is True                         # grupo novo aceita pedidos

    achados = client.get("/grupos/procurar", headers=_cab(client, aluno), params={"nome": nome[-10:]}).json()["grupos"]
    assert [g["id"] for g in achados] == [grupo["id"]]
    # a busca mostra so o nome do grupo e quem o criou (D2)
    assert set(achados[0]) == {"id", "nome", "criador", "situacao"}
    assert achados[0]["criador"] == prof.nome and achados[0]["situacao"] is None

    r = client.post(f"/grupos/{grupo['id']}/pedir", headers=_cab(client, aluno))
    assert r.status_code == 200 and r.json()["situacao"] == "pedido_pendente"
    assert client.post(f"/grupos/{grupo['id']}/pedir", headers=_cab(client, aluno)).status_code == 409
    assert client.get("/grupos/participo", headers=_cab(client, aluno)).json()["grupos"] == []
    enviados = client.get("/grupos/pedidos-enviados", headers=_cab(client, aluno)).json()["pedidos"]
    assert [p["grupo"]["id"] for p in enviados] == [grupo["id"]]
    achados = client.get("/grupos/procurar", headers=_cab(client, aluno), params={"nome": nome[-10:]}).json()["grupos"]
    assert achados[0]["situacao"] == "pedido_pendente"

    client.post(f"/grupos/{grupo['id']}/pedir", headers=_cab(client, outro))
    pedidos = {p["pessoa"]["id"]: p["id"] for p in _meu_grupo(client, cab, grupo["id"])["pedidos"]}
    assert set(pedidos) == {aluno.id, outro.id}
    assert client.post(f"/grupos/{grupo['id']}/pedidos/{pedidos[aluno.id]}/autorizar", headers=cab).status_code == 200
    assert client.post(f"/grupos/{grupo['id']}/pedidos/{pedidos[outro.id]}/recusar", headers=cab).status_code == 200

    visto = _meu_grupo(client, cab, grupo["id"])
    assert [(m["id"], m["origem"]) for m in visto["membros"]] == [(aluno.id, "pedido")]
    assert visto["pedidos"] == []
    participo = client.get("/grupos/participo", headers=_cab(client, aluno)).json()["grupos"]
    assert [g["id"] for g in participo] == [grupo["id"]]
    # o participante nao ve a lista dos colegas (D2)
    assert set(participo[0]) == {"id", "nome", "criador", "entrou_em"}
    assert client.get("/grupos/participo", headers=_cab(client, outro)).json()["grupos"] == []

    acoes = {a for (a,) in db.query(AuditLog.acao).filter(AuditLog.entidade_id == grupo["id"],
                                                          AuditLog.entidade == "grupo_envio")}
    assert {"grupo_pedido_enviado", "grupo_pedido_autorizado", "grupo_pedido_recusado"} <= acoes


def test_estudante_cancela_o_proprio_pedido(client, criar_usuario, limpar_grupos):
    prof, aluno = criar_usuario(perfil=UserRole.professor), criar_usuario()
    grupo = _criar(client, _cab(client, prof), limpar_grupos)
    client.post(f"/grupos/{grupo['id']}/pedir", headers=_cab(client, aluno))
    pedido_id = client.get("/grupos/pedidos-enviados", headers=_cab(client, aluno)).json()["pedidos"][0]["id"]
    assert client.delete(f"/grupos/pedidos-enviados/{pedido_id}", headers=_cab(client, prof)).status_code == 404
    assert client.delete(f"/grupos/pedidos-enviados/{pedido_id}", headers=_cab(client, aluno)).status_code == 200
    assert _meu_grupo(client, _cab(client, prof), grupo["id"])["pedidos"] == []


def test_busca_e_pedido_sao_so_para_estudantes_e_grupos_abertos(client, criar_usuario, limpar_grupos):
    prof, aluno = criar_usuario(perfil=UserRole.professor), criar_usuario()
    colega = criar_usuario(perfil=UserRole.pesquisador)
    cab = _cab(client, prof)
    marca = uuid.uuid4().hex[:8]
    aberto = _criar(client, cab, limpar_grupos, nome=f"Aberto {marca}")
    fechado = _criar(client, cab, limpar_grupos, nome=f"Fechado {marca}", aceita_pedidos=False)

    achados = client.get("/grupos/procurar", headers=_cab(client, aluno), params={"nome": marca}).json()["grupos"]
    assert [g["id"] for g in achados] == [aberto["id"]]
    assert client.post(f"/grupos/{fechado['id']}/pedir", headers=_cab(client, aluno)).status_code == 404
    assert client.post("/grupos/999999999/pedir", headers=_cab(client, aluno)).status_code == 404
    # pelo menos 3 letras
    assert client.get("/grupos/procurar", headers=_cab(client, aluno), params={"nome": "ab"}).status_code == 422
    # so estudantes procuram e pedem (D7); os outros entram por convite
    assert client.get("/grupos/procurar", headers=_cab(client, colega), params={"nome": marca}).status_code == 403
    assert client.post(f"/grupos/{aberto['id']}/pedir", headers=_cab(client, colega)).status_code == 403

    # o dono liga e desliga "aceitar pedidos"
    r = client.put(f"/grupos/{fechado['id']}", headers=cab, json={"nome": fechado["nome"], "aceita_pedidos": True})
    assert r.status_code == 200 and r.json()["aceita_pedidos"] is True
    achados = client.get("/grupos/procurar", headers=_cab(client, aluno), params={"nome": marca}).json()["grupos"]
    assert {g["id"] for g in achados} == {aberto["id"], fechado["id"]}


def test_busca_traz_no_maximo_20_e_tem_limite_por_minuto(client, criar_usuario, limpar_grupos):
    prof, aluno = criar_usuario(perfil=UserRole.professor), criar_usuario()
    cab = _cab(client, prof)
    marca = uuid.uuid4().hex[:8]
    for i in range(22):
        _criar(client, cab, limpar_grupos, nome=f"Lote {marca} {i:02d}")
    cab_aluno = _cab(client, aluno)
    assert len(client.get("/grupos/procurar", headers=cab_aluno, params={"nome": marca}).json()["grupos"]) == 20
    codigos = [client.get("/grupos/procurar", headers=cab_aluno, params={"nome": marca}).status_code for _ in range(30)]
    assert 429 in codigos


def test_curinga_na_busca_e_texto_comum(client, criar_usuario, limpar_grupos):
    prof, aluno = criar_usuario(perfil=UserRole.professor), criar_usuario()
    _criar(client, _cab(client, prof), limpar_grupos)
    # "%" e "_" nao viram "qualquer coisa": nao listam todos os grupos
    assert client.get("/grupos/procurar", headers=_cab(client, aluno), params={"nome": "%%%"}).json()["grupos"] == []
    assert client.get("/grupos/procurar", headers=_cab(client, aluno), params={"nome": "___"}).json()["grupos"] == []


# --- convite e pedido cruzados, validade, saida ---------------------------

def test_convite_e_pedido_cruzados_entram_na_hora(client, criar_usuario, limpar_grupos):
    prof = criar_usuario(perfil=UserRole.professor)
    a1, a2 = criar_usuario(), criar_usuario()
    cab = _cab(client, prof)
    grupo = _criar(client, cab, limpar_grupos, membros_ids=[a1.id])

    # a1 ja foi convidado e pede para entrar: as duas partes concordaram
    r = client.post(f"/grupos/{grupo['id']}/pedir", headers=_cab(client, a1))
    assert r.status_code == 200 and r.json()["situacao"] == "participa"
    # a2 pediu antes e o dono o convida: entra na hora
    client.post(f"/grupos/{grupo['id']}/pedir", headers=_cab(client, a2))
    r = client.post(f"/grupos/{grupo['id']}/convites", headers=cab, json={"usuario_id": a2.id})
    assert r.status_code == 200 and r.json()["situacao"] == "participa"

    visto = _meu_grupo(client, cab, grupo["id"])
    assert {m["id"] for m in visto["membros"]} == {a1.id, a2.id}
    assert visto["convites"] == [] and visto["pedidos"] == []
    # quem ja participa nao e convidado de novo
    assert client.post(f"/grupos/{grupo['id']}/convites", headers=cab, json={"usuario_id": a1.id}).status_code == 409


def test_convite_e_pedido_vencem_em_30_dias(client, criar_usuario, limpar_grupos, db):
    prof = criar_usuario(perfil=UserRole.professor)
    a1, a2 = criar_usuario(), criar_usuario()
    cab = _cab(client, prof)
    grupo = _criar(client, cab, limpar_grupos, membros_ids=[a1.id])
    client.post(f"/grupos/{grupo['id']}/pedir", headers=_cab(client, a2))
    antigo = datetime.now(timezone.utc) - timedelta(days=31)
    db.query(GrupoEntrada).filter(GrupoEntrada.grupo_id == grupo["id"]).update({"criado_em": antigo})
    db.commit()

    convite_id = grupo["convites"][0]["id"]
    assert _convite_recebido(client, _cab(client, a1), grupo["id"]) is None
    assert client.post(f"/grupos/convites-recebidos/{convite_id}/aceitar", headers=_cab(client, a1)).status_code == 404
    visto = _meu_grupo(client, cab, grupo["id"])
    assert visto["membros"] == [] and visto["convites"] == [] and visto["pedidos"] == []
    db.expire_all()
    assert {e.estado for e in db.query(GrupoEntrada).filter(GrupoEntrada.grupo_id == grupo["id"])} == {"vencido"}
    # vencido nao impede um novo pedido
    assert client.post(f"/grupos/{grupo['id']}/pedir", headers=_cab(client, a2)).status_code == 200


def test_participante_sai_e_dono_tira_participante(client, criar_usuario, limpar_grupos, db):
    prof = criar_usuario(perfil=UserRole.professor)
    a1, a2 = criar_usuario(), criar_usuario()
    cab = _cab(client, prof)
    grupo = _criar(client, cab, limpar_grupos, membros_ids=[a1.id, a2.id])
    for quem in (a1, a2):
        c = _convite_recebido(client, _cab(client, quem), grupo["id"])
        client.post(f"/grupos/convites-recebidos/{c['id']}/aceitar", headers=_cab(client, quem))

    assert client.delete(f"/grupos/participo/{grupo['id']}", headers=_cab(client, a1)).status_code == 200
    assert client.delete(f"/grupos/participo/{grupo['id']}", headers=_cab(client, a1)).status_code == 404
    assert client.delete(f"/grupos/{grupo['id']}/membros/{a2.id}", headers=cab).status_code == 200
    assert _meu_grupo(client, cab, grupo["id"])["membros"] == []
    assert db.query(GrupoEnvioMembro).filter(GrupoEnvioMembro.grupo_id == grupo["id"]).count() == 0
    acoes = {a for (a,) in db.query(AuditLog.acao).filter(AuditLog.entidade_id == grupo["id"],
                                                          AuditLog.entidade == "grupo_envio")}
    assert {"grupo_participante_saiu", "grupo_participante_retirado"} <= acoes


def test_editar_lista_nao_coloca_ninguem_direto(client, criar_usuario, limpar_grupos):
    prof = criar_usuario(perfil=UserRole.professor)
    a1, a2 = criar_usuario(), criar_usuario()
    cab = _cab(client, prof)
    grupo = _criar(client, cab, limpar_grupos, membros_ids=[a1.id])
    c = _convite_recebido(client, _cab(client, a1), grupo["id"])
    client.post(f"/grupos/convites-recebidos/{c['id']}/aceitar", headers=_cab(client, a1))

    # a tela atual manda a lista inteira: quem ja participa fica, quem e novo e convidado
    r = client.put(f"/grupos/{grupo['id']}", headers=cab, json={"nome": grupo["nome"], "membros_ids": [a1.id, a2.id]})
    assert r.status_code == 200, r.text
    assert [m["id"] for m in r.json()["membros"]] == [a1.id]
    assert [c["pessoa"]["id"] for c in r.json()["convites"]] == [a2.id]
    # tirar da lista tira do grupo
    r = client.put(f"/grupos/{grupo['id']}", headers=cab, json={"nome": grupo["nome"], "membros_ids": []})
    assert r.json()["membros"] == []
    # sem a lista, os participantes ficam como estao
    r = client.put(f"/grupos/{grupo['id']}", headers=cab, json={"nome": "Outro nome " + uuid.uuid4().hex[:6]})
    assert r.status_code == 200 and [c["pessoa"]["id"] for c in r.json()["convites"]] == [a2.id]


# --- permissoes -----------------------------------------------------------

def test_so_o_dono_cuida_de_convites_pedidos_e_participantes(client, criar_usuario, limpar_grupos):
    prof, outro_prof = criar_usuario(perfil=UserRole.professor), criar_usuario(perfil=UserRole.professor)
    a1, a2 = criar_usuario(), criar_usuario()
    grupo = _criar(client, _cab(client, prof), limpar_grupos, membros_ids=[a1.id])
    client.post(f"/grupos/{grupo['id']}/pedir", headers=_cab(client, a2))
    visto = _meu_grupo(client, _cab(client, prof), grupo["id"])
    convite_id, pedido_id = visto["convites"][0]["id"], visto["pedidos"][0]["id"]

    alheio = _cab(client, outro_prof)
    assert client.post(f"/grupos/{grupo['id']}/convites", headers=alheio, json={"usuario_id": a2.id}).status_code == 404
    assert client.delete(f"/grupos/{grupo['id']}/convites/{convite_id}", headers=alheio).status_code == 404
    assert client.post(f"/grupos/{grupo['id']}/pedidos/{pedido_id}/autorizar", headers=alheio).status_code == 404
    assert client.post(f"/grupos/{grupo['id']}/pedidos/{pedido_id}/recusar", headers=alheio).status_code == 404
    assert client.delete(f"/grupos/{grupo['id']}/membros/{a1.id}", headers=alheio).status_code == 404
    # o estudante nao autoriza o proprio pedido
    assert client.post(f"/grupos/{grupo['id']}/pedidos/{pedido_id}/autorizar", headers=_cab(client, a2)).status_code == 403
    # um pedido de outro grupo nao e autorizado pelo id trocado
    outro = _criar(client, alheio, limpar_grupos)
    assert client.post(f"/grupos/{outro['id']}/pedidos/{pedido_id}/autorizar", headers=alheio).status_code == 404
    assert _meu_grupo(client, _cab(client, prof), grupo["id"])["membros"] == []


@pytest.mark.parametrize("perfil,pode", [
    (UserRole.professor, True), (UserRole.pesquisador, True), (UserRole.curador, True),
    (UserRole.administrador, True), (UserRole.estudante, False), (UserRole.suporte, False),
])
def test_quem_cria_grupos(client, criar_usuario, limpar_grupos, perfil, pode):
    u = criar_usuario(perfil=perfil)
    r = client.post("/grupos", headers=_cab(client, u), json={"nome": _nome()})
    if r.status_code == 200:
        limpar_grupos.append(r.json()["id"])
    assert (r.status_code == 200) is pode, r.text


# --- contador do menu (Etapa 2) -------------------------------------------

def test_pendencias_contam_so_o_que_e_da_pessoa(client, criar_usuario, limpar_grupos):
    """O menu mostra quantos convites a pessoa tem para responder e quantos
    pedidos esperam o dono nos grupos DELE (nunca os de outros)."""
    prof, outro_prof = criar_usuario(perfil=UserRole.professor), criar_usuario(perfil=UserRole.professor)
    a1, a2 = criar_usuario(), criar_usuario()
    g1 = _criar(client, _cab(client, prof), limpar_grupos, membros_ids=[a1.id])
    _criar(client, _cab(client, outro_prof), limpar_grupos, membros_ids=[a1.id])
    client.post(f"/grupos/{g1['id']}/pedir", headers=_cab(client, a2))

    assert client.get("/grupos/pendencias", headers=_cab(client, a1)).json() == {"convites": 2, "pedidos": 0}
    assert client.get("/grupos/pendencias", headers=_cab(client, a2)).json() == {"convites": 0, "pedidos": 0}
    assert client.get("/grupos/pendencias", headers=_cab(client, prof)).json() == {"convites": 0, "pedidos": 1}
    assert client.get("/grupos/pendencias", headers=_cab(client, outro_prof)).json() == {"convites": 0, "pedidos": 0}
    assert client.get("/grupos/pendencias").status_code == 401
