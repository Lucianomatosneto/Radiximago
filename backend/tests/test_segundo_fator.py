"""
Login em duas etapas (app/modules/mfa.py, mfa_router.py) - OWASP ASVS 6.3.3
e apoio a 6.5.x (codigos de uso unico) e 6.4.x (recuperacao).
Decisao do responsavel (19/10/2026): obrigatorio para administrador, suporte
e curadoria; opcional para os demais.
"""

import re

import pyotp
from fastapi.testclient import TestClient

from app.main import app
from app.modules import mfa
from app.modules.audit_logs import AuditLog
from app.modules.users import User, UserRole
from tests.conftest import SENHA_TESTE, cabecalho_auth, codigo_atual_do_usuario, obter_token


def _novo_cliente() -> TestClient:
    return TestClient(app)


def _senha(cliente: TestClient, email: str):
    return cliente.post("/auth/login", data={"username": email, "password": SENHA_TESTE})


def _cadastrar_no_login(cliente: TestClient, email: str) -> tuple[str, list[str]]:
    """1o login de perfil obrigatorio: cadastra o aplicativo; devolve (segredo, codigos de recuperacao)."""
    desafio = _senha(cliente, email).json()["desafio"]
    segredo = cliente.post("/auth/login/cadastro-mfa/iniciar", json={"desafio": desafio}).json()["segredo"]
    r = cliente.post("/auth/login/cadastro-mfa/confirmar", json={"desafio": desafio, "codigo": pyotp.TOTP(segredo).now()})
    assert r.status_code == 200, r.text
    return segredo, r.json()["codigos_recuperacao"]


def test_estudante_entra_so_com_a_senha(criar_usuario):
    estudante = criar_usuario()
    r = _senha(_novo_cliente(), estudante.email)
    assert r.status_code == 200 and "access_token" in r.json()


def test_6_3_3_perfil_com_poder_nao_entra_so_com_a_senha(criar_usuario):
    for perfil in mfa.PERFIS_MFA_OBRIGATORIO:
        usuario = criar_usuario(perfil=perfil)
        cliente = _novo_cliente()
        r = _senha(cliente, usuario.email)
        assert r.status_code == 200
        dados = r.json()
        assert dados["segundo_fator"] == "cadastro" and "access_token" not in dados
        assert "radix_token" not in r.cookies and not cliente.cookies  # nenhuma sessao aberta
        # o "vale" do desafio NAO serve como sessao
        assert cliente.get("/auth/me", headers=cabecalho_auth(dados["desafio"])).status_code == 401


def test_cadastro_no_primeiro_login_com_qr_code(criar_usuario, db):
    curador = criar_usuario(perfil=UserRole.curador)
    cliente = _novo_cliente()
    desafio = _senha(cliente, curador.email).json()["desafio"]
    inicio = cliente.post("/auth/login/cadastro-mfa/iniciar", json={"desafio": desafio}).json()
    assert inicio["qr_code"].startswith("data:image/svg+xml")
    assert inicio["endereco"].startswith("otpauth://totp/Radix%20Imago:")
    # codigo errado nao ativa
    r = cliente.post("/auth/login/cadastro-mfa/confirmar", json={"desafio": desafio, "codigo": "000000"})
    assert r.status_code == 401
    r = cliente.post("/auth/login/cadastro-mfa/confirmar", json={"desafio": desafio, "codigo": pyotp.TOTP(inicio["segredo"]).now()})
    assert r.status_code == 200 and "access_token" in r.json()
    codigos = r.json()["codigos_recuperacao"]
    assert len(codigos) == 8 and all(re.fullmatch(r"[A-Z2-9]{4}-[A-Z2-9]{4}", c) for c in codigos)
    assert cliente.get("/auth/me").status_code == 200  # sessao aberta
    db.expire_all()
    salvo = db.get(User, curador.id)
    assert salvo.totp_ativo
    # segredo CIFRADO no banco; codigos de recuperacao so como resumo
    assert inicio["segredo"] not in (salvo.totp_segredo_cifrado or "")
    assert mfa.decifrar(salvo.totp_segredo_cifrado) == inicio["segredo"]
    assert all(re.fullmatch(r"[0-9a-f]{64}", h) for h in salvo.codigos_recuperacao)
    assert db.query(AuditLog).filter(AuditLog.usuario_id == curador.id, AuditLog.acao == "segundo_fator_ativado").count() == 1


