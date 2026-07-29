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
