"""
LINK DE CONVITE PARA ENTRAR NO GRUPO (pedido do video, 22/11/2026).

O dono gera um link e manda para a turma (WhatsApp, e-mail...). Quem abre o
link, ja com login, ve o nome do grupo e quem o criou e so entra se clicar em
"Entrar no grupo" (consentimento - decisao D1 continua valendo). Regras:
- so o dono gera, ve e cancela; um link ativo por grupo (gerar outro cancela
  o anterior);
- vale DIAS_VALIDADE_LINK dias; o servidor guarda so o resumo SHA-256 do
  codigo (o codigo completo aparece uma vez, para o dono copiar);
- link vencido, cancelado ou inventado: a mesma resposta 404, sem dizer qual;
- o dono nao "entra" no proprio grupo; quem ja participa so recebe a situacao;
- quem tinha convite ou pedido pendente nesse grupo entra e a pendencia fecha;
- auditoria: grupo_link_criado, grupo_link_cancelado, grupo_entrada_por_link
  (nunca o codigo);
- limite por minuto em ver e entrar.
Dados inventados.
"""

import hashlib
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.modules.audit_logs import AuditLog
from app.modules.grupos import DIAS_VALIDADE_LINK, GrupoEntrada, GrupoEnvio, GrupoEnvioMembro, GrupoLinkConvite
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


@pytest.fixture()
def limpar_grupos(db):
    criados: list[int] = []
    yield criados
    for gid in criados:
        g = db.get(GrupoEnvio, gid)
        if g:
            db.delete(g)
    db.commit()


_CABS: dict[int, dict] = {}


def _cab(client, u):
    if u.id not in _CABS:
        from app.main import app
        app.state.limiter.reset()
        _CABS[u.id] = cabecalho_auth(obter_token(client, u.email))
    return _CABS[u.id]


def _grupo(client, cab, limpar) -> dict:
    r = client.post("/grupos", headers=cab, json={"nome": f"Turma {uuid.uuid4().hex[:8]}"})
    assert r.status_code == 200, r.text
    limpar.append(r.json()["id"])
    return r.json()


def _gerar(client, cab, gid) -> dict:
    r = client.post(f"/grupos/{gid}/link-convite", headers=cab)
    assert r.status_code == 200, r.text
    return r.json()


def test_dono_gera_link_e_quem_abre_ve_o_grupo_e_entra_ao_confirmar(client, criar_usuario, limpar_grupos, db):
    dono = criar_usuario(perfil=UserRole.professor)
    aluno = criar_usuario(perfil=UserRole.estudante)
    g = _grupo(client, _cab(client, dono), limpar_grupos)
    link = _gerar(client, _cab(client, dono), g["id"])
    assert len(link["codigo"]) >= 40 and link["expira_em"]

    # o banco guarda so o resumo, nunca o codigo
    salvo = db.query(GrupoLinkConvite).filter(GrupoLinkConvite.grupo_id == g["id"]).one()
    assert salvo.codigo_hash == hashlib.sha256(link["codigo"].encode()).hexdigest()
    assert link["codigo"] not in salvo.codigo_hash

    ver = client.post("/grupos/link-convite/ver", headers=_cab(client, aluno), json={"codigo": link["codigo"]})
    assert ver.status_code == 200
    assert ver.json()["grupo"]["nome"] == g["nome"] and ver.json()["situacao"] is None
    assert db.query(GrupoEnvioMembro).filter_by(grupo_id=g["id"], usuario_id=aluno.id).first() is None  # ver nao poe ninguem

    r = client.post("/grupos/link-convite/entrar", headers=_cab(client, aluno), json={"codigo": link["codigo"]})
    assert r.status_code == 200 and r.json()["situacao"] == "participa"
    db.expire_all()
    membro = db.query(GrupoEnvioMembro).filter_by(grupo_id=g["id"], usuario_id=aluno.id).one()
    assert membro.origem == "link"
    # entrar de novo nao duplica
    assert client.post("/grupos/link-convite/entrar", headers=_cab(client, aluno), json={"codigo": link["codigo"]}).json()["situacao"] == "participa"
    acoes = [a.acao for a in db.query(AuditLog).filter(AuditLog.entidade == "grupo_envio", AuditLog.entidade_id == g["id"])]
    assert "grupo_link_criado" in acoes and acoes.count("grupo_entrada_por_link") == 1
    assert not any(link["codigo"] in (a.detalhes or "") for a in db.query(AuditLog).filter(AuditLog.entidade_id == g["id"]))


