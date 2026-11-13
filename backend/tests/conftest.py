"""
Fixtures compartilhadas da suite.

Roda contra o banco de dados de verdade (mesmo Postgres do docker-compose,
nao um banco sqlite/em memoria) porque o app usa recursos especificos do
Postgres (ARRAY, .overlap()). Por isso: cada teste cria seus proprios
usuarios/fichas com identificadores unicos (uuid) e os remove no teardown -
nunca reaproveita nem apaga dados que ja existiam no banco.

Roda de dentro do container radix-api, mas NUM BANCO SEPARADO (B3 da
auditoria do administrador, 01/11/2026):
    docker compose exec radix-api python scripts/rodar_testes.py
O script cria/usa <banco>_teste. Rodar `pytest` direto apontando para o
banco do sistema e RECUSADO logo abaixo (antes deixava usuarios e registros
de teste misturados com os dados reais).
"""

import os
import re
import sys

from sqlalchemy.engine import make_url

from app.core.config import settings as _config


def _banco_e_de_teste(url: str) -> bool:
    return bool(re.search(r"test", make_url(url).database or "", re.IGNORECASE))


if not _banco_e_de_teste(_config.DATABASE_URL) and os.environ.get("RADIX_PERMITIR_TESTES_NO_BANCO") != "sim":
    sys.exit(
        "RECUSADO: os testes nao rodam no banco do sistema "
        f"({make_url(_config.DATABASE_URL).database}). Use: "
        "docker compose exec radix-api python scripts/rodar_testes.py"
    )

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import text
from fastapi.testclient import TestClient

