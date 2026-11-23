"""
Origem da imagem com nome neutro (18/11/2026).

O valor "ufsc" (imagem recebida direto de um aparelho) passou a se chamar
"aparelho". Estes testes garantem que:
1. o valor novo e o oficial;
2. o valor antigo "ufsc" continua aceito como sinonimo (links e macros antigos);
3. a busca pelo valor antigo encontra as imagens do valor novo;
4. a migracao troca os dados gravados e pode ser desfeita.
"""
import importlib.util
from pathlib import Path

from sqlalchemy import text

from app.modules.orthanc_references import OrigemImagem, OrthancReference

RAIZ_BACKEND = Path(__file__).resolve().parent.parent


def test_valores_oficiais_sao_neutros():
    assert {o.value for o in OrigemImagem} == {"aparelho", "externa"}


def test_valor_antigo_ufsc_vira_aparelho():
    assert OrigemImagem("ufsc") is OrigemImagem.APARELHO
    assert OrigemImagem(" UFSC ") is OrigemImagem.APARELHO
    assert OrigemImagem("aparelho") is OrigemImagem.APARELHO


def test_valor_desconhecido_continua_recusado():
    try:
        OrigemImagem("clinica")
    except ValueError:
        return
    raise AssertionError("valor desconhecido nao pode ser aceito")


def _login_curador(client, criar_usuario):
    from tests.test_search_odontologico import _curador_autenticado
    return _curador_autenticado(client, criar_usuario)


def _ids(resposta_json):
    from tests.test_search_odontologico import _ids_encontrados
    return _ids_encontrados(resposta_json)


def test_busca_com_valor_antigo_encontra_imagens_do_aparelho(client, criar_usuario, criar_ficha, db):
    headers = _login_curador(client, criar_usuario)
    ficha = criar_ficha()
    ref = db.get(OrthancReference, ficha.orthanc_reference_id)
    ref.origem = "aparelho"
    db.commit()

    for valor in ("aparelho", "ufsc"):
        resposta = client.get("/search", headers=headers, params={"origem": valor})
        assert resposta.status_code == 200, resposta.text
        assert ficha.id in _ids(resposta.json()), f"busca por origem={valor} nao achou a ficha"


def _carregar_migracao():
    caminho = next((RAIZ_BACKEND / "alembic" / "versions").glob("f9b1d3e5a7c8_*.py"))
    spec = importlib.util.spec_from_file_location("migracao_origem", caminho)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def test_migracao_troca_e_desfaz_dados_gravados(criar_ficha, db):
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    ficha = criar_ficha()
    db.execute(text("UPDATE orthanc_references SET origem = 'ufsc' WHERE id = :i"), {"i": ficha.orthanc_reference_id})
    db.commit()

    migracao = _carregar_migracao()
    conexao = db.connection()
    contexto = MigrationContext.configure(conexao)
    with Operations.context(contexto):
        migracao.upgrade()
        assert db.execute(text("SELECT origem FROM orthanc_references WHERE id = :i"),
                          {"i": ficha.orthanc_reference_id}).scalar() == "aparelho"
        migracao.downgrade()
        assert db.execute(text("SELECT origem FROM orthanc_references WHERE id = :i"),
                          {"i": ficha.orthanc_reference_id}).scalar() == "ufsc"
        migracao.upgrade()
    db.commit()
