"""
M7 da auditoria do administrador (01/11/2026): a tela Configuracoes mostrava
uma lista de modalidades SEM a tomografia, e valores crus ("em_analise",
"development"). Este teste confere que as listas fixas da tela continuam
iguais as do sistema (backend) e que cada valor tem um nome amigavel nas
traducoes - assim uma modalidade nova nao fica de fora de novo.
"""

import json
import re
from pathlib import Path

from app.modules.curations import StatusCuradoria, TipoRadiografia
from app.modules.users import UserRole as PerfilUsuario

RAIZ = Path(__file__).resolve().parents[2] / "frontend"
PAGINA = (RAIZ / "src/app/configuracoes/page.tsx").read_text(encoding="utf-8")


def _lista(nome: str) -> list[str]:
    bloco = re.search(rf"const {nome} = \[(.*?)\]", PAGINA, re.S)
    assert bloco, f"lista {nome} nao encontrada na tela"
    return re.findall(r"'([a-z_]+)'", bloco.group(1))


def _traducoes(lingua: str) -> dict:
    return json.loads((RAIZ / f"messages/{lingua}.json").read_text(encoding="utf-8"))


def test_modalidades_iguais_ao_backend_inclui_tomografia():
    assert set(_lista("MODALIDADES_RADIOGRAFIA")) == {t.value for t in TipoRadiografia}
    assert "tomografia" in _lista("MODALIDADES_RADIOGRAFIA")


def test_status_e_perfis_iguais_ao_backend():
    assert set(_lista("STATUS_CURADORIA")) == {s.value for s in StatusCuradoria}
    assert set(_lista("PERFIS_USUARIO")) == {p.value for p in PerfilUsuario}


def test_todos_os_valores_tem_nome_amigavel_pt_e_en():
    for lingua in ("pt", "en"):
        d = _traducoes(lingua)
        for v in _lista("MODALIDADES_RADIOGRAFIA"):
            assert v in d["Pesquisa"]["opcoes"]["tipoRadiografia"], (lingua, v)
        for v in _lista("STATUS_CURADORIA"):
            assert v in d["ImagensRecebidas"]["statusCuradoriaFiltro"], (lingua, v)
        for v in _lista("PERFIS_USUARIO"):
            assert v in d["Usuarios"]["perfis"], (lingua, v)


def test_ambiente_tem_nome_amigavel_e_aviso_de_desenvolvimento():
    assert "config?.environment ?? '—'" not in PAGINA
    assert "avisoAmbienteDesenvolvimento" in PAGINA
    for lingua in ("pt", "en"):
        c = _traducoes(lingua)["Configuracoes"]
        for chave in ("ambienteProducao", "ambienteDesenvolvimento", "avisoAmbienteDesenvolvimento"):
            assert c.get(chave), (lingua, chave)
