"""
Tomografia como UM item na fila de curadoria (Parte B, 18/11/2026).

Com os UIDs fixos (Parte A), os cortes de uma tomografia ficam no mesmo
exame. Aqui: o exame entra na fila uma vez so (o primeiro corte), a ficha
vale para todos os cortes, o aviso de texto considera o exame inteiro e o
recorte de moldura nao e aplicado a cortes. Radiografias nao mudam.
Sem rede, sem Orthanc real e sem imagem real.
"""
import uuid

import pytest

from app.modules import orthanc_client
from app.modules.curations import Curation, CurationHistory
from app.modules.orthanc_references import DestinoImagem, OrthancReference, texto_do_exame
from app.modules.substituir_instancia import e_corte_de_volume
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


# --- o que e corte de volume --------------------------------------------------------

@pytest.mark.parametrize("tags,esperado", [
    ({"Modality": "CT"}, True),
    ({"Modality": "MR"}, True),
    ({"Modality": "", "ImagePositionPatient": "0\\0\\1"}, True),
    ({"Modality": "IO"}, False),
    ({"Modality": "IO", "ImagePositionPatient": "0\\0\\1"}, False),  # serie de periapicais
    ({"Modality": "PX"}, False),
    ({"Modality": "OT"}, False),
    ({}, False),
])
def test_corte_de_volume_pela_modalidade(tags, esperado):
    assert e_corte_de_volume(tags) is esperado


def test_corte_de_tomografia_nao_e_recortado(monkeypatch):
    """Recortar um corte mudaria o tamanho dele e desalinharia o volume."""
    class _Resposta:
        content = b"dicom-anonimizado"

        def raise_for_status(self):
            return None

    def recorte_proibido(arquivo):
        raise AssertionError("recorte de moldura chamado para um corte de tomografia")

    monkeypatch.setattr(orthanc_client, "obter_tags_simplificadas_instancia",
                        lambda oid: {"Modality": "CT", "StudyInstanceUID": "1.2.3"})
    monkeypatch.setattr(orthanc_client._client, "post", lambda url, json, timeout: _Resposta())
    monkeypatch.setattr("app.modules.geometria_imagem.recortar_moldura", recorte_proibido)
    monkeypatch.setattr("app.modules.texto_na_imagem.tarjar_texto", lambda a: (a, None))
    monkeypatch.setattr(orthanc_client, "enviar_instancia", lambda a: {"ID": "x"})
    _, _, recorte = orthanc_client.anonimizar_instancia("corte-1")
    assert recorte.situacao == "sem_borda"
    assert "volume" in recorte.detalhe


def test_radiografia_continua_sendo_recortada(monkeypatch):
    chamado = []

    class _Resposta:
        content = b"dicom-anonimizado"

        def raise_for_status(self):
            return None

    monkeypatch.setattr(orthanc_client, "obter_tags_simplificadas_instancia", lambda oid: {"Modality": "IO"})
    monkeypatch.setattr(orthanc_client._client, "post", lambda url, json, timeout: _Resposta())
    monkeypatch.setattr("app.modules.geometria_imagem.recortar_moldura", lambda a: chamado.append(1) or (a, None))
    monkeypatch.setattr("app.modules.texto_na_imagem.tarjar_texto", lambda a: (a, None))
    monkeypatch.setattr(orthanc_client, "enviar_instancia", lambda a: {"ID": "x"})
    orthanc_client.anonimizar_instancia("periapical")
    assert chamado == [1]


# --- aviso de texto do exame inteiro -------------------------------------------------

class _C:
    def __init__(self, situacao, regioes=None):
        self.texto_na_imagem, self.texto_regioes = situacao, regioes


def test_texto_do_exame_e_o_pior_caso_entre_os_cortes():
    assert texto_do_exame([_C("sem_texto"), _C("tarjado", 2), _C("tarjado", 1)]) == ("tarjado", 3)
    assert texto_do_exame([_C("sem_texto"), _C("nao_verificado")]) == ("nao_verificado", None)
    assert texto_do_exame([_C("sem_texto"), _C(None)]) == ("nao_verificado", None)
    assert texto_do_exame([_C("sem_texto"), _C("sem_texto")]) == ("sem_texto", None)
    assert texto_do_exame([_C("tarjado", 4)]) == ("tarjado", 4)  # radiografia: igual a antes


