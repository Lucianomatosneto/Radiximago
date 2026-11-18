"""
UIDs FIXOS na anonimizacao (app/modules/uids_anonimizados.py, 18/11/2026).

Achados do dossie (doc. 06): DICOM-ACH-01 (cortes de uma tomografia viravam
exames separados) e DICOM-ACH-02 (o mesmo arquivo enviado de novo criava
uma copia). Sem rede, sem Orthanc real e sem imagem real.
"""
import re

import pytest

from app.modules import images_router, orthanc_client
from app.modules.orthanc_client import regras_de_anonimizacao
from app.modules.orthanc_references import OrthancReference
from app.modules.uids_anonimizados import (
    NOME_PACIENTE,
    TAMANHO_MAX_UID,
    paciente_derivado,
    substituicoes_de_identificadores,
    uid_derivado,
)

CHAVE = "chave-de-teste-com-mais-de-32-caracteres-0123456789"
OUTRA_CHAVE = "outra-chave-de-teste-com-mais-de-32-caracteres-xyz"
UID_VALIDO = re.compile(r"^2\.25\.(0|[1-9][0-9]*)$")


def _corte(n: int) -> dict:
    """Tags de um corte de uma tomografia ficticia (mesmo estudo/serie)."""
    return {
        "StudyInstanceUID": "1.2.3.4.100",
        "SeriesInstanceUID": "1.2.3.4.100.1",
        "SOPInstanceUID": f"1.2.3.4.100.1.{n}",
        "FrameOfReferenceUID": "1.2.3.4.100.9",
        "PatientID": "PAC-998877",
    }


# --- funcoes puras ------------------------------------------------------------

def test_mesmo_original_gera_sempre_o_mesmo_uid():
    assert uid_derivado(CHAVE, "StudyInstanceUID", "1.2.3") == uid_derivado(CHAVE, "StudyInstanceUID", "1.2.3")


def test_uid_derivado_e_valido_no_padrao_dicom():
    uid = uid_derivado(CHAVE, "SOPInstanceUID", "1.2.840.113619.2.55.3.604688119.971.1234567890.123")
    assert UID_VALIDO.match(uid)
    assert len(uid) <= TAMANHO_MAX_UID


def test_originais_diferentes_ou_tipos_diferentes_geram_uids_diferentes():
    assert uid_derivado(CHAVE, "StudyInstanceUID", "1.2.3") != uid_derivado(CHAVE, "StudyInstanceUID", "1.2.4")
    # o mesmo texto como estudo e como serie nao pode virar o mesmo UID
    assert uid_derivado(CHAVE, "StudyInstanceUID", "1.2.3") != uid_derivado(CHAVE, "SeriesInstanceUID", "1.2.3")


def test_sem_a_chave_certa_o_resultado_muda():
    """Quem tem o original mas nao a chave nao consegue refazer o calculo."""
    assert uid_derivado(CHAVE, "StudyInstanceUID", "1.2.3") != uid_derivado(OUTRA_CHAVE, "StudyInstanceUID", "1.2.3")


def test_uid_derivado_nao_contem_o_original():
    original = "1.2.840.10008.999.123456"
    assert original not in uid_derivado(CHAVE, "StudyInstanceUID", original)


def test_cortes_da_mesma_tomografia_ficam_no_mesmo_estudo_e_serie():
    a = substituicoes_de_identificadores(CHAVE, _corte(1))
    b = substituicoes_de_identificadores(CHAVE, _corte(2))
    assert a["StudyInstanceUID"] == b["StudyInstanceUID"]
    assert a["SeriesInstanceUID"] == b["SeriesInstanceUID"]
    assert a["FrameOfReferenceUID"] == b["FrameOfReferenceUID"]
    assert a["PatientID"] == b["PatientID"]
    assert a["SOPInstanceUID"] != b["SOPInstanceUID"]  # cada corte continua sendo uma imagem


def test_paciente_ficticio_vem_do_estudo_e_nao_do_paciente_original():
    """Exames diferentes da MESMA pessoa nao ficam ligados no Radix."""
    exame1 = {**_corte(1), "StudyInstanceUID": "1.2.3.4.100"}
    exame2 = {**_corte(1), "StudyInstanceUID": "1.2.3.4.200"}  # mesmo PatientID original
    p1 = substituicoes_de_identificadores(CHAVE, exame1)["PatientID"]
    p2 = substituicoes_de_identificadores(CHAVE, exame2)["PatientID"]
    assert p1 != p2
    assert "998877" not in p1
    assert p1 == paciente_derivado(CHAVE, "1.2.3.4.100")


def test_nome_do_paciente_fixo():
    assert substituicoes_de_identificadores(CHAVE, _corte(1))["PatientName"] == NOME_PACIENTE


def test_so_substitui_uids_que_existem_no_arquivo():
    tags = {"StudyInstanceUID": "1.2.3", "SOPInstanceUID": "1.2.3.1"}  # sem serie nem FrameOfReference
    sub = substituicoes_de_identificadores(CHAVE, tags)
    assert "FrameOfReferenceUID" not in sub and "SeriesInstanceUID" not in sub
    assert {"StudyInstanceUID", "SOPInstanceUID", "PatientID", "PatientName"} <= set(sub)


