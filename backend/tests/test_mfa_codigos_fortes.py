"""
Login em duas etapas - correcoes da auditoria de 12/11/2026.

Bloco B (OWASP ASVS 6.5.2): codigos de recuperacao com pelo menos 112 bits
e guardados com Argon2id (com sal), nunca em texto puro; os antigos
(SHA-256, ~40 bits) foram invalidados pela migracao f1a3c5e7b9d2 e sao
trocados no proximo login com o aplicativo.

Bloco C (OWASP ASVS 6.5.5): o codigo do aplicativo vale so no intervalo de
30 s do momento (MFA_TOTP_JANELA=0); com 1, vale tambem o anterior; o
seguinte nunca; o mesmo codigo nao vale duas vezes.
"""

import json
import math
import os
import re
import subprocess
import sys
from pathlib import Path

import pyotp
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app.core.config import Settings, settings
from app.core.security import pwd_context
from app.main import app
from app.modules import mfa
from app.modules.audit_logs import AuditLog
from app.modules.users import User, UserRole
from tests.conftest import SENHA_TESTE, codigo_atual_do_usuario, completar_segundo_fator

BACKEND = Path(__file__).resolve().parents[1]
FORMATO = re.compile(r"^[A-Z2-9]{4}(-[A-Z2-9]{4}){5}$")


class _Relogio:
    """Relogio falso so para o modulo mfa (o resto do sistema segue o real)."""

    def __init__(self, agora: float):
        self.agora = agora

    def time(self) -> float:
        return self.agora


def _usuario_com_aplicativo(db, criar_usuario):
    u = criar_usuario(perfil=UserRole.estudante)
    segredo = pyotp.random_base32()
    u.totp_segredo_cifrado = mfa.cifrar(segredo)
    u.totp_ativo = True
    u.totp_ultimo_passo = None
    db.commit()
    return u, pyotp.TOTP(segredo)


# --- Bloco B: codigos de recuperacao -------------------------------------------

def test_codigos_novos_tem_pelo_menos_112_bits_e_formato_de_6_grupos(db, criar_usuario):
    u = criar_usuario()
    codigos = mfa.gerar_codigos_recuperacao(u)
    assert len(codigos) == mfa.QUANTIDADE_CODIGOS_RECUPERACAO == 8
    assert len(set(codigos)) == 8
    for c in codigos:
        assert FORMATO.match(c), c
    bits = mfa.TAMANHO_CODIGO_RECUPERACAO * math.log2(len(mfa._ALFABETO_RECUPERACAO))
    assert bits >= 112, bits


def test_banco_guarda_so_argon2id_com_sal_nunca_o_codigo(db, criar_usuario):
    u = criar_usuario()
    codigos = mfa.gerar_codigos_recuperacao(u)
    db.commit()
    db.refresh(u)
    guardados = u.codigos_recuperacao
    assert all(g.startswith("$argon2id$") for g in guardados)
    assert len(set(guardados)) == 8                       # sal diferente em cada um
    texto_do_banco = json.dumps(guardados)
    for c in codigos:
        assert c not in texto_do_banco and c.replace("-", "") not in texto_do_banco


def test_codigo_certo_vale_uma_vez_errado_nao_vale(db, criar_usuario):
    u = criar_usuario()
    codigos = mfa.gerar_codigos_recuperacao(u)
    assert mfa.usar_codigo_recuperacao(u, codigos[0].lower()) is True   # maiusculas/minusculas tanto faz
    assert mfa.usar_codigo_recuperacao(u, codigos[0]) is False          # segunda vez: recusado
    assert mfa.usar_codigo_recuperacao(u, codigos[1].replace("-", " ")) is True
    assert len(u.codigos_recuperacao) == 6
    assert mfa.usar_codigo_recuperacao(u, "ABCD-EFGH-JKMN-PQRS-TUVW-XYZ2") is False
    assert mfa.usar_codigo_recuperacao(u, "") is False


def test_codigo_de_6_numeros_nao_dispara_os_calculos_pesados(db, criar_usuario, monkeypatch):
    u = criar_usuario()
    mfa.gerar_codigos_recuperacao(u)
    chamadas = []
    original = pwd_context.verify
    monkeypatch.setattr(pwd_context, "verify", lambda *a, **k: chamadas.append(1) or original(*a, **k))
    assert mfa.usar_codigo_recuperacao(u, "123456") is False
    assert mfa.usar_codigo_recuperacao(u, "ABCD-EFGH") is False             # formato antigo
    assert chamadas == []


