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


def test_professor_ve_so_as_imagens_que_enviou(client, db, criar_usuario):
    """01/11/2026 (QA perfil professor): minimo necessario na lista. Desde
    08/11/2026 quem enviou fica na propria imagem (enviado_por_id)."""
    professor = criar_usuario(perfil=UserRole.professor)
    curador = criar_usuario(perfil=UserRole.curador)
    minha, alheia = _ref(db, RECORTADA), _ref(db, RECORTADA)
    minha.enviado_por_id = professor.id
    db.commit()
    try:
        ids_prof = {i["id"] for i in client.get("/images/", headers=cabecalho_auth(obter_token(client, professor.email))).json()}
        assert minha.id in ids_prof and alheia.id not in ids_prof
        ids_cur = {i["id"] for i in client.get("/images/", headers=cabecalho_auth(obter_token(client, curador.email))).json()}
        assert {minha.id, alheia.id} <= ids_cur
    finally:
        # o registro de auditoria nao pode ser apagado (ASVS 16.4.2) - fica
        db.delete(minha)
        db.delete(alheia)
        db.commit()


def test_filtro_de_anonimizacao_usa_os_valores_reais():
    """M5 (01/11/2026): o filtro oferecia 'validada', que nunca e gravado
    (o sistema grava 'concluida') - 'Validada' devolvia 0 imagens."""
    import re
    from pathlib import Path

    raiz = Path(__file__).resolve().parents[2]
    gravados = set(re.findall(r'anonimizacao_status="([a-z_]+)"', (raiz / "backend/app/modules/images_router.py").read_text()))
    gravados |= set(re.findall(r"default=\"([a-z_]+)\"", (raiz / "backend/app/modules/orthanc_references.py").read_text().split("anonimizacao_status", 1)[1][:200]))
    tela = (raiz / "frontend/src/app/imagens/page.tsx").read_text(encoding="utf-8")
    opcoes = set(re.findall(r"'([a-z_]+)'", re.search(r"OPCOES_ANONIMIZACAO = \[(.*?)\]", tela).group(1)))
    assert gravados and gravados <= opcoes, (gravados, opcoes)
