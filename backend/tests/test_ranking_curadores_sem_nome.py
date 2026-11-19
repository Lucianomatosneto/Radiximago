"""
"FICHAS POR CURADOR" SEM NOMES PARA QUEM NAO E ADMINISTRADOR (18/11/2026).

Decisao do Luciano: so o ADMINISTRADOR do Radix ve o ranking geral com o nome
dos curadores. Os demais perfis que abrem os indicadores (curador, suporte)
veem apenas a POSICAO ("Curador 1" = quem mais curou, "Curador 2" = o
segundo...) e o numero de curadorias - sem nome, sem numero de cadastro e sem
instituicao. A regra vale no SERVIDOR: os nomes nem chegam ao navegador.

Pelo mesmo motivo, a "atividade recente" (que o Painel administrativo mostra)
so traz o nome do curador para o administrador.
Dados inventados.
"""

import pytest

from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


def _stats(client, usuario):
    from app.main import app
    app.state.limiter.reset()
    r = client.get("/admin/stats", headers=cabecalho_auth(obter_token(client, usuario.email)))
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture()
def tres_curadores(criar_usuario, criar_ficha, db):
    """Tres curadores com 3, 2 e 1 fichas (nesta ordem de producao)."""
    curadores = [criar_usuario(perfil=UserRole.curador) for _ in range(3)]
    for curador, quantidade in zip(curadores, (3, 2, 1)):
        curador.nome = f"Curador Inventado {curador.id}"
        for _ in range(quantidade):
            ficha = criar_ficha()
            ficha.curador_id = curador.id
    db.commit()
    return curadores


@pytest.mark.parametrize("perfil", [UserRole.curador, UserRole.suporte])
def test_quem_nao_e_administrador_ve_so_a_posicao(client, criar_usuario, tres_curadores, perfil):
    leitor = criar_usuario(perfil=perfil)
    dados = _stats(client, leitor)

    por_curador = dados["por_curador"]
    chaves = [c for c in por_curador if c != "nao_informado"]
    # so posicoes: "curador_1", "curador_2"... em ordem de quem mais curou
    assert chaves == [f"curador_{n}" for n in range(1, len(chaves) + 1)]
    valores = [por_curador[c] for c in chaves]
    assert valores == sorted(valores, reverse=True)
    # os tres curadores do teste aparecem pelas contagens, nunca pelo numero de cadastro
    ids = {str(c.id) for c in tres_curadores}
    assert not ids & set(por_curador)

    # nenhum nome sai na resposta: nem a lista de nomes, nem a atividade recente
    assert dados.get("nomes_curadores", {}) == {}
    assert all(item["curador_nome"] is None for item in dados["atividade_recente"])
    texto = str(dados)
    assert not any(c.nome in texto for c in tres_curadores)


def test_administrador_ve_o_ranking_com_os_nomes(client, criar_usuario, tres_curadores):
    admin = criar_usuario(perfil=UserRole.administrador)
    dados = _stats(client, admin)
    for curador, quantidade in zip(tres_curadores, (3, 2, 1)):
        assert dados["por_curador"][str(curador.id)] == quantidade
        assert dados["nomes_curadores"][str(curador.id)] == curador.nome
    assert any(item["curador_nome"] for item in dados["atividade_recente"])


def test_mesmo_total_para_todos(client, criar_usuario, tres_curadores):
    """A versao sem nomes tem exatamente as mesmas contagens, so sem identificar ninguem."""
    admin, curador = criar_usuario(perfil=UserRole.administrador), criar_usuario(perfil=UserRole.curador)
    com_nomes, sem_nomes = _stats(client, admin)["por_curador"], _stats(client, curador)["por_curador"]
    assert sorted(com_nomes.values()) == sorted(sem_nomes.values())
    assert com_nomes.get("nao_informado") == sem_nomes.get("nao_informado")
