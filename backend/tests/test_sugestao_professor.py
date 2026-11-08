"""
Etapa C, parte 2 (08/11/2026 - decisao do Luciano): o professor usa a tela de
Curadoria SO nas imagens que ele enviou, preenche a ficha e escolhe "Enviar
ao curador" ou "Guardar em Minhas imagens". So o curador aprova (publica).
"""

import uuid

import pytest

from app.modules.achados import Achado
from app.modules.curations import Curation, CurationHistory
from app.modules.orthanc_references import OrthancReference
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


@pytest.fixture()
def imagens(db):
    criadas: list[int] = []

    def _nova(dono_id, destino="fila"):
        m = uuid.uuid4().hex[:12]
        ref = OrthancReference(orthanc_id=f"suite-fake-{m}", study_instance_uid=f"1.2.suite.{m}",
                               resource_type="instance", ativo=True, enquadramento="sem_borda",
                               enviado_por_id=dono_id, destino=destino)
        db.add(ref)
        db.commit()
        criadas.append(ref.id)
        return ref

    yield _nova
    for rid in criadas:
        for f in db.query(Curation).filter(Curation.orthanc_reference_id == rid):
            db.query(Achado).filter(Achado.curation_id == f.id).delete()
            db.query(CurationHistory).filter(CurationHistory.curation_id == f.id).delete()
            db.delete(f)
        db.commit()
        ref = db.get(OrthancReference, rid)
        if ref:
            db.delete(ref)
    db.commit()


def _cab(client, u):
    from app.main import app
    app.state.limiter.reset()
    return cabecalho_auth(obter_token(client, u.email))


def test_professor_marca_so_as_proprias_e_envia_ao_curador(client, criar_usuario, imagens):
    prof, outro, curador = (criar_usuario(perfil=UserRole.professor), criar_usuario(perfil=UserRole.professor),
                            criar_usuario(perfil=UserRole.curador))
    cab, cab_outro, cab_cur = _cab(client, prof), _cab(client, outro), _cab(client, curador)
    minha, alheia = imagens(prof.id), imagens(outro.id)

    fila = client.get("/curation/professor/fila", headers=cab)
    assert fila.status_code == 200, fila.text
    ids = {i["orthanc_reference_id"] for i in fila.json()["itens"]}
    assert minha.id in ids and alheia.id not in ids
    assert client.post(f"/curation/{alheia.id}", headers=cab, json={"tipo_radiografia": "periapical"}).status_code == 404

    r = client.post(f"/curation/{minha.id}", headers=cab, json={"tipo_radiografia": "periapical"})
    assert r.status_code == 200, r.text
    cid = r.json()["curation_id"]
    assert r.json()["sugerida_por_id"] == prof.id
    # abrir de novo devolve o mesmo rascunho
    assert client.post(f"/curation/{minha.id}", headers=cab, json={"tipo_radiografia": "periapical"}).json()["curation_id"] == cid
    assert client.patch(f"/curation/{cid}", headers=cab, json={"descricao_didatica": "Lesao periapical no 46"}).status_code == 200
    assert client.post(f"/curation/{cid}/achados", headers=cab,
                       json={"tipo": "lesao_periapical", "dentes": [46]}).status_code in (200, 422)

    # o rascunho e so dele: outro professor e o curador nao veem; ninguem aprova
    assert client.get(f"/curation/{cid}", headers=cab_outro).status_code == 404
    assert client.get(f"/curation/{cid}", headers=cab_cur).status_code == 404
    assert minha.id not in {i["orthanc_reference_id"] for i in client.get("/curation/pending?limit=200", headers=cab_cur).json()["itens"]}
    assert client.post(f"/curation/{cid}/approve", headers=cab, json={"anonimizacao_validada": True}).status_code == 403

    r = client.post(f"/curation/{cid}/enviar-sugestao", headers=cab)
    assert r.status_code == 200, r.text
    assert client.patch(f"/curation/{cid}", headers=cab, json={"descricao_didatica": "x"}).status_code == 409
    pend = client.get("/curation/pending?limit=200", headers=cab_cur).json()["itens"]
    item = [i for i in pend if i["orthanc_reference_id"] == minha.id][0]
    assert item["curation_id"] == cid and item["sugerida_por"] == prof.nome

    # o curador abre: assume a ficha e encontra o que o professor escreveu
    r = client.post(f"/curation/{minha.id}", headers=cab_cur, json={"tipo_radiografia": "periapical"})
    assert r.status_code == 200 and r.json()["curation_id"] == cid
    ficha = client.get(f"/curation/{cid}", headers=cab_cur).json()
    assert ficha["descricao_didatica"] == "Lesao periapical no 46" and ficha["curador_id"] == curador.id
    assert minha.id not in {i["orthanc_reference_id"] for i in client.get("/curation/pending?limit=200", headers=cab_cur).json()["itens"]}
    assert client.patch(f"/curation/{cid}", headers=cab_cur, json={"descricao_didatica": "Corrigida pelo curador"}).status_code == 200


def test_professor_guarda_em_minhas_imagens(client, criar_usuario, imagens, db):
    prof, curador = criar_usuario(perfil=UserRole.professor), criar_usuario(perfil=UserRole.curador)
    cab, cab_cur = _cab(client, prof), _cab(client, curador)
    ref = imagens(prof.id)
    cid = client.post(f"/curation/{ref.id}", headers=cab, json={"tipo_radiografia": "panoramica"}).json()["curation_id"]
    assert client.post(f"/curation/{cid}/guardar-para-mim", headers=cab).status_code == 200
    db.expire_all()
    assert db.get(OrthancReference, ref.id).destino == "pessoal"
    meus = client.get("/envios/meus", headers=cab).json()["itens"]
    assert [i["situacao"] for i in meus if i["id"] == ref.id] == ["so_para_mim"]
    # continua editavel e pode ir ao curador depois
    assert client.patch(f"/curation/{cid}", headers=cab, json={"descricao_didatica": "depois"}).status_code == 200
    assert ref.id in {i["orthanc_reference_id"] for i in client.get("/curation/professor/fila", headers=cab).json()["itens"]}
    assert client.post(f"/curation/{cid}/enviar-sugestao", headers=cab).status_code == 200
    db.expire_all()
    assert db.get(OrthancReference, ref.id).destino == "fila"
    assert ref.id in {i["orthanc_reference_id"] for i in client.get("/curation/pending?limit=200", headers=cab_cur).json()["itens"]}


def test_estudante_nao_usa_a_curadoria(client, criar_usuario, imagens):
    aluno = criar_usuario()
    ref = imagens(aluno.id, destino="pessoal")
    cab = _cab(client, aluno)
    assert client.get("/curation/professor/fila", headers=cab).status_code == 403
    assert client.post(f"/curation/{ref.id}", headers=cab, json={"tipo_radiografia": "periapical"}).status_code == 403
