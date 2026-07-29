"""
"Regra de ouro" da Pesquisa avancada: /search (e tudo derivado dele) so
pode expor fichas com status='aprovada' E orthanc_reference.ativo=True.
"""

from app.modules.curations import StatusCuradoria
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


def _buscar_marcador(itens: list[dict], marcador: str) -> bool:
    return any(marcador in (item.get("descricao_didatica") or "") for item in itens)


def test_search_retorna_ficha_aprovada_e_ativa(client, criar_usuario, criar_ficha):
    usuario = criar_usuario(perfil=UserRole.estudante)
    token = obter_token(client, usuario.email)
    ficha = criar_ficha(status=StatusCuradoria.APROVADA.value, ativo=True)
    marcador = ficha.descricao_didatica

    resposta = client.get("/search?limit=200", headers=cabecalho_auth(token))

    assert resposta.status_code == 200
    assert _buscar_marcador(resposta.json()["itens"], marcador)


def test_search_nao_retorna_ficha_em_analise(client, criar_usuario, criar_ficha):
    usuario = criar_usuario(perfil=UserRole.estudante)
    token = obter_token(client, usuario.email)
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value, ativo=True)
    marcador = ficha.descricao_didatica

    resposta = client.get("/search?limit=200", headers=cabecalho_auth(token))

    assert resposta.status_code == 200
    assert not _buscar_marcador(resposta.json()["itens"], marcador)


def test_search_nao_retorna_ficha_descartada(client, criar_usuario, criar_ficha):
    usuario = criar_usuario(perfil=UserRole.estudante)
    token = obter_token(client, usuario.email)
    ficha = criar_ficha(status=StatusCuradoria.DESCARTADA.value, ativo=True)
    marcador = ficha.descricao_didatica

    resposta = client.get("/search?limit=200", headers=cabecalho_auth(token))

    assert not _buscar_marcador(resposta.json()["itens"], marcador)


def test_search_nao_retorna_ficha_aprovada_com_referencia_inativa(
    client, criar_usuario, criar_ficha
):
    usuario = criar_usuario(perfil=UserRole.estudante)
    token = obter_token(client, usuario.email)
    ficha = criar_ficha(status=StatusCuradoria.APROVADA.value, ativo=False)
    marcador = ficha.descricao_didatica

    resposta = client.get("/search?limit=200", headers=cabecalho_auth(token))

    assert not _buscar_marcador(resposta.json()["itens"], marcador)


def test_search_exige_autenticacao(client):
    resposta = client.get("/search")
    assert resposta.status_code == 401


def test_preview_e_email_recusam_ficha_nao_aprovada(client, criar_usuario, criar_ficha):
    """
    A mesma regra de ouro vale pros endpoints derivados de uma ficha
    especifica (preview, send-email) - IDOR-style: tentar acessar pelo ID
    direto uma ficha que nao esta aprovada deve dar 404, nao vazar dado
    nenhum sobre ela.
    """
    usuario = criar_usuario(perfil=UserRole.estudante)
    token = obter_token(client, usuario.email)
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value, ativo=True)

    resposta_preview = client.get(f"/search/{ficha.id}/preview", headers=cabecalho_auth(token))
    assert resposta_preview.status_code == 404

    resposta_email = client.post(
        f"/search/{ficha.id}/send-email", headers=cabecalho_auth(token)
    )
    assert resposta_email.status_code == 404
