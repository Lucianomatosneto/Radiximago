"""
RELATORIOS: "MEUS DADOS" DO CURADOR E CADA CURADOR PARA O ADMINISTRADOR
(pedido do video, 22/11/2026 - item B1).

- O curador continua vendo os colegas so pela posicao ("Curador 1, 2, 3...",
  regra de 18/11/2026), mas a LINHA DELE vem com o proprio nome: o servidor
  diz qual posicao e a dele (minha_chave) e manda so o nome dele.
- "Meus dados": as fichas do curador logado (todas, nao so do mes), por
  situacao.
- O administrador ve cada curador separadamente, por situacao
  (por_curador_detalhe). Ninguem mais recebe esse detalhe.
Dados inventados.
"""

import pytest

from app.modules.curations import StatusCuradoria
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


def _get(client, usuario, caminho):
    from app.main import app
    app.state.limiter.reset()
    r = client.get(caminho, headers=cabecalho_auth(obter_token(client, usuario.email)))
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture()
def equipe(criar_usuario, criar_ficha, db):
    """Dois curadores: A com 3 fichas (2 aprovadas, 1 em analise), B com 1."""
    a, b = criar_usuario(perfil=UserRole.curador), criar_usuario(perfil=UserRole.curador)
    a.nome, b.nome = f"Curadora Inventada {a.id}", f"Curador Inventado {b.id}"
    for status in (StatusCuradoria.APROVADA, StatusCuradoria.APROVADA, StatusCuradoria.EM_ANALISE):
        criar_ficha(status=status.value).curador_id = a.id
    criar_ficha(status=StatusCuradoria.EM_ANALISE.value).curador_id = b.id
    db.commit()
    return a, b


def test_curador_ve_o_proprio_nome_na_posicao_dele_e_nenhum_outro(client, equipe):
    a, b = equipe
    dados = _get(client, b, "/admin/stats")
    chave = dados["minha_chave"]
    assert chave is not None and chave.startswith("curador_")
    assert dados["por_curador"][chave] == 1
    assert dados["nomes_curadores"] == {chave: b.nome}
    assert a.nome not in str(dados)
    assert str(a.id) not in dados["por_curador"]


def test_curador_sem_fichas_nao_tem_posicao(client, criar_usuario, equipe):
    novo = criar_usuario(perfil=UserRole.curador)
    dados = _get(client, novo, "/admin/stats")
    assert dados["minha_chave"] is None
    assert dados["nomes_curadores"] == {}


def test_meus_dados_traz_todas_as_minhas_fichas_por_situacao(client, equipe):
    a, _b = equipe
    dados = _get(client, a, "/curation/minhas-estatisticas")
    assert dados["minhas_fichas_total"] == 3
    assert dados["minhas_por_status"] == {"aprovada": 2, "em_analise": 1}


def test_administrador_ve_cada_curador_por_situacao(client, criar_usuario, equipe):
    a, b = equipe
    admin = criar_usuario(perfil=UserRole.administrador)
    dados = _get(client, admin, "/admin/stats")
    detalhe = dados["por_curador_detalhe"]
    assert detalhe[str(a.id)] == {"aprovada": 2, "em_analise": 1}
    assert detalhe[str(b.id)] == {"em_analise": 1}
    assert dados["minha_chave"] is None  # o administrador ja ve todos os nomes


@pytest.mark.parametrize("perfil", [UserRole.curador, UserRole.suporte])
def test_detalhe_por_curador_so_para_o_administrador(client, criar_usuario, equipe, perfil):
    leitor = criar_usuario(perfil=perfil)
    assert _get(client, leitor, "/admin/stats")["por_curador_detalhe"] == {}
