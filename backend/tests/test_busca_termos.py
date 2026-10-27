"""
Busca por termos alinhada a Curadoria (26/10/2026) - busca_termos.py.

- grupo:carie acha QUALQUER carie marcada pelo curador (achado estruturado,
  checklist antigo, "achado principal" ou marcacao antiga);
- achado:/regiao:/vocab:/texto: e varios termos juntos (E);
- erros tecnicos: basta ter qualquer um dos marcados;
- contagem por grupo (cartoes do Banco de imagens);
- origem marcada pelo curador na ficha.
"""

import pytest

from app.modules.achados import Achado, ErroTecnico
from app.modules.curations import Curation, StatusCuradoria
from app.modules.orthanc_references import OrthancReference
from app.modules.users import UserRole
from app.modules.vocabulario import TermoVocabulario
from tests.conftest import cabecalho_auth, obter_token


@pytest.fixture()
def h(client, criar_usuario):
    return cabecalho_auth(obter_token(client, criar_usuario(perfil=UserRole.estudante).email))


def _ids(client, h, **params):
    r = client.get("/search", params={"limit": 200, **params}, headers=h)
    assert r.status_code == 200, r.text
    return {i["curation_id"] for i in r.json()["itens"]}


@pytest.fixture()
def fichas(db, criar_ficha):
    criadas = {}
    try:
        a = criar_ficha()
        db.add(Achado(curation_id=a.id, tipo="carie_dentina", regiao_anatomica="coroa", dentes=[36]))
        b = criar_ficha()
        db.add(Achado(curation_id=b.id, tipo="carie_secundaria", regiao_anatomica="raiz"))
        db.add(ErroTecnico(curation_id=b.id, tipo="alongamento"))
        c = criar_ficha(descricao_didatica="Nódulo pulpar evidente no 26 - termo-busca-teste")
        c = db.get(Curation, c.id)
        c.achado_principal = "carie"  # campo antigo tambem conta no grupo
        d = criar_ficha()
        db.add(Achado(curation_id=d.id, tipo="lesao_periapical"))
        db.add(ErroTecnico(curation_id=d.id, tipo="subexposicao"))
        db.commit()
        criadas.update(a=a.id, b=b.id, c=c.id, d=d.id)
        yield criadas
    finally:
        for cid in criadas.values():
            db.query(Achado).filter(Achado.curation_id == cid).delete()
            db.query(ErroTecnico).filter(ErroTecnico.curation_id == cid).delete()
        db.commit()


def test_grupo_carie_acha_todos_os_tipos_de_carie(client, h, fichas):
    achadas = _ids(client, h, termos="grupo:carie")
    assert {fichas["a"], fichas["b"], fichas["c"]} <= achadas
    assert fichas["d"] not in achadas


def test_achado_regiao_e_termos_juntos(client, h, fichas):
    assert fichas["a"] in _ids(client, h, termos="achado:carie_dentina")
    assert fichas["b"] not in _ids(client, h, termos="achado:carie_dentina")
    juntos = _ids(client, h, termos=["grupo:carie", "regiao:raiz"])
    assert fichas["b"] in juntos and fichas["a"] not in juntos


def test_vocabulario_acha_pelo_texto_e_sinonimo(client, h, fichas, db):
    termo = db.query(TermoVocabulario).filter(TermoVocabulario.termo_normalizado == "nodulo pulpar").first()
    assert termo, "o vocabulario inicial deveria ter 'Nódulo pulpar'"
    assert fichas["c"] in _ids(client, h, termos=f"vocab:{termo.id}")
    assert fichas["c"] in _ids(client, h, termos="texto:nodulos pulpares")


def test_erros_tecnicos_qualquer_um(client, h, fichas):
    achadas = _ids(client, h, erros_tecnicos=["alongamento", "subexposicao"])
    assert {fichas["b"], fichas["d"]} <= achadas and fichas["a"] not in achadas


@pytest.mark.parametrize("token", ["grupo:inexistente", "achado:nada", "regiao:lua", "vocab:abc", "sem-tipo", "x:y"])
def test_termo_invalido_e_recusado(client, h, token):
    assert client.get("/search", params={"termos": token}, headers=h).status_code == 422


def test_contagem_por_grupo(client, h, fichas):
    r = client.get("/search/counts", headers=h).json()
    assert r["por_grupo"]["carie"] >= 3 and "erro_tecnico" in r["por_grupo"]


def test_curador_marca_a_origem(client, db, criar_usuario, criar_ficha):
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)
    hc = cabecalho_auth(obter_token(client, criar_usuario(perfil=UserRole.curador).email))
    r = client.patch(f"/curation/{ficha.id}", json={"origem": "externa"}, headers=hc)
    assert r.status_code == 200, r.text
    db.expire_all()
    assert db.get(OrthancReference, ficha.orthanc_reference_id).origem == "externa"
    assert client.get(f"/curation/{ficha.id}", headers=hc).json()["origem"] == "externa"
