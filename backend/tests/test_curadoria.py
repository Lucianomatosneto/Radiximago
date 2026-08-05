"""
Fluxo de curadoria: criar ficha, aprovar (com regra de anonimizacao
validada), descartar (com justificativa obrigatoria), e o controle de
acesso (so administrador/suporte/curador operam esses endpoints).
"""

from app.modules.curations import StatusCuradoria
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


def test_estudante_nao_cria_ficha_de_curadoria(client, criar_usuario, criar_referencia):
    usuario = criar_usuario(perfil=UserRole.estudante)
    token = obter_token(client, usuario.email)
    referencia = criar_referencia()

    resposta = client.post(
        f"/curation/{referencia.id}",
        headers=cabecalho_auth(token),
        json={"tipo_radiografia": "periapical"},
    )

    assert resposta.status_code == 403


def test_curador_cria_ficha_de_curadoria(client, criar_usuario, criar_referencia):
    usuario = criar_usuario(perfil=UserRole.curador)
    token = obter_token(client, usuario.email)
    referencia = criar_referencia()

    resposta = client.post(
        f"/curation/{referencia.id}",
        headers=cabecalho_auth(token),
        json={"tipo_radiografia": "periapical"},
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["status"] == StatusCuradoria.EM_ANALISE.value
    assert corpo["orthanc_reference_id"] == referencia.id


def test_nao_cria_ficha_pra_referencia_inexistente(client, criar_usuario):
    usuario = criar_usuario(perfil=UserRole.curador)
    token = obter_token(client, usuario.email)

    resposta = client.post(
        "/curation/999999999",
        headers=cabecalho_auth(token),
        json={"tipo_radiografia": "periapical"},
    )

    assert resposta.status_code == 404


def test_nao_cria_ficha_pra_referencia_inativa(client, criar_usuario, criar_referencia):
    usuario = criar_usuario(perfil=UserRole.curador)
    token = obter_token(client, usuario.email)
    referencia = criar_referencia(ativo=False)

    resposta = client.post(
        f"/curation/{referencia.id}",
        headers=cabecalho_auth(token),
        json={"tipo_radiografia": "periapical"},
    )

    assert resposta.status_code == 409


def test_nao_cria_segunda_ficha_pra_mesma_referencia(client, criar_usuario, criar_ficha):
    usuario = criar_usuario(perfil=UserRole.curador)
    token = obter_token(client, usuario.email)
    ficha_existente = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)

    resposta = client.post(
        f"/curation/{ficha_existente.orthanc_reference_id}",
        headers=cabecalho_auth(token),
        json={"tipo_radiografia": "periapical"},
    )

    assert resposta.status_code == 409


def test_aprovar_exige_anonimizacao_validada(client, criar_usuario, criar_ficha):
    usuario = criar_usuario(perfil=UserRole.curador)
    token = obter_token(client, usuario.email)
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)

    resposta = client.post(
        f"/curation/{ficha.id}/approve",
        headers=cabecalho_auth(token),
        json={"anonimizacao_validada": False},
    )

    assert resposta.status_code == 422


def test_aprovar_com_anonimizacao_validada(client, criar_usuario, criar_ficha):
    usuario = criar_usuario(perfil=UserRole.curador)
    token = obter_token(client, usuario.email)
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)

    resposta = client.post(
        f"/curation/{ficha.id}/approve",
        headers=cabecalho_auth(token),
        json={"anonimizacao_validada": True, "observacoes": "ok pra suite"},
    )

    assert resposta.status_code == 200
    assert resposta.json()["status"] == StatusCuradoria.APROVADA.value


def test_descartar_exige_motivo(client, criar_usuario, criar_ficha):
    usuario = criar_usuario(perfil=UserRole.curador)
    token = obter_token(client, usuario.email)
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)

    resposta = client.post(
        f"/curation/{ficha.id}/discard",
        headers=cabecalho_auth(token),
        json={"motivo": "   "},
    )

    assert resposta.status_code == 422


