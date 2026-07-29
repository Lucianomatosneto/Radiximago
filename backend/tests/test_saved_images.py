"""
"Minhas imagens": salvar so funciona pra ficha aprovada, e cada usuario
so ve/mexe nas proprias imagens salvas (isolamento entre contas).
"""

from app.modules.curations import StatusCuradoria
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


def test_salvar_e_listar_imagem_aprovada(client, criar_usuario, criar_ficha):
    usuario = criar_usuario(perfil=UserRole.estudante)
    token = obter_token(client, usuario.email)
    ficha = criar_ficha(status=StatusCuradoria.APROVADA.value, ativo=True)

    resposta_salvar = client.post(
        f"/saved-images/{ficha.id}", headers=cabecalho_auth(token)
    )
    assert resposta_salvar.status_code == 200

    resposta_lista = client.get("/saved-images/", headers=cabecalho_auth(token))
    assert resposta_lista.status_code == 200
    ids_salvos = [item["curation_id"] for item in resposta_lista.json()["itens"]]
    assert ficha.id in ids_salvos


def test_salvar_a_mesma_imagem_duas_vezes_e_idempotente(client, criar_usuario, criar_ficha):
    usuario = criar_usuario(perfil=UserRole.estudante)
    token = obter_token(client, usuario.email)
    ficha = criar_ficha(status=StatusCuradoria.APROVADA.value, ativo=True)

    client.post(f"/saved-images/{ficha.id}", headers=cabecalho_auth(token))
    segunda_resposta = client.post(f"/saved-images/{ficha.id}", headers=cabecalho_auth(token))

    assert segunda_resposta.status_code == 200
    resposta_lista = client.get("/saved-images/", headers=cabecalho_auth(token))
    ids_salvos = [item["curation_id"] for item in resposta_lista.json()["itens"]]
    assert ids_salvos.count(ficha.id) == 1


def test_nao_salva_imagem_nao_aprovada(client, criar_usuario, criar_ficha):
    usuario = criar_usuario(perfil=UserRole.estudante)
    token = obter_token(client, usuario.email)
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value, ativo=True)

    resposta = client.post(f"/saved-images/{ficha.id}", headers=cabecalho_auth(token))

    assert resposta.status_code == 404


def test_usuario_nao_ve_imagem_salva_de_outro(client, criar_usuario, criar_ficha):
    dono = criar_usuario(perfil=UserRole.estudante)
    outro = criar_usuario(perfil=UserRole.estudante)
    token_dono = obter_token(client, dono.email)
    token_outro = obter_token(client, outro.email)
    ficha = criar_ficha(status=StatusCuradoria.APROVADA.value, ativo=True)

    client.post(f"/saved-images/{ficha.id}", headers=cabecalho_auth(token_dono))

    lista_dono = client.get("/saved-images/", headers=cabecalho_auth(token_dono)).json()
    lista_outro = client.get("/saved-images/", headers=cabecalho_auth(token_outro)).json()

    assert ficha.id in [item["curation_id"] for item in lista_dono["itens"]]
    assert ficha.id not in [item["curation_id"] for item in lista_outro["itens"]]


def test_usuario_nao_remove_imagem_salva_de_outro(client, criar_usuario, criar_ficha):
    dono = criar_usuario(perfil=UserRole.estudante)
    outro = criar_usuario(perfil=UserRole.estudante)
    token_dono = obter_token(client, dono.email)
    token_outro = obter_token(client, outro.email)
    ficha = criar_ficha(status=StatusCuradoria.APROVADA.value, ativo=True)

    client.post(f"/saved-images/{ficha.id}", headers=cabecalho_auth(token_dono))

    resposta_remocao_indevida = client.delete(
        f"/saved-images/{ficha.id}", headers=cabecalho_auth(token_outro)
    )
    assert resposta_remocao_indevida.status_code == 404

    # continua salva pro dono de verdade
    lista_dono = client.get("/saved-images/", headers=cabecalho_auth(token_dono)).json()
    assert ficha.id in [item["curation_id"] for item in lista_dono["itens"]]
