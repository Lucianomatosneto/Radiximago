"""
Politica de senha (app/core/politica_senha.py) - OWASP ASVS 5.0:
- 6.2.1: minimo de 8 caracteres;
- 6.2.4: senhas comuns recusadas;
- 6.2.8: nenhuma senha nova passa do limite do bcrypt (72 bytes), entao
  a senha e sempre conferida inteira, nunca cortada;
- regra igual em todas as entradas (cadastro, troca, redefinicao, admin).
"""

from app.core.politica_senha import SENHA_MAX_BYTES, _senhas_comuns, problema_na_senha
from app.core.security import gerar_hash_senha, verificar_senha
from app.modules.users import UserRole
from tests.conftest import SENHA_TESTE, cabecalho_auth, obter_token


def test_lista_carregada_e_com_senhas_conhecidas():
    lista = _senhas_comuns()
    assert len(lista) > 3000  # ASVS pede ao menos as 3000 mais comuns
    for comum in ("password", "12345678", "senha123", "qwertyuiop", "radiximago"):
        assert comum in lista


def test_regras_basicas():
    assert problema_na_senha("curta") is not None
    assert problema_na_senha("Password") is not None  # ignora maiusculas
    assert problema_na_senha("SENHA123") is not None
    assert problema_na_senha("panoramica do terceiro molar") is None  # frase: aceita
    assert problema_na_senha("abcdefghij") is None  # sem exigir simbolo (ASVS 6.2.5)


def test_contexto_email_e_nome():
    assert problema_na_senha("maria.souza", email="maria.souza@ufsc.br") is not None
    assert problema_na_senha("maria.souza@ufsc.br", email="maria.souza@ufsc.br") is not None
    assert problema_na_senha("mariasouza", nome="Maria Souza") is not None


def test_limite_de_tamanho_em_caracteres_e_bytes():
    assert problema_na_senha("a" * 64) is None
    assert problema_na_senha("a" * 65) is not None
    # 40 letras acentuadas = 80 bytes: passaria do bcrypt, entao e recusada
    assert problema_na_senha("ç" * 40) is not None
    assert problema_na_senha("ç" * 36) is None  # 72 bytes: no limite


def test_bcrypt_confere_a_senha_inteira_dentro_do_limite():
    """Dentro do limite, mudar o ULTIMO caractere ja invalida a senha (nada cortado)."""
    senha = "x" * (SENHA_MAX_BYTES - 1) + "A"
    assert problema_na_senha(senha[-64:]) is None
    h = gerar_hash_senha(senha[-64:])
    assert verificar_senha(senha[-64:], h)
    assert not verificar_senha(senha[-64:-1] + "B", h)


def test_todas_as_entradas_usam_a_mesma_regra(client, criar_usuario):
    usuario = criar_usuario(perfil=UserRole.curador)
    admin = criar_usuario(perfil=UserRole.administrador)
    client.cookies.clear()
    token_admin = obter_token(client, admin.email)
    # administrador criando conta
    r = client.post(
        "/users/",
        json={"nome": "Conta Teste", "email": "conta-politica@teste.example", "senha": "12345678",
              "perfil": "estudante", "instituicao": "UFSC"},
        headers=cabecalho_auth(token_admin),
    )
    assert r.status_code == 422 and "comum" in r.json()["detail"]
    # cadastro publico (solicitar acesso)
    r = client.post(
        "/auth/request-access",
        json={"nome": "Pessoa Teste", "email": "pedido-politica@teste.example", "senha": "iloveyou",
              "perfil_solicitado": "estudante", "instituicao": "UFSC", "justificativa": "teste da politica"},
    )
    assert r.status_code == 422, r.text
    # troca da propria senha
    client.cookies.clear()
    token = obter_token(client, usuario.email)
    r = client.post("/auth/change-password", json={"senha_atual": SENHA_TESTE, "nova_senha": "qwertyuiop"},
                    headers=cabecalho_auth(token))
    assert r.status_code == 422 and "comum" in r.json()["detail"]
    r = client.post("/auth/change-password", json={"senha_atual": SENHA_TESTE, "nova_senha": "y" * 80},
                    headers=cabecalho_auth(token))
    assert r.status_code == 422 and "máximo" in r.json()["detail"]
    client.cookies.clear()
