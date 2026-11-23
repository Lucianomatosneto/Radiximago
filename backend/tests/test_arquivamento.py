"""
Situacao "arquivada" (18/11/2026, Bloco 6): uma imagem APROVADA sai de
circulacao sem ser apagada nem descartada, e pode voltar ("desarquivar").
"""
import pytest

from app.modules.audit_logs import AuditLog
from app.modules.curations import CurationHistory, StatusCuradoria
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


@pytest.fixture()
def curador(client, criar_usuario):
    return cabecalho_auth(obter_token(client, criar_usuario(perfil=UserRole.curador).email))


@pytest.fixture()
def estudante(client, criar_usuario):
    return cabecalho_auth(obter_token(client, criar_usuario(perfil=UserRole.estudante).email))


@pytest.fixture()
def aprovada(db, criar_ficha):
    ficha = criar_ficha(status=StatusCuradoria.APROVADA.value)
    ficha.anonimizacao_validada = True
    db.commit()
    return ficha


def _ids_na_busca(client, h):
    r = client.get("/search", params={"limit": 200}, headers=h)
    assert r.status_code == 200, r.text
    return {i["curation_id"] for i in r.json()["itens"]}


def test_arquivar_tira_da_busca_e_desarquivar_devolve(client, curador, estudante, db, aprovada):
    assert aprovada.id in _ids_na_busca(client, estudante)

    r = client.post(f"/curation/{aprovada.id}/arquivar", json={"motivo": "Substituida por imagem melhor"}, headers=curador)
    assert r.status_code == 200, r.text
    db.refresh(aprovada)
    assert aprovada.status == "arquivada"
    assert aprovada.id not in _ids_na_busca(client, estudante)  # saiu de circulacao

    r = client.post(f"/curation/{aprovada.id}/desarquivar", json={}, headers=curador)
    assert r.status_code == 200, r.text
    db.refresh(aprovada)
    assert aprovada.status == "aprovada"
    assert aprovada.id in _ids_na_busca(client, estudante)


def test_arquivamento_fica_no_historico_e_na_auditoria(client, curador, db, aprovada):
    client.post(f"/curation/{aprovada.id}/arquivar", json={"motivo": "Desatualizada"}, headers=curador)
    hist = db.query(CurationHistory).filter(CurationHistory.curation_id == aprovada.id,
                                            CurationHistory.acao == "arquivamento").one()
    assert (hist.status_anterior, hist.status_novo, hist.justificativa) == ("aprovada", "arquivada", "Desatualizada")
    assert db.query(AuditLog).filter(AuditLog.acao == "arquivamento", AuditLog.entidade_id == aprovada.id).count() == 1


def test_arquivar_exige_motivo(client, curador, aprovada):
    r = client.post(f"/curation/{aprovada.id}/arquivar", json={"motivo": "   "}, headers=curador)
    assert r.status_code == 422


@pytest.mark.parametrize("status", ["em_analise", "descartada", "segunda_opiniao"])
def test_so_ficha_aprovada_pode_ser_arquivada(client, curador, criar_ficha, status):
    ficha = criar_ficha(status=status)
    r = client.post(f"/curation/{ficha.id}/arquivar", json={"motivo": "teste"}, headers=curador)
    assert r.status_code == 409


def test_so_ficha_arquivada_pode_ser_desarquivada(client, curador, aprovada):
    assert client.post(f"/curation/{aprovada.id}/desarquivar", json={}, headers=curador).status_code == 409


def test_arquivada_nao_pode_ser_aprovada_nem_descartada_direto(client, curador, aprovada):
    client.post(f"/curation/{aprovada.id}/arquivar", json={"motivo": "x"}, headers=curador)
    assert client.post(f"/curation/{aprovada.id}/approve", json={"anonimizacao_validada": True},
                       headers=curador).status_code == 409
    assert client.post(f"/curation/{aprovada.id}/discard", json={"motivo": "x"}, headers=curador).status_code == 409


def test_estudante_nao_arquiva(client, estudante, aprovada):
    assert client.post(f"/curation/{aprovada.id}/arquivar", json={"motivo": "x"},
                       headers=estudante).status_code == 403


def test_contagem_dos_paineis_tem_arquivadas(client, curador, db, aprovada):
    from app.modules.admin_router import contar_imagens_por_situacao

    antes = contar_imagens_por_situacao(db)
    client.post(f"/curation/{aprovada.id}/arquivar", json={"motivo": "x"}, headers=curador)
    depois = contar_imagens_por_situacao(db)
    assert depois["por_situacao"]["arquivada"] - antes["por_situacao"]["arquivada"] == 1
    assert depois["total"] == sum(depois["por_situacao"].values())  # a soma continua batendo


def test_lista_de_imagens_traz_a_ficha_para_arquivar(client, curador, aprovada):
    itens = {i["id"]: i for i in client.get("/images/", headers=curador).json()}
    assert itens[aprovada.orthanc_reference_id]["curation_id"] == aprovada.id