@pytest.mark.parametrize("chave,tags", [("", _corte(1)), (CHAVE, {"SOPInstanceUID": "1.2"})])
def test_sem_chave_ou_sem_estudo_volta_ao_sorteio(chave, tags):
    assert substituicoes_de_identificadores(chave, tags) == {}


# --- regras enviadas ao Orthanc ---------------------------------------------------

def test_regras_com_chave_trazem_uids_e_force():
    regras = regras_de_anonimizacao(_corte(1), CHAVE)
    assert regras["Force"] is True  # o Orthanc so troca UIDs com Force
    assert regras["Replace"]["StudyInstanceUID"].startswith("2.25.")
    # as regras de 18/10/2026 continuam valendo
    assert regras["Keep"] == ["PatientSex", "PatientAge"]
    assert regras["Remove"] == ["ContributingEquipmentSequence"]
    assert "DeidentificationMethod" in regras["Replace"]


def test_regras_sem_chave_ficam_como_antes():
    regras = regras_de_anonimizacao(_corte(1))
    assert "Force" not in regras
    assert "StudyInstanceUID" not in regras["Replace"]


def test_anonimizar_instancia_usa_a_chave_do_servidor(monkeypatch):
    pedidos = []

    class _Resposta:
        content = b"dicom"

        def raise_for_status(self):
            return None

    monkeypatch.setattr(orthanc_client.settings, "ANONIMIZACAO_CHAVE_UID", CHAVE)
    monkeypatch.setattr(orthanc_client, "obter_tags_simplificadas_instancia", lambda oid: _corte(1))
    monkeypatch.setattr(orthanc_client._client, "post", lambda url, json, timeout: pedidos.append(json) or _Resposta())
    monkeypatch.setattr("app.modules.geometria_imagem.recortar_moldura", lambda a: (a, None))
    monkeypatch.setattr("app.modules.texto_na_imagem.tarjar_texto", lambda a: (a, None))
    monkeypatch.setattr(orthanc_client, "enviar_instancia", lambda a: {"ID": "x"})
    orthanc_client.anonimizar_instancia("original")
    assert pedidos[0]["Force"] is True
    assert pedidos[0]["Replace"]["StudyInstanceUID"] == uid_derivado(CHAVE, "StudyInstanceUID", "1.2.3.4.100")


# --- arquivo repetido ---------------------------------------------------------------

class _Texto:
    situacao = "sem_texto"
    regioes = 0


class _Recorte:
    situacao = "sem_borda"


def test_arquivo_repetido_devolve_a_imagem_existente_sem_criar_outra(monkeypatch, db, criar_referencia):
    existente = criar_referencia()
    apagadas = []
    monkeypatch.setattr(images_router, "_determinar_origem", lambda oid: "externa")
    monkeypatch.setattr(images_router, "_anonimizar_e_excluir_original",
                        lambda oid: (existente.orthanc_id, _Texto(), _Recorte()))
    monkeypatch.setattr(images_router.orthanc_client, "excluir_instancia", apagadas.append)
    antes = db.query(OrthancReference).count()

    ref, criada = images_router._registrar_referencia_se_nova(db, "original-reenviado")

    assert criada is False
    assert ref.id == existente.id
    assert db.query(OrthancReference).count() == antes
    assert apagadas == []  # a imagem do acervo nao e tocada


def test_falha_ao_apagar_original_nao_apaga_imagem_ja_guardada(monkeypatch):
    """Se o Orthanc disse 'AlreadyStored', a copia anonimizada e uma imagem
    do acervo: mesmo com falha no meio, ela NAO pode ser apagada."""
    apagadas = []

    def excluir(oid):
        apagadas.append(oid)
        if oid == "ORIGINAL":
            raise RuntimeError("Orthanc fora do ar (simulado)")

    monkeypatch.setattr(orthanc_client, "excluir_instancia", excluir)
    monkeypatch.setattr(orthanc_client, "anonimizar_instancia",
                        lambda oid: ({"ID": "DO-ACERVO", "Status": "AlreadyStored"}, _Texto(), _Recorte()))
    with pytest.raises(RuntimeError):
        images_router._anonimizar_e_excluir_original("ORIGINAL")
    assert "DO-ACERVO" not in apagadas


# --- configuracao ---------------------------------------------------------------

def test_producao_nao_liga_sem_a_chave_dos_identificadores():
    from app.core.config import Settings

    base = dict(DATABASE_URL="postgresql://x", JWT_SECRET_KEY="k" * 40, ORTHANC_PASSWORD="x",
                WHISPER_CHAVE="c" * 64)
    with pytest.raises(ValueError, match="ANONIMIZACAO_CHAVE_UID"):
        Settings(**base, ENVIRONMENT="production", ANONIMIZACAO_CHAVE_UID="curta")
    with pytest.warns(UserWarning, match="ANONIMIZACAO_CHAVE_UID"):
        Settings(**base, ENVIRONMENT="development", ANONIMIZACAO_CHAVE_UID="")
    assert Settings(**base, ENVIRONMENT="production", ANONIMIZACAO_CHAVE_UID=CHAVE).ANONIMIZACAO_CHAVE_UID == CHAVE
