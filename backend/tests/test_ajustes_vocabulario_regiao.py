"""
Ajustes de 01/11/2026 (Vocabulario x busca, regiao padrao, relatorio):

1/2. o Vocabulario mostra quantas fichas ligadas estao APROVADAS e quantas
     imagens a busca devolve - uma ficha ligada mas pendente nao aparece na
     busca (era o caso "Lesao de furca": 1 ligada, 0 na busca);
3.   achado periodontal sem regiao escolhida vale "periodonto" (e e achado
     pela busca regiao:periodonto, inclusive fichas antigas);
4.   relatorio "Fichas por achado" conta as alteracoes observadas.
"""

import uuid

import pytest

from app.modules.achados import Achado, regiao_do_achado
from app.modules.curations import Curation, StatusCuradoria
from app.modules.users import UserRole
from app.modules.vocabulario import CurationTermo, TermoVocabulario
from tests.conftest import cabecalho_auth, obter_token


def _ids(client, h, **params):
    r = client.get("/search", params={"limit": 200, **params}, headers=h)
    assert r.status_code == 200, r.text
    return {i["curation_id"] for i in r.json()["itens"]}


@pytest.fixture()
def termo(db):
    nome = f"Termo ajuste {uuid.uuid4().hex[:8]}"
    t = TermoVocabulario(termo=nome, termo_normalizado=nome.lower(), categoria="achado", ativo=True)
    db.add(t)
    db.commit()
    db.refresh(t)
    yield t
    db.query(CurationTermo).filter(CurationTermo.termo_id == t.id).delete()
    db.delete(t)
    db.commit()


def test_vocabulario_separa_ligadas_aprovadas_e_na_busca(client, db, criar_usuario, criar_ficha, termo):
    pendente = criar_ficha(status=StatusCuradoria.PENDENTE.value)
    db.add(CurationTermo(curation_id=pendente.id, termo_id=termo.id))
    db.commit()
    h = cabecalho_auth(obter_token(client, criar_usuario(perfil=UserRole.curador).email))

    r = client.get("/vocabulario", params={"incluir_inativos": True, "com_contagem_busca": True}, headers=h)
    assert r.status_code == 200, r.text
    item = next(x for x in r.json()["termos"] if x["id"] == termo.id)
    assert item["quantidade_fichas"] == 1
    assert item["quantidade_aprovadas"] == 0
    assert item["quantidade_na_busca"] == 0  # igual ao que a busca devolve
    assert pendente.id not in _ids(client, h, termos=f"vocab:{termo.id}")

    aprovada = criar_ficha()
    db.add(CurationTermo(curation_id=aprovada.id, termo_id=termo.id))
    db.commit()
    r = client.get("/vocabulario", params={"incluir_inativos": True, "com_contagem_busca": True}, headers=h)
    item = next(x for x in r.json()["termos"] if x["id"] == termo.id)
    assert (item["quantidade_fichas"], item["quantidade_aprovadas"], item["quantidade_na_busca"]) == (2, 1, 1)
    assert aprovada.id in _ids(client, h, termos=f"vocab:{termo.id}")


def test_regiao_padrao_dos_achados():
    assert regiao_do_achado("perda_ossea_horizontal", None) == "periodonto"
    assert regiao_do_achado("lesao_periapical", "") == "regiao_periapical"
    assert regiao_do_achado("perda_ossea_vertical", "osso_alveolar") == "osso_alveolar"  # escolha do curador vale
    assert regiao_do_achado("cisto", None) is None


def test_busca_por_regiao_acha_fichas_antigas_sem_regiao(client, db, criar_usuario, criar_ficha):
    sem_regiao = criar_ficha()
    db.add(Achado(curation_id=sem_regiao.id, tipo="calculo_dentario"))
    so_lista = criar_ficha()
    c = db.get(Curation, so_lista.id)
    c.alteracoes_observadas = ["lesao_periapical"]
    db.commit()
    try:
        h = cabecalho_auth(obter_token(client, criar_usuario(perfil=UserRole.estudante).email))
        assert sem_regiao.id in _ids(client, h, termos="regiao:periodonto")
        assert so_lista.id in _ids(client, h, termos="regiao:regiao_periapical")
        assert so_lista.id not in _ids(client, h, termos="regiao:periodonto")
    finally:
        db.query(Achado).filter(Achado.curation_id == sem_regiao.id).delete()
        db.commit()


def test_relatorio_fichas_por_achado(client, db, criar_usuario, criar_ficha):
    f = criar_ficha()
    c = db.get(Curation, f.id)
    c.alteracoes_observadas = ["calculo_dentario", "lesao_periapical"]
    db.commit()
    h = cabecalho_auth(obter_token(client, criar_usuario(perfil=UserRole.administrador).email))
    r = client.get("/admin/stats", headers=h)
    assert r.status_code == 200, r.text
    dados = r.json()
    assert "por_dificuldade" not in dados and "por_achado_principal" not in dados
    assert dados["por_achado"].get("calculo_dentario", 0) >= 1
    assert dados["por_achado"].get("lesao_periapical", 0) >= 1
