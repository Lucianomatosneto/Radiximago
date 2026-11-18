"""
Tipo de radiografia sugerido a partir da propria imagem (18/11/2026).

Defeito antigo (desde jul/2026): toda ficha nova comecava como "periapical",
ate em tomografias. Agora, sem tipo informado, o sistema sugere um pelas
tags DICOM; quem informa o tipo continua mandando; sem Orthanc, cai no padrao.
"""
import pytest

from app.modules.curation import tipo_automatico
from app.modules.curation.tipo_automatico import sugerir_tipo
from app.modules.curations import Curation, TipoRadiografia
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


@pytest.mark.parametrize(
    "tags, esperado",
    [
        ({"Modality": "CT", "Rows": "512", "Columns": "512"}, TipoRadiografia.TOMOGRAFIA),
        ({"Modality": "ct"}, TipoRadiografia.TOMOGRAFIA),
        ({"Modality": "PX", "Rows": "1000", "Columns": "1000"}, TipoRadiografia.PANORAMICA),
        ({"Modality": "DX", "Rows": "1300", "Columns": "2800"}, TipoRadiografia.PANORAMICA),
        ({"Modality": "OT", "Rows": 900, "Columns": 1800}, TipoRadiografia.PANORAMICA),
        ({"Modality": "IO", "Rows": "1300", "Columns": "1000"}, TipoRadiografia.PERIAPICAL),
        ({"Modality": "DX", "Rows": "1000", "Columns": "1300"}, TipoRadiografia.PERIAPICAL),
        ({}, TipoRadiografia.PERIAPICAL),
        ({"Rows": "0", "Columns": "abc"}, TipoRadiografia.PERIAPICAL),
    ],
)
def test_regras_de_sugestao(tags, esperado):
    tipo, motivo = sugerir_tipo(tags)
    assert tipo is esperado
    assert motivo


def _curador(client, criar_usuario):
    usuario = criar_usuario(perfil=UserRole.curador)
    return cabecalho_auth(obter_token(client, usuario.email))


def test_ficha_sem_tipo_usa_a_sugestao_da_imagem(client, criar_usuario, criar_referencia, db, monkeypatch):
    monkeypatch.setattr(tipo_automatico.orthanc_client, "obter_tags_simplificadas_instancia",
                        lambda _id: {"Modality": "CT", "Rows": "512", "Columns": "512"})
    ref = criar_referencia()
    resposta = client.post(f"/curation/{ref.id}", headers=_curador(client, criar_usuario), json={})
    assert resposta.status_code == 200, resposta.text
    ficha = db.query(Curation).filter(Curation.orthanc_reference_id == ref.id).one()
    assert ficha.tipo_radiografia == "tomografia"


def test_tipo_informado_continua_valendo(client, criar_usuario, criar_referencia, db, monkeypatch):
    def nao_deve_ser_chamado(_id):
        raise AssertionError("com tipo informado, o Orthanc nao precisa ser consultado")

    monkeypatch.setattr(tipo_automatico.orthanc_client, "obter_tags_simplificadas_instancia", nao_deve_ser_chamado)
    ref = criar_referencia()
    resposta = client.post(f"/curation/{ref.id}", headers=_curador(client, criar_usuario),
                           json={"tipo_radiografia": "oclusal"})
    assert resposta.status_code == 200, resposta.text
    assert db.query(Curation).filter(Curation.orthanc_reference_id == ref.id).one().tipo_radiografia == "oclusal"


def test_sem_orthanc_a_ficha_abre_como_periapical(client, criar_usuario, criar_referencia, db, monkeypatch):
    def orthanc_fora(_id):
        raise ConnectionError("Orthanc fora do ar")

    monkeypatch.setattr(tipo_automatico.orthanc_client, "obter_tags_simplificadas_instancia", orthanc_fora)
    ref = criar_referencia()
    resposta = client.post(f"/curation/{ref.id}", headers=_curador(client, criar_usuario), json={})
    assert resposta.status_code == 200, resposta.text
    assert db.query(Curation).filter(Curation.orthanc_reference_id == ref.id).one().tipo_radiografia == "periapical"
