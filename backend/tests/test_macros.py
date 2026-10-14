"""
Macros da curadoria e frases aprendidas pela voz:
- criar, listar, editar e desativar macro (com auditoria);
- validacao do conteudo (alteracao/tipo invalidos, macro vazia, nome repetido);
- estudante nao acessa;
- ensinar frase como alteracao e como sinonimo de termo; repetida da 409.
"""

import uuid

from app.modules.audit_logs import AuditLog
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


def test_macro_ciclo_completo(client, criar_usuario, db):
    curador = criar_usuario(perfil=UserRole.curador)
    estudante = criar_usuario()
    h = cabecalho_auth(obter_token(client, curador.email))
    h_est = cabecalho_auth(obter_token(client, estudante.email))
    nome = f"Periapical normal {uuid.uuid4().hex[:5]}"

    assert client.get("/macros", headers=h_est).status_code == 403

    r = client.post("/macros", headers=h, json={"nome": nome, "conteudo": {
        "descricao_didatica": "  Radiografia periapical sem alterações.  ",
        "tipo_radiografia": "periapical", "qualidade_tecnica": "boa", "achados_detalhe": "",
    }})
    assert r.status_code == 200, r.text
    macro = r.json()
    assert macro["conteudo"] == {
        "descricao_didatica": "Radiografia periapical sem alterações.",
        "tipo_radiografia": "periapical", "qualidade_tecnica": "boa",
    }
    assert any(m["id"] == macro["id"] for m in client.get("/macros", headers=h).json()["macros"])

    # nome repetido (mesmo sem acento/maiusculas)
    assert client.post("/macros", headers=h, json={"nome": nome.upper(), "conteudo": {"achados_detalhe": "x"}}).status_code == 409
    # conteudo invalido
    assert client.post("/macros", headers=h, json={"nome": "x1" + nome, "conteudo": {"alteracoes_observadas": ["inventada"]}}).status_code == 422
    assert client.post("/macros", headers=h, json={"nome": "x2" + nome, "conteudo": {"tipo_radiografia": "ressonancia"}}).status_code == 422
    assert client.post("/macros", headers=h, json={"nome": "x3" + nome, "conteudo": {}}).status_code == 422
    assert client.post("/macros", headers=h, json={"nome": "fim", "conteudo": {"achados_detalhe": "x"}}).status_code == 422

    r = client.patch(f"/macros/{macro['id']}", headers=h, json={"conteudo": {"alteracoes_observadas": ["carie_dentina", "carie_dentina"]}})
    assert r.status_code == 200 and r.json()["conteudo"] == {"alteracoes_observadas": ["carie_dentina"]}

    assert client.delete(f"/macros/{macro['id']}", headers=h).status_code == 200
    assert all(m["id"] != macro["id"] for m in client.get("/macros", headers=h).json()["macros"])
    assert any(m["id"] == macro["id"] for m in client.get("/macros?incluir_inativas=true", headers=h).json()["macros"])

    acoes = {a.acao for a in db.query(AuditLog).filter(AuditLog.usuario_id == curador.id).all()}
    assert {"macro_criada", "macro_editada", "macro_desativada"} <= acoes


def test_frases_aprendidas(client, criar_usuario, db):
    curador = criar_usuario(perfil=UserRole.curador)
    h = cabecalho_auth(obter_token(client, curador.email))
    marca = uuid.uuid4().hex[:5]
    frase = f"reabsorsão externa {marca}"

    r = client.post("/voz/frases", headers=h, json={"frase": frase, "tipo": "alteracao", "valor": "reabsorcao_radicular_externa"})
    assert r.status_code == 200, r.text
    fid = r.json()["id"]
    assert any(f["id"] == fid for f in client.get("/voz/frases", headers=h).json()["frases"])
    # repetida (sem acento) -> 409
    assert client.post("/voz/frases", headers=h, json={"frase": frase.replace("ã", "a"), "tipo": "alteracao", "valor": "cisto"}).status_code == 409
    assert client.post("/voz/frases", headers=h, json={"frase": "outra " + marca, "tipo": "alteracao", "valor": "nada"}).status_code == 422

    # termo -> sinonimo
    termo = client.post("/vocabulario/termos", headers=h, json={"termo": f"Calcificação pulpar {marca}"}).json()
    r = client.post("/voz/frases", headers=h, json={"frase": f"calsificasao {marca}", "tipo": "termo", "valor": str(termo["id"])})
    assert r.status_code == 200, r.text
    vocab = client.get("/vocabulario", headers=h).json()["termos"]
    alvo = next(t for t in vocab if t["id"] == termo["id"])
    assert any(s["sinonimo"] == f"calsificasao {marca}" for s in alvo["sinonimos"])

    assert client.delete(f"/voz/frases/{fid}", headers=h).status_code == 200
    acoes = [a.acao for a in db.query(AuditLog).filter(AuditLog.usuario_id == curador.id).all()]
    assert acoes.count("voz_frase_aprendida") == 2 and "voz_frase_esquecida" in acoes
