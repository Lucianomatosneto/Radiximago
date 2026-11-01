"""
Prancha por e-mail com DESTINO VISIVEL e escolhido (01/11/2026 - QA item 2):

- GET /prancha/destinatarios devolve o e-mail completo (para a tela mostrar
  antes de confirmar) e o aviso de provavel erro de digitacao;
- estudante so envia para si; professor/curador tambem para outro
  professor/curador cadastrado - nunca para um e-mail digitado livre;
- a lista de dominios trocados e a mesma no servidor e nas telas.
"""

import re
from pathlib import Path

from app.core.email_digitacao import DOMINIOS_TROCADOS, sugestao_de_email
from app.modules import prancha_router
from app.modules.audit_logs import AuditLog
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token
from tests.test_prancha import _png


def test_sugestao_de_email():
    assert sugestao_de_email("gabrielly.machado@hotmai.com") == "gabrielly.machado@hotmail.com"
    assert sugestao_de_email("Fulano@GMIAL.com") == "Fulano@gmail.com"
    assert sugestao_de_email("fulano@hotmail.com") is None
    assert sugestao_de_email("sem-arroba") is None


def test_mascara_mantem_dominio():
    assert prancha_router._mascarar("gabrielly.machado@hotmai.com") == "g•••o@hotmai.com"
    assert prancha_router._mascarar("a@b.com") == "a•••@b.com"


def test_lista_de_dominios_igual_nas_telas():
    ts = (Path(__file__).resolve().parents[2] / "frontend/src/lib/emailDigitacao.ts").read_text(encoding="utf-8")
    pares = dict(re.findall(r"'([^']+)': '([^']+)',", ts))
    assert pares == DOMINIOS_TROCADOS


def test_destinatarios_mostra_email_completo_e_aviso(client, criar_usuario):
    curador = criar_usuario(perfil=UserRole.curador)
    professor = criar_usuario(perfil=UserRole.professor)
    aluno = criar_usuario(perfil=UserRole.estudante)
    r = client.get("/prancha/destinatarios", headers=cabecalho_auth(obter_token(client, curador.email)))
    assert r.status_code == 200, r.text
    dados = r.json()
    assert dados["proprio"]["email"] == curador.email
    ids = {p["id"] for p in dados["outros"]}
    assert professor.id in ids and aluno.id not in ids and curador.id not in ids
    outro = next(p for p in dados["outros"] if p["id"] == professor.id)
    assert outro["email"] != professor.email and outro["email"].endswith("@" + professor.email.split("@")[1])

    r = client.get("/prancha/destinatarios", headers=cabecalho_auth(obter_token(client, aluno.email)))
    assert r.json()["outros"] == []  # estudante so envia para si


def test_email_vai_para_o_destinatario_escolhido(client, db, criar_usuario, criar_ficha, monkeypatch):
    curador = criar_usuario(perfil=UserRole.curador)
    professor = criar_usuario(perfil=UserRole.professor)
    ficha = criar_ficha(descricao_didatica="prancha-destino")
    monkeypatch.setattr(prancha_router.orthanc_client, "obter_preview_instancia", lambda i: _png())
    enviados = []
    monkeypatch.setattr(prancha_router, "enviar_email_prancha", lambda *a, **k: enviados.append((a, k)))
    r = client.post("/prancha/email", headers=cabecalho_auth(obter_token(client, curador.email)),
                    json={"curation_ids": [ficha.id], "para_id": professor.id})
    assert r.status_code == 200, r.text
    assert r.json()["destinatario"] != professor.email  # mascarado na resposta
    (args, extras), = enviados
    assert args[0] == professor.email and extras["remetente"] == curador.nome
    log = db.query(AuditLog).filter(AuditLog.acao == "prancha_enviada_email", AuditLog.usuario_id == curador.id).first()
    assert f"para_id={professor.id}" in log.detalhes


def test_estudante_nao_envia_para_outra_pessoa(client, criar_usuario, criar_ficha, monkeypatch):
    aluno = criar_usuario(perfil=UserRole.estudante)
    outro = criar_usuario(perfil=UserRole.professor)
    ficha = criar_ficha()
    enviados = []
    monkeypatch.setattr(prancha_router, "enviar_email_prancha", lambda *a, **k: enviados.append(a))
    r = client.post("/prancha/email", headers=cabecalho_auth(obter_token(client, aluno.email)),
                    json={"curation_ids": [ficha.id], "para_id": outro.id})
    assert r.status_code == 422
    assert enviados == []