# --- fila de curadoria ---------------------------------------------------------------

@pytest.fixture()
def exame(db):
    """Uma tomografia de 3 cortes e uma periapical, prontos para a fila."""
    marca = uuid.uuid4().hex[:10]
    serie = f"serie-tc-{marca}"
    refs = []
    for n in range(3):
        refs.append(OrthancReference(
            orthanc_id=f"tc-{marca}-{n}", study_instance_uid=f"2.25.{marca}", series_instance_uid=serie,
            sop_instance_uid=f"2.25.{marca}.{n}", resource_type="instance", em_volume=True,
            enquadramento="sem_borda", destino=DestinoImagem.FILA.value,
            texto_na_imagem="tarjado" if n == 2 else "sem_texto", texto_regioes=2 if n == 2 else 0,
        ))
    refs.append(OrthancReference(
        orthanc_id=f"rx-{marca}", study_instance_uid=f"2.25.rx{marca}", series_instance_uid=f"serie-rx-{marca}",
        sop_instance_uid=f"2.25.rx{marca}.1", resource_type="instance", enquadramento="sem_borda",
        destino=DestinoImagem.FILA.value, texto_na_imagem="sem_texto",
    ))
    db.add_all(refs)
    db.commit()
    yield refs
    db.rollback()
    ids = [r.id for r in refs]
    fichas = [c.id for c in db.query(Curation).filter(Curation.orthanc_reference_id.in_(ids)).all()]
    if fichas:
        db.query(CurationHistory).filter(CurationHistory.curation_id.in_(fichas)).delete(synchronize_session=False)
    db.query(Curation).filter(Curation.orthanc_reference_id.in_(ids)).delete(synchronize_session=False)
    db.query(OrthancReference).filter(OrthancReference.id.in_(ids)).delete(synchronize_session=False)
    db.commit()


@pytest.fixture()
def curador(client, criar_usuario):
    return cabecalho_auth(obter_token(client, criar_usuario(perfil=UserRole.curador).email))


def _total(client, h):
    r = client.get("/curation/pending", params={"limit": 1}, headers=h)
    assert r.status_code == 200, r.text
    return r.json()["total_pendentes"]


def test_tomografia_entra_na_fila_uma_vez_e_radiografia_continua_igual(client, curador, db, criar_usuario):
    h = curador
    antes = _total(client, h)
    refs = []
    marca = uuid.uuid4().hex[:10]
    for n in range(3):
        refs.append(OrthancReference(
            orthanc_id=f"tcf-{marca}-{n}", study_instance_uid=f"2.25.{marca}", series_instance_uid=f"s-{marca}",
            sop_instance_uid=f"2.25.{marca}.{n}", resource_type="instance", em_volume=True,
            enquadramento="sem_borda", destino=DestinoImagem.FILA.value))
    refs.append(OrthancReference(
        orthanc_id=f"rxf-{marca}", study_instance_uid=f"2.25.r{marca}", series_instance_uid=f"sr-{marca}",
        sop_instance_uid=f"2.25.r{marca}.1", resource_type="instance", enquadramento="sem_borda",
        destino=DestinoImagem.FILA.value))
    db.add_all(refs)
    db.commit()
    try:
        total = _total(client, h)
        assert total == antes + 2  # 3 cortes = 1 item; + 1 periapical
        r = client.get("/curation/pending", params={"skip": total - 2, "limit": 2}, headers=h)
        itens = {i["orthanc_reference_id"]: i for i in r.json()["itens"]}
        assert set(itens) == {refs[0].id, refs[3].id}  # o PRIMEIRO corte representa o exame
        assert itens[refs[0].id]["em_volume"] is True and itens[refs[0].id]["cortes"] == 3
        assert itens[refs[3].id]["em_volume"] is False and itens[refs[3].id]["cortes"] == 1
    finally:
        ids = [r.id for r in refs]
        db.query(OrthancReference).filter(OrthancReference.id.in_(ids)).delete(synchronize_session=False)
        db.commit()


