"""
FILA: O ADMINISTRADOR VE E ASSUME FICHAS EM ANDAMENTO DE OUTRO CURADOR
(pedido do Luciano, 24/11/2026, opcao A: "sumiram as tomografias da
curadoria" - as 2 tomografias tinham ficha em analise do "Curador
Demonstracao" e o Luciano entrou com outro usuario).

Regra:
- o ADMINISTRADOR ve na fila as fichas em andamento (pendente / em analise)
  de QUALQUER curador, com o nome de quem esta com ela ("em_andamento_de");
- ao abrir, o administrador ASSUME a ficha (vira o curador dela). Fica no
  historico da ficha ("ficha_assumida") e na auditoria, com quem estava
  antes - a autoria continua rastreavel para a pesquisa;
- curador comum continua sem ver nem abrir as fichas de outro (409) e o
  suporte so ve (nao assume);
- ficha aprovada (ou em segunda opiniao) nao volta para a fila.
Dados inventados.
"""

from app.modules.audit_logs import AuditLog
from app.modules.curations import CurationHistory, StatusCuradoria
from app.modules.users import UserRole
from tests.test_fila_continuar_em_analise import _cab, _ficha_na_fila, _fila


def _curador(criar_usuario, db, nome="Curador Demonstracao"):
    u = criar_usuario(perfil=UserRole.curador)
    u.nome = nome
    db.commit()
    return u


def _item(fila, ficha):
    return next((i for i in fila["itens"] if i["orthanc_reference_id"] == ficha.orthanc_reference_id), None)


def test_administrador_ve_a_ficha_de_outro_curador_com_o_nome(client, criar_usuario, criar_ficha, db):
    dono = _curador(criar_usuario, db)
    admin = criar_usuario(perfil=UserRole.administrador)
    ficha = _ficha_na_fila(criar_ficha, db, dono)
    fila = _fila(client, _cab(client, admin))
    item = _item(fila, ficha)
    assert item is not None
    assert item["curation_id"] == ficha.id
    assert item["em_andamento"] is False
    assert item["em_andamento_de"] == "Curador Demonstracao"
    assert fila["por_tipo"].get("tomografia", 0) >= 1


def test_administrador_assume_ao_abrir_com_historico_e_auditoria(client, criar_usuario, criar_ficha, db):
    dono = _curador(criar_usuario, db)
    admin = criar_usuario(perfil=UserRole.administrador)
    ficha = _ficha_na_fila(criar_ficha, db, dono)
    cab = _cab(client, admin)
    r = client.post(f"/curation/{ficha.orthanc_reference_id}", headers=cab, json={})
    assert r.status_code in (200, 201), r.text
    assert r.json()["curation_id"] == ficha.id
    db.expire_all()
    db.refresh(ficha)
    assert ficha.curador_id == admin.id
    assert ficha.status == StatusCuradoria.EM_ANALISE.value
    hist = db.query(CurationHistory).filter(CurationHistory.curation_id == ficha.id, CurationHistory.acao == "ficha_assumida").one()
    assert hist.usuario_id == admin.id
    assert "Curador Demonstracao" in (hist.justificativa or "")
    log = db.query(AuditLog).filter(AuditLog.acao == "ficha_assumida", AuditLog.entidade_id == ficha.id).one()
    assert log.usuario_id == admin.id
    assert f"curador anterior {dono.id}" in (log.detalhes or "")
    # agora a ficha e do administrador: na fila dele, "em andamento" proprio
    item = _item(_fila(client, cab), ficha)
    assert item["em_andamento"] is True and item["em_andamento_de"] is None


def test_suporte_ve_mas_nao_assume(client, criar_usuario, criar_ficha, db):
    dono = criar_usuario(perfil=UserRole.curador)
    suporte = criar_usuario(perfil=UserRole.suporte)
    ficha = _ficha_na_fila(criar_ficha, db, dono)
    cab = _cab(client, suporte)
    assert _item(_fila(client, cab), ficha) is None
    assert client.post(f"/curation/{ficha.orthanc_reference_id}", headers=cab, json={}).status_code in (403, 409)
    db.refresh(ficha)
    assert ficha.curador_id == dono.id


def test_curador_comum_continua_sem_ver_a_ficha_de_outro(client, criar_usuario, criar_ficha, db):
    dono, outro = criar_usuario(perfil=UserRole.curador), criar_usuario(perfil=UserRole.curador)
    ficha = _ficha_na_fila(criar_ficha, db, dono)
    cab = _cab(client, outro)
    assert _item(_fila(client, cab), ficha) is None
    assert client.post(f"/curation/{ficha.orthanc_reference_id}", headers=cab, json={}).status_code == 409


def test_ficha_aprovada_de_outro_nao_aparece_nem_para_o_administrador(client, criar_usuario, criar_ficha, db):
    dono = criar_usuario(perfil=UserRole.curador)
    admin = criar_usuario(perfil=UserRole.administrador)
    ficha = _ficha_na_fila(criar_ficha, db, dono, status=StatusCuradoria.APROVADA.value)
    cab = _cab(client, admin)
    assert _item(_fila(client, cab), ficha) is None
    assert client.post(f"/curation/{ficha.orthanc_reference_id}", headers=cab, json={}).status_code == 409
