"""
Segmentacao de estruturas (pintura do curador) - 22/10/2026.

- So a curadoria pinta, e so com a ficha em curadoria.
- Quem nao e da curadoria so ve imagem aprovada ou compartilhada com ele.
- A mascara recebida e sempre redesenhada no servidor (PNG 1 bit), com
  limites de tamanho; arquivo que nao e PNG e recusado.
- Toda gravacao fica na auditoria.
- Girar a imagem gira a pintura junto; recortar a moldura recorta junto.
"""

import base64
import io

import numpy as np
import pytest
from PIL import Image

from app.modules.audit_logs import AuditLog
from app.modules.compartilhamentos import CompartilhamentoImagem
from app.modules.curations import Curation, StatusCuradoria
from app.modules.orthanc_references import OrthancReference
from app.modules.segmentacoes import (
    MascaraInvalida,
    SegmentacaoCuradoria,
    girar_mascara,
    recortar_mascara,
    sanitizar_mascara,
)
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token
from tests.test_geometria_imagem import _dicom, _radiografia
from tests.test_girar_imagem import OrthancFalso


def _png(largura=40, altura=20, caixa=(5, 2, 15, 10), modo="RGBA") -> str:
    """Mascara de teste: retangulo pintado (opaco) dentro de fundo transparente."""
    img = Image.new(modo, (largura, altura), (0, 0, 0, 0) if modo == "RGBA" else 0)
    x0, y0, x1, y1 = caixa
    for x in range(x0, x1):
        for y in range(y0, y1):
            img.putpixel((x, y), (255, 255, 255, 255) if modo == "RGBA" else 255)
    saida = io.BytesIO()
    img.save(saida, format="PNG")
    return "data:image/png;base64," + base64.b64encode(saida.getvalue()).decode()


def _matriz(data_url_ou_png) -> np.ndarray:
    if isinstance(data_url_ou_png, str):
        data_url_ou_png = base64.b64decode(data_url_ou_png.split(",", 1)[1])
    with Image.open(io.BytesIO(data_url_ou_png)) as img:
        canal = img.getchannel("A") if "A" in img.getbands() else img.convert("L")
        return np.array(canal) > 127


def _auth(client, criar_usuario, perfil=UserRole.curador):
    return cabecalho_auth(obter_token(client, criar_usuario(perfil=perfil).email))


def _nova(nome="Dente 36", dente=36, cor="#56B4E9", **mascara):
    return {"nome": nome, "dente": dente, "cor": cor, "mascara": _png(**mascara)}


# --------------------------------------------------------------- mascara


def test_mascara_e_redesenhada_em_1_bit():
    png, largura, altura = sanitizar_mascara(_png())
    assert (largura, altura) == (40, 20)
    with Image.open(io.BytesIO(png)) as img:
        assert img.mode == "1"
    m = _matriz(png)
    assert m.sum() == 10 * 8 and m[2:10, 5:15].all()


def test_mascara_sem_transparencia_usa_o_brilho():
    png, _, _ = sanitizar_mascara(_png(modo="L"))
    assert _matriz(png).sum() == 80


@pytest.mark.parametrize("entrada", [
    "",
    "data:image/jpeg;base64,AAAA",
    "nao-e-base64!!!",
    base64.b64encode(b"GIF89a qualquer coisa").decode(),
])
def test_mascara_invalida_e_recusada(entrada):
    with pytest.raises(MascaraInvalida):
        sanitizar_mascara(entrada)


def test_mascara_grande_ou_pequena_demais_e_recusada():
    with pytest.raises(MascaraInvalida):
        sanitizar_mascara(_png(largura=4, altura=4, caixa=(0, 0, 1, 1)))
    with pytest.raises(MascaraInvalida):
        sanitizar_mascara(_png(largura=2049, altura=10, caixa=(0, 0, 1, 1)))


