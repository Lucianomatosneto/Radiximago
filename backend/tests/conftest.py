"""
Fixtures compartilhadas da suite.

Roda contra o banco de dados de verdade (mesmo Postgres do docker-compose,
nao um banco sqlite/em memoria) porque o app usa recursos especificos do
Postgres (ARRAY, .overlap()). Por isso: cada teste cria seus proprios
usuarios/fichas com identificadores unicos (uuid) e os remove no teardown -
nunca reaproveita nem apaga dados que ja existiam no banco.

Roda de dentro do container radix-api (`docker exec radix-api pytest`),
onde DATABASE_URL/ORTHANC_URL ja apontam pros hostnames certos da rede
Docker.
"""

import uuid
from datetime import datetime, timezone, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.database import SessionLocal
from app.core.security import gerar_hash_senha
from app.modules.users import User, UserRole
from app.modules.curations import Curation, CurationHistory, CurationReview, StatusCuradoria
from app.modules.orthanc_references import OrthancReference
from app.modules.saved_images import SavedImage
from app.modules.audit_logs import AuditLog
from app.modules.access_requests import AccessRequest, IntencaoPerfil

SENHA_TESTE = "TesteSuite123!"
# Hash bcrypt e caro (~200ms) - calculado uma unica vez pra suite inteira,
# nao uma vez por usuario criado.
_HASH_SENHA_TESTE = gerar_hash_senha(SENHA_TESTE)


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


@pytest.fixture()
def db():
    sessao = SessionLocal()
    try:
        yield sessao
    finally:
        sessao.close()


@pytest.fixture(autouse=True)
def limiter_limpo():
    """
    Zera os contadores do rate limiter (slowapi guarda em memoria, no
    processo) antes de cada teste - sem isso, testes que fazem varias
    chamadas de login/reset em sequencia vazariam limite uns pros outros,
    dependendo da ordem em que rodam.
    """
    app.state.limiter.reset()
    yield


@pytest.fixture()
def criar_usuario(db):
    """
    Fabrica de usuarios de teste. Uso:
        usuario = criar_usuario(perfil=UserRole.administrador)
    Devolve o objeto User (ja commitado, com id). Remove no teardown,
    inclusive audit_logs e saved_images que passem a referencia-lo.
    """
    criados = []

    def _criar(
        perfil: UserRole = UserRole.estudante,
        ativo: bool = True,
        bloqueado: bool = False,
        excluido: bool = False,
    ) -> User:
        email = f"suite-{uuid.uuid4().hex[:12]}@teste.example"
        usuario = User(
            nome="Usuario de Teste (suite automatizada)",
            email=email,
            senha_hash=_HASH_SENHA_TESTE,
            perfil=perfil,
            ativo=ativo,
            bloqueado=bloqueado,
            excluido=excluido,
        )
        db.add(usuario)
        db.commit()
        db.refresh(usuario)
        criados.append(usuario.id)
        return usuario

    yield _criar

    for usuario_id in criados:
        db.query(SavedImage).filter(SavedImage.user_id == usuario_id).delete()
        db.query(AuditLog).filter(AuditLog.usuario_id == usuario_id).delete()
        db.query(CurationHistory).filter(CurationHistory.usuario_id == usuario_id).delete()
        db.query(CurationReview).filter(CurationReview.solicitante_id == usuario_id).delete()
        db.query(CurationReview).filter(CurationReview.revisor_id == usuario_id).delete()
        # nao apaga a ficha em si (pode ser uma fixture gerenciada por
        # criar_ficha) - so desvincula esse usuario dela.
        db.query(Curation).filter(Curation.curador_id == usuario_id).update(
            {"curador_id": None}
        )
        db.query(AccessRequest).filter(AccessRequest.revisado_por_id == usuario_id).update(
            {"revisado_por_id": None}
        )
        db.query(User).filter(User.id == usuario_id).delete()
    db.commit()


