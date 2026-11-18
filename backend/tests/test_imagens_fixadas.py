"""
Imagens dos containers com versao fixa (auditoria M-03, 12/11/2026).

":latest" (ou sem versao) faz o "docker compose pull" trocar o programa
sozinho, sem revisao - risco de quebra ou de componente comprometido. Toda
imagem dos arquivos docker-compose*.yml precisa de versao explicita ou de
resumo (sha256).
"""

import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]


def _imagens():
    for arquivo in sorted(RAIZ.glob("docker-compose*.yml")):
        for n, linha in enumerate(arquivo.read_text(encoding="utf-8").splitlines(), 1):
            m = re.match(r"^\s*image:\s*['\"]?([^'\"\s#]+)", linha)
            if m:
                yield arquivo.name, n, m.group(1)


def test_nenhuma_imagem_sem_versao_ou_latest():
    imagens = list(_imagens())
    assert imagens, "nenhuma imagem encontrada"
    problemas = []
    for arquivo, n, imagem in imagens:
        if "@sha256:" in imagem:
            continue
        nome, _, versao = imagem.rpartition(":") if ":" in imagem.split("/")[-1] else (imagem, "", "")
        if not versao or versao == "latest":
            problemas.append(f"{arquivo}:{n} {imagem}")
    assert problemas == []


def test_tunel_cloudflared_fixado():
    texto = (RAIZ / "docker-compose.tunel.yml").read_text(encoding="utf-8")
    assert re.search(r"image: cloudflare/cloudflared:20\d\d\.\d+\.\d+\n", texto)


def test_ohif_fixado_pela_impressao_digital():
    """Reprodutibilidade (dossie doc. 07, INT-01, 18/11/2026): o visualizador
    e o mesmo programa testado. Versoes 3.10+ quebram o OHIF ("No modes are
    defined!") - ver comentario no docker-compose.yml."""
    ohif = [img for _, _, img in _imagens() if img.startswith("ohif/app")]
    assert ohif, "imagem do OHIF nao encontrada"
    for imagem in ohif:
        assert imagem.startswith("ohif/app:v3.9.2@sha256:"), imagem
        assert re.fullmatch(r"ohif/app:v3\.9\.2@sha256:[0-9a-f]{64}", imagem), imagem
