"""
EXPORTACAO DAS MARCACOES DA TOMOGRAFIA NA AUDITORIA (pedido do Luciano,
24/11/2026: "registrar auditoria"). O arquivo JSON continua sendo montado no
navegador (nada novo sai do servidor), mas antes de baixar a tela avisa o
servidor, que registra na auditoria quem exportou, de qual exame e quantas
marcacoes e medidas.

Regras conferidas:
- POST /reconstrucao/{ref}/exportacao -> 201 e um registro
  "exportacao_marcacoes_tc" (entidade orthanc_reference) com as contagens;
- so curador e administrador (como a tela de marcacao); exame que nao
  existe: 404; contagens fora do limite: 422.
Dados inventados.
"""

import pytest

from app.modules.audit_logs import AuditLog
from app.modules.users import UserRole
from tests.test_reconstrucao_api import _cab


def test_registra_a_exportacao(client, criar_usuario, criar_referencia, db):
    ref = criar_referencia()
    usuario = criar_usuario(perfil=UserRole.curador)
    from tests.conftest import cabecalho_auth, obter_token

    cab = cabecalho_auth(obter_token(client, usuario.email))
    r = client.post(f"/reconstrucao/{ref.id}/exportacao", headers=cab, json={"marcacoes": 3, "medidas": 2})
    assert r.status_code == 201, r.text
    log = db.query(AuditLog).filter(AuditLog.acao == "exportacao_marcacoes_tc", AuditLog.entidade_id == ref.id).one()
    assert log.usuario_id == usuario.id
    assert log.entidade == "orthanc_reference" and log.resultado == "sucesso"
    assert "3 marcações" in log.detalhes and "2 medidas" in log.detalhes


@pytest.mark.parametrize("perfil", [UserRole.estudante, UserRole.professor, UserRole.pesquisador])
def test_so_curadoria(client, criar_usuario, criar_referencia, perfil):
    ref = criar_referencia()
    r = client.post(f"/reconstrucao/{ref.id}/exportacao", headers=_cab(client, criar_usuario, perfil), json={"marcacoes": 1, "medidas": 0})
    assert r.status_code == 403


def test_exame_inexistente_404(client, criar_usuario):
    r = client.post("/reconstrucao/999999999/exportacao", headers=_cab(client, criar_usuario), json={"marcacoes": 1, "medidas": 0})
    assert r.status_code == 404


@pytest.mark.parametrize("corpo", [{"marcacoes": -1, "medidas": 0}, {"marcacoes": 1, "medidas": 100000}, {}])
def test_contagens_invalidas_422(client, criar_usuario, criar_referencia, corpo):
    ref = criar_referencia()
    assert client.post(f"/reconstrucao/{ref.id}/exportacao", headers=_cab(client, criar_usuario), json=corpo).status_code == 422
