"""
Politica de senha (app/core/politica_senha.py) - OWASP ASVS 5.0:
- 6.2.1: minimo de 8 caracteres;
- 6.2.4: senhas comuns recusadas;
- 6.2.8 / 6.2.9: senhas de ate 128 caracteres, com acentos e simbolos,
  conferidas INTEIRAS (Argon2id - antes, bcrypt cortava em 72 bytes);
- 6.2.12: senhas que ja vazaram na internet recusadas (lista local);
- regra igual em todas as entradas (cadastro, troca, redefinicao, admin).
"""

from app.core.politica_senha import SENHA_MAX_CARACTERES, _senhas_comuns, _senhas_vazadas, problema_na_senha
from app.core.security import gerar_hash_senha, pwd_context, senha_precisa_atualizar, verificar_senha
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
    assert problema_na_senha("laranjeiraquintal") is None  # sem exigir simbolo (ASVS 6.2.5)


def test_contexto_email_e_nome():
    assert problema_na_senha("maria.souza", email="maria.souza@ufsc.br") is not None
    assert problema_na_senha("maria.souza@ufsc.br", email="maria.souza@ufsc.br") is not None
    assert problema_na_senha("mariasouza", nome="Maria Souza") is not None


def test_6_2_9_senhas_longas_com_acentos_aceitas():
    assert problema_na_senha("ç" * 64) is None  # 128 bytes: antes, o bcrypt nao comportava
    assert problema_na_senha("a" * SENHA_MAX_CARACTERES) is None
    assert problema_na_senha("a" * (SENHA_MAX_CARACTERES + 1)) is not None


def test_argon2_confere_a_senha_inteira():
    """Mudar o ULTIMO caractere de uma senha longa ja invalida (nada cortado)."""
    senha = "ç" * 100 + "A"  # 201 bytes: o bcrypt teria lido so os 72 primeiros
    h = gerar_hash_senha(senha)
    assert h.startswith("$argon2id$")
    assert verificar_senha(senha, h)
    assert not verificar_senha(senha[:-1] + "B", h)


def test_senha_antiga_em_bcrypt_continua_valendo_e_e_marcada_para_regravar():
    import bcrypt

    antiga = bcrypt.hashpw(b"senha antiga do sistema", bcrypt.gensalt(12)).decode()
    assert verificar_senha("senha antiga do sistema", antiga)
    assert senha_precisa_atualizar(antiga)
    assert not senha_precisa_atualizar(gerar_hash_senha("senha nova do sistema"))
    assert pwd_context.default_scheme() == "argon2"


def test_6_2_12_senhas_vazadas_recusadas():
    vazadas = _senhas_vazadas()
    assert len(vazadas) > 40_000
    for senha in ("password1", "iloveyou", "qwertyuiop"):
        assert senha in vazadas or senha in _senhas_comuns()
    exemplo = sorted(vazadas - _senhas_comuns())[0]
    problema = problema_na_senha(exemplo)
    assert problema is not None and "vazamentos" in problema


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
    r = client.post("/auth/change-password", json={"senha_atual": SENHA_TESTE, "nova_senha": "y" * 129},
                    headers=cabecalho_auth(token))
    assert r.status_code == 422 and "máximo" in r.json()["detail"]
    client.cookies.clear()
