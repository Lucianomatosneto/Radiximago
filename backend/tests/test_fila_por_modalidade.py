"""
FILA DA CURADORIA POR MODALIDADE (pedido do Luciano, 23/11/2026).

"Atualmente as imagens abrem sem dar a possibilidade de escolha": o curador
quer escolher a modalidade (tipo de exame) que vai curar. O Manual do
Bloco 6 (item 7) ja preve a "modalidade preliminar" na fila.

Decisao do Luciano: AUTOMATICO + QUEM ENVIA.
- Na entrada, o sistema reconhece sozinho tomografia (DICOM CT),
  panoramica (DICOM PX ou imagem bem mais larga que alta) e "intraoral"
  (o resto: periapical, interproximal e oclusal tem o mesmo DICOM e nao
  da para separar sem olhar).
- Quem envia pode informar o tipo (opcional); a informacao dele vale.
- A fila filtra por tipo e conta quantas ha de cada; sem tipo conhecido
  (imagens antigas) = "nao_informado".
- A ficha nova ja comeca com o tipo informado por quem enviou; o curador
  confere e corrige, como sempre.
Imagens e IDs inventados.
"""

import uuid

import pytest

from app.modules import images_router, orthanc_client
from app.modules.curation.tipo_automatico import tipo_preliminar_automatico
from app.modules.curations import Curation
from app.modules.orthanc_references import OrthancReference
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token
from tests.test_envios_imagens import _enviar, orthanc_falso  # noqa: F401 - fixture reaproveitada


@pytest.mark.parametrize(
    "tags, esperado",
    [
        ({"Modality": "CT"}, "tomografia"),
        ({"Modality": "PX"}, "panoramica"),
        ({"Modality": "DX", "Rows": "1300", "Columns": "2800"}, "panoramica"),
        ({"Modality": "IO", "Rows": "1300", "Columns": "1000"}, "intraoral"),
        ({}, "intraoral"),
    ],
)
def test_reconhecimento_automatico(tags, esperado):
    assert tipo_preliminar_automatico(tags) == esperado


class _Texto:
    situacao = "sem_texto"
    regioes = 0


class _Recorte:
    situacao = "sem_borda"


def test_imagem_nova_entra_com_o_tipo_automatico(monkeypatch, db):
    novo = f"NOVO-{uuid.uuid4().hex}"
    monkeypatch.setattr(images_router, "_determinar_origem", lambda oid: "externa")
    monkeypatch.setattr(images_router, "_anonimizar_e_excluir_original", lambda oid: (novo, _Texto(), _Recorte()))
    monkeypatch.setattr(orthanc_client, "obter_detalhes_instancia", lambda oid: {"MainDicomTags": {"SOPInstanceUID": f"1.2.{uuid.uuid4().int % 10**9}"}})
    monkeypatch.setattr(orthanc_client, "obter_tags_simplificadas_instancia",
                        lambda oid: {"Modality": "PX", "StudyInstanceUID": f"1.2.{uuid.uuid4().int % 10**9}"})
    ref, criada = images_router._registrar_referencia_se_nova(db, "original")
    try:
        assert criada is True
        assert (ref.tipo_preliminar, ref.tipo_preliminar_origem) == ("panoramica", "automatico")
    finally:
        db.delete(ref)
        db.commit()


def _cab(client, criar_usuario, perfil):
    return cabecalho_auth(obter_token(client, criar_usuario(perfil=perfil).email))


def test_quem_envia_informa_o_tipo(client, criar_usuario, orthanc_falso, db):  # noqa: F811
    cab = _cab(client, criar_usuario, UserRole.professor)
    r = _enviar(client, cab, "fila", tipo_radiografia="interproximal")
    assert r.status_code == 200, r.text
    ref = db.get(OrthancReference, r.json()["orthanc_reference_id"])
    assert (ref.tipo_preliminar, ref.tipo_preliminar_origem) == ("interproximal", "envio")


def test_tipo_informado_invalido_e_recusado(client, criar_usuario, orthanc_falso):  # noqa: F811
    cab = _cab(client, criar_usuario, UserRole.professor)
    assert _enviar(client, cab, "fila", tipo_radiografia="raio-x").status_code == 422


def _na_fila(criar_referencia, db, tipo, origem="automatico"):
    ref = criar_referencia()
    ref.enquadramento = "sem_borda"
    ref.tipo_preliminar = tipo
    ref.tipo_preliminar_origem = origem if tipo else None
    db.commit()
    return ref.id