def test_resumo_antigo_sha256_nao_e_aceito(db, criar_usuario):
    import hashlib

    u = criar_usuario()
    antigo = "ABCDEFGHJKMNPQRSTUVWXYZ2"
    u.codigos_recuperacao = [hashlib.sha256(antigo.encode()).hexdigest()]
    assert mfa.usar_codigo_recuperacao(u, antigo) is False


def test_login_troca_os_codigos_antigos_e_registra_na_auditoria(db, criar_usuario, caplog):
    u = criar_usuario(perfil=UserRole.curador)                 # curador: segundo fator obrigatorio
    primeiro = TestClient(app)
    r = completar_segundo_fator(primeiro, u.email, primeiro.post("/auth/login", data={"username": u.email, "password": SENHA_TESTE}))
    assert r.status_code == 200, r.text

    # situacao depois da migracao: resumos antigos apagados e conta marcada
    db.refresh(u)
    u.codigos_recuperacao = None
    u.codigos_recuperacao_trocar = True
    db.commit()

    cliente = TestClient(app)
    desafio = cliente.post("/auth/login", data={"username": u.email, "password": SENHA_TESTE}).json()["desafio"]
    r = cliente.post("/auth/login/segundo-fator", json={"desafio": desafio, "codigo": codigo_atual_do_usuario(u.email)})
    assert r.status_code == 200, r.text
    corpo = r.json()
    assert corpo["codigos_recuperacao_trocados"] is True
    novos = corpo["codigos_recuperacao"]
    assert len(novos) == 8 and all(FORMATO.match(c) for c in novos)
    assert corpo["codigos_recuperacao_restantes"] == 8

    db.expire_all()
    salvo = db.get(User, u.id)
    assert salvo.codigos_recuperacao_trocar is False
    assert all(g.startswith("$argon2id$") for g in salvo.codigos_recuperacao)
    registros = db.query(AuditLog).filter(AuditLog.usuario_id == u.id).all()
    assert any(a.acao == "codigos_recuperacao_regenerados" for a in registros)

    # nenhum codigo em texto puro na auditoria nem nos registros do servidor
    textos = " ".join((a.detalhes or "") for a in registros) + caplog.text
    for c in novos:
        assert c not in textos and c.replace("-", "") not in textos

    # login seguinte: nada de trocar de novo
    outro = TestClient(app)
    desafio = outro.post("/auth/login", data={"username": u.email, "password": SENHA_TESTE}).json()["desafio"]
    r = outro.post("/auth/login/segundo-fator", json={"desafio": desafio, "codigo": codigo_atual_do_usuario(u.email)})
    assert r.status_code == 200 and "codigos_recuperacao" not in r.json()


def test_codigo_novo_entra_no_login_com_formato_longo(db, criar_usuario):
    u = criar_usuario(perfil=UserRole.curador)
    primeiro = TestClient(app)
    r = completar_segundo_fator(primeiro, u.email, primeiro.post("/auth/login", data={"username": u.email, "password": SENHA_TESTE}))
    codigo = r.json()["codigos_recuperacao"][3]
    cliente = TestClient(app)
    desafio = cliente.post("/auth/login", data={"username": u.email, "password": SENHA_TESTE}).json()["desafio"]
    r = cliente.post("/auth/login/segundo-fator", json={"desafio": desafio, "codigo": codigo})
    assert r.status_code == 200, r.text
    assert r.json()["codigos_recuperacao_restantes"] == 7


# --- Bloco C: janela do codigo do aplicativo -----------------------------------

def test_janela_0_so_o_codigo_do_momento(db, criar_usuario, monkeypatch):
    monkeypatch.setattr(settings, "MFA_TOTP_JANELA", 0)
    u, totp = _usuario_com_aplicativo(db, criar_usuario)
    agora = 1_800_000_015.0                                    # meio de um intervalo de 30 s
    monkeypatch.setattr(mfa, "time", _Relogio(agora))
    assert mfa.conferir_codigo(u, totp.at(agora - 30)) is False   # anterior: vencido
    assert mfa.conferir_codigo(u, totp.at(agora + 30)) is False   # seguinte: nunca
    assert mfa.conferir_codigo(u, totp.at(agora)) is True         # do momento
    assert mfa.conferir_codigo(u, totp.at(agora)) is False        # reutilizado


