"""
DEFINICAO DE CADA TERMO DO VOCABULARIO (pedido do video, 22/11/2026 - B14).

Cada termo que o curador usa na classificacao ganha uma DEFINICAO salva, com
a FONTE (decisao do Luciano: seguir orgaos brasileiros; por direito autoral,
usar o DeCS/BIREME, com a mencao da fonte, ou texto do proprio curador).
No visualizador, o "?" ao lado de cada marcacao mostra a definicao do achado.
Regras:
- so curador e administrador escrevem (suporte e estudante nao);
- definicao exige fonte; apagar a definicao apaga a fonte;
- qualquer pessoa logada le a definicao, achando o termo pelo nome OU por
  um sinonimo (sem acento, maiusculas etc.); termo inativo ou sem
  definicao: 404 com a mesma mensagem;
- a edicao fica na auditoria.
Dados inventados (textos de teste, nao sao definicoes reais).
"""

import uuid

import pytest

from app.modules.audit_logs import AuditLog
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token

DEFINICAO = "Texto de teste da definição."
FONTE = "DeCS/BIREME (texto de teste)"


def _token(client, criar_usuario, perfil):
    return cabecalho_auth(obter_token(client, criar_usuario(perfil=perfil).email))


def _criar_termo(client, cab, nome=None, **extra):
    nome = nome or f"Achado Teste {uuid.uuid4().hex[:6]}"
    r = client.post("/vocabulario/termos", headers=cab, json={"termo": nome, **extra})
    assert r.status_code == 200, r.text
    return r.json()


def test_curador_cria_e_edita_definicao_com_fonte(client, criar_usuario, db):
    cab = _token(client, criar_usuario, UserRole.curador)
    termo = _criar_termo(client, cab, definicao=DEFINICAO, definicao_fonte=FONTE)
    assert (termo["definicao"], termo["definicao_fonte"]) == (DEFINICAO, FONTE)
    r = client.patch(f"/vocabulario/termos/{termo['id']}", headers=cab,
                     json={"definicao": "Outro texto de teste.", "definicao_fonte": "Texto do curador"})
    assert r.status_code == 200, r.text
    assert r.json()["definicao"] == "Outro texto de teste."
    log = db.query(AuditLog).filter(AuditLog.acao == "vocabulario_termo_editado", AuditLog.entidade_id == termo["id"]).first()
    assert "definicao=sim" in log.detalhes


def test_definicao_sem_fonte_e_recusada(client, criar_usuario):
    cab = _token(client, criar_usuario, UserRole.curador)
    r = client.post("/vocabulario/termos", headers=cab, json={"termo": f"Sem Fonte {uuid.uuid4().hex[:6]}", "definicao": DEFINICAO})
    assert r.status_code == 422
    termo = _criar_termo(client, cab)
    r = client.patch(f"/vocabulario/termos/{termo['id']}", headers=cab, json={"definicao": DEFINICAO})
    assert r.status_code == 422


def test_apagar_a_definicao_apaga_a_fonte(client, criar_usuario):
    cab = _token(client, criar_usuario, UserRole.curador)
    termo = _criar_termo(client, cab, definicao=DEFINICAO, definicao_fonte=FONTE)
    r = client.patch(f"/vocabulario/termos/{termo['id']}", headers=cab, json={"definicao": ""})
    assert r.status_code == 200, r.text
    assert (r.json()["definicao"], r.json()["definicao_fonte"]) == (None, None)


@pytest.mark.parametrize("perfil", [UserRole.suporte, UserRole.estudante, UserRole.professor])
def test_so_curador_e_administrador_escrevem(client, criar_usuario, perfil):
    termo = _criar_termo(client, _token(client, criar_usuario, UserRole.administrador))
    r = client.patch(f"/vocabulario/termos/{termo['id']}", headers=_token(client, criar_usuario, perfil),
                     json={"definicao": DEFINICAO, "definicao_fonte": FONTE})
    assert r.status_code == 403


def test_qualquer_pessoa_logada_le_pelo_nome_ou_sinonimo(client, criar_usuario):
    cab = _token(client, criar_usuario, UserRole.curador)
    marca = uuid.uuid4().hex[:6]
    _criar_termo(client, cab, nome=f"Lesão Teste {marca}", sinonimos=[f"Imagem Teste {marca}"],
                 definicao=DEFINICAO, definicao_fonte=FONTE)
    estudante = _token(client, criar_usuario, UserRole.estudante)
    for texto in (f"lesao teste {marca}", f"LESÃO TESTE {marca}", f"Imagem teste {marca}"):
        r = client.get("/vocabulario/definicao", headers=estudante, params={"texto": texto})
        assert r.status_code == 200, (texto, r.text)
        assert r.json() == {"termo": f"Lesão Teste {marca}", "definicao": DEFINICAO, "fonte": FONTE}


def test_sem_definicao_inativo_ou_inexistente_da_404_igual(client, criar_usuario):
    cab = _token(client, criar_usuario, UserRole.curador)
    sem = _criar_termo(client, cab)
    inativo = _criar_termo(client, cab, definicao=DEFINICAO, definicao_fonte=FONTE)
    client.patch(f"/vocabulario/termos/{inativo['id']}", headers=cab, json={"ativo": False})
    respostas = [client.get("/vocabulario/definicao", headers=cab, params={"texto": t})
                 for t in (sem["termo"], inativo["termo"], f"nada {uuid.uuid4().hex}")]
    assert {r.status_code for r in respostas} == {404}
    assert len({r.json()["detail"] for r in respostas}) == 1


def test_ler_definicao_exige_login(client):
    assert client.get("/vocabulario/definicao", params={"texto": "carie"}).status_code == 401


def test_textos_longos_sao_recusados(client, criar_usuario):
    cab = _token(client, criar_usuario, UserRole.curador)
    termo = _criar_termo(client, cab)
    assert client.patch(f"/vocabulario/termos/{termo['id']}", headers=cab,
                        json={"definicao": "x" * 2001, "definicao_fonte": FONTE}).status_code == 422
    assert client.patch(f"/vocabulario/termos/{termo['id']}", headers=cab,
                        json={"definicao": DEFINICAO, "definicao_fonte": "x" * 301}).status_code == 422
