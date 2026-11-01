"""
Sugestoes de melhoria (Etapa 1 - 30/10/2026):
- qualquer perfil logado envia; o perfil de quem enviou fica gravado;
- so o administrador ve a lista completa (ordem de chegada) e muda o andamento;
- cada um ve so as proprias; "nao sera feita" exige motivo;
- tudo na auditoria; sem login = 401.
"""

from app.modules.audit_logs import AuditLog
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


def test_envio_por_todos_os_perfis_e_lista_do_admin(client, criar_usuario, db):
    admin = criar_usuario(perfil=UserRole.administrador)
    h_admin = cabecalho_auth(obter_token(client, admin.email))
    enviados = {}
    for perfil in (UserRole.estudante, UserRole.professor, UserRole.pesquisador, UserRole.curador):
        u = criar_usuario(perfil=perfil)
        h = cabecalho_auth(obter_token(client, u.email))
        r = client.post("/sugestoes", headers=h, json={"texto": f"  Melhorar a busca ({perfil.value})  ", "contato": "48 99999-0000"})
        assert r.status_code == 200, r.text
        assert "perfil" not in r.json() and "contato" not in r.json()
        enviados[r.json()["id"]] = (perfil.value, u.nome)
        # cada um ve so a sua
        minhas = client.get("/sugestoes/minhas", headers=h).json()["sugestoes"]
        assert [m["id"] for m in minhas] == [r.json()["id"]]
        assert minhas[0]["texto"] == f"Melhorar a busca ({perfil.value})"
        # a lista completa e so do administrador
        assert client.get("/sugestoes", headers=h).status_code == 403

    todas = client.get("/sugestoes", headers=h_admin).json()["sugestoes"]
    nossas = [s for s in todas if s["id"] in enviados]
    assert [s["id"] for s in nossas] == sorted(enviados)  # ordem de chegada
    for s in nossas:
        assert (s["perfil"], s["nome"]) == enviados[s["id"]]
        assert s["contato"] == "48 99999-0000" and s["andamento"] == "recebida"


def test_andamento_motivo_e_auditoria(client, criar_usuario, db):
    admin = criar_usuario(perfil=UserRole.administrador)
    aluno = criar_usuario()
    h_admin = cabecalho_auth(obter_token(client, admin.email))
    h_aluno = cabecalho_auth(obter_token(client, aluno.email))
    sid = client.post("/sugestoes", headers=h_aluno, json={"texto": "Modo escuro no celular"}).json()["id"]

    assert client.patch(f"/sugestoes/{sid}", headers=h_aluno, json={"andamento": "feita"}).status_code == 403
    assert client.patch(f"/sugestoes/{sid}", headers=h_admin, json={"andamento": "nao_sera_feita"}).status_code == 422
    assert client.patch(f"/sugestoes/{sid}", headers=h_admin, json={"andamento": "inventado"}).status_code == 422
    r = client.patch(f"/sugestoes/{sid}", headers=h_admin, json={"andamento": "em_analise"})
    assert r.status_code == 200 and r.json()["andamento"] == "em_analise"
    r = client.patch(f"/sugestoes/{sid}", headers=h_admin, json={"andamento": "nao_sera_feita", "motivo": "Fora do escopo"})
    assert r.status_code == 200
    minha = client.get("/sugestoes/minhas", headers=h_aluno).json()["sugestoes"][0]
    assert minha["andamento"] == "nao_sera_feita" and minha["motivo"] == "Fora do escopo"
    assert client.patch("/sugestoes/999999999", headers=h_admin, json={"andamento": "feita"}).status_code == 404

    acoes_aluno = {a.acao for a in db.query(AuditLog).filter(AuditLog.usuario_id == aluno.id)}
    acoes_admin = [a.acao for a in db.query(AuditLog).filter(AuditLog.usuario_id == admin.id)]
    assert "sugestao_enviada" in acoes_aluno
    assert acoes_admin.count("sugestao_andamento_alterado") == 2


def test_validacao_e_sem_login(client, criar_usuario):
    aluno = criar_usuario()
    h = cabecalho_auth(obter_token(client, aluno.email))
    assert client.post("/sugestoes", headers=h, json={"texto": "   "}).status_code == 422
    assert client.post("/sugestoes", headers=h, json={"texto": "abc"}).status_code == 422
    assert client.post("/sugestoes", headers=h, json={"texto": "x" * 4001}).status_code == 422
    client.cookies.clear()
    assert client.post("/sugestoes", json={"texto": "Sem login nao pode"}).status_code == 401
    assert client.get("/sugestoes/minhas").status_code == 401