def test_girar_e_recortar_mascara():
    png, _, _ = sanitizar_mascara(_png())
    original = _matriz(png)
    for graus, k in ((90, -1), (180, 2), (270, 1)):
        girada, largura, altura = girar_mascara(png, graus)
        assert np.array_equal(_matriz(girada), np.rot90(original, k))
        assert (largura, altura) == ((20, 40) if graus != 180 else (40, 20))
    # imagem 400x200 recortada em (50, 20)-(250, 120): mascara 40x20 -> (5, 2)-(25, 12)
    recortada, largura, altura = recortar_mascara(png, (50, 20, 250, 120), 400, 200)
    assert (largura, altura) == (20, 10)
    assert np.array_equal(_matriz(recortada), original[2:12, 5:25])


# --------------------------------------------------------------- rotas


def test_curador_cria_altera_lista_e_apaga_com_auditoria(client, db, criar_usuario, criar_ficha):
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)
    h = _auth(client, criar_usuario)

    r = client.post(f"/segmentacoes/ficha/{ficha.id}", json=_nova(), headers=h)
    assert r.status_code == 201, r.text
    criada = r.json()
    assert criada["nome"] == "Dente 36" and criada["dente"] == 36 and criada["cor"] == "#56b4e9"
    assert _matriz(criada["mascara"]).sum() == 80

    r = client.patch(f"/segmentacoes/{criada['id']}", json={"nome": "Dente 37", "dente": 37, "mascara": _png(caixa=(0, 0, 4, 4))}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["nome"] == "Dente 37" and _matriz(r.json()["mascara"]).sum() == 16
    r = client.patch(f"/segmentacoes/{criada['id']}", json={"sem_dente": True}, headers=h)
    assert r.json()["dente"] is None

    lista = client.get(f"/segmentacoes/ficha/{ficha.id}", headers=h).json()["itens"]
    assert [s["id"] for s in lista] == [criada["id"]]

    assert client.delete(f"/segmentacoes/{criada['id']}", headers=h).status_code == 200
    assert client.get(f"/segmentacoes/ficha/{ficha.id}", headers=h).json()["itens"] == []

    acoes = [a for (a,) in db.query(AuditLog.acao).filter(AuditLog.entidade_id == ficha.id, AuditLog.acao.like("segmentacao_%"))]
    assert sorted(acoes) == ["segmentacao_alterada", "segmentacao_alterada", "segmentacao_apagada", "segmentacao_criada"]


@pytest.mark.parametrize("perfil", [UserRole.estudante, UserRole.professor])
def test_quem_nao_e_curadoria_nao_pinta(client, criar_usuario, criar_ficha, perfil):
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)
    assert client.post(f"/segmentacoes/ficha/{ficha.id}", json=_nova(), headers=_auth(client, criar_usuario, perfil)).status_code == 403


def test_ficha_finalizada_nao_e_pintada(client, criar_usuario, criar_ficha):
    ficha = criar_ficha(status=StatusCuradoria.APROVADA.value)
    assert client.post(f"/segmentacoes/ficha/{ficha.id}", json=_nova(), headers=_auth(client, criar_usuario)).status_code == 409


def test_entradas_invalidas_sao_recusadas(client, criar_usuario, criar_ficha):
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)
    h = _auth(client, criar_usuario)
    url = f"/segmentacoes/ficha/{ficha.id}"
    assert client.post(url, json={**_nova(), "cor": "vermelho"}, headers=h).status_code == 422
    assert client.post(url, json={**_nova(), "dente": 19}, headers=h).status_code == 422
    assert client.post(url, json={**_nova(), "nome": "x" * 61}, headers=h).status_code == 422
    assert client.post(url, json={**_nova(), "mascara": "data:image/jpeg;base64,AAAA"}, headers=h).status_code == 422


def test_limite_de_estruturas_por_imagem(client, db, criar_usuario, criar_ficha, monkeypatch):
    from app.modules import segmentacoes_router

    monkeypatch.setattr(segmentacoes_router, "MAX_SEGMENTACOES_POR_FICHA", 2)
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)
    h = _auth(client, criar_usuario)
    for _ in range(2):
        assert client.post(f"/segmentacoes/ficha/{ficha.id}", json=_nova(), headers=h).status_code == 201
    assert client.post(f"/segmentacoes/ficha/{ficha.id}", json=_nova(), headers=h).status_code == 422


