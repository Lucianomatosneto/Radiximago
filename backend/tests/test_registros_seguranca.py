"""
Registros de seguranca - OWASP ASVS 5.0 (docs/REGISTROS.md):
- 16.2.1: todo registro sabe DE ONDE veio (ip) e por qual rota;
- 16.3.2: acesso negado por perfil e registrado;
- 16.3.3: excesso de pedidos, origem recusada e dado recusado sao registrados
  (com freio contra enxurrada);
- 16.3.4: erro inesperado vai para a auditoria (e o usuario ve mensagem generica);
- 16.4.2: o banco recusa alterar/apagar registros e o lacre encadeado
  denuncia adulteracao;
- 16.2.4: saida do servidor em JSON;
- 14.2.4: prazo de guarda igual no codigo e no banco.
"""

import json
import logging
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core import registro_seguranca
from app.core.registro_json import FormatoJson
from app.main import app
from app.modules.audit_logs import AuditLog
from app.modules.retencao import AUDITORIA_RETENCAO_ANOS
from app.modules.users import UserRole
from tests.conftest import SENHA_TESTE, cabecalho_auth, obter_token


@pytest.fixture(autouse=True)
def freio_limpo():
    registro_seguranca._ultimo_registro.clear()
    yield
    registro_seguranca._ultimo_registro.clear()


def _ultimos(db, acao, depois_de_id):
    db.expire_all()
    return db.query(AuditLog).filter(AuditLog.acao == acao, AuditLog.id > depois_de_id).order_by(AuditLog.id).all()


def _maior_id(db):
    return db.query(AuditLog.id).order_by(AuditLog.id.desc()).limit(1).scalar() or 0


def test_16_2_1_registro_guarda_ip_e_rota(client, criar_usuario, db):
    usuario = criar_usuario(perfil=UserRole.estudante)
    marca = _maior_id(db)
    client.cookies.clear()
    obter_token(client, usuario.email)
    login = _ultimos(db, "login", marca)[-1]
    assert login.ip and login.rota == "POST /auth/login"
    assert login.lacre and re.fullmatch(r"[0-9a-f]{64}", login.lacre)
    client.cookies.clear()


def test_16_3_2_acesso_negado_por_perfil_e_registrado(client, criar_usuario, db):
    estudante = criar_usuario(perfil=UserRole.estudante)
    client.cookies.clear()
    cab = cabecalho_auth(obter_token(client, estudante.email))
    marca = _maior_id(db)
    assert client.get("/admin/audit-logs", headers=cab).status_code == 403
    negado = _ultimos(db, "acesso_negado", marca)
    assert len(negado) == 1
    assert negado[0].usuario_id == estudante.id and negado[0].rota == "GET /admin/audit-logs"
    assert negado[0].resultado == "negado"
    client.cookies.clear()


def test_16_3_3_excesso_de_pedidos_registrado_uma_vez_por_minuto(client, db):
    marca = _maior_id(db)
    client.cookies.clear()
    respostas = [client.post("/auth/login", data={"username": "ninguem@teste.example", "password": "x"}).status_code
                 for _ in range(9)]
    assert respostas.count(429) >= 3  # limite de 5/min
    assert len(_ultimos(db, "limite_excedido", marca)) == 1  # freio: 1 registro, nao 1 por pedido


def test_16_3_3_origem_recusada_e_dado_recusado_registrados(client, criar_usuario, db):
    marca = _maior_id(db)
    client.cookies.clear()
    assert client.post("/auth/login", data={"username": "a@b.c", "password": "x"},
                       headers={"Origin": "http://site-malicioso.example"}).status_code == 403
    assert len(_ultimos(db, "origem_recusada", marca)) == 1
    usuario = criar_usuario(perfil=UserRole.curador)
    cab = cabecalho_auth(obter_token(client, usuario.email))
    assert client.get("/search?idade_min=999", headers=cab).status_code == 422
    recusado = _ultimos(db, "entrada_recusada", marca)
    assert len(recusado) == 1 and recusado[0].usuario_id == usuario.id
    assert "999" not in (recusado[0].detalhes or "")  # nao guarda o conteudo do pedido
    client.cookies.clear()


