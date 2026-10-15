"""
Portaria das imagens (app/core/acesso_imagens.py + GET /visualizador/autorizar):
ninguem ve imagem do Orthanc sem login no Radix, e cada perfil so ve o que
pode (OWASP ASVS 5.0 - V8.2.2, V8.3.1, V16.3.2).
"""

import random

from app.core.acesso_imagens import classificar_pedido, decidir
from app.modules.audit_logs import AuditLog
from app.modules.compartilhamentos import CompartilhamentoImagem
from app.modules.curations import StatusCuradoria
from app.modules.orthanc_references import OrthancReference
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


# ---------- regras puras ----------

def test_classifica_enderecos_dicomweb_e_wado():
    p = classificar_pedido("/dicom-web/studies/1.2.840.1/series/1.2.3/metadata")
    assert p.tipo == "estudo" and p.uids == {"1.2.840.1"}
    p = classificar_pedido("/dicom-web/studies?StudyInstanceUID=1.2.3,1.2.4&includefield=all")
    assert p.tipo == "estudo" and p.uids == {"1.2.3", "1.2.4"}
    assert classificar_pedido("/dicom-web/studies?limit=101&offset=0").tipo == "lista"
    p = classificar_pedido("/wado?requestType=WADO&studyUID=1.2.9&seriesUID=1&objectUID=2")
    assert p.tipo == "estudo" and p.uids == {"1.2.9"}
    assert classificar_pedido("/instances").tipo == "outro"
    assert classificar_pedido("/app/explorer.html").tipo == "outro"
    assert classificar_pedido("/dicom-web/studies/abc'or'1/series").uid_invalido
    assert classificar_pedido("/dicom-web/studies/1.2/../../instances").uid_invalido


def test_regras_por_perfil():
    estudo = classificar_pedido("/dicom-web/studies/1.2.3/series")
    lista = classificar_pedido("/dicom-web/studies")
    api = classificar_pedido("/instances/abc")
    nenhum = lambda uids: set()  # noqa: E731
    todos = lambda uids: set(uids)  # noqa: E731
    # administrador: tudo, inclusive apagar e a API do Orthanc
    assert decidir("administrador", "DELETE", api, nenhum)
    # suporte: so leitura, de tudo
    assert decidir("suporte", "GET", lista, nenhum)
    assert not decidir("suporte", "DELETE", api, nenhum)
    # demais: so leitura do que o banco permitir; nada de lista geral/API
    assert decidir("estudante", "GET", estudo, todos)
    assert not decidir("estudante", "GET", estudo, nenhum)
    assert not decidir("curador", "GET", lista, todos)
    assert not decidir("curador", "GET", api, todos)
    assert not decidir("curador", "POST", estudo, todos)
    # varios estudos no mesmo pedido: precisa poder TODOS
    dois = classificar_pedido("/dicom-web/studies?StudyInstanceUID=1.2.3,1.2.4")
    assert not decidir("estudante", "GET", dois, lambda uids: {"1.2.3"})


# ---------- rota completa (como o Nginx chama) ----------

def _uid_numerico() -> str:
    return "1.2.826.0.1.3680043." + str(random.randint(10**8, 10**9))


def _ficha_com_uid(db, criar_ficha, status=StatusCuradoria.APROVADA.value, ativo=True):
    ficha = criar_ficha(status=status, ativo=ativo)
    ref = db.query(OrthancReference).get(ficha.orthanc_reference_id)
    ref.study_instance_uid = _uid_numerico()
    db.commit()
    return ficha, ref.study_instance_uid


def _pedir(client, token, uri, metodo="GET"):
    cab = {"X-Original-URI": uri, "X-Original-Method": metodo}
    if token:
        cab.update(cabecalho_auth(token))
    return client.get("/visualizador/autorizar", headers=cab)


def test_sem_login_nao_ve_nada(client, db, criar_ficha):
    client.cookies.clear()
    _, uid = _ficha_com_uid(db, criar_ficha)
    assert _pedir(client, None, f"/dicom-web/studies/{uid}/series").status_code == 401


def test_estudante_ve_aprovada_e_compartilhada_mas_nao_pendente(client, db, criar_usuario, criar_ficha):
    estudante = criar_usuario()
    remetente = criar_usuario(perfil=UserRole.curador)
    token = obter_token(client, estudante.email)
    _, uid_aprovada = _ficha_com_uid(db, criar_ficha)
    _, uid_pendente = _ficha_com_uid(db, criar_ficha, status=StatusCuradoria.PENDENTE.value)
    ficha_comp, uid_comp = _ficha_com_uid(db, criar_ficha, status=StatusCuradoria.PENDENTE.value)
    _, uid_inativa = _ficha_com_uid(db, criar_ficha, ativo=False)
    db.add(CompartilhamentoImagem(remetente_id=remetente.id, destinatario_id=estudante.id, curation_id=ficha_comp.id))
    db.commit()

    assert _pedir(client, token, f"/dicom-web/studies/{uid_aprovada}/series/1.2/instances/3.4/frames/1").status_code == 204
    assert _pedir(client, token, f"/dicom-web/studies?StudyInstanceUID={uid_aprovada}").status_code == 204
    assert _pedir(client, token, f"/dicom-web/studies/{uid_comp}/metadata").status_code == 204
    assert _pedir(client, token, f"/dicom-web/studies/{uid_pendente}/metadata").status_code == 403
    assert _pedir(client, token, f"/dicom-web/studies/{uid_inativa}/metadata").status_code == 403
    # lista geral, API do Orthanc e escrita: negados
    assert _pedir(client, token, "/dicom-web/studies?limit=101").status_code == 403
    assert _pedir(client, token, "/instances").status_code == 403
    assert _pedir(client, token, f"/dicom-web/studies/{uid_aprovada}", "DELETE").status_code == 403
    # negacoes ficam na auditoria
    negados = db.query(AuditLog).filter(AuditLog.usuario_id == estudante.id, AuditLog.acao == "acesso_imagem_negado").count()
    assert negados == 5


def test_curador_ve_cadastradas_e_admin_tudo(client, db, criar_usuario, criar_ficha):
    curador = criar_usuario(perfil=UserRole.curador)
    admin = criar_usuario(perfil=UserRole.administrador)
    _, uid_pendente = _ficha_com_uid(db, criar_ficha, status=StatusCuradoria.PENDENTE.value)
    t_cur = obter_token(client, curador.email)
    assert _pedir(client, t_cur, f"/dicom-web/studies/{uid_pendente}/series").status_code == 204
    assert _pedir(client, t_cur, f"/dicom-web/studies/{_uid_numerico()}/series").status_code == 403
    assert _pedir(client, t_cur, "/instances").status_code == 403
    t_adm = obter_token(client, admin.email)
    assert _pedir(client, t_adm, "/instances").status_code == 204
    assert _pedir(client, t_adm, "/app/explorer.html").status_code == 204
    client.cookies.clear()