def test_quem_ja_tem_aplicativo_nao_cadastra_outro_so_com_a_senha(criar_usuario):
    """Senha roubada nao basta para trocar o celular cadastrado."""
    admin = criar_usuario(perfil=UserRole.administrador)
    _cadastrar_no_login(_novo_cliente(), admin.email)
    r = _senha(_novo_cliente(), admin.email)
    assert r.json()["segundo_fator"] == "codigo"
    assert _novo_cliente().post("/auth/login/cadastro-mfa/iniciar", json={"desafio": r.json()["desafio"]}).status_code == 409


def test_6_5_1_codigo_vale_uma_vez_e_desafio_tambem(criar_usuario):
    suporte = criar_usuario(perfil=UserRole.suporte)
    segredo, _ = _cadastrar_no_login(_novo_cliente(), suporte.email)
    cliente = _novo_cliente()
    desafio = _senha(cliente, suporte.email).json()["desafio"]
    # o codigo usado no cadastro (mesma janela de 30 s) nao entra de novo
    r = cliente.post("/auth/login/segundo-fator", json={"desafio": desafio, "codigo": pyotp.TOTP(segredo).now()})
    assert r.status_code == 401
    codigo = codigo_atual_do_usuario(suporte.email)  # "proxima janela" simulada
    assert cliente.post("/auth/login/segundo-fator", json={"desafio": desafio, "codigo": codigo}).status_code == 200
    # o mesmo desafio nao abre uma segunda sessao
    outro = _novo_cliente()
    codigo = codigo_atual_do_usuario(suporte.email)
    assert outro.post("/auth/login/segundo-fator", json={"desafio": desafio, "codigo": codigo}).status_code == 401


def test_desafio_aceita_no_maximo_5_tentativas(criar_usuario, db):
    curador = criar_usuario(perfil=UserRole.curador)
    _cadastrar_no_login(_novo_cliente(), curador.email)
    cliente = _novo_cliente()
    desafio = _senha(cliente, curador.email).json()["desafio"]
    for _ in range(mfa.TENTATIVAS_POR_DESAFIO):
        assert cliente.post("/auth/login/segundo-fator", json={"desafio": desafio, "codigo": "123456"}).status_code == 401
    # esgotado: nem o codigo certo entra com este desafio
    codigo = codigo_atual_do_usuario(curador.email)
    assert cliente.post("/auth/login/segundo-fator", json={"desafio": desafio, "codigo": codigo}).status_code == 401
    assert db.query(AuditLog).filter(AuditLog.usuario_id == curador.id, AuditLog.acao == "falha_segundo_fator").count() >= 5


def test_codigo_de_recuperacao_entra_uma_vez(criar_usuario):
    curador = criar_usuario(perfil=UserRole.curador)
    _, codigos = _cadastrar_no_login(_novo_cliente(), curador.email)
    cliente = _novo_cliente()
    desafio = _senha(cliente, curador.email).json()["desafio"]
    r = cliente.post("/auth/login/segundo-fator", json={"desafio": desafio, "codigo": codigos[0].lower()})
    assert r.status_code == 200 and r.json()["codigos_recuperacao_restantes"] == 7
    cliente2 = _novo_cliente()
    desafio = _senha(cliente2, curador.email).json()["desafio"]
    assert cliente2.post("/auth/login/segundo-fator", json={"desafio": desafio, "codigo": codigos[0]}).status_code == 401


