"""
AUDITORIA DE AUTORIZAÇÃO — toda rota da API exige login, exceto as públicas aprovadas.

Como funciona (em linguagem simples):
  1. Lê o "mapa oficial" da API (OpenAPI) e acha todas as rotas e métodos.
  2. Chama cada uma SEM login e SEM cookie.
  3. Se alguma responder algo diferente de 401 ou 403, ela é "pública".
  4. Compara com a lista de rotas públicas APROVADAS abaixo.

Se alguém criar uma rota nova e esquecer de proteger, este teste FALHA e mostra qual é.
Para aprovar uma rota pública nova de propósito, inclua-a em PUBLICAS_APROVADAS
(e registre o motivo na auditoria).

Lista aprovada em 11/11/2026 (Auditoria 01): 12 rotas, todas esperadas.
"""

import uuid

import pytest

PUBLICAS_APROVADAS = {
    # fluxo de entrada (login, cadastro, senha, segundo fator): precisam ser públicas
    ("POST", "/auth/login"),
    ("POST", "/auth/login/segundo-fator"),
    ("POST", "/auth/login/cadastro-mfa/iniciar"),
    ("POST", "/auth/login/cadastro-mfa/confirmar"),
    ("POST", "/auth/request-access"),
    ("POST", "/auth/confirm-email"),
    ("POST", "/auth/forgot-password"),
    ("POST", "/auth/reset-password"),
    # verificação de saúde do sistema
    ("GET", "/health"),
    ("GET", "/health/database"),
    ("GET", "/health/orthanc"),
    # texto dos Termos de Uso (precisa ser lido antes do login)
    ("GET", "/termos"),
}

METODOS = ("GET", "POST", "PUT", "PATCH", "DELETE")


def _valor_de_parametro(p: dict) -> str:
    esquema = p.get("schema", {})
    if esquema.get("type") == "integer":
        return "1"
    if esquema.get("format") == "uuid":
        return str(uuid.uuid4())
    return "x"


def _chamar_todas(cliente, mapa):
    abertas, total = set(), 0
    for caminho, operacoes in mapa["paths"].items():
        for metodo, op in operacoes.items():
            if metodo.upper() not in METODOS:
                continue
            total += 1
            url = caminho
            for p in op.get("parameters", []):
                if p["in"] == "path":
                    url = url.replace("{" + p["name"] + "}", _valor_de_parametro(p))
            resposta = cliente.request(metodo.upper(), url)
            if resposta.status_code not in (401, 403):
                abertas.add((metodo.upper(), caminho))
    return abertas, total


@pytest.fixture(scope="module")
def resultado(cliente, mapa_openapi):
    return _chamar_todas(cliente, mapa_openapi)


def test_nenhuma_rota_publica_alem_das_aprovadas(resultado):
    abertas, _ = resultado
    inesperadas = sorted(abertas - PUBLICAS_APROVADAS)
    assert not inesperadas, (
        "Rotas que respondem SEM exigir login e não estão na lista aprovada: "
        f"{inesperadas}"
    )


def test_rotas_publicas_aprovadas_ainda_existem(resultado):
    """Se uma rota aprovada sumiu, a lista ficou velha: atualize-a."""
    abertas, _ = resultado
    sumidas = sorted(PUBLICAS_APROVADAS - abertas)
    assert not sumidas, f"Rotas aprovadas que agora exigem login ou não existem mais: {sumidas}"


def test_a_api_tem_rotas_suficientes_para_o_teste_valer(resultado):
    """Trava de sanidade: se o mapa vier vazio, o teste acima passaria à toa."""
    _, total = resultado
    assert total > 100, f"Só {total} rotas encontradas; esperado mais de 100."