def test_janela_1_aceita_tambem_o_anterior_mas_nunca_o_seguinte(db, criar_usuario, monkeypatch):
    monkeypatch.setattr(settings, "MFA_TOTP_JANELA", 1)
    u, totp = _usuario_com_aplicativo(db, criar_usuario)
    agora = 1_800_000_015.0
    monkeypatch.setattr(mfa, "time", _Relogio(agora))
    assert mfa.conferir_codigo(u, totp.at(agora + 30)) is False
    assert mfa.conferir_codigo(u, totp.at(agora - 60)) is False   # dois atras: vencido
    assert mfa.conferir_codigo(u, totp.at(agora - 30)) is True
    assert mfa.conferir_codigo(u, totp.at(agora - 30)) is False   # reutilizado


def test_codigo_ja_usado_nao_volta_a_valer_no_intervalo_seguinte(db, criar_usuario, monkeypatch):
    monkeypatch.setattr(settings, "MFA_TOTP_JANELA", 1)
    u, totp = _usuario_com_aplicativo(db, criar_usuario)
    relogio = _Relogio(1_800_000_015.0)
    monkeypatch.setattr(mfa, "time", relogio)
    codigo = totp.at(relogio.agora)
    assert mfa.conferir_codigo(u, codigo) is True
    relogio.agora += 30                                       # 30 s depois, o mesmo codigo
    assert mfa.conferir_codigo(u, codigo) is False


def test_padrao_e_0_e_valor_fora_de_0_1_impede_de_ligar():
    assert Settings.model_fields["MFA_TOTP_JANELA"].default == 0
    base = {"DATABASE_URL": "postgresql://x:y@localhost/z", "ORTHANC_PASSWORD": "x"}
    with pytest.raises(ValidationError):
        Settings(**base, MFA_TOTP_JANELA=2)
    with pytest.raises(ValidationError):
        Settings(**base, MFA_TOTP_JANELA=-1)


# --- migracao f1a3c5e7b9d2 em banco proprio -----------------------------------

def test_migracao_invalida_os_codigos_antigos_e_marca_so_quem_tem_aplicativo():
    url = make_url(os.environ["DATABASE_URL"])
    nome = f"{url.database}_migracao_mfa"
    raiz = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        with raiz.connect() as c:
            c.execute(text(f'DROP DATABASE IF EXISTS "{nome}"'))
            c.execute(text(f'CREATE DATABASE "{nome}"'))
    except Exception as erro:  # sem permissao de criar banco neste ambiente
        pytest.skip(f"sem permissao para criar banco de teste: {erro}")
    url_teste = url.set(database=nome).render_as_string(hide_password=False)
    ambiente = {**os.environ, "DATABASE_URL": url_teste}

    def alembic(*args):
        r = subprocess.run([sys.executable, "-m", "alembic", *args], cwd=BACKEND, env=ambiente,
                           capture_output=True, text=True)
        assert r.returncode == 0, r.stderr[-2000:]

    try:
        alembic("upgrade", "d6e8f0a2b4c5")
        motor = create_engine(url_teste)
        with motor.begin() as c:
            for email, ativo, codigos in (
                ("a@teste.example", True, '["%s"]' % ("a" * 64)),   # aplicativo + codigos antigos
                ("b@teste.example", True, "null"),                  # aplicativo, sem codigos (null do JSON)
                ("c@teste.example", False, None),                   # sem aplicativo
            ):
                c.execute(text(
                    "INSERT INTO users (nome, email, senha_hash, perfil, ativo, bloqueado, excluido, totp_ativo, codigos_recuperacao) "
                    "VALUES ('Teste', :e, 'x', 'estudante', true, false, false, :a, CAST(:cod AS json))"
                ), {"e": email, "a": ativo, "cod": codigos})
        alembic("upgrade", "head")
        with motor.connect() as c:
            linhas = {e: (cod, trocar) for e, cod, trocar in c.execute(text(
                "SELECT email, codigos_recuperacao::text, codigos_recuperacao_trocar FROM users"))}
        assert linhas["a@teste.example"] == (None, True)
        assert linhas["b@teste.example"] == (None, False)
        assert linhas["c@teste.example"] == (None, False)
        alembic("downgrade", "d6e8f0a2b4c5")                  # caminho de volta funciona
        motor.dispose()
    finally:
        with raiz.connect() as c:
            c.execute(text(f'DROP DATABASE IF EXISTS "{nome}" WITH (FORCE)'))
        raiz.dispose()
