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


def test_regiao_da_imagem_panoramica_e_campo_da_curadoria(client, db, criar_usuario, criar_ficha):
    """
    01/11/2026: panoramica antiga (sem o campo) e achada pelo padrao do exame;
    o campo "Regioes da imagem" marcado pelo curador vale no lugar do padrao;
    periapical nao herda regiao nenhuma do tipo de exame.
    """
    pano_antiga = criar_ficha(tipo_radiografia="panoramica")
    pano_revisada = criar_ficha(tipo_radiografia="panoramica")
    db.get(Curation, pano_revisada.id).regioes_imagem = ["mandibula"]
    peri = criar_ficha(tipo_radiografia="periapical")
    peri_marcada = criar_ficha(tipo_radiografia="periapical")
    db.get(Curation, peri_marcada.id).regioes_imagem = ["seio_maxilar"]
    db.commit()
    h = cabecalho_auth(obter_token(client, criar_usuario(perfil=UserRole.estudante).email))

    seio = _ids(client, h, regiao_anatomica="seio_maxilar")
    assert pano_antiga.id in seio and peri_marcada.id in seio
    assert pano_revisada.id not in seio and peri.id not in seio
    assert seio == _ids(client, h, termos="regiao:seio_maxilar")  # filtro e termo: mesma regra
    assert pano_revisada.id in _ids(client, h, regiao_anatomica="mandibula")


def test_curadoria_grava_regioes_da_imagem(client, db, criar_usuario, criar_ficha):
    f = criar_ficha(status=StatusCuradoria.EM_ANALISE.value, tipo_radiografia="panoramica")
    h = cabecalho_auth(obter_token(client, criar_usuario(perfil=UserRole.curador).email))
    r = client.patch(f"/curation/{f.id}", json={"regioes_imagem": ["maxila", "atm", "maxila"]}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["regioes_imagem"] == ["maxila", "atm"]
    r = client.patch(f"/curation/{f.id}", json={"regioes_imagem": ["nao_existe"]}, headers=h)
    assert r.status_code == 422


def test_relatorio_mostra_nome_do_curador_sem_lista_de_usuarios(client, db, criar_usuario, criar_ficha):
    """01/11/2026: "Fichas por curador" mostrava "Usuario #1" para o curador,
    que nao pode ver /users/ - os nomes agora vem junto do relatorio."""
    curador = criar_usuario(perfil=UserRole.curador)
    f = criar_ficha()
    db.get(Curation, f.id).curador_id = curador.id
    db.commit()
    h = cabecalho_auth(obter_token(client, curador.email))
    r = client.get("/admin/stats", headers=h)
    assert r.status_code == 200, r.text
    dados = r.json()
    assert dados["por_curador"][str(curador.id)] >= 1
    assert dados["nomes_curadores"][str(curador.id)] == curador.nome
    assert set(dados["nomes_curadores"]) <= set(dados["por_curador"])  # so quem aparece no relatorio
