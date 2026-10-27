"""
Tela de Integracoes (22/10/2026): status de OHIF e Armazenamento.

- So administrador e suporte veem (dados de infraestrutura).
- Backup VAZIO (0 bytes) ou ausente = erro; antigo = instavel.
- Nao depende do Docker (nada de docker.sock).
"""

import os
import time

import pytest

from app.modules import integracoes_router, orthanc_client
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


@pytest.fixture()
def orthanc_ok(monkeypatch):
    monkeypatch.setattr(orthanc_client, "obter_estatisticas", lambda: {"TotalDiskSizeMB": 512, "CountInstances": 454})


def _arquivo(caminho, conteudo=b"dados", horas_atras=0):
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_bytes(conteudo)
    quando = time.time() - horas_atras * 3600
    os.utime(caminho, (quando, quando))


def test_status_so_para_administrador_e_suporte(client, criar_usuario, orthanc_ok):
    for perfil, esperado in ((UserRole.estudante, 403), (UserRole.curador, 403), (UserRole.suporte, 200), (UserRole.administrador, 200)):
        usuario = criar_usuario(perfil=perfil)
        r = client.get("/integracoes/status", headers=cabecalho_auth(obter_token(client, usuario.email)))
        assert r.status_code == esperado, perfil
        if esperado == 200:
            dados = r.json()
            assert dados["ohif_url"]
            assert "armazenamento" in dados


def test_status_exige_login(client):
    assert client.get("/integracoes/status").status_code == 401


def test_backups_recentes_e_cheios_ficam_online(tmp_path, orthanc_ok, monkeypatch):
    from collections import namedtuple

    Uso = namedtuple("Uso", "total used free")
    monkeypatch.setattr(integracoes_router.shutil, "disk_usage", lambda _: Uso(100 * 1024**3, 40 * 1024**3, 60 * 1024**3))
    _arquivo(tmp_path / "postgres" / "radix-imago-20261021-030000.dump")
    _arquivo(tmp_path / "orthanc" / "orthanc-dados-20261021-030000.tar.gz")
    r = integracoes_router.situacao_armazenamento(tmp_path)
    assert r["status"] == "online", r["alertas"]
    assert r["orthanc"] == {"tamanho_mb": 512, "instancias": 454}
    assert r["backup_banco"]["arquivo"] == "radix-imago-20261021-030000.dump"
    assert r["disco"] == {"total_gb": 100.0, "livre_gb": 60.0, "percentual_livre": 60.0}


def test_pouco_espaco_em_disco_avisa(tmp_path, orthanc_ok, monkeypatch):
    from collections import namedtuple

    Uso = namedtuple("Uso", "total used free")
    monkeypatch.setattr(integracoes_router.shutil, "disk_usage", lambda _: Uso(100 * 1024**3, 95 * 1024**3, 5 * 1024**3))
    _arquivo(tmp_path / "postgres" / "a.dump")
    _arquivo(tmp_path / "orthanc" / "b.tar.gz")
    r = integracoes_router.situacao_armazenamento(tmp_path)
    assert r["status"] == "instavel" and r["alertas"] == ["disco_pouco_espaco"]


def test_backup_vazio_vira_erro(tmp_path, orthanc_ok):
    _arquivo(tmp_path / "postgres" / "antigo-bom.dump", horas_atras=30)
    _arquivo(tmp_path / "postgres" / "novo-vazio.dump", conteudo=b"")
    _arquivo(tmp_path / "orthanc" / "imagens.tar.gz")
    r = integracoes_router.situacao_armazenamento(tmp_path)
    assert r["status"] == "erro"
    assert "backup_banco_vazio" in r["alertas"]


def test_backup_ausente_e_antigo(tmp_path, orthanc_ok):
    _arquivo(tmp_path / "orthanc" / "imagens.tar.gz", horas_atras=72)
    r = integracoes_router.situacao_armazenamento(tmp_path)
    assert r["status"] == "erro"
    assert "backup_banco_ausente" in r["alertas"] and "backup_imagens_antigo" in r["alertas"]


def test_pasta_de_backup_nao_montada_fica_instavel(tmp_path, orthanc_ok):
    r = integracoes_router.situacao_armazenamento(tmp_path / "nao-existe")
    assert r["status"] == "instavel"
    assert r["alertas"] == ["pasta_backup_indisponivel"]


def test_orthanc_fora_do_ar_nao_derruba_a_rota(tmp_path, monkeypatch):
    def falha():
        raise RuntimeError("sem conexao")

    monkeypatch.setattr(orthanc_client, "obter_estatisticas", falha)
    _arquivo(tmp_path / "postgres" / "a.dump")
    _arquivo(tmp_path / "orthanc" / "b.tar.gz")
    r = integracoes_router.situacao_armazenamento(tmp_path)
    assert r["status"] == "instavel"
    assert r["orthanc"] is None and "orthanc_estatisticas_indisponiveis" in r["alertas"]
