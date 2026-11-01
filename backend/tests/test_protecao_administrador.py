"""
Protecao do administrador (01/11/2026 - auditoria do administrador, M1).

- ninguem bloqueia nem exclui a PROPRIA conta (a exclusao ja era recusada);
- nunca fica o sistema sem administrador ativo (defesa extra: so acontece
  quando o alvo e o unico ativo, o que pela API so ocorreria se ele mesmo
  pedisse - ja recusado acima - ou por outro caminho no futuro);
- bloquear outro administrador, havendo outro ativo, continua possivel.
A tela tira Bloquear/Encerrar/Excluir da propria linha e pede confirmacao.
"""

import pytest
from fastapi import HTTPException

from app.modules.users import User, UserRole
from app.modules.users_router import _exigir_outro_administrador
from tests.conftest import cabecalho_auth, obter_token


def test_nao_bloqueia_nem_exclui_a_propria_conta(client, criar_usuario):
    admin = criar_usuario(perfil=UserRole.administrador)
    cab = cabecalho_auth(obter_token(client, admin.email))
    r = client.patch(f"/users/{admin.id}/block", headers=cab)
    assert r.status_code == 422 and "própria conta" in r.json()["detail"]
    assert client.delete(f"/users/{admin.id}", headers=cab).status_code == 422


def test_bloquear_outro_administrador_funciona(client, criar_usuario):
    admin = criar_usuario(perfil=UserRole.administrador)
    outro = criar_usuario(perfil=UserRole.administrador)
    cab = cabecalho_auth(obter_token(client, admin.email))
    assert client.patch(f"/users/{outro.id}/block", headers=cab).status_code == 200
    assert client.patch(f"/users/{outro.id}/block", headers=cab).status_code == 200  # desbloqueia


def test_ultimo_administrador_ativo_nao_pode_sair(db, criar_usuario):
    unico = criar_usuario(perfil=UserRole.administrador)
    outros = db.query(User).filter(User.perfil == UserRole.administrador, User.id != unico.id,
                                   User.bloqueado.is_(False)).all()
    for u in outros:
        u.bloqueado = True
    db.commit()
    try:
        with pytest.raises(HTTPException) as erro:
            _exigir_outro_administrador(db, db.get(User, unico.id), "bloquear")
        assert erro.value.status_code == 409 and "último administrador" in erro.value.detail
        # perfil que nao e administrador nao entra na regra
        _exigir_outro_administrador(db, criar_usuario(perfil=UserRole.curador), "excluir")
    finally:
        for u in outros:
            u.bloqueado = False
        db.commit()
