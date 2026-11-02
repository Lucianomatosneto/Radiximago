"""
B1 da auditoria do administrador (01/11/2026) - pequenos acertos de leitura:
- "UFSC", "ufsc" e "Ufsc" contavam como instituicoes diferentes: agora o
  sistema escreve SIGLAS em maiusculas ao salvar e tambem ao mostrar os
  cadastros antigos (sem mudar o banco);
- o Painel mostra "Tomografia (TCFC)" na Atividade recente;
- os cartoes da tela Usuarios usam os mesmos nomes do filtro Perfil;
- o contato da tela Sugestoes avisa erro de digitacao no e-mail.
"""

import json
from pathlib import Path

import pytest

from app.core.limites import normalizar_instituicao
from app.modules.users import User, UserRole
from tests.conftest import cabecalho_auth, obter_token

FRONT = Path(__file__).resolve().parents[2] / "frontend"


@pytest.mark.parametrize(
    "digitado,esperado",
    [
        ("UFSC", "UFSC"),
        ("ufsc", "UFSC"),
        ("  Ufsc ", "UFSC"),
        ("Unisul", "UNISUL"),
        ("Universidade Federal de Santa Catarina", "Universidade Federal de Santa Catarina"),
        ("UFSC   -  Florianópolis", "UFSC - Florianópolis"),
        ("   ", None),
        (None, None),
        ("123", "123"),
    ],
)
def test_regra_de_normalizacao(digitado, esperado):
    assert normalizar_instituicao(digitado) == esperado


def test_salvar_e_listar_instituicao_normalizada(client, db, criar_usuario):
    admin = criar_usuario(perfil=UserRole.administrador)
    alvo = criar_usuario()
    cab = cabecalho_auth(obter_token(client, admin.email))
    r = client.patch(f"/users/{alvo.id}", json={"instituicao": " ufsc "}, headers=cab)
    assert r.status_code == 200, r.text
    db.expire_all()
    assert db.get(User, alvo.id).instituicao == "UFSC"

    # cadastro ANTIGO gravado em minusculas: a lista mostra igual, o banco nao muda
    db.query(User).filter(User.id == alvo.id).update({"instituicao": "Ufsc"})
    db.commit()
    lista = client.get("/users/", headers=cab).json()
    assert next(u for u in lista if u["id"] == alvo.id)["instituicao"] == "UFSC"
    db.expire_all()
    assert db.get(User, alvo.id).instituicao == "Ufsc"


def test_painel_traduz_tomografia():
    pagina = (FRONT / "src/app/dashboard/page.tsx").read_text(encoding="utf-8")
    assert "tomografia: 'tomografia'" in pagina
    for lingua in ("pt", "en"):
        d = json.loads((FRONT / f"messages/{lingua}.json").read_text(encoding="utf-8"))
        assert d["Dashboard"]["tiposRadiografia"]["tomografia"]


def test_cartoes_de_usuarios_iguais_ao_filtro():
    pagina = (FRONT / "src/app/usuarios/page.tsx").read_text(encoding="utf-8")
    assert "cards.docentes" not in pagina
    assert "['administrador', 'curador', 'professor', 'estudante']" in pagina
    for lingua in ("pt", "en"):
        cards = json.loads((FRONT / f"messages/{lingua}.json").read_text(encoding="utf-8"))["Usuarios"]["cards"]
        assert set(cards["porPerfil"]) == {"administrador", "curador", "professor", "estudante"}


def test_sugestoes_avisa_email_digitado_errado():
    pagina = (FRONT / "src/app/sugestoes/page.tsx").read_text(encoding="utf-8")
    assert "<AvisoEmail email={contato} />" in pagina