@pytest.fixture()
def criar_ficha(db):
    """
    Fabrica de fichas de curadoria (OrthancReference + Curation) de teste.
    Uso:
        ficha = criar_ficha(status=StatusCuradoria.APROVADA, ativo=True)
    Os IDs do Orthanc sao fake (uuid) - suficiente pra testar a logica de
    filtragem do /search, que nao chama o Orthanc de verdade. Endpoints
    que de fato baixam/renderizam a imagem (preview, download) nao sao
    cobertos por fichas criadas aqui.
    """
    criadas = []

    def _criar(
        status: str = StatusCuradoria.APROVADA.value,
        ativo: bool = True,
        tipo_radiografia: str = "periapical",
        descricao_didatica: str | None = None,
    ) -> Curation:
        marcador = uuid.uuid4().hex[:12]
        ref = OrthancReference(
            orthanc_id=f"suite-fake-{marcador}",
            study_instance_uid=f"1.2.suite.{marcador}",
            series_instance_uid=f"1.2.suite.serie.{marcador}",
            sop_instance_uid=f"1.2.suite.sop.{marcador}",
            resource_type="instance",
            ativo=ativo,
        )
        db.add(ref)
        db.commit()
        db.refresh(ref)

        ficha = Curation(
            orthanc_reference_id=ref.id,
            tipo_radiografia=tipo_radiografia,
            status=status,
            descricao_didatica=descricao_didatica or f"Ficha de teste da suite {marcador}",
        )
        db.add(ficha)
        db.commit()
        db.refresh(ficha)
        criadas.append((ficha.id, ref.id))
        return ficha

    yield _criar

    for curation_id, ref_id in criadas:
        db.query(SavedImage).filter(SavedImage.curation_id == curation_id).delete()
        db.query(CurationReview).filter(CurationReview.curation_id == curation_id).delete()
        db.query(CurationHistory).filter(CurationHistory.curation_id == curation_id).delete()
        db.query(Curation).filter(Curation.id == curation_id).delete()
        db.query(OrthancReference).filter(OrthancReference.id == ref_id).delete()
    db.commit()


@pytest.fixture()
def criar_referencia(db):
    """
    Fabrica de OrthancReference "solta", sem ficha de curadoria - usada
    pra testar a criacao da ficha (POST /curation/{orthanc_reference_id}),
    que exige uma referencia existente e ainda sem ficha.
    """
    criadas = []

    def _criar(ativo: bool = True) -> OrthancReference:
        marcador = uuid.uuid4().hex[:12]
        ref = OrthancReference(
            orthanc_id=f"suite-fake-{marcador}",
            study_instance_uid=f"1.2.suite.{marcador}",
            series_instance_uid=f"1.2.suite.serie.{marcador}",
            sop_instance_uid=f"1.2.suite.sop.{marcador}",
            resource_type="instance",
            ativo=ativo,
        )
        db.add(ref)
        db.commit()
        db.refresh(ref)
        criadas.append(ref.id)
        return ref

    yield _criar

    for ref_id in criadas:
        curation_ids = [
            c.id for c in db.query(Curation).filter(Curation.orthanc_reference_id == ref_id).all()
        ]
        for curation_id in curation_ids:
            db.query(SavedImage).filter(SavedImage.curation_id == curation_id).delete()
            db.query(CurationReview).filter(CurationReview.curation_id == curation_id).delete()
            db.query(CurationHistory).filter(CurationHistory.curation_id == curation_id).delete()
        db.query(Curation).filter(Curation.orthanc_reference_id == ref_id).delete()
        db.query(OrthancReference).filter(OrthancReference.id == ref_id).delete()
    db.commit()


@pytest.fixture()
def criar_solicitacao_acesso(db):
    """
    Fabrica de solicitacoes de acesso (AccessRequest) de teste - o pedido
    "pendente" que aparece pro admin revisar em /users/access-requests.
    """
    criadas = []

    def _criar(
        perfil_solicitado: IntencaoPerfil = IntencaoPerfil.ESTUDANTE,
        email: str | None = None,
    ) -> AccessRequest:
        email_final = email or f"suite-solicitacao-{uuid.uuid4().hex[:12]}@teste.example"
        solicitacao = AccessRequest(
            nome="Solicitante de Teste (suite automatizada)",
            email=email_final,
            senha_hash=_HASH_SENHA_TESTE,
            perfil_solicitado=perfil_solicitado,
        )
        db.add(solicitacao)
        db.commit()
        db.refresh(solicitacao)
        criadas.append(solicitacao.id)
        return solicitacao

    yield _criar

    for solicitacao_id in criadas:
        db.query(AccessRequest).filter(AccessRequest.id == solicitacao_id).delete()
    db.commit()


def obter_token(client: TestClient, email: str, senha: str = SENHA_TESTE) -> str:
    resposta = client.post("/auth/login", data={"username": email, "password": senha})
    assert resposta.status_code == 200, resposta.text
    return resposta.json()["access_token"]


def cabecalho_auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
