"""
Separacao Radix Imago / Radix Clinica (08/11/2026, decisao do Luciano):
as pastas de pacientes (dados IDENTIFICADOS) sairam do Radix Imago, que
trata somente imagens anonimizadas para ensino e pesquisa. O modulo
completo ficou guardado no ramo `radix-clinica-base` do repositorio, para
o futuro Radix Clinica. Estes testes impedem que ele volte por engano.
"""

from pathlib import Path

from app.main import app

RAIZ = Path(__file__).resolve().parents[2]


def test_api_nao_tem_rotas_de_pastas_de_pacientes():
    caminhos = {getattr(r, "path", "") for r in app.routes}
    assert not any(c.startswith("/casos") for c in caminhos)


def test_codigo_das_pastas_nao_existe_mais():
    for arquivo in ("casos.py", "casos_router.py", "casos_arquivos.py", "casos_eliminacao.py", "casos_rotacao.py"):
        assert not (RAIZ / "backend/app/modules" / arquivo).exists(), arquivo
    assert not (RAIZ / "frontend/src/app/casos").exists()
    assert not (RAIZ / "frontend/src/components/casos").exists()


def test_menu_e_configuracao_sem_pastas():
    menu = (RAIZ / "frontend/src/components/Sidebar.tsx").read_text(encoding="utf-8")
    assert "/casos" not in menu
    from app.core.config import settings
    assert not hasattr(settings, "CASOS_CHAVE")
