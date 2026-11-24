"""
PINTAR A LESAO NOS CORTES DA TOMOGRAFIA (pedido do Luciano, 24/11/2026,
recurso 8): o mesmo pincel das radiografias (segmentacao), agora num CORTE
de um PLANO da tomografia. Cada corte pintado e uma linha de
segmentacoes_curadoria com o plano e o numero do corte; uma lesao que passa
por varios cortes = varias linhas com o mesmo nome (dado valioso para
treinar IA: a mascara de cada corte).

Regras conferidas:
- "plano" e "corte" andam juntos (um sem o outro: 422); plano desconhecido
  ou corte negativo: 422; sem eles e pintura de radiografia, como sempre;
- a lista devolve plano e corte; a auditoria diz o corte;
- limite proprio para a tomografia (MAX_CORTES_PINTADOS_POR_FICHA), sem
  gastar o limite de 30 estruturas da radiografia;
- a pesquisa so conta as pinturas que cabem sobre a miniatura (as de
  radiografia): as da tomografia ficam num corte.
Dados inventados.
"""

import pytest

from app.modules.audit_logs import AuditLog
from app.modules.curations import StatusCuradoria
from app.modules.segmentacoes import SegmentacaoCuradoria, sanitizar_mascara
from app.modules.users import UserRole
from tests.test_segmentacoes import _auth, _nova, _png


def _no_corte(plano="sagital", corte=35, **extra):
    return {**_nova(nome="Lesão 1", dente=None), "plano": plano, "corte": corte, **extra}


def test_pinta_no_corte_e_a_lista_devolve_o_corte(client, db, criar_usuario, criar_ficha):
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value, tipo_radiografia="tomografia")
    h = _auth(client, criar_usuario)
    r = client.post(f"/segmentacoes/ficha/{ficha.id}", json=_no_corte(), headers=h)
    assert r.status_code == 201, r.text
    assert (r.json()["plano"], r.json()["corte"]) == ("sagital", 35)
    r2 = client.post(f"/segmentacoes/ficha/{ficha.id}", json=_no_corte(corte=36), headers=h)
    assert r2.status_code == 201
    itens = client.get(f"/segmentacoes/ficha/{ficha.id}", headers=h).json()["itens"]
    assert [(s["plano"], s["corte"]) for s in itens] == [("sagital", 35), ("sagital", 36)]
    log = db.query(AuditLog).filter(AuditLog.entidade_id == ficha.id, AuditLog.acao == "segmentacao_criada").order_by(AuditLog.id).first()
    assert "corte 36 do plano sagital" in log.detalhes


def test_radiografia_continua_sem_corte(client, criar_usuario, criar_ficha):
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)
    r = client.post(f"/segmentacoes/ficha/{ficha.id}", json=_nova(), headers=_auth(client, criar_usuario))
    assert r.status_code == 201
    assert r.json()["plano"] is None and r.json()["corte"] is None


@pytest.mark.parametrize("extra", [
    {"plano": "axial"},
    {"corte": 3},
    {"plano": "obliquo", "corte": 3},
    {"plano": "axial", "corte": -1},
])
def test_plano_e_corte_andam_juntos(client, criar_usuario, criar_ficha, extra):
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)
    corpo = {**_nova(), **extra}
    assert client.post(f"/segmentacoes/ficha/{ficha.id}", json=corpo, headers=_auth(client, criar_usuario)).status_code == 422


def test_limite_proprio_da_tomografia(client, criar_usuario, criar_ficha, monkeypatch):
    from app.modules import segmentacoes_router

    monkeypatch.setattr(segmentacoes_router, "MAX_SEGMENTACOES_POR_FICHA", 1)
    monkeypatch.setattr(segmentacoes_router, "MAX_CORTES_PINTADOS_POR_FICHA", 2)
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value, tipo_radiografia="tomografia")
    h = _auth(client, criar_usuario)
    url = f"/segmentacoes/ficha/{ficha.id}"
    # os cortes nao gastam o limite da radiografia...
    assert client.post(url, json=_no_corte(corte=1), headers=h).status_code == 201
    assert client.post(url, json=_no_corte(corte=2), headers=h).status_code == 201
    assert client.post(url, json=_nova(), headers=h).status_code == 201
    # ...e tem o limite deles
    assert client.post(url, json=_no_corte(corte=3), headers=h).status_code == 422


def test_estudante_nao_pinta_corte(client, criar_usuario, criar_ficha):
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)
    h = _auth(client, criar_usuario, UserRole.estudante)
    assert client.post(f"/segmentacoes/ficha/{ficha.id}", json=_no_corte(), headers=h).status_code == 403


def test_pesquisa_so_conta_a_pintura_que_cabe_na_miniatura(client, db, criar_usuario, criar_ficha):
    ficha = criar_ficha(status=StatusCuradoria.APROVADA.value, descricao_didatica="segmentacao-tc-contagem")
    png, largura, altura = sanitizar_mascara(_png())
    db.add(SegmentacaoCuradoria(curation_id=ficha.id, nome="Lesão", dente=None, cor="#56b4e9",
                                mascara=png, largura=largura, altura=altura, plano="axial", corte=4))
    db.commit()
    h = _auth(client, criar_usuario, UserRole.estudante)
    r = client.get("/search", params={"texto": "segmentacao-tc-contagem"}, headers=h)
    item = next(i for i in r.json()["itens"] if i["curation_id"] == ficha.id)
    assert item["total_segmentacoes"] == 0
