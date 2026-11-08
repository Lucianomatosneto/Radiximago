"""
Etapa D da separacao (08/11/2026): aparelhos de raio X da rede.

Regras do Luciano: so o ADMINISTRADOR cadastra, libera e bloqueia; aparelho
nao cadastrado ou bloqueado e RECUSADO (o Orthanc so recebe a lista dos
liberados, com AE Title e IP conferidos). A imagem que chega guarda de qual
aparelho veio.
"""

import uuid

import pytest
from sqlalchemy import text

from app.modules import anonimizacao_automatica, images_router, orthanc_client
from app.modules.aparelhos import AparelhoRede
from app.modules.audit_logs import AuditLog
from app.modules.orthanc_references import OrthancReference
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token

_CABS: dict[int, dict] = {}


def _cab(client, u):
    if u.id not in _CABS:
        from app.main import app
        app.state.limiter.reset()
        _CABS[u.id] = cabecalho_auth(obter_token(client, u.email))
    return _CABS[u.id]


@pytest.fixture()
def orthanc_aparelhos(monkeypatch):
    """Lista de aparelhos do Orthanc, de mentira (em memoria)."""
    lista: dict[str, dict] = {"outro-sistema": {"AET": "PACS", "Host": "10.0.0.9", "Port": 104}}
    estado = {"no_ar": True, "echo": True}

    def _exigir():
        if not estado["no_ar"]:
            raise ConnectionError("Orthanc fora do ar")

    def listar():
        _exigir()
        return dict(lista)

    def gravar(nome, aet, ip, porta):
        _exigir()
        lista[nome] = {"AET": aet, "Host": ip, "Port": porta, "AllowStore": True, "AllowFind": False}

    def remover(nome):
        _exigir()
        lista.pop(nome, None)

    def testar(nome, segundos=5):
        _exigir()
        return estado["echo"] and nome in lista

    monkeypatch.setattr(orthanc_client, "listar_modalidades", listar)
    monkeypatch.setattr(orthanc_client, "gravar_modalidade", gravar)
    monkeypatch.setattr(orthanc_client, "remover_modalidade", remover)
    monkeypatch.setattr(orthanc_client, "testar_modalidade", testar)
    return lista, estado


_REFS_CRIADAS: list[str] = []


def _limpar(db):
    # a auditoria e protegida contra apagamento (gatilho, ASVS 16.4.2): so a
    # limpeza dos testes desliga o gatilho, dentro desta transacao
    db.rollback()
    db.execute(text("SET LOCAL session_replication_role = replica"))
    refs = db.query(OrthancReference).filter(
        (OrthancReference.aparelho_id.isnot(None)) | (OrthancReference.orthanc_id.in_(_REFS_CRIADAS)))
    ids = [r.id for r in refs]
    if ids:
        db.query(AuditLog).filter(AuditLog.entidade == "orthanc_reference", AuditLog.entidade_id.in_(ids)).delete()
        db.query(OrthancReference).filter(OrthancReference.id.in_(ids)).delete()
    db.query(AuditLog).filter(AuditLog.entidade == "aparelho_rede").delete()
    db.query(AparelhoRede).delete()
    db.commit()
    _REFS_CRIADAS.clear()


@pytest.fixture()
def limpar_aparelhos(db):
    _limpar(db)
    yield
    _limpar(db)


def _novo(aet="RX-SALA1", ip="192.168.0.25", **extra):
    return {"nome": "Raio X periapical sala 1", "unidade": "Clinica 1", "aet": aet, "ip": ip, "porta": 104, **extra}


