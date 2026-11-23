"""
FICHA: DENTICAO, DENTES DECIDUOS, ODONTOGRAMA DE SITUACAO E ESTRUTURAS
FORA DOS DENTES (pedido do Luciano, 23/11/2026, junto com o layout da
panoramica).

Decisoes do Luciano:
1. Denticao (decidua / mista / permanente) - em TODOS os tipos de exame.
2. Odontograma de situacao: clicar no dente e dizer como ele esta (ausente,
   incluso/impactado, carie, restaurado, tratamento endodontico, implante,
   protese, supranumerario). Um dente pode ter mais de uma situacao.
3. Dentes deciduos 51-55, 61-65, 71-75, 81-85 (FDI) - em todos os tipos,
   quando a denticao e mista ou decidua.
4. Estruturas e achados fora dos dentes (seios maxilares, ATM, canal
   mandibular, calcificacoes etc.) - so na PANORAMICA.
Fichas e imagens inventadas.
"""

import pytest

from app.modules.curations import StatusCuradoria
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


def _cab(client, criar_usuario, perfil=UserRole.curador):
    usuario = criar_usuario(perfil=perfil)
    return usuario, cabecalho_auth(obter_token(client, usuario.email))


@pytest.fixture()
def ficha_editavel(client, criar_usuario, criar_ficha, db):
    def _criar(tipo="panoramica"):
        usuario, cab = _cab(client, criar_usuario)
        ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value, tipo_radiografia=tipo)
        ficha.curador_id = usuario.id
        db.commit()
        return ficha, cab
    return _criar


def _patch(client, cab, ficha_id, **campos):
    return client.patch(f"/curation/{ficha_id}", json=campos, headers=cab)


def test_grava_e_devolve_os_campos_novos(client, ficha_editavel):
    ficha, cab = ficha_editavel("panoramica")
    r = _patch(
        client, cab, ficha.id,
        denticao="mista",
        situacao_dentes={"16": ["restaurado", "endodontia"], "55": ["carie"], "38": ["incluso"]},
        estruturas_extradentais=["seio_maxilar", "ateroma_carotideo"],
    )
    assert r.status_code == 200, r.text
    dados = client.get(f"/curation/{ficha.id}", headers=cab).json()
    assert dados["denticao"] == "mista"
    assert dados["situacao_dentes"] == {"16": ["restaurado", "endodontia"], "38": ["incluso"], "55": ["carie"]}
    assert dados["estruturas_extradentais"] == ["seio_maxilar", "ateroma_carotideo"]


def test_situacao_repetida_e_dente_vazio_sao_limpos(client, ficha_editavel):
    ficha, cab = ficha_editavel("periapical")
    r = _patch(client, cab, ficha.id, situacao_dentes={"36": ["carie", "carie"], "37": []})
    assert r.status_code == 200, r.text
    assert client.get(f"/curation/{ficha.id}", headers=cab).json()["situacao_dentes"] == {"36": ["carie"]}
    # lista vazia apaga o odontograma
    assert _patch(client, cab, ficha.id, situacao_dentes={}).status_code == 200
    assert client.get(f"/curation/{ficha.id}", headers=cab).json()["situacao_dentes"] is None


def test_deciduos_valem_nos_dentes_da_ficha_em_todos_os_tipos(client, ficha_editavel):
    ficha, cab = ficha_editavel("periapical")
    r = _patch(client, cab, ficha.id, denticao="mista", dentes=[55, 85, 46])
    assert r.status_code == 200, r.text
    assert r.json()["dentes"] == [55, 85, 46]


@pytest.mark.parametrize(
    "campos",
    [
        {"denticao": "adulta"},
        {"situacao_dentes": {"99": ["carie"]}},
        {"situacao_dentes": {"19": ["carie"]}},
        {"situacao_dentes": {"abc": ["carie"]}},
        {"situacao_dentes": {"36": ["quebrado"]}},
        {"estruturas_extradentais": ["unha"]},
        {"dentes": [56]},
    ],
)
def test_valores_invalidos_sao_recusados(client, ficha_editavel, campos):
    ficha, cab = ficha_editavel("panoramica")
    assert _patch(client, cab, ficha.id, **campos).status_code == 422


def test_deciduo_nao_combina_com_denticao_permanente(client, ficha_editavel):
    ficha, cab = ficha_editavel("panoramica")
    r = _patch(client, cab, ficha.id, denticao="permanente", situacao_dentes={"55": ["carie"]})
    assert r.status_code == 422
    assert "decíduo" in r.json()["detail"]
    r = _patch(client, cab, ficha.id, denticao="permanente", dentes=[75])
    assert r.status_code == 422
    # com denticao mista passa
    assert _patch(client, cab, ficha.id, denticao="mista", dentes=[75]).status_code == 200


def test_estruturas_fora_dos_dentes_so_na_panoramica(client, ficha_editavel):
    ficha, cab = ficha_editavel("periapical")
    r = _patch(client, cab, ficha.id, estruturas_extradentais=["seio_maxilar"])
    assert r.status_code == 422
    assert "panorâmica" in r.json()["detail"]
    # lista vazia sempre pode (limpar)
    assert _patch(client, cab, ficha.id, estruturas_extradentais=[]).status_code == 200


def _ids_busca(client, cab, **params):
    r = client.get("/search", params={"limit": 200, **params}, headers=cab)
    assert r.status_code == 200, r.text
    return {i["curation_id"] for i in r.json()["itens"]}


def test_busca_pelos_campos_novos(client, criar_usuario, criar_ficha, db):
    _, cab = _cab(client, criar_usuario, UserRole.estudante)
    com = criar_ficha(tipo_radiografia="panoramica")
    com.denticao = "mista"
    com.dentes = [55, 16]
    com.situacao_dentes = {"16": ["implante"], "55": ["carie"]}
    com.estruturas_extradentais = ["ateroma_carotideo"]
    sem = criar_ficha(tipo_radiografia="panoramica")
    sem.denticao = "permanente"
    db.commit()

    assert com.id in _ids_busca(client, cab, denticao="mista")
    assert sem.id not in _ids_busca(client, cab, denticao="mista")
    assert com.id in _ids_busca(client, cab, situacao_dente="implante")
    assert sem.id not in _ids_busca(client, cab, situacao_dente="implante")
    assert com.id in _ids_busca(client, cab, estrutura="ateroma_carotideo")
    assert sem.id not in _ids_busca(client, cab, estrutura="ateroma_carotideo")
    # deciduo no filtro de dentes e na arcada superior
    assert com.id in _ids_busca(client, cab, dentes=[55])
    assert com.id in _ids_busca(client, cab, arcada="superior")


def test_busca_recusa_valor_desconhecido(client, criar_usuario):
    _, cab = _cab(client, criar_usuario, UserRole.estudante)
    assert client.get("/search", params={"situacao_dente": "quebrado"}, headers=cab).status_code == 422
    assert client.get("/search", params={"estrutura": "unha"}, headers=cab).status_code == 422
