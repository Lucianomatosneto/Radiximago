"""
LOGIN: TRAVA PROGRESSIVA E MENSAGENS CLARAS (18/11/2026).

O Luciano errou a senha mais de 20 vezes e a tela so dizia "Nao foi possivel
entrar" - o servidor travava a conta, mas ninguem sabia. Agora:
- a trava cresce a cada repeticao: 10 erros em 15 minutos -> 15 minutos;
  20 erros em 1 hora -> 1 hora; 30 erros em 24 horas -> 24 horas.
  Nunca bloqueia para sempre sozinho (isso deixaria qualquer pessoa travar a
  conta de um colega so digitando o e-mail dele - NIST SP 800-63B / OWASP);
- a resposta diz o motivo ("conta_travada") e por quanto tempo, para a tela
  explicar com clareza (inclusive em ingles);
- quando a trava comeca, o dono da conta recebe um e-mail; no nivel de 24
  horas, os administradores tambem sao avisados; tudo fica na auditoria.
Dados inventados.
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.modules.audit_logs import AuditLog
from app.modules.users import UserRole
from tests.conftest import SENHA_TESTE


def _falhas(db, usuario, quantidade, ha):
    """Registra `quantidade` senhas erradas da conta, `ha` tempo atras."""
    quando = datetime.now(timezone.utc) - ha
    for _ in range(quantidade):
        db.add(AuditLog(usuario_id=usuario.id, acao="falha_login", entidade="user", entidade_id=usuario.id,
                        resultado="negado", detalhes="Senha incorreta.", criado_em=quando))
    db.commit()


def _entrar(client, usuario, senha=SENHA_TESTE):
    from app.main import app
    app.state.limiter.reset()  # o limite por rede (5/min) e outro teste
    return client.post("/auth/login", data={"username": usuario.email, "password": senha})


@pytest.fixture()
def emails(monkeypatch):
    enviados: list[tuple[str, str]] = []
    import app.modules.auth as auth
    monkeypatch.setattr(auth, "enviar_email", lambda destinatario, assunto, corpo, **_: enviados.append((destinatario, assunto)))
    return enviados


@pytest.mark.parametrize("quantidade,ha,minutos", [
    (10, timedelta(minutes=1), 15),
    (20, timedelta(minutes=40), 60),
    (30, timedelta(hours=10), 24 * 60),
])
def test_trava_cresce_e_a_resposta_diz_por_quanto_tempo(client, criar_usuario, db, quantidade, ha, minutos):
    usuario = criar_usuario(perfil=UserRole.estudante)
    _falhas(db, usuario, quantidade, ha)
    r = _entrar(client, usuario)  # nem a senha certa entra durante a trava
    assert r.status_code == 429
    corpo = r.json()
    assert corpo["codigo"] == "conta_travada" and corpo["minutos"] == minutos
    assert "Esqueci minha senha" in corpo["detail"]


def test_poucas_falhas_antigas_nao_travam(client, criar_usuario, db):
    usuario = criar_usuario(perfil=UserRole.estudante)
    _falhas(db, usuario, 9, timedelta(minutes=1))
    _falhas(db, usuario, 15, timedelta(days=2))  # fora de todas as janelas
    assert _entrar(client, usuario).status_code == 200


def test_ao_travar_o_dono_recebe_email_e_fica_na_auditoria(client, criar_usuario, db, emails):
    usuario = criar_usuario(perfil=UserRole.estudante)
    _falhas(db, usuario, 9, timedelta(minutes=1))
    assert _entrar(client, usuario, senha="errada").status_code == 401  # a 10a falha comeca a trava
    assert [d for d, _ in emails] == [usuario.email]
    db.expire_all()
    registro = db.query(AuditLog).filter(AuditLog.usuario_id == usuario.id,
                                         AuditLog.acao == "conta_travada_por_tentativas").one()
    assert "15 minutos" in registro.detalhes
    # tentar de novo durante a trava nao manda outro e-mail
    assert _entrar(client, usuario, senha="errada").status_code == 429
    assert len(emails) == 1


def test_no_nivel_de_24_horas_os_administradores_sao_avisados(client, criar_usuario, db, emails):
    admin = criar_usuario(perfil=UserRole.administrador)
    usuario = criar_usuario(perfil=UserRole.estudante)
    _falhas(db, usuario, 29, timedelta(hours=3))
    assert _entrar(client, usuario, senha="errada").status_code == 401
    destinatarios = {d for d, _ in emails}
    assert usuario.email in destinatarios and admin.email in destinatarios


def test_email_que_falha_nao_impede_a_resposta(client, criar_usuario, db, monkeypatch):
    import app.modules.auth as auth

    def falha(*_a, **_k):
        raise OSError("servidor de e-mail fora do ar")

    monkeypatch.setattr(auth, "enviar_email", falha)
    usuario = criar_usuario(perfil=UserRole.estudante)
    _falhas(db, usuario, 9, timedelta(minutes=1))
    assert _entrar(client, usuario, senha="errada").status_code == 401


@pytest.mark.parametrize("campo,detalhe", [("bloqueado", "Usuário bloqueado"), ("ativo", "Usuário inativo")])
def test_conta_bloqueada_ou_inativa_com_senha_certa_diz_o_motivo(client, criar_usuario, db, campo, detalhe):
    usuario = criar_usuario(perfil=UserRole.estudante)
    setattr(usuario, campo, campo == "bloqueado")
    db.commit()
    r = _entrar(client, usuario)
    assert r.status_code == 403 and r.json()["detail"] == detalhe
    assert r.json()["codigo"] == ("conta_bloqueada" if campo == "bloqueado" else "conta_inativa")
