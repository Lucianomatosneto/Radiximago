"""
Integridade da auditoria com gravacoes SIMULTANEAS (01/11/2026 - auditoria
do administrador, item A1).

Causa encontrada: o numero (id) do registro era dado ANTES da trava do lacre;
com dois pedidos ao mesmo tempo, o de numero maior podia entrar primeiro na
corrente e a verificacao apontava "quebra" sem nenhum registro alterado.
Correcao: migracao f5d1b3a7c9e2 (id dado dentro da trava) + verificacao que
reconhece os elos antigos fora de ordem - sem apagar nem reescrever nada.
"""

import threading

from sqlalchemy import text

from app.core.database import SessionLocal
from app.modules.audit_logs import AuditLog
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


def _integridade(client, cab, a_partir_de):
    r = client.get(f"/admin/audit-logs/integridade?a_partir_de_id={a_partir_de}", headers=cab)
    assert r.status_code == 200, r.text
    return r.json()


def test_gravacoes_simultaneas_nao_quebram_a_corrente(client, criar_usuario, db):
    cab = cabecalho_auth(obter_token(client, criar_usuario(perfil=UserRole.administrador).email))
    inicio = db.execute(text("SELECT coalesce(max(id), 0) + 1 FROM audit_logs")).scalar()
    barreira = threading.Barrier(6)

    def grava(n):
        sessao = SessionLocal()
        try:
            barreira.wait()
            for i in range(12):
                sessao.add(AuditLog(acao="teste_corrida", resultado="sucesso", detalhes=f"{n}-{i}"))
                sessao.commit()
        finally:
            sessao.close()

    tarefas = [threading.Thread(target=grava, args=(n,)) for n in range(6)]
    for t in tarefas:
        t.start()
    for t in tarefas:
        t.join()
    res = _integridade(client, cab, inicio)
    assert res["integro"] is True
    assert res["quantidade_ordem_concorrente"] == 0  # depois da correcao, nem fora de ordem


def test_elo_antigo_fora_de_ordem_e_reconhecido_e_alteracao_continua_denunciada(client, criar_usuario, db):
    """Recria (com os gatilhos desligados, como um superusuario faria) o caso de
    25/10: dois registros cuja ordem na corrente e a inversa dos numeros."""
    cab = cabecalho_auth(obter_token(client, criar_usuario(perfil=UserRole.administrador).email))
    db.add(AuditLog(acao="teste_ancora", resultado="sucesso"))
    db.commit()
    ancora = db.execute(text("SELECT max(id) FROM audit_logs")).scalar()
    db.execute(text("SET LOCAL session_replication_role = replica"))
    a = db.execute(text("INSERT INTO audit_logs (acao, resultado, criado_em) VALUES ('teste_fora_ordem_a', 'sucesso', now()) RETURNING id")).scalar()
    b = db.execute(text("INSERT INTO audit_logs (acao, resultado, criado_em) VALUES ('teste_fora_ordem_b', 'sucesso', now()) RETURNING id")).scalar()
    # b entrou na corrente ANTES de a (lacre de b usa o da ancora; o de a usa o de b)
    db.execute(text("UPDATE audit_logs x SET lacre = radix_lacre_auditoria((SELECT lacre FROM audit_logs WHERE id = :ancora), x) WHERE id = :b"),
               {"ancora": ancora, "b": b})
    db.execute(text("UPDATE audit_logs x SET lacre = radix_lacre_auditoria((SELECT lacre FROM audit_logs WHERE id = :b), x) WHERE id = :a"),
               {"a": a, "b": b})
    db.commit()
    db.add(AuditLog(acao="teste_depois", resultado="sucesso"))
    db.commit()

    res = _integridade(client, cab, ancora)
    assert res["integro"] is True
    assert res["quantidade_ordem_concorrente"] >= 2 and {a, b} <= set(res["ids_ordem_concorrente"])

    # mudar o CONTEUDO de um desses registros continua sendo denunciado
    db.execute(text("SET LOCAL session_replication_role = replica"))
    db.execute(text("UPDATE audit_logs SET detalhes = 'ADULTERADO' WHERE id = :a"), {"a": a})
    db.commit()
    res = _integridade(client, cab, ancora)
    assert res["integro"] is False and res["primeiro_problema_id"] == a


def test_ultima_verificacao_mostrada_sem_refazer(client, criar_usuario):
    cab = cabecalho_auth(obter_token(client, criar_usuario(perfil=UserRole.administrador).email))
    client.get("/admin/audit-logs/integridade?a_partir_de_id=1", headers=cab)
    r = client.get("/admin/audit-logs/integridade/ultima", headers=cab)
    assert r.status_code == 200 and r.json()["verificado_em"]
    assert "registros_conferidos" in r.json() and "quantidade_ordem_concorrente" in r.json()
    curador = cabecalho_auth(obter_token(client, criar_usuario(perfil=UserRole.curador).email))
    assert client.get("/admin/audit-logs/integridade/ultima", headers=curador).status_code == 403


def test_problema_na_verificacao_e_alerta_com_numero(client, criar_usuario, db):
    """Reteste do administrador: a verificacao que acha problema grava
    'alerta' (nao 'erro') e a ultima verificacao informa o numero."""
    cab = cabecalho_auth(obter_token(client, criar_usuario(perfil=UserRole.administrador).email))
    db.add(AuditLog(acao="teste_alerta", resultado="sucesso", detalhes="a"))
    db.add(AuditLog(acao="teste_alerta", resultado="sucesso", detalhes="b"))
    db.commit()
    ids = [r.id for r in db.query(AuditLog).filter(AuditLog.acao == "teste_alerta").order_by(AuditLog.id.desc()).limit(2)][::-1]
    db.execute(text("SET LOCAL session_replication_role = replica"))
    db.execute(text("UPDATE audit_logs SET detalhes = 'ADULTERADO' WHERE id = :i"), {"i": ids[1]})
    db.commit()
    res = _integridade(client, cab, ids[0])
    assert res["integro"] is False
    ultima = client.get("/admin/audit-logs/integridade/ultima", headers=cab).json()
    assert ultima["primeiro_problema_id"] == ids[1] and ultima["integro"] is False
    registro = db.query(AuditLog).filter(AuditLog.acao == "verificacao_integridade_auditoria").order_by(AuditLog.id.desc()).first()
    assert registro.resultado == "alerta"