def test_so_administrador_gerencia_e_suporte_so_ve_e_testa(client, criar_usuario, orthanc_aparelhos, limpar_aparelhos):
    lista, _ = orthanc_aparelhos
    adm, sup = criar_usuario(perfil=UserRole.administrador), criar_usuario(perfil=UserRole.suporte)
    cur, prof = criar_usuario(perfil=UserRole.curador), criar_usuario(perfil=UserRole.professor)

    r = client.post("/aparelhos", headers=_cab(client, adm), json=_novo(aet=" rx-sala1 "))
    assert r.status_code == 200, r.text
    ap = r.json()["aparelho"]
    assert ap["aet"] == "RX-SALA1" and ap["liberado"] is True and r.json()["aviso"] is None
    assert lista[f"radix-{ap['id']}"]["Host"] == "192.168.0.25"
    assert "outro-sistema" in lista   # o Radix so mexe nos "radix-*"

    assert client.post("/aparelhos", headers=_cab(client, sup), json=_novo(aet="X2")).status_code == 403
    assert client.post(f"/aparelhos/{ap['id']}/bloquear", headers=_cab(client, sup)).status_code == 403
    assert client.get("/aparelhos", headers=_cab(client, cur)).status_code == 403
    assert client.get("/aparelhos", headers=_cab(client, prof)).status_code == 403

    visto = client.get("/aparelhos", headers=_cab(client, sup)).json()
    assert visto["pode_gerir"] is False and visto["configuracao"]["porta"] == 4242
    assert [a["aet"] for a in visto["aparelhos"]] == ["RX-SALA1"]
    r = client.post(f"/aparelhos/{ap['id']}/testar", headers=_cab(client, sup))
    assert r.status_code == 200 and r.json() == {"respondeu": True, "orthanc_no_ar": True}


def test_bloquear_tira_do_orthanc_e_liberar_devolve(client, criar_usuario, orthanc_aparelhos, limpar_aparelhos, db):
    lista, estado = orthanc_aparelhos
    adm = criar_usuario(perfil=UserRole.administrador)
    cab = _cab(client, adm)
    ap = client.post("/aparelhos", headers=cab, json=_novo()).json()["aparelho"]
    chave = f"radix-{ap['id']}"

    assert client.post(f"/aparelhos/{ap['id']}/bloquear", headers=cab).json()["aparelho"]["liberado"] is False
    assert chave not in lista
    assert client.post(f"/aparelhos/{ap['id']}/testar", headers=cab).status_code == 409
    client.post(f"/aparelhos/{ap['id']}/liberar", headers=cab)
    assert chave in lista

    # alterar o IP vale no Orthanc
    client.put(f"/aparelhos/{ap['id']}", headers=cab, json=_novo(ip="192.168.0.30"))
    assert lista[chave]["Host"] == "192.168.0.30"

    # Orthanc fora do ar: salva no Radix, avisa, e o ciclo seguinte aplica
    estado["no_ar"] = False
    r = client.post(f"/aparelhos/{ap['id']}/bloquear", headers=cab)
    assert r.status_code == 200 and "Orthanc" in r.json()["aviso"]
    assert chave in lista
    estado["no_ar"] = True
    assert anonimizacao_automatica.sincronizar_aparelhos() == 1
    assert chave not in lista

    acoes = [a for (a,) in db.query(AuditLog.acao).filter(AuditLog.entidade == "aparelho_rede",
                                                          AuditLog.entidade_id == ap["id"])]
    assert {"aparelho_cadastrado", "aparelho_bloqueado", "aparelho_liberado", "aparelho_alterado"} <= set(acoes)


@pytest.mark.parametrize("campo,valor", [
    ("ip", "999.1.1.1"), ("ip", "0.0.0.0"), ("ip", "224.0.0.1"), ("ip", "maquina.local"),
    ("aet", "NOME/COM/BARRA"), ("aet", "A" * 17), ("aet", "RADIXIMAGO"), ("porta", 0), ("porta", 70000),
])
def test_dados_invalidos_sao_recusados(client, criar_usuario, orthanc_aparelhos, limpar_aparelhos, campo, valor):
    adm = criar_usuario(perfil=UserRole.administrador)
    r = client.post("/aparelhos", headers=_cab(client, adm), json=_novo(**{campo: valor}))
    assert r.status_code == 422, (campo, valor, r.text)


