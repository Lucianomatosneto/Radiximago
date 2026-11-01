"""
TUDO O QUE O CURADOR MARCA EXISTE NA BUSCA AVANCADA (01/11/2026 - QA item 7;
requisito do Luciano).

Duas camadas:
1) as LISTAS da tela da Curadoria batem com as da Busca e com o servidor
   (achados, regioes, erros tecnicos, grupos) - lidas dos arquivos .ts;
2) cada valor que a Curadoria grava e de fato ENCONTRADO pela API /search
   (achado:, regiao:, erros_tecnicos, vocab:) numa ficha aprovada.
Mais: duplicidade de erro tecnico (409) e termo inativo fora da busca (422).
"""

import re
import uuid
from pathlib import Path

import pytest

from app.modules.achados import Achado, ErroTecnico, RegiaoAnatomica, TipoAchado, TipoErroTecnico
from app.modules.busca_termos import GRUPOS_ACHADO
from app.modules.curations import StatusCuradoria
from app.modules.users import UserRole
from app.modules.vocabulario import CurationTermo, TermoVocabulario
from tests.conftest import cabecalho_auth, obter_token

FRONT = Path(__file__).resolve().parents[2] / "frontend/src/lib"


def _ler(nome: str) -> str:
    return (FRONT / nome).read_text(encoding="utf-8")


def _lista_ts(texto: str, constante: str) -> list[str]:
    bloco = re.search(rf"{constante}[^=]*=\s*\[(.*?)\]", texto, re.S).group(1)
    return re.findall(r"'([^']+)'", bloco)


def _ids(client, h, **params):
    r = client.get("/search", params={"limit": 200, **params}, headers=h)
    assert r.status_code == 200, r.text
    return {i["curation_id"] for i in r.json()["itens"]}


@pytest.fixture()
def h(client, criar_usuario):
    return cabecalho_auth(obter_token(client, criar_usuario(perfil=UserRole.estudante).email))


# ---------------- 1) listas iguais ----------------
def test_achados_da_curadoria_estao_na_busca():
    curadoria = set(re.findall(r"valor: '([^']+)'", _ler("alteracoesObservadas.ts")))
    servidor = {t.value for t in TipoAchado} - {"outro"}
    assert curadoria == servidor  # a Busca usa a MESMA lista (lib/achados.ts: TIPOS_ACHADO)
    assert "CATEGORIAS_ALTERACOES" in _ler("achados.ts")


def test_regioes_da_curadoria_estao_na_busca():
    curadoria = set(_lista_ts(_ler("achadosFicha.ts"), "export const REGIOES"))
    busca = set(_lista_ts(_ler("achados.ts"), "REGIOES_ANATOMICAS"))
    assert curadoria == busca == {r.value for r in RegiaoAnatomica}


def test_erros_tecnicos_da_curadoria_estao_na_busca():
    curadoria = set(re.findall(r"valor: '([^']+)'", _ler("errosTecnicos.ts")))
    legado = {"corte_apice", "corte_coroa", "angulacao_inadequada", "exposicao_inadequada",
              "posicionamento_inadequado", "artefato", "processamento_inadequado"}
    assert curadoria == {e.value for e in TipoErroTecnico} - legado  # o filtro da Busca usa ERROS_TECNICOS inteiro


def test_grupos_da_busca_iguais_ao_servidor():
    assert set(_lista_ts(_ler("catalogoTermos.ts"), "GRUPOS_TERMOS")) == set(GRUPOS_ACHADO)


# ---------------- 2) cada valor e encontrado ----------------
def test_cada_achado_e_regiao_marcados_sao_encontrados(client, db, h, criar_ficha):
    criadas = []
    try:
        for i, tipo in enumerate(t for t in TipoAchado if t.value != "outro"):
            regiao = list(RegiaoAnatomica)[i % len(RegiaoAnatomica)].value
            f = criar_ficha()
            db.add(Achado(curation_id=f.id, tipo=tipo.value, regiao_anatomica=regiao, dentes=[36]))
            criadas.append((f.id, tipo.value, regiao))
        db.commit()
        for cid, tipo, regiao in criadas:
            assert cid in _ids(client, h, termos=f"achado:{tipo}"), tipo
            assert cid in _ids(client, h, termos=f"regiao:{regiao}"), regiao
            assert cid in _ids(client, h, regiao_anatomica=regiao), regiao
    finally:
        for cid, _, _ in criadas:
            db.query(Achado).filter(Achado.curation_id == cid).delete()
        db.commit()


def test_cada_erro_tecnico_marcado_e_encontrado(client, db, h, criar_ficha):
    criadas = []
    try:
        for erro in TipoErroTecnico:
            f = criar_ficha()
            db.add(ErroTecnico(curation_id=f.id, tipo=erro.value))
            criadas.append((f.id, erro.value))
        db.commit()
        for cid, erro in criadas:
            assert cid in _ids(client, h, erros_tecnicos=[erro]), erro
    finally:
        for cid, _ in criadas:
            db.query(ErroTecnico).filter(ErroTecnico.curation_id == cid).delete()
        db.commit()


def test_termo_do_vocabulario_ligado_e_encontrado_e_inativo_sai(client, db, h, criar_ficha):
    nome = f"Termo cxb {uuid.uuid4().hex[:8]}"
    termo = TermoVocabulario(termo=nome, termo_normalizado=nome.lower(), categoria="achado", ativo=True)
    db.add(termo)
    db.commit()
    f = criar_ficha()
    db.add(CurationTermo(curation_id=f.id, termo_id=termo.id))
    db.commit()
    try:
        assert f.id in _ids(client, h, termos=f"vocab:{termo.id}")
        termo.ativo = False
        db.commit()
        r = client.get("/search", params={"termos": f"vocab:{termo.id}"}, headers=h)
        assert r.status_code == 422 and "inativo" in r.json()["detail"]
    finally:
        db.query(CurationTermo).filter(CurationTermo.termo_id == termo.id).delete()
        db.delete(termo)
        db.commit()


# ---------------- erro tecnico repetido ----------------
def test_erro_tecnico_repetido_recusado(client, db, criar_usuario, criar_ficha):
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value, tipo_radiografia="tomografia")
    hc = cabecalho_auth(obter_token(client, criar_usuario(perfil=UserRole.curador).email))
    try:
        assert client.post(f"/curation/{ficha.id}/erros-tecnicos", json={"tipo": "tc_ruido"}, headers=hc).status_code == 200
        r = client.post(f"/curation/{ficha.id}/erros-tecnicos", json={"tipo": "tc_ruido"}, headers=hc)
        assert r.status_code == 409 and "já tem" in r.json()["detail"]
        outro = client.post(f"/curation/{ficha.id}/erros-tecnicos", json={"tipo": "tc_truncamento"}, headers=hc).json()
        assert client.patch(f"/curation/{ficha.id}/erros-tecnicos/{outro['id']}", json={"tipo": "tc_ruido"}, headers=hc).status_code == 409
        assert db.query(ErroTecnico).filter(ErroTecnico.curation_id == ficha.id).count() == 2
    finally:
        db.query(ErroTecnico).filter(ErroTecnico.curation_id == ficha.id).delete()
        db.commit()