def _todos(client, cab, tipo=None):
    ids, skip = {}, 0
    while True:
        params = {"limit": 200, "skip": skip}
        if tipo:
            params["tipo"] = tipo
        r = client.get("/curation/pending", headers=cab, params=params)
        assert r.status_code == 200, r.text
        dados = r.json()
        ids.update({i["orthanc_reference_id"]: i["tipo_preliminar"] for i in dados["itens"]})
        skip += 200
        if skip >= dados["total_pendentes"]:
            return ids, dados


def test_fila_filtra_por_tipo_e_conta_cada_um(client, criar_usuario, criar_referencia, db):
    cab = _cab(client, criar_usuario, UserRole.curador)
    panoramica = _na_fila(criar_referencia, db, "panoramica")
    periapical = _na_fila(criar_referencia, db, "periapical", "envio")
    intraoral = _na_fila(criar_referencia, db, "intraoral")
    antiga = _na_fila(criar_referencia, db, None)

    todos, dados = _todos(client, cab)
    assert {panoramica, periapical, intraoral, antiga} <= set(todos)
    assert todos[periapical] == "periapical" and todos[antiga] is None
    por_tipo = dados["por_tipo"]
    assert por_tipo["panoramica"] >= 1 and por_tipo["periapical"] >= 1
    assert por_tipo["intraoral"] >= 1 and por_tipo["nao_informado"] >= 1
    assert sum(por_tipo.values()) == dados["total_pendentes"]

    so_panoramica, dados_p = _todos(client, cab, "panoramica")
    assert panoramica in so_panoramica and not {periapical, intraoral, antiga} & set(so_panoramica)
    assert set(so_panoramica.values()) == {"panoramica"}
    assert dados_p["total_pendentes"] == por_tipo["panoramica"]
    # os contadores sao sempre da fila inteira (para o curador trocar de filtro)
    assert dados_p["por_tipo"] == por_tipo

    nao_informado, _ = _todos(client, cab, "nao_informado")
    assert antiga in nao_informado and panoramica not in nao_informado


def test_filtro_desconhecido_e_recusado(client, criar_usuario):
    cab = _cab(client, criar_usuario, UserRole.curador)
    assert client.get("/curation/pending", headers=cab, params={"tipo": "raio-x"}).status_code == 422


def test_ficha_nova_comeca_com_o_tipo_de_quem_enviou(client, criar_usuario, criar_referencia, db, monkeypatch):
    from app.modules.curation import ficha as modulo_ficha

    def sem_orthanc(_oid):
        raise AssertionError("com o tipo informado no envio, nao precisa perguntar ao Orthanc")

    monkeypatch.setattr(modulo_ficha, "sugerir_tipo_da_imagem", sem_orthanc)
    ref_id = _na_fila(criar_referencia, db, "oclusal", "envio")
    cab = _cab(client, criar_usuario, UserRole.curador)
    r = client.post(f"/curation/{ref_id}", headers=cab, json={})
    assert r.status_code in (200, 201), r.text
    db.expire_all()
    assert db.query(Curation).filter(Curation.orthanc_reference_id == ref_id).one().tipo_radiografia == "oclusal"


def test_roteiro_preenche_as_imagens_antigas_so_quando_confirmado(monkeypatch, criar_referencia, db, capsys):
    import preencher_tipo_preliminar

    antiga = criar_referencia()
    ja_tem = criar_referencia()
    ja_tem.tipo_preliminar, ja_tem.tipo_preliminar_origem = "oclusal", "envio"
    db.commit()
    tags = {antiga.orthanc_id: {"Modality": "CT"}, ja_tem.orthanc_id: {"Modality": "PX"}}
    monkeypatch.setattr(preencher_tipo_preliminar.orthanc_client, "obter_tags_simplificadas_instancia",
                        lambda oid: tags.get(oid, {}))

    preencher_tipo_preliminar.executar(aplicar=False)
    assert "SIMULACAO" in capsys.readouterr().out
    db.expire_all()
    assert db.get(OrthancReference, antiga.id).tipo_preliminar is None

    preencher_tipo_preliminar.executar(aplicar=True)
    db.expire_all()
    assert (db.get(OrthancReference, antiga.id).tipo_preliminar, db.get(OrthancReference, antiga.id).tipo_preliminar_origem) == ("tomografia", "automatico")
    assert db.get(OrthancReference, ja_tem.id).tipo_preliminar == "oclusal"  # o que veio de quem enviou nao muda
