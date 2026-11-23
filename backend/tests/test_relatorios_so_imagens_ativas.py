"""
RELATORIOS SO COM AS IMAGENS QUE ESTAO NO RADIX (pedido do Luciano,
23/11/2026: "esses numeros nao condizem com a realidade do Radix, preciso
que sejam atualizados automaticamente").

Depois de desativar as imagens antigas (manter_somente_acervo.py), os
paineis mostravam 59 imagens mas 231 fichas: as contagens de FICHAS ainda
somavam as fichas das imagens desativadas. Regra: todo numero de ficha
(Inicio, Painel administrativo, Relatorios e "Minhas estatisticas") conta
so fichas de imagens ATIVAS; desativar ou reativar uma imagem muda os
numeros na hora, sem roteiro nenhum.

Os testes medem a DIFERENCA (antes x depois), porque o banco de teste e
compartilhado com outros testes. Dados inventados.
"""

import pytest

from app.modules.curations import CurationHistory, StatusCuradoria
from app.modules.orthanc_references import OrthancReference
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


def _get(client, usuario, caminho):
    from app.main import app
    app.state.limiter.reset()
    r = client.get(caminho, headers=cabecalho_auth(obter_token(client, usuario.email)))
    assert r.status_code == 200, r.text
    return r.json()


def _ficha(criar_ficha, db, curador, ativo, status=StatusCuradoria.APROVADA.value):
    ficha = criar_ficha(status=status, ativo=ativo, tipo_radiografia="oclusal")
    ficha.curador_id = curador.id
    ficha.qualidade_tecnica = "boa"
    ficha.alteracoes_observadas = ["carie"]
    db.add(CurationHistory(curation_id=ficha.id, usuario_id=curador.id, acao="aprovacao",
                           status_anterior=StatusCuradoria.EM_ANALISE.value, status_novo=status))
    db.commit()
    return ficha


NUMEROS = ("total_fichas_curadoria",)
POR = ("por_status", "por_tipo_radiografia", "por_qualidade_tecnica", "por_achado")


def test_fichas_de_imagem_desativada_nao_entram_nos_paineis(client, criar_usuario, criar_ficha, db):
    adm = criar_usuario(perfil=UserRole.administrador)
    curador = criar_usuario(perfil=UserRole.curador)
    antes = _get(client, adm, "/admin/stats")
    meus_antes = _get(client, curador, "/curation/minhas-estatisticas")
    _ficha(criar_ficha, db, curador, ativo=False)
    depois = _get(client, adm, "/admin/stats")
    meus = _get(client, curador, "/curation/minhas-estatisticas")
    for campo in NUMEROS:
        assert depois[campo] == antes[campo], campo
    for campo in POR:
        assert depois[campo] == antes[campo], campo
    assert str(curador.id) not in depois["por_curador"]
    assert str(curador.id) not in depois["por_curador_detalhe"]
    assert meus == meus_antes  # nada de "minhas fichas", aprovadas no mes ou ranking


def test_imagem_ativa_conta_e_desativar_tira_na_hora(client, criar_usuario, criar_ficha, db):
    adm = criar_usuario(perfil=UserRole.administrador)
    curador = criar_usuario(perfil=UserRole.curador)
    antes = _get(client, adm, "/admin/stats")
    ficha = _ficha(criar_ficha, db, curador, ativo=True)
    com = _get(client, adm, "/admin/stats")
    assert com["total_fichas_curadoria"] == antes["total_fichas_curadoria"] + 1
    assert com["por_tipo_radiografia"].get("oclusal", 0) == antes["por_tipo_radiografia"].get("oclusal", 0) + 1
    assert com["por_curador"][str(curador.id)] == 1
    meus = _get(client, curador, "/curation/minhas-estatisticas")
    assert (meus["minhas_fichas_total"], meus["aprovadas_no_mes"]) == (1, 1)
    # desativar a imagem (como a tela/roteiro fazem) tira a ficha de todos os numeros
    db.get(OrthancReference, ficha.orthanc_reference_id).ativo = False
    db.commit()
    sem = _get(client, adm, "/admin/stats")
    assert sem["total_fichas_curadoria"] == antes["total_fichas_curadoria"]
    assert sem["por_tipo_radiografia"] == antes["por_tipo_radiografia"]
    meus = _get(client, curador, "/curation/minhas-estatisticas")
    assert (meus["minhas_fichas_total"], meus["aprovadas_no_mes"], meus["posicao_ranking"]) == (0, 0, None)


@pytest.mark.parametrize("perfil", [UserRole.curador])
def test_atividade_recente_so_de_imagens_ativas(client, criar_usuario, criar_ficha, db, perfil):
    adm = criar_usuario(perfil=UserRole.administrador)
    curador = criar_usuario(perfil=perfil)
    escondida = _ficha(criar_ficha, db, curador, ativo=False)
    dados = _get(client, adm, "/admin/stats")
    assert escondida.id not in [a["id"] for a in dados["atividade_recente"]]
