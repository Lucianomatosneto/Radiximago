"""
TRIAGEM DA MODALIDADE EM LOTE (pedido do Luciano, 23/11/2026).

O reconhecimento automatico so separa tomografia e panoramica; periapical,
interproximal e oclusal tem o mesmo DICOM e ficam como "intraoral". Na
triagem, o curador ve as miniaturas, seleciona varias e diz o tipo de uma
vez - quem decide e um profissional, e fica na auditoria.
Regras:
- so curador e administrador (quem escreve na curadoria);
- so imagens que ainda estao na fila (ativas, na fila, sem ficha) mudam;
  as outras sao contadas como ignoradas;
- tipo precisa ser um tipo de radiografia; ate 100 imagens por vez;
- a ficha nova comeca com o tipo da triagem.
IDs inventados.
"""

import pytest

from app.modules.audit_logs import AuditLog
from app.modules.curations import Curation
from app.modules.orthanc_references import OrthancReference
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


def _cab(client, criar_usuario, perfil=UserRole.curador):
    return cabecalho_auth(obter_token(client, criar_usuario(perfil=perfil).email))


def _na_fila(criar_referencia, db, tipo="intraoral"):
    ref = criar_referencia()
    ref.enquadramento = "sem_borda"
    ref.tipo_preliminar, ref.tipo_preliminar_origem = tipo, "automatico"
    db.commit()
    return ref


def test_curador_marca_varias_de_uma_vez(client, criar_usuario, criar_referencia, db):
    cab = _cab(client, criar_usuario)
    a, b = _na_fila(criar_referencia, db), _na_fila(criar_referencia, db)
    r = client.post("/curation/triagem", headers=cab, json={"orthanc_reference_ids": [a.id, b.id], "tipo": "oclusal"})
    assert r.status_code == 200, r.text
    assert r.json() == {"alteradas": 2, "ignoradas": 0}
    db.expire_all()
    for ref in (a, b):
        atual = db.get(OrthancReference, ref.id)
        assert (atual.tipo_preliminar, atual.tipo_preliminar_origem) == ("oclusal", "triagem")
    log = db.query(AuditLog).filter(AuditLog.acao == "triagem_modalidade").order_by(AuditLog.id.desc()).first()
    assert "tipo=oclusal" in log.detalhes and str(a.id) in log.detalhes


def test_imagem_com_ficha_ou_fora_da_fila_e_ignorada(client, criar_usuario, criar_referencia, criar_ficha, db):
    cab = _cab(client, criar_usuario)
    livre = _na_fila(criar_referencia, db)
    com_ficha = criar_ficha().orthanc_reference_id
    inativa = _na_fila(criar_referencia, db)
    inativa.ativo = False
    db.commit()
    r = client.post("/curation/triagem", headers=cab,
                    json={"orthanc_reference_ids": [livre.id, com_ficha, inativa.id, 999999999], "tipo": "periapical"})
    assert r.json() == {"alteradas": 1, "ignoradas": 3}
    db.expire_all()
    assert db.get(OrthancReference, inativa.id).tipo_preliminar == "intraoral"


@pytest.mark.parametrize("perfil", [UserRole.professor, UserRole.estudante, UserRole.suporte, UserRole.pesquisador])
def test_so_curador_e_administrador(client, criar_usuario, criar_referencia, db, perfil):
    ref = _na_fila(criar_referencia, db)
    r = client.post("/curation/triagem", headers=_cab(client, criar_usuario, perfil),
                    json={"orthanc_reference_ids": [ref.id], "tipo": "periapical"})
    assert r.status_code == 403


def test_administrador_pode(client, criar_usuario, criar_referencia, db):
    ref = _na_fila(criar_referencia, db)
    r = client.post("/curation/triagem", headers=_cab(client, criar_usuario, UserRole.administrador),
                    json={"orthanc_reference_ids": [ref.id], "tipo": "interproximal"})
    assert r.json()["alteradas"] == 1


@pytest.mark.parametrize("corpo", [
    {"orthanc_reference_ids": [1], "tipo": "intraoral"},
    {"orthanc_reference_ids": [1], "tipo": "raio-x"},
    {"orthanc_reference_ids": [], "tipo": "periapical"},
    {"orthanc_reference_ids": list(range(1, 102)), "tipo": "periapical"},
])
def test_entrada_invalida(client, criar_usuario, corpo):
    assert client.post("/curation/triagem", headers=_cab(client, criar_usuario), json=corpo).status_code == 422