def test_mesmo_ae_title_nao_pode_repetir(client, criar_usuario, orthanc_aparelhos, limpar_aparelhos):
    cab = _cab(client, criar_usuario(perfil=UserRole.administrador))
    assert client.post("/aparelhos", headers=cab, json=_novo()).status_code == 200
    assert client.post("/aparelhos", headers=cab, json=_novo(ip="192.168.0.99")).status_code == 409


def test_imagem_que_chega_guarda_de_qual_aparelho_veio(
        client, criar_usuario, orthanc_aparelhos, limpar_aparelhos, monkeypatch, db):
    cab = _cab(client, criar_usuario(perfil=UserRole.administrador))
    ap = client.post("/aparelhos", headers=cab, json=_novo()).json()["aparelho"]

    ids = [f"chegada-{uuid.uuid4()}", f"chegada-{uuid.uuid4()}"]
    metadados = {
        ids[0]: {"Origin": "DicomProtocol", "RemoteAET": "RX-SALA1", "RemoteIP": "192.168.0.25"},
        ids[1]: {"Origin": "DicomProtocol", "RemoteAET": "DESCONHECIDO", "RemoteIP": "10.1.1.1"},
    }
    monkeypatch.setattr(anonimizacao_automatica, "ferramentas_prontas", lambda: True)
    monkeypatch.setattr(orthanc_client, "listar_instancias", lambda: list(ids))
    monkeypatch.setattr(orthanc_client, "obter_metadado_instancia", lambda oid, chave: metadados[oid].get(chave))

    def registrar(db_, oid):
        _REFS_CRIADAS.append(f"anon-{oid}")
        ref = OrthancReference(orthanc_id=f"anon-{oid}", resource_type="instance",
                               anonimizacao_status="concluida", origem="aparelho")
        db_.add(ref)
        db_.commit()
        return ref, True

    monkeypatch.setattr(images_router, "_registrar_referencia_se_nova", registrar)
    assert anonimizacao_automatica.processar_chegadas() == 2

    db.expire_all()
    refs = {r.orthanc_id: r for r in db.query(OrthancReference).filter(OrthancReference.orthanc_id.in_(
        [f"anon-{i}" for i in ids]))}
    assert refs[f"anon-{ids[0]}"].aparelho_id == ap["id"]
    assert refs[f"anon-{ids[1]}"].aparelho_id is None
    assert refs[f"anon-{ids[0]}"].destino == "fila"   # vai para a fila de curadoria
    aparelho = db.get(AparelhoRede, ap["id"])
    assert aparelho.total_recebidas == 1 and aparelho.ultimo_recebimento_em is not None
    detalhes = [d for (d,) in db.query(AuditLog.detalhes).filter(
        AuditLog.acao == "anonimizacao_automatica", AuditLog.entidade_id.in_([r.id for r in refs.values()]))]
    assert any("Raio X periapical sala 1" in d for d in detalhes)
    assert any("NAO cadastrado" in d for d in detalhes)


def test_painel_mostra_situacao_dos_aparelhos(client, criar_usuario, orthanc_aparelhos, limpar_aparelhos):
    lista, estado = orthanc_aparelhos
    adm = criar_usuario(perfil=UserRole.administrador)
    cab = _cab(client, adm)
    vazio = client.get("/integracoes/status", headers=cab).json()["aparelhos"]
    assert vazio["status"] == "aguardando" and vazio["liberados"] == 0

    ap = client.post("/aparelhos", headers=cab, json=_novo()).json()["aparelho"]
    ok = client.get("/integracoes/status", headers=cab).json()["aparelhos"]
    assert ok["status"] == "online" and ok["liberados"] == 1 and ok["lista_confere"] is True

    lista.pop(f"radix-{ap['id']}")          # Orthanc perdeu a lista
    assert client.get("/integracoes/status", headers=cab).json()["aparelhos"]["status"] == "instavel"
    estado["no_ar"] = False                 # Orthanc fora do ar
    assert client.get("/integracoes/status", headers=cab).json()["aparelhos"]["status"] == "instavel"