def test_so_o_dono_gera_ve_e_cancela_e_gerar_outro_cancela_o_anterior(client, criar_usuario, limpar_grupos):
    dono = criar_usuario(perfil=UserRole.curador)
    outro = criar_usuario(perfil=UserRole.professor)
    aluno = criar_usuario(perfil=UserRole.estudante)
    g = _grupo(client, _cab(client, dono), limpar_grupos)
    for cab in (_cab(client, outro), _cab(client, aluno)):
        assert client.post(f"/grupos/{g['id']}/link-convite", headers=cab).status_code in (403, 404)
        assert client.get(f"/grupos/{g['id']}/link-convite", headers=cab).status_code in (403, 404)
        assert client.delete(f"/grupos/{g['id']}/link-convite", headers=cab).status_code in (403, 404)

    primeiro = _gerar(client, _cab(client, dono), g["id"])
    segundo = _gerar(client, _cab(client, dono), g["id"])
    situacao = client.get(f"/grupos/{g['id']}/link-convite", headers=_cab(client, dono)).json()
    assert situacao["ativo"] is True and "codigo" not in situacao
    assert client.post("/grupos/link-convite/entrar", headers=_cab(client, aluno), json={"codigo": primeiro["codigo"]}).status_code == 404

    assert client.delete(f"/grupos/{g['id']}/link-convite", headers=_cab(client, dono)).status_code == 200
    assert client.get(f"/grupos/{g['id']}/link-convite", headers=_cab(client, dono)).json()["ativo"] is False
    assert client.post("/grupos/link-convite/entrar", headers=_cab(client, aluno), json={"codigo": segundo["codigo"]}).status_code == 404


def test_link_vencido_ou_inventado_tem_a_mesma_resposta(client, criar_usuario, limpar_grupos, db):
    dono = criar_usuario(perfil=UserRole.professor)
    aluno = criar_usuario(perfil=UserRole.estudante)
    g = _grupo(client, _cab(client, dono), limpar_grupos)
    link = _gerar(client, _cab(client, dono), g["id"])
    salvo = db.query(GrupoLinkConvite).filter(GrupoLinkConvite.grupo_id == g["id"]).one()
    salvo.expira_em = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()
    vencido = client.post("/grupos/link-convite/entrar", headers=_cab(client, aluno), json={"codigo": link["codigo"]})
    inventado = client.post("/grupos/link-convite/entrar", headers=_cab(client, aluno), json={"codigo": "x" * 43})
    assert vencido.status_code == inventado.status_code == 404
    assert vencido.json()["detail"] == inventado.json()["detail"]
    assert client.post("/grupos/link-convite/ver", headers=_cab(client, aluno), json={"codigo": link["codigo"]}).status_code == 404


def test_validade_padrao_e_de_7_dias():
    assert DIAS_VALIDADE_LINK == 7


def test_dono_nao_entra_no_proprio_grupo_e_pendencia_fecha_ao_entrar(client, criar_usuario, limpar_grupos, db):
    dono = criar_usuario(perfil=UserRole.professor)
    aluno = criar_usuario(perfil=UserRole.estudante)
    g = _grupo(client, _cab(client, dono), limpar_grupos)
    # o dono ja tinha convidado o aluno (convite pendente)
    client.put(f"/grupos/{g['id']}", headers=_cab(client, dono), json={"nome": g["nome"], "membros_ids": [aluno.id]})
    link = _gerar(client, _cab(client, dono), g["id"])
    assert client.post("/grupos/link-convite/entrar", headers=_cab(client, dono), json={"codigo": link["codigo"]}).status_code == 409
    assert client.post("/grupos/link-convite/entrar", headers=_cab(client, aluno), json={"codigo": link["codigo"]}).status_code == 200
    db.expire_all()
    pend = db.query(GrupoEntrada).filter_by(grupo_id=g["id"], usuario_id=aluno.id).one()
    assert pend.estado == "aceito"


def test_sem_login_nao_ve_nem_entra(client):
    assert client.post("/grupos/link-convite/ver", json={"codigo": "x" * 43}).status_code == 401
    assert client.post("/grupos/link-convite/entrar", json={"codigo": "x" * 43}).status_code == 401


def test_limite_por_minuto_ao_entrar(client, criar_usuario):
    from app.main import app
    aluno = criar_usuario(perfil=UserRole.estudante)
    cab = _cab(client, aluno)
    app.state.limiter.reset()
    respostas = [client.post("/grupos/link-convite/entrar", headers=cab, json={"codigo": "y" * 43}).status_code for _ in range(12)]
    assert 429 in respostas
    app.state.limiter.reset()