def test_quem_ve_a_pintura(client, db, criar_usuario, criar_ficha):
    pendente = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)
    aprovada = criar_ficha(status=StatusCuradoria.APROVADA.value)
    h_curador = _auth(client, criar_usuario)
    client.post(f"/segmentacoes/ficha/{pendente.id}", json=_nova(), headers=h_curador)

    estudante = criar_usuario(perfil=UserRole.estudante)
    h_estudante = cabecalho_auth(obter_token(client, estudante.email))
    # em curadoria: o estudante nao ve (nem sabe que existe)
    assert client.get(f"/segmentacoes/ficha/{pendente.id}", headers=h_estudante).status_code == 404
    # aprovada: ve
    assert client.get(f"/segmentacoes/ficha/{aprovada.id}", headers=h_estudante).status_code == 200
    # compartilhada com ele: ve, mesmo nao aprovada
    remetente = criar_usuario(perfil=UserRole.professor)
    db.add(CompartilhamentoImagem(remetente_id=remetente.id, destinatario_id=estudante.id, curation_id=pendente.id))
    db.commit()
    r = client.get(f"/segmentacoes/ficha/{pendente.id}", headers=h_estudante)
    assert r.status_code == 200 and len(r.json()["itens"]) == 1
    # sem login: nada
    assert client.get(f"/segmentacoes/ficha/{aprovada.id}").status_code == 401


def test_pesquisa_informa_quantas_estruturas(client, db, criar_usuario, criar_ficha):
    ficha = criar_ficha(status=StatusCuradoria.APROVADA.value, descricao_didatica="segmentacao-teste-contagem")
    png, largura, altura = sanitizar_mascara(_png())
    db.add(SegmentacaoCuradoria(curation_id=ficha.id, nome="Dente 11", dente=11, cor="#56b4e9",
                                mascara=png, largura=largura, altura=altura))
    db.commit()
    h = _auth(client, criar_usuario, UserRole.estudante)
    r = client.get("/search", params={"texto": "segmentacao-teste-contagem"}, headers=h)
    assert r.status_code == 200, r.text
    itens = [i for i in r.json()["itens"] if i["curation_id"] == ficha.id]
    assert itens and itens[0]["total_segmentacoes"] == 1


def test_apagar_a_ficha_apaga_a_pintura(db, criar_ficha):
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)
    png, largura, altura = sanitizar_mascara(_png())
    db.add(SegmentacaoCuradoria(curation_id=ficha.id, nome="x", cor="#ffffff", mascara=png, largura=largura, altura=altura))
    db.commit()
    db.query(Curation).filter(Curation.id == ficha.id).delete()
    db.commit()
    assert db.query(SegmentacaoCuradoria).filter(SegmentacaoCuradoria.curation_id == ficha.id).count() == 0


def test_girar_a_imagem_gira_a_pintura(client, db, criar_usuario, criar_ficha, monkeypatch):
    orthanc = OrthancFalso(monkeypatch)
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)
    ref = db.get(OrthancReference, ficha.orthanc_reference_id)
    orthanc.guardar(ref.orthanc_id, _dicom(_radiografia(120, 200)))
    png, largura, altura = sanitizar_mascara(_png())
    seg = SegmentacaoCuradoria(curation_id=ficha.id, nome="Dente 36", cor="#56b4e9", mascara=png, largura=largura, altura=altura)
    db.add(seg)
    db.commit()
    original = _matriz(png)

    r = client.post(f"/curation/imagem/{ref.id}/girar", json={"graus": 90}, headers=_auth(client, criar_usuario))
    assert r.status_code == 200, r.text
    db.expire_all()
    seg = db.get(SegmentacaoCuradoria, seg.id)
    assert (seg.largura, seg.altura) == (20, 40)
    assert np.array_equal(_matriz(seg.mascara), np.rot90(original, -1))
