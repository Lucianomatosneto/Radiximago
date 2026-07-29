"""
Solicitacao de acesso (cadastro publico): fica pendente pra um admin
aprovar (cria a conta de verdade) ou rejeitar. Sempre responde com
mensagem generica, sem revelar se o e-mail ja tem conta/pedido.
"""

import uuid

from app.modules.access_requests import AccessRequest, IntencaoPerfil, StatusSolicitacaoAcesso
from app.modules.users import User, UserRole
from tests.conftest import cabecalho_auth, obter_token


def test_solicitar_acesso_com_sucesso(client, db):
    email = f"suite-request-{uuid.uuid4().hex[:12]}@teste.example"

    resposta = client.post(
        "/auth/request-access",
        json={
            "nome": "Solicitante da Suite",
            "email": email,
            "senha": "SenhaValida123",
            "perfil_solicitado": "estudante",
        },
    )

    assert resposta.status_code == 201
    solicitacao = db.query(AccessRequest).filter(AccessRequest.email == email).first()
    assert solicitacao is not None
    assert solicitacao.status == StatusSolicitacaoAcesso.pendente
    db.delete(solicitacao)
    db.commit()


def test_solicitar_acesso_com_senha_curta(client):
    resposta = client.post(
        "/auth/request-access",
        json={
            "nome": "Solicitante da Suite",
            "email": f"suite-request-{uuid.uuid4().hex[:12]}@teste.example",
            "senha": "curta",
            "perfil_solicitado": "estudante",
        },
    )
    assert resposta.status_code == 422


def test_solicitar_acesso_para_email_ja_cadastrado_nao_cria_pedido(client, criar_usuario, db):
    usuario = criar_usuario()

    resposta = client.post(
        "/auth/request-access",
        json={
            "nome": "Tentativa duplicada",
            "email": usuario.email,
            "senha": "SenhaValida123",
            "perfil_solicitado": "estudante",
        },
    )

    # mensagem generica de sucesso, mas sem criar pedido nenhum (nao
    # revela que o e-mail ja tem conta)
    assert resposta.status_code == 201
    pedido = db.query(AccessRequest).filter(AccessRequest.email == usuario.email).first()
    assert pedido is None


def test_estudante_nao_lista_solicitacoes_de_acesso(client, criar_usuario):
    usuario = criar_usuario(perfil=UserRole.estudante)
    token = obter_token(client, usuario.email)

    resposta = client.get("/users/access-requests", headers=cabecalho_auth(token))

    assert resposta.status_code == 403


def test_admin_lista_solicitacao_pendente(client, criar_usuario, criar_solicitacao_acesso):
    admin = criar_usuario(perfil=UserRole.administrador)
    token = obter_token(client, admin.email)
    solicitacao = criar_solicitacao_acesso()

    resposta = client.get("/users/access-requests", headers=cabecalho_auth(token))

    assert resposta.status_code == 200
    ids = [item["id"] for item in resposta.json()]
    assert solicitacao.id in ids


def test_admin_aprova_solicitacao_cria_conta_utilizavel(
    client, criar_usuario, criar_solicitacao_acesso, db
):
    admin = criar_usuario(perfil=UserRole.administrador)
    token = obter_token(client, admin.email)
    solicitacao = criar_solicitacao_acesso(perfil_solicitado=IntencaoPerfil.ESTUDANTE)

    resposta = client.post(
        f"/users/access-requests/{solicitacao.id}/approve",
        headers=cabecalho_auth(token),
        json={"perfil_concedido": "estudante"},
    )

    assert resposta.status_code == 200
    novo_usuario_id = resposta.json()["id"]

    try:
        # a conta criada realmente consegue logar
        token_novo = obter_token(client, solicitacao.email)
        assert token_novo

        db.refresh(solicitacao)
        assert solicitacao.status == StatusSolicitacaoAcesso.aprovada
    finally:
        from app.modules.audit_logs import AuditLog

        db.query(AuditLog).filter(AuditLog.usuario_id == novo_usuario_id).delete()
        db.query(User).filter(User.id == novo_usuario_id).delete()
        db.commit()


def test_admin_rejeita_solicitacao_com_motivo(client, criar_usuario, criar_solicitacao_acesso, db):
    admin = criar_usuario(perfil=UserRole.administrador)
    token = obter_token(client, admin.email)
    solicitacao = criar_solicitacao_acesso()

    resposta = client.post(
        f"/users/access-requests/{solicitacao.id}/reject",
        headers=cabecalho_auth(token),
        json={"motivo": "Instituição não reconhecida."},
    )

    assert resposta.status_code == 200
    db.refresh(solicitacao)
    assert solicitacao.status == StatusSolicitacaoAcesso.rejeitada

    # rejeitada -> nao criou conta nenhuma com esse e-mail
    conta_criada = db.query(User).filter(User.email == solicitacao.email).first()
    assert conta_criada is None


def test_estudante_nao_aprova_solicitacao(client, criar_usuario, criar_solicitacao_acesso):
    usuario = criar_usuario(perfil=UserRole.estudante)
    token = obter_token(client, usuario.email)
    solicitacao = criar_solicitacao_acesso()

    resposta = client.post(
        f"/users/access-requests/{solicitacao.id}/approve",
        headers=cabecalho_auth(token),
        json={"perfil_concedido": "estudante"},
    )

    assert resposta.status_code == 403
