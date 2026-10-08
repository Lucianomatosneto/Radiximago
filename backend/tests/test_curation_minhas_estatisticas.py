"""
GET /curation/minhas-estatisticas - resumo pessoal do curador (mes
corrente): quantas fichas ele aprovou e sua posicao no ranking de volume
de curadorias, sem expor nome/id/contagem de nenhum outro curador.
"""

from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


def test_estudante_nao_acessa_minhas_estatisticas(client, criar_usuario):
    usuario = criar_usuario(perfil=UserRole.estudante)
    token = obter_token(client, usuario.email)

    resposta = client.get("/curation/minhas-estatisticas", headers=cabecalho_auth(token))

    assert resposta.status_code == 403


def test_curador_sem_curadorias_no_mes(client, criar_usuario):
    # O banco de teste NAO e isolado por teste (outros curadores podem ja
    # ter curadorias no mes corrente, inclusive de dados fora da suite) -
    # por isso as asserts aqui ficam restritas ao que e verificavel pra um
    # curador RECEM-CRIADO (sem nenhuma ficha), sem assumir total_curadores
    # nem posicao_ranking em termos absolutos.
    usuario = criar_usuario(perfil=UserRole.curador)
    token = obter_token(client, usuario.email)

    resposta = client.get("/curation/minhas-estatisticas", headers=cabecalho_auth(token))

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["aprovadas_no_mes"] == 0
    assert corpo["curadorias_no_mes"] == 0
    # Sem curadoria propria no mes -> ou nao entra no ranking (None) ou
    # fica na ultima posicao possivel (empatado em 0 com quem tambem tem 0,
    # mas nunca "melhor" que quem tem curadorias de verdade).
    if corpo["posicao_ranking"] is not None:
        assert 1 <= corpo["posicao_ranking"] <= corpo["total_curadores"]


def test_curador_conta_propria_ficha_e_aprovacao_no_mes(client, criar_usuario, criar_referencia):
    usuario = criar_usuario(perfil=UserRole.curador)
    token = obter_token(client, usuario.email)
    referencia = criar_referencia()

    criada = client.post(
        f"/curation/{referencia.id}",
        headers=cabecalho_auth(token),
        json={"tipo_radiografia": "periapical"},
    ).json()

    resposta_meio = client.get("/curation/minhas-estatisticas", headers=cabecalho_auth(token)).json()
    assert resposta_meio["curadorias_no_mes"] == 1
    assert resposta_meio["aprovadas_no_mes"] == 0

    client.post(
        f"/curation/{criada['curation_id']}/approve",
        headers=cabecalho_auth(token),
        json={"anonimizacao_validada": True},
    )

    resposta_final = client.get("/curation/minhas-estatisticas", headers=cabecalho_auth(token)).json()
    assert resposta_final["curadorias_no_mes"] == 1
    assert resposta_final["aprovadas_no_mes"] == 1
    # Tem pelo menos 1 curadoria -> necessariamente entra no ranking.
    assert resposta_final["total_curadores"] >= 1
    assert 1 <= resposta_final["posicao_ranking"] <= resposta_final["total_curadores"]


def test_ranking_reflete_posicao_sem_revelar_outros_curadores(client, criar_usuario, criar_referencia):
    curador_a = criar_usuario(perfil=UserRole.curador)  # abre 2 fichas
    curador_b = criar_usuario(perfil=UserRole.curador)  # abre 1 ficha
    token_a = obter_token(client, curador_a.email)
    token_b = obter_token(client, curador_b.email)

    for _ in range(2):
        ref = criar_referencia()
        client.post(f"/curation/{ref.id}", headers=cabecalho_auth(token_a), json={"tipo_radiografia": "periapical"})

    ref_b = criar_referencia()
    client.post(f"/curation/{ref_b.id}", headers=cabecalho_auth(token_b), json={"tipo_radiografia": "periapical"})

    corpo_a = client.get("/curation/minhas-estatisticas", headers=cabecalho_auth(token_a)).json()
    corpo_b = client.get("/curation/minhas-estatisticas", headers=cabecalho_auth(token_b)).json()

    assert corpo_a["curadorias_no_mes"] == 2
    assert corpo_b["curadorias_no_mes"] == 1
    # total_curadores conta todo mundo com curadoria no mes (>= os 2 destes,
    # pode ter mais se ja houver outras fichas no mes fora da suite) - mas
    # tem que ser o MESMO numero pros dois, ja que e o mesmo universo.
    assert corpo_a["total_curadores"] >= 2
    assert corpo_a["total_curadores"] == corpo_b["total_curadores"]
    # curador_a tem MAIS curadorias que curador_b no mes -> posicao (1a =
    # melhor) de A tem que ser igual ou melhor (numero menor ou igual) que
    # a de B. Nao assume valores absolutos (podem existir outros curadores
    # com volume maior no banco compartilhado de teste).
    assert corpo_a["posicao_ranking"] <= corpo_b["posicao_ranking"]

    # Nenhuma das duas respostas expoe id/nome/contagem do outro curador -
    # so os 4 campos agregados, nada por-curador.
    assert set(corpo_a.keys()) == {
        "aprovadas_no_mes",
        "curadorias_no_mes",
        "posicao_ranking",
        "total_curadores",
    }