def test_descartar_com_motivo(client, criar_usuario, criar_ficha):
    usuario = criar_usuario(perfil=UserRole.curador)
    token = obter_token(client, usuario.email)
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)

    resposta = client.post(
        f"/curation/{ficha.id}/discard",
        headers=cabecalho_auth(token),
        json={"motivo": "Imagem com qualidade tecnica insuficiente."},
    )

    assert resposta.status_code == 200
    assert resposta.json()["status"] == StatusCuradoria.DESCARTADA.value


def test_aprovar_ficha_inexistente_da_404(client, criar_usuario):
    usuario = criar_usuario(perfil=UserRole.curador)
    token = obter_token(client, usuario.email)

    resposta = client.post(
        "/curation/999999999/approve",
        headers=cabecalho_auth(token),
        json={"anonimizacao_validada": True},
    )

    assert resposta.status_code == 404


def test_reviews_answered_so_lista_do_proprio_solicitante(client, criar_usuario, criar_ficha):
    solicitante = criar_usuario(perfil=UserRole.curador)
    revisor = criar_usuario(perfil=UserRole.curador)
    outro_curador = criar_usuario(perfil=UserRole.curador)
    token_solicitante = obter_token(client, solicitante.email)
    token_revisor = obter_token(client, revisor.email)
    token_outro = obter_token(client, outro_curador.email)

    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)

    resposta = client.post(
        f"/curation/{ficha.id}/request-review",
        headers=cabecalho_auth(token_solicitante),
        json={"motivo": "Duvida sobre o achado principal."},
    )
    assert resposta.status_code == 200
    review_id = resposta.json()["review_id"]

    # Ainda 'solicitada' (sem resposta) - nao aparece em /answered pra ninguem.
    resposta = client.get("/curation/reviews/answered", headers=cabecalho_auth(token_solicitante))
    assert resposta.status_code == 200
    assert resposta.json()["itens"] == []

    resposta = client.post(
        f"/curation/reviews/{review_id}/respond",
        headers=cabecalho_auth(token_revisor),
        json={"concordancia": "discorda", "parecer_revisor": "Parece lesao periapical, nao carie."},
    )
    assert resposta.status_code == 200

    resposta = client.get("/curation/reviews/answered", headers=cabecalho_auth(token_solicitante))
    assert resposta.status_code == 200
    itens = resposta.json()["itens"]
    assert len(itens) == 1
    assert itens[0]["id"] == review_id
    assert itens[0]["curation"]["id"] == ficha.id

    # Nem o revisor nem um curador nao envolvido veem a review de outro
    # solicitante - cada um so ve o que ele mesmo pediu.
    resposta = client.get("/curation/reviews/answered", headers=cabecalho_auth(token_revisor))
    assert resposta.json()["itens"] == []
    resposta = client.get("/curation/reviews/answered", headers=cabecalho_auth(token_outro))
    assert resposta.json()["itens"] == []


def test_reviews_answered_some_da_lista_apos_decisao_final(client, criar_usuario, criar_ficha):
    solicitante = criar_usuario(perfil=UserRole.curador)
    revisor = criar_usuario(perfil=UserRole.curador)
    token_solicitante = obter_token(client, solicitante.email)
    token_revisor = obter_token(client, revisor.email)

    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)

    resposta = client.post(
        f"/curation/{ficha.id}/request-review",
        headers=cabecalho_auth(token_solicitante),
        json={"motivo": "Duvida sobre o achado principal."},
    )
    review_id = resposta.json()["review_id"]

    client.post(
        f"/curation/reviews/{review_id}/respond",
        headers=cabecalho_auth(token_revisor),
        json={"concordancia": "concorda"},
    )

    resposta = client.get("/curation/reviews/answered", headers=cabecalho_auth(token_solicitante))
    assert len(resposta.json()["itens"]) == 1

    resposta = client.post(
        f"/curation/{ficha.id}/apply-review-decision",
        headers=cabecalho_auth(token_solicitante),
        json={"decisao": "aprovar", "anonimizacao_validada": True},
    )
    assert resposta.status_code == 200
    assert resposta.json()["status"] == StatusCuradoria.APROVADA.value

    resposta = client.get("/curation/reviews/answered", headers=cabecalho_auth(token_solicitante))
    assert resposta.json()["itens"] == []