from app.main import app
from app.core.database import SessionLocal
from app.core.security import gerar_hash_senha
from app.modules.users import User, UserRole
from app.modules.curations import Curation, CurationHistory, CurationReview, CurationReviewNote, StatusCuradoria
from app.modules.orthanc_references import OrthancReference
from app.modules.saved_images import SavedImage
from app.modules.compartilhamentos import CompartilhamentoImagem
from app.modules.anotacoes import AnotacaoImagem
from app.modules.macros import FraseAprendida, MacroCuradoria
from app.modules.vocabulario import CurationTermo, TermoVocabulario
from app.modules.audit_logs import AuditLog
from app.modules.sessoes import SessaoUsuario
from app.modules.access_requests import AccessRequest, IntencaoPerfil
from app.modules.sugestoes import Sugestao

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
        from app.modules.prancha_envios import PranchaEnviada
        db.query(PranchaEnviada).filter(
            (PranchaEnviada.remetente_id == usuario_id) | (PranchaEnviada.destinatario_id == usuario_id)
        ).delete(synchronize_session=False)
        db.query(CurationTermo).filter(CurationTermo.vinculado_por_id == usuario_id).delete()
        db.query(MacroCuradoria).filter(MacroCuradoria.criado_por_id == usuario_id).delete()
        db.query(FraseAprendida).filter(FraseAprendida.criado_por_id == usuario_id).delete()
        db.query(TermoVocabulario).filter(TermoVocabulario.criado_por_id == usuario_id).delete()
        db.query(CompartilhamentoImagem).filter(
            (CompartilhamentoImagem.remetente_id == usuario_id) | (CompartilhamentoImagem.destinatario_id == usuario_id)
        ).delete(synchronize_session=False)
        db.query(AnotacaoImagem).filter(AnotacaoImagem.usuario_id == usuario_id).delete()
        db.query(SavedImage).filter(SavedImage.user_id == usuario_id).delete()
        db.query(Sugestao).filter(Sugestao.atualizado_por_id == usuario_id).update({"atualizado_por_id": None})
        db.query(Sugestao).filter(Sugestao.usuario_id == usuario_id).delete()
        # a auditoria e protegida contra apagamento (gatilho, ASVS 16.4.2): so a
        # LIMPEZA DOS TESTES desliga os gatilhos, e so nesta transacao
        db.execute(text("SET LOCAL session_replication_role = replica"))
        db.query(AuditLog).filter(AuditLog.usuario_id == usuario_id).delete()
        db.query(SessaoUsuario).filter(SessaoUsuario.usuario_id == usuario_id).delete()
        db.query(CurationHistory).filter(CurationHistory.usuario_id == usuario_id).delete()
        dele = db.query(CurationReview.id).filter(
            (CurationReview.solicitante_id == usuario_id) | (CurationReview.revisor_id == usuario_id)
        )
        db.query(CurationReviewNote).filter(
            (CurationReviewNote.review_id.in_(dele.scalar_subquery())) | (CurationReviewNote.resolvido_por == usuario_id)
        ).delete(synchronize_session=False)
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
        db.query(CompartilhamentoImagem).filter(CompartilhamentoImagem.curation_id == curation_id).delete()
        db.query(AnotacaoImagem).filter(AnotacaoImagem.curation_id == curation_id).delete()
        db.query(SavedImage).filter(SavedImage.curation_id == curation_id).delete()
        db.query(CurationReviewNote).filter(CurationReviewNote.review_id.in_(
            db.query(CurationReview.id).filter(CurationReview.curation_id == curation_id).scalar_subquery()
        )).delete(synchronize_session=False)
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
            db.query(CurationReviewNote).filter(CurationReviewNote.review_id.in_(
                db.query(CurationReview.id).filter(CurationReview.curation_id == curation_id).scalar_subquery()
            )).delete(synchronize_session=False)
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
        email_confirmado: bool = True,
    ) -> AccessRequest:
        email_final = email or f"suite-solicitacao-{uuid.uuid4().hex[:12]}@teste.example"
        solicitacao = AccessRequest(
            nome="Solicitante de Teste (suite automatizada)",
            email=email_final,
            senha_hash=_HASH_SENHA_TESTE,
            perfil_solicitado=perfil_solicitado,
            email_confirmado_em=datetime.now(timezone.utc) if email_confirmado else None,
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


def codigo_totp(segredo: str) -> str:
    """Codigo do aplicativo autenticador, sem cair na borda do intervalo.

    O servidor so aceita o codigo do intervalo atual de 30 s (MFA_TOTP_JANELA=0).
    Se o codigo fosse gerado nos ultimos 2 s do intervalo, ele poderia ser
    conferido ja no intervalo seguinte e ser recusado (teste instavel). Aqui
    espera-se o proximo intervalo quando faltar pouco - o celular de verdade
    mostra o mesmo codigo ate o fim do intervalo."""
    import time

    import pyotp

    restante = 30 - (time.time() % 30)
    if restante < 2.5:
        time.sleep(restante + 0.2)
    return pyotp.TOTP(segredo).now()


def codigo_atual_do_usuario(email: str) -> str:
    """Codigo do aplicativo autenticador da conta (o teste faz o papel do celular).
    Zera o "ultimo codigo usado" para o mesmo codigo valer em logins seguidos."""

    from app.modules import mfa

    sessao = SessionLocal()
    try:
        usuario = sessao.query(User).filter(User.email == email, User.excluido.is_(False)).first()
        usuario.totp_ultimo_passo = None
        sessao.commit()
        return codigo_totp(mfa.decifrar(usuario.totp_segredo_cifrado))
    finally:
        sessao.close()


def completar_segundo_fator(client: TestClient, email: str, resposta):
    """Login em duas etapas (app/modules/mfa.py): perfis com poder recebem um
    desafio em vez da sessao. Aqui o teste cadastra o aplicativo (1o login)
    ou digita o codigo, como a pessoa faria na tela."""

    dados = resposta.json()
    if "segundo_fator" not in dados:
        return resposta
    if dados["segundo_fator"] == "cadastro":
        cadastro = client.post("/auth/login/cadastro-mfa/iniciar", json={"desafio": dados["desafio"]})
        assert cadastro.status_code == 200, cadastro.text
        codigo = codigo_totp(cadastro.json()["segredo"])
        return client.post("/auth/login/cadastro-mfa/confirmar", json={"desafio": dados["desafio"], "codigo": codigo})
    return client.post("/auth/login/segundo-fator", json={"desafio": dados["desafio"], "codigo": codigo_atual_do_usuario(email)})


def obter_token(client: TestClient, email: str, senha: str = SENHA_TESTE) -> str:
    resposta = client.post("/auth/login", data={"username": email, "password": senha})
    assert resposta.status_code == 200, resposta.text
    resposta = completar_segundo_fator(client, email, resposta)
    assert resposta.status_code == 200, resposta.text
    # /auth/login tambem seta um cookie httpOnly (ver auth.py) - o TestClient
    # persiste cookies entre chamadas como um navegador de verdade, e
    # obter_usuario_atual le o cookie ANTES do header Authorization. Sem
    # limpar aqui, testes que logam como usuarios diferentes no mesmo
    # `client` (pra simular contas distintas) fariam a chamada seguinte
    # authenticar com o cookie do login anterior, ignorando o header
    # explicito que o teste passou de proposito.
    client.cookies.clear()
    token = resposta.json()["access_token"]
    # termo de ciencia (10/11/2026): cada login precisa do aceite antes de
    # usar o sistema - aqui o aceite e automatico; os testes do proprio
    # termo (test_termo_ciencia.py) fazem o login sem ele
    from app.modules.termo_ciencia import TERMO_CIENCIA_VERSAO
    from app.modules.termos_uso import TERMOS_VERSAO
    cab = {"Authorization": f"Bearer {token}"}
    perfil = client.get("/termos/meus", headers=cab).json()["perfil"]
    termos = client.post("/termos/aceitar", headers=cab, json={"versao": TERMOS_VERSAO, "anexo": perfil, "li_e_concordo": True})
    assert termos.status_code == 200, termos.text
    aceite = client.post("/auth/termo-ciencia/aceitar", headers={"Authorization": f"Bearer {token}"},
                         json={"versao": TERMO_CIENCIA_VERSAO, "ciente": True})
    assert aceite.status_code == 200, aceite.text
    client.cookies.clear()
    return token


def cabecalho_auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def completar_ficha(db, ficha):
    """Preenche os campos MINIMOS para a ficha poder ser aprovada (02/11/2026:
    o servidor recusa aprovacao incompleta). Usado pelos testes que aprovam."""
    ficha.dentes = ficha.dentes or [36]
    ficha.alteracoes_observadas = ficha.alteracoes_observadas or ["carie_dentina"]
    ficha.qualidade_tecnica = ficha.qualidade_tecnica or "boa"
    ficha.descricao_didatica = ficha.descricao_didatica or "Descricao didatica de teste."
    db.commit()
    return ficha
