"""
Auditoria 02 - anonimização DICOM: o que acontece quando a exclusão do original falha?

Usa o Orthanc FALSO (substituído por funções simples), sem rede, sem banco e sem imagem real.
Cobre o achado M-02 (corrigido): falha ao apagar o original nao pode deixar copia orfa nem passar em silencio.
"""
import logging

import pytest

from app.modules import images_router, orthanc_client


class _TextoFalso:
    situacao = "sem_texto"
    regioes = []


class _RecorteFalso:
    situacao = "sem_recorte"


@pytest.fixture
def orthanc_falso(monkeypatch):
    estado = {"excluidas": [], "falha_ao_excluir": set()}

    def excluir(orthanc_id):
        estado["excluidas"].append(orthanc_id)
        if orthanc_id in estado["falha_ao_excluir"]:
            raise RuntimeError("Orthanc fora do ar (simulado)")

    monkeypatch.setattr(orthanc_client, "excluir_instancia", excluir)
    monkeypatch.setattr(
        orthanc_client, "anonimizar_instancia",
        lambda oid: ({"ID": "ANONIMIZADA"}, _TextoFalso(), _RecorteFalso()),
    )
    return estado


def test_caminho_feliz_apaga_o_original(orthanc_falso):
    novo, _, _ = images_router._anonimizar_e_excluir_original("ORIGINAL")
    assert novo == "ANONIMIZADA"
    assert orthanc_falso["excluidas"] == ["ORIGINAL"]


def test_falha_na_anonimizacao_apaga_o_original(orthanc_falso, monkeypatch):
    def quebra(oid):
        raise RuntimeError("OCR quebrou (simulado)")
    monkeypatch.setattr(orthanc_client, "anonimizar_instancia", quebra)
    with pytest.raises(RuntimeError):
        images_router._anonimizar_e_excluir_original("ORIGINAL")
    assert orthanc_falso["excluidas"] == ["ORIGINAL"]


def test_exclusao_do_original_falha_nao_deixa_copia_orfa(orthanc_falso):
    orthanc_falso["falha_ao_excluir"].add("ORIGINAL")
    with pytest.raises(Exception):
        images_router._anonimizar_e_excluir_original("ORIGINAL")
    # desejado: a cópia anonimizada recém-criada é removida, para a próxima tentativa não duplicar
    assert "ANONIMIZADA" in orthanc_falso["excluidas"]


def test_falha_silenciosa_ao_apagar_original_gera_alerta(orthanc_falso, monkeypatch, caplog):
    def quebra(oid):
        raise RuntimeError("OCR quebrou (simulado)")
    monkeypatch.setattr(orthanc_client, "anonimizar_instancia", quebra)
    orthanc_falso["falha_ao_excluir"].add("ORIGINAL")
    with caplog.at_level(logging.WARNING):
        with pytest.raises(RuntimeError):
            images_router._anonimizar_e_excluir_original("ORIGINAL")
    assert any("ORIGINAL" in r.getMessage() for r in caplog.records)