def test_16_3_4_erro_inesperado_vai_para_a_auditoria_com_mensagem_generica(db):
    def rota_que_quebra():
        raise RuntimeError("segredo interno /app/codigo.py")
    app.add_api_route("/__teste_erro_registro", rota_que_quebra, methods=["GET"])
    marca = _maior_id(db)
    try:
        r = TestClient(app, raise_server_exceptions=False).get("/__teste_erro_registro")
        assert r.status_code == 500 and "segredo" not in r.text
        erro = _ultimos(db, "erro_inesperado", marca)
        assert len(erro) == 1 and erro[0].resultado == "erro"
        assert "segredo" not in (erro[0].detalhes or "")
    finally:
        app.router.routes[:] = [rt for rt in app.router.routes if getattr(rt, "path", "") != "/__teste_erro_registro"]


def test_16_4_2_banco_recusa_alterar_e_apagar_registros(db):
    db.add(AuditLog(acao="teste_protecao", resultado="sucesso", detalhes="original"))
    db.commit()
    registro = db.query(AuditLog).filter(AuditLog.acao == "teste_protecao").order_by(AuditLog.id.desc()).first()
    with pytest.raises(Exception, match="nao podem ser alterados"):
        db.execute(text("UPDATE audit_logs SET detalhes = 'adulterado' WHERE id = :i"), {"i": registro.id})
    db.rollback()
    with pytest.raises(Exception, match="nao podem ser alterados"):
        db.execute(text("DELETE FROM audit_logs WHERE id = :i"), {"i": registro.id})
    db.rollback()
    # passado o prazo de guarda, apagar e permitido (limpeza automatica)
    antigo = datetime.now(timezone.utc) - timedelta(days=365 * AUDITORIA_RETENCAO_ANOS + 10)
    db.add(AuditLog(acao="teste_protecao_antigo", resultado="sucesso", criado_em=antigo))
    db.commit()
    apagados = db.execute(text("DELETE FROM audit_logs WHERE acao = 'teste_protecao_antigo'")).rowcount
    db.commit()
    assert apagados == 1


def test_16_4_2_lacre_denuncia_adulteracao_feita_por_fora(client, criar_usuario, db):
    admin = criar_usuario(perfil=UserRole.administrador)
    client.cookies.clear()
    cab = cabecalho_auth(obter_token(client, admin.email))
    for i in range(3):
        db.add(AuditLog(acao="teste_lacre", resultado="sucesso", detalhes=f"registro {i}"))
        db.commit()
    ids = [r.id for r in db.query(AuditLog).filter(AuditLog.acao == "teste_lacre").order_by(AuditLog.id.desc()).limit(3)][::-1]
    url = f"/admin/audit-logs/integridade?a_partir_de_id={ids[0]}"
    r = client.get(url, headers=cab)
    assert r.status_code == 200 and r.json()["integro"] is True
    # alguem com acesso de superusuario ao banco desliga os gatilhos e altera um registro
    db.execute(text("SET LOCAL session_replication_role = replica"))
    db.execute(text("UPDATE audit_logs SET detalhes = 'ADULTERADO' WHERE id = :i"), {"i": ids[1]})
    db.commit()
    r = client.get(url, headers=cab)
    assert r.json()["integro"] is False and r.json()["primeiro_problema_id"] == ids[1]
    client.cookies.clear()


def test_14_2_4_prazo_de_guarda_igual_no_codigo_e_no_banco():
    migracao = (Path(__file__).resolve().parents[1] / "alembic" / "versions"
                / "a4c8e2f6b1d9_auditoria_origem_e_lacre.py").read_text(encoding="utf-8")
    assert f"interval '{AUDITORIA_RETENCAO_ANOS} years'" in migracao


def test_16_2_4_saida_do_servidor_em_json():
    registro = logging.LogRecord("radix", logging.ERROR, __file__, 1, "falhou %s", ("x",), None)
    try:
        raise ValueError("teste")
    except ValueError:
        import sys
        registro.exc_info = sys.exc_info()
    linha = json.loads(FormatoJson().format(registro))
    assert linha["nivel"] == "ERROR" and linha["mensagem"] == "falhou x" and linha["erro"] == "ValueError"
    assert linha["horario"].endswith("+00:00")