def test_depois_da_ficha_nenhum_outro_corte_volta_para_a_fila(client, curador, exame):
    h = curador
    antes = _total(client, h)
    r = client.post(f"/curation/{exame[0].id}", json={"tipo_radiografia": "tomografia"}, headers=h)
    assert r.status_code in (200, 201), r.text
    assert _total(client, h) == antes - 1  # o exame saiu da fila; os outros cortes nao entram


def test_ficha_do_exame_mostra_cortes_e_aviso_de_todos_os_cortes(client, curador, exame):
    h = curador
    ficha = client.post(f"/curation/{exame[0].id}", json={"tipo_radiografia": "tomografia"}, headers=h).json()
    dados = client.get(f"/curation/{ficha['curation_id']}", headers=h).json()
    assert dados["em_volume"] is True
    assert dados["cortes"] == 3
    # o corte 3 foi tarjado: o aviso aparece mesmo abrindo pelo corte 1
    assert dados["texto_na_imagem"] == "tarjado" and dados["texto_regioes"] == 2


def test_ficha_de_radiografia_continua_igual(client, curador, exame):
    h = curador
    ficha = client.post(f"/curation/{exame[3].id}", json={"tipo_radiografia": "periapical"}, headers=h).json()
    dados = client.get(f"/curation/{ficha['curation_id']}", headers=h).json()
    assert dados["em_volume"] is False and dados["cortes"] == 1
    assert dados["texto_na_imagem"] == "sem_texto"


# --- telas de listagem e contagens (18/11/2026) ------------------------------------

@pytest.fixture()
def admin(client, criar_usuario):
    return cabecalho_auth(obter_token(client, criar_usuario(perfil=UserRole.administrador).email))


def test_imagens_recebidas_mostram_o_exame_uma_vez(client, admin, exame):
    r = client.get("/images/", headers=admin)
    assert r.status_code == 200, r.text
    ids = {i["id"]: i for i in r.json()}
    assert exame[0].id in ids and exame[1].id not in ids and exame[2].id not in ids
    assert ids[exame[0].id]["cortes"] == 3 and ids[exame[0].id]["em_volume"] is True
    assert ids[exame[3].id]["cortes"] == 1


def test_contagem_dos_paineis_conta_o_exame_uma_vez(db, exame):
    from app.modules.admin_router import contar_imagens_por_situacao

    com = contar_imagens_por_situacao(db)["total"]
    for r in exame:
        r.ativo = False
    db.commit()
    sem = contar_imagens_por_situacao(db)["total"]
    assert com - sem == 2  # 1 tomografia + 1 periapical


def test_desativar_o_exame_desativa_todos_os_cortes(client, admin, db, exame):
    r = client.patch(f"/images/{exame[0].id}/deactivate", headers=admin)
    assert r.status_code == 200, r.text
    for corte in exame[:3]:
        db.refresh(corte)
        assert corte.ativo is False
    db.refresh(exame[3])
    assert exame[3].ativo is True  # a periapical nao e tocada


def test_minhas_imagens_e_retirar_valem_para_o_exame(client, criar_usuario, db, exame):
    dono = criar_usuario(perfil=UserRole.estudante)
    h = cabecalho_auth(obter_token(client, dono.email))
    for corte in exame[:3]:
        corte.enviado_por_id, corte.destino = dono.id, DestinoImagem.PESSOAL.value
    db.commit()
    itens = client.get("/envios/meus", headers=h).json()["itens"]
    assert [i["id"] for i in itens] == [exame[0].id]
    assert itens[0]["cortes"] == 3
    assert client.delete(f"/envios/{exame[0].id}", headers=h).status_code == 200
    for corte in exame[:3]:
        db.refresh(corte)
        assert corte.ativo is False
