"""
MEDIDAS NA FICHA (pedido do Luciano, 24/11/2026, recurso 6): a regua (mm)
e o angulo (graus) que o curador faz num corte da tomografia passam a ser
DADO DA FICHA (ex.: tamanho da lesao), para a pesquisa e para quem estuda.

Regras conferidas:
- cada medida guarda o tipo (regua: 2 pontos; angulo: 3 pontos, o do meio
  e o vertice), o plano e o corte, e os pontos em FRACAO da imagem do corte
  (0 a 1). O VALOR nao e guardado: a tela calcula pela geometria do exame,
  assim nunca fica diferente dos pontos;
- PATCH /curation/{id} com "medidas" substitui a lista inteira; sem o
  campo, nada muda; no maximo 50;
- a ficha (GET) e a pesquisa (/search, ficha aprovada) devolvem as medidas;
- coluna nova curations.medidas (JSONB, lista vazia por padrao) - migration.
Dados inventados.
"""

import pytest
from pydantic import ValidationError

from app.modules.curation.schemas import CurationUpdate, MedidaFicha
from app.modules.curations import Curation, StatusCuradoria
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token

REGUA = {"id": "r1", "tipo": "regua", "plano": "axial", "corte": 20, "pontos": [{"x": 0.1, "y": 0.5}, {"x": 0.6, "y": 0.5}]}
ANGULO = {"id": "a1", "tipo": "angulo", "plano": "sagital", "corte": 5,
          "pontos": [{"x": 0.6, "y": 0.4}, {"x": 0.5, "y": 0.4}, {"x": 0.5, "y": 0.6}]}


def test_medida_valida():
    m = MedidaFicha(**REGUA)
    assert m.tipo == "regua" and len(m.pontos) == 2
    assert MedidaFicha(**ANGULO).pontos[1].x == 0.5


@pytest.mark.parametrize("erro", [
    {**REGUA, "pontos": REGUA["pontos"][:1]},                       # regua com 1 ponto
    {**REGUA, "pontos": ANGULO["pontos"]},                          # regua com 3 pontos
    {**ANGULO, "pontos": ANGULO["pontos"][:2]},                     # angulo com 2 pontos
    {**REGUA, "pontos": [{"x": 1.5, "y": 0.5}, {"x": 0.6, "y": 0.5}]},  # fora da imagem
    {**REGUA, "plano": "obliquo"},
    {**REGUA, "corte": -1},
    {**REGUA, "tipo": "densidade"},
    {k: v for k, v in REGUA.items() if k != "plano"},
    {**REGUA, "id": "x" * 65},
])
def test_medida_invalida(erro):
    with pytest.raises(ValidationError):
        MedidaFicha(**erro)


def test_no_maximo_50_medidas():
    with pytest.raises(ValidationError):
        CurationUpdate(medidas=[{**REGUA, "id": f"r{i}"} for i in range(51)])


def _cab(client, usuario):
    from app.main import app
    app.state.limiter.reset()
    return cabecalho_auth(obter_token(client, usuario.email))


def test_curador_grava_e_le_as_medidas(client, criar_usuario, criar_ficha, db):
    curador = criar_usuario(perfil=UserRole.curador)
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value, tipo_radiografia="tomografia")
    ficha.curador_id = curador.id
    db.commit()
    cab = _cab(client, curador)
    r = client.patch(f"/curation/{ficha.id}", headers=cab, json={"medidas": [REGUA, ANGULO]})
    assert r.status_code == 200, r.text
    db.expire_all()
    assert [m["id"] for m in db.get(Curation, ficha.id).medidas] == ["r1", "a1"]
    lida = client.get(f"/curation/{ficha.id}", headers=cab).json()
    assert lida["medidas"][0] == REGUA
    # sem o campo: nada muda
    assert client.patch(f"/curation/{ficha.id}", headers=cab, json={"descricao_didatica": "Texto"}).status_code == 200
    db.expire_all()
    assert len(db.get(Curation, ficha.id).medidas) == 2
    # lista vazia apaga
    assert client.patch(f"/curation/{ficha.id}", headers=cab, json={"medidas": []}).status_code == 200
    db.expire_all()
    assert db.get(Curation, ficha.id).medidas == []


def test_ficha_nova_comeca_sem_medidas(criar_ficha):
    assert criar_ficha().medidas == []


def test_pesquisa_devolve_as_medidas_da_ficha_aprovada(client, criar_usuario, criar_ficha, db):
    ficha = criar_ficha(status=StatusCuradoria.APROVADA.value, tipo_radiografia="tomografia")
    ficha.medidas = [REGUA]
    db.commit()
    r = client.get("/search", headers=_cab(client, criar_usuario(perfil=UserRole.estudante)), params={"limit": 200})
    item = next(i for i in r.json()["itens"] if i["curation_id"] == ficha.id)
    assert item["medidas"] == [REGUA]
