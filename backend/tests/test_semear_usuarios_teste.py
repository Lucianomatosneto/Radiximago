"""
Script dos usuarios descartaveis dos testes no navegador
(scripts/semear_usuarios_teste.py, 13/11/2026):
- RECUSA rodar fora de ENVIRONMENT=test (e nao cria nada);
- cria as contas, com senha que funciona no login e segredo do 2o fator
  que gera codigos aceitos pelo servidor;
- credenciais vao so para o arquivo pedido; na tela, so "::add-mask::".
"""

import pyotp
import pytest
from sqlalchemy import text

from app.core.config import settings
from app.modules import mfa
from app.modules.audit_logs import AuditLog
from app.modules.curations import Curation
from app.modules.orthanc_references import OrthancReference
from app.modules.sessoes import SessaoUsuario
from app.modules.termos_uso import AceiteTermosUso
from app.modules.users import User

from scripts import semear_usuarios_teste as semear


@pytest.fixture()
def limpar_semeados(db):
    yield
    db.rollback()
    refs = db.query(OrthancReference).filter(OrthancReference.orthanc_id.like("e2e-sintetica-%")).all()
    for ref in refs:
        db.query(Curation).filter(Curation.orthanc_reference_id == ref.id).delete()
        db.delete(ref)
    usuarios = db.query(User).filter(User.email.like(f"%@{semear.DOMINIO}")).all()
    # o login do teste grava auditoria e sessao; a auditoria e protegida contra
    # apagamento (gatilho) - so a limpeza dos testes desliga, e so nesta transacao
    db.execute(text("SET LOCAL session_replication_role = replica"))
    for u in usuarios:
        db.query(AceiteTermosUso).filter(AceiteTermosUso.usuario_id == u.id).delete()
        db.query(AuditLog).filter(AuditLog.usuario_id == u.id).delete()
        db.query(SessaoUsuario).filter(SessaoUsuario.usuario_id == u.id).delete()
        db.delete(u)
    db.commit()


def _semeados(db):
    return db.query(User).filter(User.email.like(f"%@{semear.DOMINIO}")).count()


@pytest.mark.parametrize("ambiente", ["development", "production", "", "TEST"])
def test_recusa_fora_do_ambiente_de_teste(ambiente, db, monkeypatch, tmp_path, capsys, limpar_semeados):
    monkeypatch.setattr(settings, "ENVIRONMENT", ambiente)
    saida = tmp_path / "env"
    assert semear.main(["--saida-env", str(saida)]) == 2
    assert "Recusado" in capsys.readouterr().err
    assert not saida.exists()
    with pytest.raises(semear.AmbienteNaoPermitido):
        semear.semear(db)
    assert _semeados(db) == 0


def test_cria_contas_que_funcionam_e_nao_mostra_segredos(client, db, monkeypatch, tmp_path, capsys, limpar_semeados):
    monkeypatch.setattr(settings, "ENVIRONMENT", "test")
    saida = tmp_path / "env"
    assert semear.main(["--saida-env", str(saida)]) == 0
    variaveis = dict(linha.split("=", 1) for linha in saida.read_text().splitlines())
    assert set(variaveis) == {
        "E2E_ADMIN_EMAIL", "E2E_ADMIN_SENHA", "E2E_ADMIN_TOTP",
        "E2E_CURADOR_EMAIL", "E2E_CURADOR_SENHA", "E2E_CURADOR_TOTP",
        "E2E_ESTUDANTE_EMAIL", "E2E_ESTUDANTE_SENHA",
    }
    # na tela: so os comandos que escondem os valores, nunca o valor solto
    tela = capsys.readouterr().out
    for nome, valor in variaveis.items():
        if nome.endswith("_EMAIL"):
            continue
        assert f"::add-mask::{valor}" in tela
        assert tela.count(valor) == 1, f"{nome} apareceu fora do ::add-mask::"
    # senhas sorteadas, longas e diferentes entre si
    senhas = [variaveis[f"E2E_{p}_SENHA"] for p in ("ADMIN", "CURADOR", "ESTUDANTE")]
    assert len(set(senhas)) == 3 and all(len(s) >= 20 for s in senhas)

    db.expire_all()
    admin = db.query(User).filter(User.email == variaveis["E2E_ADMIN_EMAIL"]).one()
    estudante = db.query(User).filter(User.email == variaveis["E2E_ESTUDANTE_EMAIL"]).one()
    # segredo do 2o fator guardado CIFRADO, e o codigo gerado com ele e aceito
    assert admin.totp_ativo and variaveis["E2E_ADMIN_TOTP"] not in (admin.totp_segredo_cifrado or "")
    assert mfa.decifrar(admin.totp_segredo_cifrado) == variaveis["E2E_ADMIN_TOTP"]
    assert mfa.conferir_codigo(admin, pyotp.TOTP(variaveis["E2E_ADMIN_TOTP"]).now())
    # admin com os Termos aceitos; estudante sem (o teste confere que o aceite aparece)
    assert db.query(AceiteTermosUso).filter(AceiteTermosUso.usuario_id == admin.id).count() == 1
    assert db.query(AceiteTermosUso).filter(AceiteTermosUso.usuario_id == estudante.id).count() == 0
    assert not estudante.totp_ativo
    # duas fichas aprovadas, so texto (referencia ficticia, sem imagem real)
    fichas = (db.query(Curation).join(OrthancReference, Curation.orthanc_reference_id == OrthancReference.id)
              .filter(OrthancReference.orthanc_id.like("e2e-sintetica-%")).all())
    assert len(fichas) == 2 and all(f.status == "aprovada" for f in fichas)

    # a senha sorteada funciona no login de verdade
    r = client.post("/auth/login", data={"username": variaveis["E2E_ESTUDANTE_EMAIL"], "password": variaveis["E2E_ESTUDANTE_SENHA"]})
    assert r.status_code == 200
    r = client.post("/auth/login", data={"username": variaveis["E2E_ADMIN_EMAIL"], "password": variaveis["E2E_ADMIN_SENHA"]})
    assert r.status_code == 200 and r.json()["segundo_fator"] == "codigo"


def test_rodar_de_novo_troca_as_senhas_e_volta_o_estudante_ao_primeiro_acesso(db, monkeypatch, tmp_path, limpar_semeados):
    monkeypatch.setattr(settings, "ENVIRONMENT", "test")
    primeira = semear.variaveis(semear.semear(db))
    estudante = db.query(User).filter(User.email == primeira["E2E_ESTUDANTE_EMAIL"]).one()
    db.add(AceiteTermosUso(usuario_id=estudante.id, versao="1.1", perfil="estudante", resumo_textos="x" * 64,
                           aceito_em=estudante.criado_em))
    db.commit()
    segunda = semear.variaveis(semear.semear(db))
    assert primeira["E2E_ESTUDANTE_SENHA"] != segunda["E2E_ESTUDANTE_SENHA"]
    assert primeira["E2E_ADMIN_TOTP"] != segunda["E2E_ADMIN_TOTP"]
    assert db.query(AceiteTermosUso).filter(AceiteTermosUso.usuario_id == estudante.id).count() == 0
    assert _semeados(db) == 3  # nao duplica contas
    assert db.query(OrthancReference).filter(OrthancReference.orthanc_id.like("e2e-sintetica-%")).count() == 2
