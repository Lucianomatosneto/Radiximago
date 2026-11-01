"""
Contagens entre telas (01/11/2026 - QA item 9).

Relatorios = todas as imagens ativas; Imagens recebidas "Aguardando
curadoria" = sem ficha + pendentes + em analise; fila da Curadoria = so as
SEM ficha e ja sem moldura. A diferenca (imagens que esperam o recorte da
moldura) agora vem da API e a tela explica.
"""

import uuid

from app.modules.geometria_imagem import RECORTADA
from app.modules.orthanc_references import OrthancReference
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


def _ref(db, enquadramento):
    m = uuid.uuid4().hex[:12]
    ref = OrthancReference(
        orthanc_id=f"suite-fake-{m}", study_instance_uid=f"1.2.suite.{m}",
        series_instance_uid=f"1.2.suite.serie.{m}", sop_instance_uid=f"1.2.suite.sop.{m}",
        resource_type="instance", ativo=True, enquadramento=enquadramento,
    )
    db.add(ref)
    db.commit()
    db.refresh(ref)
    return ref


def test_fila_informa_quantas_aguardam_recorte(client, db, criar_usuario):
    h = cabecalho_auth(obter_token(client, criar_usuario(perfil=UserRole.curador).email))
    antes = client.get("/curation/pending", headers=h).json()
    pronta, sem_recorte = _ref(db, RECORTADA), _ref(db, None)
    try:
        depois = client.get("/curation/pending", headers=h).json()
        assert depois["total_pendentes"] == antes["total_pendentes"] + 1
        assert depois["aguardando_recorte"] == antes["aguardando_recorte"] + 1

        lista = {i["id"]: i for i in client.get("/images/", headers=h).json()}
        assert lista[pronta.id]["aguarda_recorte"] is False
        assert lista[sem_recorte.id]["aguarda_recorte"] is True
    finally:
        db.delete(pronta)
        db.delete(sem_recorte)
        db.commit()
