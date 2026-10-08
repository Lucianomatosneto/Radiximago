"""
Cadastro em duas etapas: o pedido de acesso so chega ao administrador
depois que o solicitante confirma o e-mail (link de uso unico + a mesma
senha definida no formulario).
"""

import re
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.modules import auth as modulo_auth
from app.modules.access_requests import AccessRequest
from app.modules.audit_logs import AuditLog
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token

SENHA = "SenhaValida123"


@pytest.fixture()
def links_enviados(monkeypatch):
    """Captura o link de confirmacao em vez de mandar e-mail de verdade."""
    links = []

    def _falso(destinatario, nome, link, validade_horas):
        links.append(link)

    monkeypatch.setattr(modulo_auth, "enviar_email_confirmacao_cadastro", _falso)
    monkeypatch.setattr(modulo_auth, "enviar_email_solicitacao_recebida", lambda *a, **k: None)
    return links


@pytest.fixture()
def email_novo(db):
    email = f"suite-confirma-{uuid.uuid4().hex[:12]}@teste.example"
    yield email
    ids = [p.id for p in db.query(AccessRequest).filter(AccessRequest.email == email).all()]
    if ids:
        db.query(AuditLog).filter(
            AuditLog.entidade == "access_request", AuditLog.entidade_id.in_(ids)
        ).delete(synchronize_session=False)
    db.query(AccessRequest).filter(AccessRequest.email == email).delete()
    db.commit()


def _solicitar(client, email, senha=SENHA):
    return client.post(
        "/auth/request-access",
        json={"nome": "Solicitante <b>Suite</b>", "email": email, "senha": senha, "perfil_solicitado": "estudante"},
    )


def _token(link: str) -> str:
    return re.search(r"token=([^&]+)", link).group(1)


def test_pedido_nasce_sem_confirmacao_e_guarda_so_o_resumo_do_token(client, db, links_enviados, email_novo):
    assert _solicitar(client, email_novo).status_code == 201
    assert len(links_enviados) == 1
    token = _token(links_enviados[0])

    pedido = db.query(AccessRequest).filter(AccessRequest.email == email_novo).one()
    assert pedido.email_confirmado_em is None
    assert pedido.token_confirmacao_hash and pedido.token_confirmacao_hash != token
    assert len(pedido.token_confirmacao_hash) == 64


def test_pedido_nao_confirmado_nao_aparece_nem_pode_ser_aprovado(
    client, db, criar_usuario, links_enviados, email_novo
):
    _solicitar(client, email_novo)
    pedido = db.query(AccessRequest).filter(AccessRequest.email == email_novo).one()
    admin = criar_usuario(perfil=UserRole.administrador)
    token_admin = obter_token(client, admin.email)

    lista = client.get("/users/access-requests", headers=cabecalho_auth(token_admin)).json()
    assert pedido.id not in [p["id"] for p in lista]

    resposta = client.post(
        f"/users/access-requests/{pedido.id}/approve",
        json={"perfil_concedido": "estudante"},
        headers=cabecalho_auth(token_admin),
    )
    assert resposta.status_code == 409


def test_confirmacao_com_senha_certa_libera_para_o_admin(
    client, db, criar_usuario, links_enviados, email_novo
):
    _solicitar(client, email_novo)
    token = _token(links_enviados[0])

    resposta = client.post("/auth/confirm-email", json={"token": token, "senha": SENHA})
    assert resposta.status_code == 200, resposta.text

    db.expire_all()
    pedido = db.query(AccessRequest).filter(AccessRequest.email == email_novo).one()
    assert pedido.email_confirmado_em is not None
    assert pedido.token_confirmacao_hash is None

    admin = criar_usuario(perfil=UserRole.administrador)
    token_admin = obter_token(client, admin.email)
    lista = client.get("/users/access-requests", headers=cabecalho_auth(token_admin)).json()
    assert pedido.id in [p["id"] for p in lista]

    # uso unico: o mesmo link nao funciona de novo
    de_novo = client.post("/auth/confirm-email", json={"token": token, "senha": SENHA})
    assert de_novo.status_code == 400


def test_senha_errada_nao_confirma_e_bloqueia_apos_limite(client, db, links_enviados, email_novo):
    _solicitar(client, email_novo)
    token = _token(links_enviados[0])

    for _ in range(modulo_auth.CONFIRMACAO_MAX_TENTATIVAS - 1):
        r = client.post("/auth/confirm-email", json={"token": token, "senha": "errada-123"})
        assert r.status_code == 401
    ultima = client.post("/auth/confirm-email", json={"token": token, "senha": "errada-123"})
    assert ultima.status_code == 400

    # mesmo com a senha certa, o link ja foi invalidado
    certa = client.post("/auth/confirm-email", json={"token": token, "senha": SENHA})
    assert certa.status_code == 400
    db.expire_all()
    pedido = db.query(AccessRequest).filter(AccessRequest.email == email_novo).one()
    assert pedido.email_confirmado_em is None


def test_link_expirado_nao_confirma(client, db, links_enviados, email_novo):
    _solicitar(client, email_novo)
    token = _token(links_enviados[0])
    pedido = db.query(AccessRequest).filter(AccessRequest.email == email_novo).one()
    pedido.token_confirmacao_expira_em = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()

    resposta = client.post("/auth/confirm-email", json={"token": token, "senha": SENHA})
    assert resposta.status_code == 400
    assert "expirado" in resposta.json()["detail"]


def test_token_inventado_e_recusado(client):
    resposta = client.post("/auth/confirm-email", json={"token": "nao-existe", "senha": SENHA})
    assert resposta.status_code == 400


def test_novo_formulario_substitui_pedido_nao_confirmado_e_invalida_link_antigo(
    client, db, links_enviados, email_novo
):
    _solicitar(client, email_novo, senha="PrimeiraSenha1")
    _solicitar(client, email_novo, senha="SegundaSenha2")
    assert len(links_enviados) == 2
    assert db.query(AccessRequest).filter(AccessRequest.email == email_novo).count() == 1

    antigo = client.post(
        "/auth/confirm-email", json={"token": _token(links_enviados[0]), "senha": "PrimeiraSenha1"}
    )
    assert antigo.status_code == 400

    # quem confirma precisa saber a senha do ULTIMO formulario
    errada = client.post(
        "/auth/confirm-email", json={"token": _token(links_enviados[1]), "senha": "PrimeiraSenha1"}
    )
    assert errada.status_code == 401
    certa = client.post(
        "/auth/confirm-email", json={"token": _token(links_enviados[1]), "senha": "SegundaSenha2"}
    )
    assert certa.status_code == 200


def test_pedido_ja_confirmado_nao_e_substituido(client, db, links_enviados, email_novo):
    _solicitar(client, email_novo)
    client.post("/auth/confirm-email", json={"token": _token(links_enviados[0]), "senha": SENHA})

    _solicitar(client, email_novo, senha="OutraSenha999")
    assert len(links_enviados) == 1  # nenhum link novo
    db.expire_all()
    pedido = db.query(AccessRequest).filter(AccessRequest.email == email_novo).one()
    assert pedido.email_confirmado_em is not None
