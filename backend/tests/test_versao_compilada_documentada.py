"""
B4 da auditoria do administrador (01/11/2026): o erro "Unexpected end of
JSON input (loadManifest)" e do modo desenvolvimento do Next.js. Confere que
toda forma de colocar o sistema no ar usa as telas COMPILADAS e que o jeito
de rodar a versao compilada esta documentado.
"""

from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]


def test_servidor_tunel_e_local_usam_telas_compiladas():
    for nome in ("docker-compose.prod.yml", "docker-compose.tunel.yml", "docker-compose.telas-compiladas.yml"):
        texto = (RAIZ / nome).read_text(encoding="utf-8")
        assert "dockerfile: Dockerfile.prod" in texto, nome
        assert "volumes: !reset []" in texto, nome  # sem a pasta do computador montada


def test_dockerfile_prod_compila_antes_de_ligar():
    texto = (RAIZ / "frontend/Dockerfile.prod").read_text(encoding="utf-8")
    assert "npm run build" in texto
    assert '"next", "start"' in texto
    assert "next dev" not in texto


def test_documentado_em_implantacao():
    texto = (RAIZ / "docs/IMPLANTACAO.md").read_text(encoding="utf-8")
    assert "Unexpected end of JSON input" in texto
    assert "docker-compose.telas-compiladas.yml" in texto