def test_ficha_nova_comeca_com_o_tipo_da_triagem(client, criar_usuario, criar_referencia, db, monkeypatch):
    from app.modules.curation import ficha as modulo_ficha

    monkeypatch.setattr(modulo_ficha, "sugerir_tipo_da_imagem", lambda oid: (_ for _ in ()).throw(AssertionError("nao pergunta ao Orthanc")))
    cab = _cab(client, criar_usuario)
    ref = _na_fila(criar_referencia, db)
    client.post("/curation/triagem", headers=cab, json={"orthanc_reference_ids": [ref.id], "tipo": "interproximal"})
    assert client.post(f"/curation/{ref.id}", headers=cab, json={}).status_code in (200, 201)
    db.expire_all()
    assert db.query(Curation).filter(Curation.orthanc_reference_id == ref.id).one().tipo_radiografia == "interproximal"


def test_triada_aparece_na_fila_com_o_tipo_novo(client, criar_usuario, criar_referencia, db):
    cab = _cab(client, criar_usuario)
    ref = _na_fila(criar_referencia, db)
    client.post("/curation/triagem", headers=cab, json={"orthanc_reference_ids": [ref.id], "tipo": "oclusal"})
    ids, skip = set(), 0
    while True:
        dados = client.get("/curation/pending", headers=cab, params={"tipo": "oclusal", "limit": 200, "skip": skip}).json()
        ids |= {i["orthanc_reference_id"] for i in dados["itens"]}
        skip += 200
        if skip >= dados["total_pendentes"]:
            break
    assert ref.id in ids


# CORRIGIR UMA MODALIDADE (pedido do Luciano, 23/11/2026): "um curador
# classificou a imagem como interproximal mas e uma periapical, entao ele
# precisara remove-la para periapical". A triagem tambem tira da modalidade
# errada e poe na certa.
def test_corrigir_imagem_que_estava_na_modalidade_errada(client, criar_usuario, criar_referencia, db):
    cab = _cab(client, criar_usuario)
    errada = _na_fila(criar_referencia, db, "interproximal")
    errada.tipo_preliminar_origem = "triagem"
    db.commit()
    r = client.post("/curation/triagem", headers=cab, json={"orthanc_reference_ids": [errada.id], "tipo": "periapical"})
    assert r.json() == {"alteradas": 1, "ignoradas": 0}
    db.expire_all()
    assert db.get(OrthancReference, errada.id).tipo_preliminar == "periapical"


def test_sugestao_do_professor_na_fila_tambem_e_corrigida(client, criar_usuario, criar_referencia, db):
    """A sugestao enviada pelo professor fica na fila com o tipo da ficha
    dele; a triagem corrige a ficha (e registra no historico)."""
    from datetime import datetime, timezone

    from app.modules.curations import CurationHistory, StatusCuradoria

    cab = _cab(client, criar_usuario)
    professor = criar_usuario(perfil=UserRole.professor)
    ref = _na_fila(criar_referencia, db, "interproximal")
    ficha = Curation(
        orthanc_reference_id=ref.id, tipo_radiografia="interproximal", status=StatusCuradoria.EM_ANALISE.value,
        sugerida_por_id=professor.id, sugestao_enviada_em=datetime.now(timezone.utc), curador_id=None,
    )
    db.add(ficha)
    db.commit()
    try:
        r = client.post("/curation/triagem", headers=cab, json={"orthanc_reference_ids": [ref.id], "tipo": "periapical"})
        assert r.json() == {"alteradas": 1, "ignoradas": 0}
        db.expire_all()
        assert db.get(Curation, ficha.id).tipo_radiografia == "periapical"
        assert db.get(OrthancReference, ref.id).tipo_preliminar == "periapical"
        historico = db.query(CurationHistory).filter(CurationHistory.curation_id == ficha.id).all()
        assert any(h.acao == "triagem_modalidade" and "interproximal" in h.justificativa and "periapical" in h.justificativa for h in historico)
    finally:
        db.query(CurationHistory).filter(CurationHistory.curation_id == ficha.id).delete()
        db.delete(db.get(Curation, ficha.id))
        db.commit()
