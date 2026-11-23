"""
AVISO COM ACEITE NA TELA "ENVIAR IMAGEM" (pedido do video, 22/11/2026).

Ao entrar na tela, a pessoa ve: a imagem enviada ao Radix nao tem finalidade
diagnostica; a imagem original deve ser anexada ao prontuario do paciente
conforme o protocolo da instituicao. Ela so usa a tela depois de marcar
"Estou ciente". O aceite fica na auditoria, com a versao do texto.
- so quem pode enviar (estudante, professor, curador, administrador);
- auditoria `aviso_envio_ciente` com a versao.
Dados inventados.
"""

import pytest

from app.modules.audit_logs import AuditLog
from app.modules.envios_router import AVISO_ENVIO_VERSAO
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


@pytest.mark.parametrize("perfil", [UserRole.estudante, UserRole.professor, UserRole.curador, UserRole.administrador])
def test_aceite_fica_na_auditoria_com_a_versao(client, criar_usuario, db, perfil):
    usuario = criar_usuario(perfil=perfil)
    token = obter_token(client, usuario.email)
    r = client.post("/envios/aviso-ciente", headers=cabecalho_auth(token))
    assert r.status_code == 200 and r.json()["versao"] == AVISO_ENVIO_VERSAO
    registro = db.query(AuditLog).filter(AuditLog.usuario_id == usuario.id, AuditLog.acao == "aviso_envio_ciente").one()
    assert AVISO_ENVIO_VERSAO in registro.detalhes


def test_quem_nao_envia_nao_registra(client, criar_usuario):
    usuario = criar_usuario(perfil=UserRole.pesquisador)
    token = obter_token(client, usuario.email)
    assert client.post("/envios/aviso-ciente", headers=cabecalho_auth(token)).status_code == 403


def test_sem_login_nao_registra(client):
    assert client.post("/envios/aviso-ciente").status_code == 401
