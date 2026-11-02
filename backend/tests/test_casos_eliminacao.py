"""
Eliminacao das pastas de pacientes (02/11/2026, LGPD art. 15 e 16):
- por prazo (CASOS_RETENCAO_MESES), pela limpeza diaria;
- a pedido, pelo professor, com motivo;
- sobra so o registro de auditoria, sem nome do paciente;
- aviso: lista das pastas a vencer (professor e curador).
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.core.config import settings
from app.modules import casos_arquivos, casos_eliminacao
from app.modules.audit_logs import AuditLog
from app.modules.casos import CasoClinico, CasoHistorico, CasoImagem, EtapaCaso
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth
from tests.test_casos import _criar, _dados, obter_token


@pytest.fixture(autouse=True)
def pasta_temporaria(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "CASOS_PASTA", str(tmp_path / "dados_clinicos"))
    monkeypatch.setattr(settings, "CASOS_RETENCAO_MESES", 12)
    yield


def _pasta(client, criar_usuario, db):
    aluno = criar_usuario()
    professor = criar_usuario(perfil=UserRole.professor)
    h_aluno = cabecalho_auth(obter_token(client, aluno.email))
    caso_id = _criar(client, h_aluno, _dados(professor_id=professor.id)).json()["id"]
    return aluno, professor, caso_id


def _concluir_ha(db, caso_id, meses):
    caso = db.query(CasoClinico).filter(CasoClinico.id == caso_id).first()
    caso.etapa = EtapaCaso.CONCLUIDO.value
    caso.concluido_em = datetime.now(timezone.utc) - timedelta(days=30 * meses + 2)
    db.commit()
    return caso


def test_pasta_vencida_e_eliminada_e_fica_so_a_auditoria(client, criar_usuario, db):
    _, _, caso_id = _pasta(client, criar_usuario, db)
    arquivos = [n for i in db.query(CasoImagem).filter(CasoImagem.caso_id == caso_id).all() for n in (i.arquivo, i.miniatura)]
    assert arquivos and casos_arquivos.ler(arquivos[0])
    _concluir_ha(db, caso_id, 13)

    assert casos_eliminacao.eliminar_vencidas(db) == 1
    db.expire_all()
    assert db.query(CasoClinico).filter(CasoClinico.id == caso_id).count() == 0
    assert db.query(CasoImagem).filter(CasoImagem.caso_id == caso_id).count() == 0
    assert db.query(CasoHistorico).filter(CasoHistorico.caso_id == caso_id).count() == 0
    for nome in arquivos:
        with pytest.raises((FileNotFoundError, ValueError)):
            casos_arquivos.ler(nome)
    registro = db.query(AuditLog).filter(AuditLog.acao == "caso_eliminado", AuditLog.entidade_id == caso_id).one()
    assert registro.usuario_id is None and "motivo=prazo" in registro.detalhes
    assert "Maria" not in registro.detalhes  # nunca o nome do paciente


def test_pasta_dentro_do_prazo_e_pasta_em_tratamento_recente_ficam(client, criar_usuario, db):
    _, _, concluida = _pasta(client, criar_usuario, db)
    _concluir_ha(db, concluida, 6)  # 6 meses: dentro do prazo de 12
    _, _, aberta = _pasta(client, criar_usuario, db)  # recem-enviada, nunca concluida
    assert casos_eliminacao.eliminar_vencidas(db) == 0
    assert db.query(CasoClinico).filter(CasoClinico.id.in_([concluida, aberta])).count() == 2


def test_pasta_nao_concluida_conta_da_ultima_acao_do_historico(client, criar_usuario, db):
    _, _, caso_id = _pasta(client, criar_usuario, db)
    antigo = datetime.now(timezone.utc) - timedelta(days=30 * 14)
    db.query(CasoHistorico).filter(CasoHistorico.caso_id == caso_id).update({"criado_em": antigo})
    db.commit()
    assert casos_eliminacao.eliminar_vencidas(db) == 1


def test_retencao_zero_desliga_a_eliminacao_por_prazo(client, criar_usuario, db, monkeypatch):
    _, _, caso_id = _pasta(client, criar_usuario, db)
    _concluir_ha(db, caso_id, 40)
    monkeypatch.setattr(settings, "CASOS_RETENCAO_MESES", 0)
    assert casos_eliminacao.eliminar_vencidas(db) == 0
    assert db.query(CasoClinico).filter(CasoClinico.id == caso_id).count() == 1


def test_aviso_lista_pastas_a_vencer_so_para_professor_e_curador(client, criar_usuario, db):
    aluno, professor, caso_id = _pasta(client, criar_usuario, db)
    _concluir_ha(db, caso_id, 11)  # vence em ~1 mes: dentro dos 30 dias de aviso... (12 - 11 = 1)
    caso = db.query(CasoClinico).filter(CasoClinico.id == caso_id).first()
    caso.concluido_em = datetime.now(timezone.utc) - timedelta(days=365 - 10)  # vence daqui a 10 dias
    db.commit()
    curador = criar_usuario(perfil=UserRole.curador)
    for pessoa in (professor, curador):
        h = cabecalho_auth(obter_token(client, pessoa.email))
        r = client.get("/casos/a-vencer", headers=h)
        assert r.status_code == 200
        pastas = r.json()["pastas"]
        assert [p["id"] for p in pastas] == [caso_id] and pastas[0]["dias_restantes"] <= 11
    # quem nao ve os dados do paciente nao recebe a lista
    for pessoa in (aluno, criar_usuario(perfil=UserRole.pesquisador), criar_usuario(perfil=UserRole.administrador)):
        h = cabecalho_auth(obter_token(client, pessoa.email))
        assert client.get("/casos/a-vencer", headers=h).status_code == 403
    # detalhe mostra a data prevista so para a equipe
    h_prof = cabecalho_auth(obter_token(client, professor.email))
    assert client.get(f"/casos/{caso_id}", headers=h_prof).json()["eliminacao_prevista_em"]
    h_aluno = cabecalho_auth(obter_token(client, aluno.email))
    assert client.get(f"/casos/{caso_id}", headers=h_aluno).json()["eliminacao_prevista_em"] is None


def test_eliminar_a_pedido_professor_ou_curador_com_motivo(client, criar_usuario, db):
    aluno, professor, caso_id = _pasta(client, criar_usuario, db)
    h_aluno = cabecalho_auth(obter_token(client, aluno.email))
    h_prof = cabecalho_auth(obter_token(client, professor.email))
    curador = criar_usuario(perfil=UserRole.curador)
    h_cur = cabecalho_auth(obter_token(client, curador.email))
    h_adm = cabecalho_auth(obter_token(client, criar_usuario(perfil=UserRole.administrador).email))
    corpo = {"motivo": "Paciente retirou a autorizacao"}
    for cab in (h_aluno, h_adm):
        assert client.post(f"/casos/{caso_id}/eliminar", headers=cab, json=corpo).status_code == 403
    assert client.post(f"/casos/{caso_id}/eliminar", headers=h_prof, json={"motivo": "curto"}).status_code == 422
    assert db.query(CasoClinico).filter(CasoClinico.id == caso_id).count() == 1

    r = client.post(f"/casos/{caso_id}/eliminar", headers=h_prof, json=corpo)
    assert r.status_code == 200 and r.json()["eliminada"] is True
    db.expire_all()
    assert db.query(CasoClinico).filter(CasoClinico.id == caso_id).count() == 0
    registro = db.query(AuditLog).filter(AuditLog.acao == "caso_eliminado", AuditLog.entidade_id == caso_id).one()
    assert registro.usuario_id == professor.id and "motivo=pedido" in registro.detalhes
    assert "retirou a autorizacao" in registro.detalhes and "Maria" not in registro.detalhes
    assert client.get(f"/casos/{caso_id}", headers=h_prof).status_code == 404


def test_curador_tambem_pode_eliminar_a_pedido(client, criar_usuario, db):
    _aluno, _professor, caso_id = _pasta(client, criar_usuario, db)
    curador = criar_usuario(perfil=UserRole.curador)
    h_cur = cabecalho_auth(obter_token(client, curador.email))
    assert client.get(f"/casos/{caso_id}", headers=h_cur).json()["pode"]["eliminar"] is True
    r = client.post(f"/casos/{caso_id}/eliminar", headers=h_cur, json={"motivo": "Paciente retirou a autorizacao"})
    assert r.status_code == 200
    db.expire_all()
    assert db.query(CasoClinico).filter(CasoClinico.id == caso_id).count() == 0
    registro = db.query(AuditLog).filter(AuditLog.acao == "caso_eliminado", AuditLog.entidade_id == caso_id).one()
    assert registro.usuario_id == curador.id
