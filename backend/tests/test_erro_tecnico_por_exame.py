"""
Erro tecnico compativel com o tipo de exame (01/11/2026 - QA item 4).

Antes: POST de "magnificacao" (intraoral) numa TOMOGRAFIA devolvia 200 com
um id, e o proximo salvamento da tela apagava o registro - parecia "sucesso
sem salvar". Agora a API recusa com 422 e mensagem clara, nas tres formas de
gravar (POST, PATCH do erro e lista completa no PATCH da ficha).
"""

import re
from pathlib import Path

from app.modules.achados import ERROS_POR_EXAME, ErroTecnico, erro_vale_para_exame
from app.modules.curations import StatusCuradoria
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


def _ficha(criar_ficha, tipo):
    return criar_ficha(status=StatusCuradoria.EM_ANALISE.value, tipo_radiografia=tipo)


def test_post_incompativel_recusa_422_sem_gravar(client, db, criar_usuario, criar_ficha):
    ficha = _ficha(criar_ficha, "tomografia")
    h = cabecalho_auth(obter_token(client, criar_usuario(perfil=UserRole.curador).email))
    r = client.post(f"/curation/{ficha.id}/erros-tecnicos", json={"tipo": "magnificacao", "descricao": "QA"}, headers=h)
    assert r.status_code == 422 and "Tomografia" in r.json()["detail"]
    assert db.query(ErroTecnico).filter(ErroTecnico.curation_id == ficha.id).count() == 0

    r = client.post(f"/curation/{ficha.id}/erros-tecnicos", json={"tipo": "tc_artefato_movimento"}, headers=h)
    assert r.status_code == 200, r.text
    erro_id = r.json()["id"]
    assert client.patch(f"/curation/{ficha.id}/erros-tecnicos/{erro_id}", json={"tipo": "imagem_fantasma"}, headers=h).status_code == 422
    db.query(ErroTecnico).filter(ErroTecnico.curation_id == ficha.id).delete()
    db.commit()


def test_lista_da_ficha_incompativel_recusa_422(client, db, criar_usuario, criar_ficha):
    ficha = _ficha(criar_ficha, "periapical")
    h = cabecalho_auth(obter_token(client, criar_usuario(perfil=UserRole.curador).email))
    assert client.patch(f"/curation/{ficha.id}", json={"erros_tecnicos": ["imagem_fantasma"]}, headers=h).status_code == 422
    # trocar o tipo NA MESMA edicao vale: panoramica aceita imagem fantasma
    r = client.patch(f"/curation/{ficha.id}", json={"tipo_radiografia": "panoramica", "erros_tecnicos": ["imagem_fantasma"]}, headers=h)
    assert r.status_code == 200, r.text
    db.query(ErroTecnico).filter(ErroTecnico.curation_id == ficha.id).delete()
    db.commit()


def test_regra_por_exame():
    assert erro_vale_para_exame("magnificacao", "periapical")
    assert not erro_vale_para_exame("magnificacao", "tomografia")
    assert not erro_vale_para_exame("corte_cone", "panoramica")
    assert erro_vale_para_exame("corte_apice", "periapical")  # legado continua valido
    assert erro_vale_para_exame("tc_ruido", None)


def test_mesma_regra_da_tela():
    """Os grupos de frontend/src/lib/errosTecnicos.ts batem com o servidor."""
    ts = (Path(__file__).resolve().parents[2] / "frontend/src/lib/errosTecnicos.ts").read_text(encoding="utf-8")
    grupos: dict[str, set[str]] = {}
    for valor, grupo in re.findall(r"valor: '([^']+)'.*?grupo: '([^']+)'", ts):
        grupos.setdefault(grupo, set()).add(valor)
    assert ERROS_POR_EXAME["tomografia"] == grupos["tomografia"]
    assert grupos["geral"] <= ERROS_POR_EXAME["periapical"]
    assert ERROS_POR_EXAME["panoramica"] >= (grupos["geral"] - {"corte_cone"}) | grupos["panoramica"]
    assert "corte_cone" not in ERROS_POR_EXAME["panoramica"]
    assert not grupos["panoramica"] & ERROS_POR_EXAME["periapical"]
