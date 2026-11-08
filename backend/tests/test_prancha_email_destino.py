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
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


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


def test_destinatarios_mostra_so_o_proprio_email_completo(client, criar_usuario):
    """Etapa E (08/11/2026): o PDF anexado so vai para o proprio e-mail; para
    outras pessoas a tela usa /prancha/enviar (link com login)."""
    curador = criar_usuario(perfil=UserRole.curador)
    criar_usuario(perfil=UserRole.professor)
    r = client.get("/prancha/destinatarios", headers=cabecalho_auth(obter_token(client, curador.email)))
    assert r.status_code == 200, r.text
    dados = r.json()
    assert dados["proprio"]["email"] == curador.email
    assert dados["outros"] == []


def test_pdf_anexado_nao_vai_para_outra_pessoa(client, criar_usuario, criar_ficha, monkeypatch):
    curador = criar_usuario(perfil=UserRole.curador)
    outro = criar_usuario(perfil=UserRole.professor)
    ficha = criar_ficha()
    enviados = []
    monkeypatch.setattr(prancha_router, "enviar_email_prancha", lambda *a, **k: enviados.append(a))
    r = client.post("/prancha/email", headers=cabecalho_auth(obter_token(client, curador.email)),
                    json={"curation_ids": [ficha.id], "para_id": outro.id})
    assert r.status_code == 422 and "link" in r.json()["detail"]
    assert enviados == []
