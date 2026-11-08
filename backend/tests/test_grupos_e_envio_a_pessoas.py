"""
Etapa C (08/11/2026): professor e curador montam os PROPRIOS
grupos e enviam imagens a pessoas e grupos. A imagem enviada pelo professor
continua indo para a fila de curadoria; quem recebeu consegue ver.
"""

import pytest

from app.modules.audit_logs import AuditLog
from app.modules.grupos import GrupoEnvio
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token
from tests.test_envios_imagens import _enviar, orthanc_falso  # noqa: F401 (fixture)


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
    # um login por pessoa (o limite de tentativas de login vale nos testes)
    if u.id not in _CABS:
        from app.main import app
        app.state.limiter.reset()
        _CABS[u.id] = cabecalho_auth(obter_token(client, u.email))
    return _CABS[u.id]


def test_grupos_sao_do_dono_e_estudante_nao_cria(client, criar_usuario, limpar_grupos, db):
    prof, outro_prof = criar_usuario(perfil=UserRole.professor), criar_usuario(perfil=UserRole.professor)
    a1, a2, bloqueado = criar_usuario(), criar_usuario(), criar_usuario()
    bloqueado.bloqueado = True
    db.commit()
    cab, cab_outro = _cab(client, prof), _cab(client, outro_prof)

    r = client.post("/grupos", headers=cab, json={"nome": "Turma A", "membros_ids": [a1.id, a2.id, bloqueado.id, prof.id]})
    assert r.status_code == 200, r.text
    grupo = r.json()
    limpar_grupos.append(grupo["id"])
    assert {m["id"] for m in grupo["membros"]} == {a1.id, a2.id}   # sem bloqueado e sem o proprio dono
    assert all("•••" in m["email"] for m in grupo["membros"])      # e-mail mascarado
    assert client.post("/grupos", headers=cab, json={"nome": "Turma A"}).status_code == 409

    assert client.get("/grupos", headers=cab_outro).json()["grupos"] == []
    assert client.put(f"/grupos/{grupo['id']}", headers=cab_outro, json={"nome": "x"}).status_code == 404
    assert client.delete(f"/grupos/{grupo['id']}", headers=cab_outro).status_code == 404
    assert client.post("/grupos", headers=_cab(client, a1), json={"nome": "Meu"}).status_code == 403

    r = client.put(f"/grupos/{grupo['id']}", headers=cab, json={"nome": "Turma A - 2026", "membros_ids": [a1.id]})
    assert [m["id"] for m in r.json()["membros"]] == [a1.id]
    achados = {p["id"] for p in client.get("/grupos/pessoas", headers=cab, params={"busca": a2.nome}).json()["pessoas"]}
    assert a2.id in achados


def test_professor_envia_a_grupo_e_pessoa_que_veem_e_a_imagem_vai_para_a_fila(
        client, criar_usuario, orthanc_falso, limpar_grupos, db):  # noqa: F811
    prof, curador = criar_usuario(perfil=UserRole.professor), criar_usuario(perfil=UserRole.curador)
    a1, a2, fora = criar_usuario(), criar_usuario(), criar_usuario()
    colega = criar_usuario(perfil=UserRole.professor)
    cab = _cab(client, prof)
    gid = client.post("/grupos", headers=cab, json={"nome": "Turma B", "membros_ids": [a1.id, a2.id]}).json()["id"]
    limpar_grupos.append(gid)

    r = _enviar(client, cab, "fila", pessoas=f"{colega.id}", grupos=f"{gid}")
    assert r.status_code == 200, r.text
    assert r.json()["enviada_para"] == 3
    ref_id = r.json()["orthanc_reference_id"]

    for quem in (a1, a2, colega):
        itens = client.get("/envios/recebidas", headers=_cab(client, quem)).json()["itens"]
        assert [i["enviado_por"] for i in itens if i["id"] == ref_id] == [prof.nome]
        assert client.get(f"/envios/{ref_id}/preview", headers=_cab(client, quem)).status_code == 200
    cab_fora = _cab(client, fora)
    assert ref_id not in {i["id"] for i in client.get("/envios/recebidas", headers=cab_fora).json()["itens"]}
    assert client.get(f"/envios/{ref_id}/preview", headers=cab_fora).status_code == 404
    # a imagem continua na fila do curador (so ele publica)
    pend = client.get("/curation/pending?limit=200", headers=_cab(client, curador)).json()["itens"]
    assert ref_id in {p["orthanc_reference_id"] for p in pend}

    # mandar de novo nao duplica; grupo de outro dono e ignorado
    gid_alheio = client.post("/grupos", headers=_cab(client, colega), json={"nome": "Do colega", "membros_ids": [fora.id]}).json()["id"]
    limpar_grupos.append(gid_alheio)
    r = client.post(f"/envios/{ref_id}/enviar-para", headers=cab, json={"pessoas_ids": [a1.id], "grupos_ids": [gid_alheio]})
    assert r.status_code == 200 and r.json()["enviada_para"] == 0
    # so quem enviou manda adiante
    assert client.post(f"/envios/{ref_id}/enviar-para", headers=_cab(client, colega), json={"pessoas_ids": [fora.id]}).status_code == 404

    novas = client.get("/envios/recebidas", headers=_cab(client, a1)).json()["itens"]
    assert [i["nova"] for i in novas if i["id"] == ref_id] == [True]
    client.post("/envios/recebidas/vistas", headers=_cab(client, a1))
    vistas = client.get("/envios/recebidas", headers=_cab(client, a1)).json()["itens"]
    assert [i["nova"] for i in vistas if i["id"] == ref_id] == [False]
    assert db.query(AuditLog).filter(AuditLog.acao == "imagem_enviada_pessoas", AuditLog.entidade_id == ref_id).count() == 1


def test_estudante_nao_envia_para_pessoas(client, criar_usuario, orthanc_falso):  # noqa: F811
    aluno, outro = criar_usuario(), criar_usuario()
    assert _enviar(client, _cab(client, aluno), "pessoal", pessoas=str(outro.id)).status_code == 403


def test_telas_de_grupos_e_recebidas():
    from pathlib import Path

    front = Path(__file__).resolve().parents[2] / "frontend/src"
    assert "href: '/grupos'" in (front / "components/Sidebar.tsx").read_text(encoding="utf-8")
    assert "somentePessoas" in (front / "app/grupos/page.tsx").read_text(encoding="utf-8")
    assert '<SecaoEnvios modo="recebidas" />' in (front / "app/compartilhadas-comigo/page.tsx").read_text(encoding="utf-8")
    envio = (front / "app/enviar-imagem/page.tsx").read_text(encoding="utf-8")
    assert "dados.append('grupos'" in envio and "if (!ehEstudante)" in envio