def test_opcional_para_estudante_liga_e_desliga(criar_usuario):
    estudante = criar_usuario()
    cliente = _novo_cliente()
    cab = cabecalho_auth(obter_token(cliente, estudante.email))
    assert cliente.get("/auth/mfa", headers=cab).json() == {"ativo": False, "obrigatorio": False, "codigos_recuperacao_restantes": 0}
    segredo = cliente.post("/auth/mfa/iniciar", headers=cab).json()["segredo"]
    r = cliente.post("/auth/mfa/confirmar", json={"codigo": pyotp.TOTP(segredo).now()}, headers=cab)
    assert r.status_code == 200 and len(r.json()["codigos_recuperacao"]) == 8
    # a partir de agora o login dele pede o codigo
    assert _senha(_novo_cliente(), estudante.email).json()["segundo_fator"] == "codigo"
    # desligar exige senha E codigo
    codigo = codigo_atual_do_usuario(estudante.email)
    assert cliente.post("/auth/mfa/desativar", json={"senha": "errada-123", "codigo": codigo}, headers=cab).status_code == 401
    codigo = codigo_atual_do_usuario(estudante.email)
    assert cliente.post("/auth/mfa/desativar", json={"senha": SENHA_TESTE, "codigo": codigo}, headers=cab).status_code == 200
    assert "access_token" in _senha(_novo_cliente(), estudante.email).json()


def test_perfil_obrigatorio_nao_desliga(criar_usuario):
    curador = criar_usuario(perfil=UserRole.curador)
    cliente = _novo_cliente()
    cab = cabecalho_auth(obter_token(cliente, curador.email))
    assert cliente.get("/auth/mfa", headers=cab).json()["obrigatorio"] is True
    codigo = codigo_atual_do_usuario(curador.email)
    assert cliente.post("/auth/mfa/desativar", json={"senha": SENHA_TESTE, "codigo": codigo}, headers=cab).status_code == 403


def test_novos_codigos_de_recuperacao_invalidam_os_antigos(criar_usuario):
    curador = criar_usuario(perfil=UserRole.curador)
    _, antigos = _cadastrar_no_login(_novo_cliente(), curador.email)
    cliente = _novo_cliente()
    cab = cabecalho_auth(obter_token(cliente, curador.email))
    novos = cliente.post("/auth/mfa/novos-codigos", json={"codigo": codigo_atual_do_usuario(curador.email)}, headers=cab).json()["codigos_recuperacao"]
    assert set(novos).isdisjoint(antigos)
    outro = _novo_cliente()
    desafio = _senha(outro, curador.email).json()["desafio"]
    assert outro.post("/auth/login/segundo-fator", json={"desafio": desafio, "codigo": antigos[1]}).status_code == 401


def test_administrador_redefine_o_segundo_fator_de_outra_pessoa(criar_usuario, db):
    admin, curador, estudante = (criar_usuario(perfil=UserRole.administrador), criar_usuario(perfil=UserRole.curador), criar_usuario())
    cab_curador = cabecalho_auth(obter_token(_novo_cliente(), curador.email))
    assert _novo_cliente().get("/auth/me", headers=cab_curador).status_code == 200
    cab_est = cabecalho_auth(obter_token(_novo_cliente(), estudante.email))
    assert _novo_cliente().post(f"/users/{curador.id}/redefinir-segundo-fator", headers=cab_est).status_code == 403
    cab_adm = cabecalho_auth(obter_token(_novo_cliente(), admin.email))
    assert _novo_cliente().post(f"/users/{curador.id}/redefinir-segundo-fator", headers=cab_adm).status_code == 200
    assert _novo_cliente().get("/auth/me", headers=cab_curador).status_code == 401  # acessos encerrados
    assert _senha(_novo_cliente(), curador.email).json()["segundo_fator"] == "cadastro"
    # o proprio admin usa o roteiro do servidor (nao ha quem confira a identidade)
    assert _novo_cliente().post(f"/users/{admin.id}/redefinir-segundo-fator", headers=cab_adm).status_code == 409
