"""
RESULTADOS DO MODO DESAFIO PARA A PESQUISA (pedido do Luciano, 24/11/2026:
"vamos inserir no sistema, mas nao vou rodar ate que consigamos o TCLE").

Sao dados de estudantes: so podem ser guardados com o TCLE (Termo de
Consentimento Livre e Esclarecido) aprovado e com o CONSENTIMENTO de cada
estudante. Por isso o registro tem DUAS travas, as duas no servidor:
1. DESAFIO_REGISTRO_ATIVO (configuracao do servidor) - desligado por padrao;
2. TCLE_PESQUISA_VERSAO (configuracao) preenchida E o estudante ter aceitado
   ESSA versao (e nao ter revogado).
Faltando qualquer uma: o resultado e DESCARTADO (nada e gravado) e a resposta
diz o motivo. Guarda so contagens (total de lesoes, encontradas, palpites),
sem as coordenadas dos cliques.

Consentimento: aceitar so quando ha TCLE configurado (senao 409); revogar a
qualquer momento; aceitar e revogar ficam na auditoria.
Dados inventados.
"""

import pytest

from app.core.config import settings
from app.modules.audit_logs import AuditLog
from app.modules.curations import StatusCuradoria
from app.modules.desafio import ConsentimentoPesquisa, ResultadoDesafio
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token

RESULTADO = {"total_lesoes": 2, "encontradas": 1, "palpites": 3}


def _cab(client, usuario):
    from app.main import app
    app.state.limiter.reset()
    return cabecalho_auth(obter_token(client, usuario.email))


@pytest.fixture
def estudante(criar_usuario):
    return criar_usuario(perfil=UserRole.estudante)


@pytest.fixture
def ficha(criar_ficha):
    return criar_ficha(status=StatusCuradoria.APROVADA.value, tipo_radiografia="tomografia")


def _enviar(client, cab, ficha, corpo=RESULTADO):
    return client.post(f"/desafio/{ficha.id}/resultado", headers=cab, json=corpo)


def _gravados(db, usuario):
    return db.query(ResultadoDesafio).filter(ResultadoDesafio.usuario_id == usuario.id).count()


def test_padrao_desligado_nada_e_gravado(client, db, estudante, ficha):
    assert settings.DESAFIO_REGISTRO_ATIVO is False
    r = _enviar(client, _cab(client, estudante), ficha)
    assert r.status_code == 200, r.text
    assert r.json() == {"registrado": False, "motivo": "registro_desligado"}
    assert _gravados(db, estudante) == 0


def test_ligado_sem_tcle_configurado_nada_e_gravado(client, db, estudante, ficha, monkeypatch):
    monkeypatch.setattr(settings, "DESAFIO_REGISTRO_ATIVO", True)
    monkeypatch.setattr(settings, "TCLE_PESQUISA_VERSAO", "")
    r = _enviar(client, _cab(client, estudante), ficha)
    assert r.json() == {"registrado": False, "motivo": "tcle_indisponivel"}
    assert _gravados(db, estudante) == 0


def test_ligado_sem_consentimento_nada_e_gravado(client, db, estudante, ficha, monkeypatch):
    monkeypatch.setattr(settings, "DESAFIO_REGISTRO_ATIVO", True)
    monkeypatch.setattr(settings, "TCLE_PESQUISA_VERSAO", "1.0")
    r = _enviar(client, _cab(client, estudante), ficha)
    assert r.json() == {"registrado": False, "motivo": "sem_consentimento"}
    assert _gravados(db, estudante) == 0


def test_com_tudo_grava_so_contagens(client, db, estudante, ficha, monkeypatch):
    monkeypatch.setattr(settings, "DESAFIO_REGISTRO_ATIVO", True)
    monkeypatch.setattr(settings, "TCLE_PESQUISA_VERSAO", "1.0")
    cab = _cab(client, estudante)
    assert client.post("/desafio/consentimento", headers=cab).status_code == 201
    r = _enviar(client, cab, ficha)
    assert r.json() == {"registrado": True, "motivo": None}
    [gravado] = db.query(ResultadoDesafio).filter(ResultadoDesafio.usuario_id == estudante.id).all()
    assert (gravado.curation_id, gravado.total_lesoes, gravado.encontradas, gravado.palpites) == (ficha.id, 2, 1, 3)
    assert gravado.versao_tcle == "1.0"
    # revogou: nao grava mais
    assert client.delete("/desafio/consentimento", headers=cab).status_code == 200
    assert _enviar(client, cab, ficha).json() == {"registrado": False, "motivo": "sem_consentimento"}
    assert _gravados(db, estudante) == 1


def test_consentimento_de_outra_versao_nao_vale(client, db, estudante, ficha, monkeypatch):
    monkeypatch.setattr(settings, "DESAFIO_REGISTRO_ATIVO", True)
    monkeypatch.setattr(settings, "TCLE_PESQUISA_VERSAO", "1.0")
    cab = _cab(client, estudante)
    client.post("/desafio/consentimento", headers=cab)
    monkeypatch.setattr(settings, "TCLE_PESQUISA_VERSAO", "2.0")
    assert _enviar(client, cab, ficha).json()["motivo"] == "sem_consentimento"


def test_aceitar_sem_tcle_configurado_409(client, estudante):
    assert client.post("/desafio/consentimento", headers=_cab(client, estudante)).status_code == 409


def test_situacao_do_consentimento_e_auditoria(client, db, estudante, monkeypatch):
    monkeypatch.setattr(settings, "TCLE_PESQUISA_VERSAO", "1.0")
    cab = _cab(client, estudante)
    assert client.get("/desafio/consentimento", headers=cab).json() == {"versao_tcle": "1.0", "aceito": False, "registro_ativo": False}
    client.post("/desafio/consentimento", headers=cab)
    assert client.get("/desafio/consentimento", headers=cab).json()["aceito"] is True
    client.delete("/desafio/consentimento", headers=cab)
    assert db.query(ConsentimentoPesquisa).filter(ConsentimentoPesquisa.usuario_id == estudante.id).one().revogado_em is not None
    acoes = sorted(a for (a,) in db.query(AuditLog.acao).filter(AuditLog.usuario_id == estudante.id, AuditLog.acao.like("consentimento_pesquisa_%")))
    assert acoes == ["consentimento_pesquisa_aceito", "consentimento_pesquisa_revogado"]


@pytest.mark.parametrize("corpo", [
    {"total_lesoes": 2, "encontradas": 3, "palpites": 3},   # mais encontradas que lesoes
    {"total_lesoes": 2, "encontradas": 1, "palpites": 5},   # mais palpites que o permitido (lesoes + 2)
    {"total_lesoes": -1, "encontradas": 0, "palpites": 0},
    {},
])
def test_resultado_invalido_422(client, estudante, ficha, corpo):
    assert _enviar(client, _cab(client, estudante), ficha, corpo).status_code == 422


def test_ficha_nao_aprovada_404(client, estudante, criar_ficha):
    outra = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)
    assert _enviar(client, _cab(client, estudante), outra).status_code == 404


def test_sem_login_401(client, ficha):
    assert client.post(f"/desafio/{ficha.id}/resultado", json=RESULTADO).status_code == 401
