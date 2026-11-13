"""
JANELA DE ENVIO DA FOTO (Fase 1 - foto do negatoscopio pelo celular,
docs/ESPECIFICACAO_FASE1_FOTO_CELULAR.md, secao 4.2; decisoes do Luciano em
10/11/2026).

Por que existe: quem abre o envio de uma foto precisa terminar em poucos
minutos (padrao 5). Assim ninguem deixa o processo aberto e manda depois
com dados que ja nao valem (destinatario trocado, foto antiga, confirmacao
de "sem dados do paciente" feita muito antes).

Como funciona:
1. Ao tocar em "Enviar foto", a tela pede uma janela (abrir_janela). O
   servidor grava a janela no banco e devolve um COMPROVANTE ASSINADO (JWT
   com a chave do sistema, tipo proprio "janela_foto" - nao abre sessao) e a
   HORA DE TERMINO calculada pelo relogio do SERVIDOR.
2. No envio, usar_janela confere: assinatura, dono, prazo (+ tolerancia de
   rede) e se a janela ainda nao foi usada nem cancelada. O "usar" e uma
   unica instrucao UPDATE com condicao: entre dois envios simultaneos, so um
   vence (uso unico de verdade, mesmo com varios processos do servidor).
3. Se a foto for recusada por problema do ARQUIVO, liberar_janela devolve a
   janela, para a pessoa tentar de novo dentro do tempo que resta.
4. Abrir uma janela nova cancela a anterior (uma por conta).

Mudar a hora do celular nao muda nada: quem decide e o relogio do servidor.
A foto so chega ao servidor no envio final; nada fica guardado antes.
Duracao e tolerancia: settings.FOTO_JANELA_MINUTOS e
settings.FOTO_JANELA_TOLERANCIA_SEGUNDOS (.env).
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import HTTPException
from sqlalchemy import DateTime, ForeignKey, Integer, String, update
from sqlalchemy.orm import Session
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import settings
from app.core.database import Base
from app.core.security import EMISSOR_TOKEN, PUBLICO_TOKEN

TIPO_TOKEN_JANELA_FOTO = "janela_foto"
# janelas antigas sao apagadas pela limpeza diaria (app/modules/retencao.py)
DIAS_GUARDAR_JANELAS = 30


class JanelaEnvioFoto(Base):
    __tablename__ = "janelas_envio_foto"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    identificador: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)  # "jti" do comprovante
    aberta_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expira_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    usada_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelada_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class JanelaRecusada(HTTPException):
    """Comprovante invalido, vencido ou ja usado. `motivo` vai para a auditoria."""

    def __init__(self, status: int, motivo: str, mensagem: str):
        super().__init__(status_code=status, detail=mensagem)
        self.motivo = motivo


def agora() -> datetime:
    return datetime.now(timezone.utc)


def abrir_janela(db: Session, usuario_id: int) -> tuple[str, JanelaEnvioFoto]:
    """Cancela a janela aberta anterior desta conta e abre uma nova."""
    momento = agora()
    db.execute(
        update(JanelaEnvioFoto)
        .where(JanelaEnvioFoto.usuario_id == usuario_id, JanelaEnvioFoto.usada_em.is_(None),
               JanelaEnvioFoto.cancelada_em.is_(None))
        .values(cancelada_em=momento)
    )
    janela = JanelaEnvioFoto(
        usuario_id=usuario_id, identificador=secrets.token_urlsafe(24), aberta_em=momento,
        expira_em=momento + timedelta(minutes=settings.FOTO_JANELA_MINUTOS),
    )
    db.add(janela)
    db.flush()
    return assinar(janela), janela


def assinar(janela: JanelaEnvioFoto) -> str:
    """Comprovante assinado da janela (o mesmo identificador; vale ate o termino + folga)."""
    return jwt.encode(
        {"sub": str(janela.usuario_id), "jti": janela.identificador, "iss": EMISSOR_TOKEN, "aud": PUBLICO_TOKEN,
         "tipo": TIPO_TOKEN_JANELA_FOTO,
         "exp": janela.expira_em + timedelta(seconds=settings.FOTO_JANELA_TOLERANCIA_SEGUNDOS)},
        settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM,
    )


def janela_aberta(db: Session, usuario_id: int) -> JanelaEnvioFoto | None:
    """A janela ainda valendo desta conta (para a tela retomar apos recarregar).
    O navegador NAO guarda o comprovante (ASVS 14.3.3): quem lembra e o servidor."""
    return (db.query(JanelaEnvioFoto)
            .filter(JanelaEnvioFoto.usuario_id == usuario_id, JanelaEnvioFoto.usada_em.is_(None),
                    JanelaEnvioFoto.cancelada_em.is_(None), JanelaEnvioFoto.expira_em > agora())
            .order_by(JanelaEnvioFoto.id.desc()).first())


def _ler_comprovante(comprovante: str) -> dict:
    try:
        dados = jwt.decode(
            comprovante, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM],
            audience=PUBLICO_TOKEN, issuer=EMISSOR_TOKEN, options={"require": ["exp", "sub", "jti"]},
        )
    except jwt.ExpiredSignatureError as causa:
        raise JanelaRecusada(410, "tempo_esgotado", "O tempo para enviar acabou. Comece de novo.") from causa
    except jwt.PyJWTError as causa:
        raise JanelaRecusada(422, "comprovante_invalido", "Envio sem autorizacao valida. Comece de novo.") from causa
    if dados.get("tipo") != TIPO_TOKEN_JANELA_FOTO:
        raise JanelaRecusada(422, "comprovante_invalido", "Envio sem autorizacao valida. Comece de novo.")
    return dados


def usar_janela(db: Session, usuario_id: int, comprovante: str) -> JanelaEnvioFoto:
    """Confere e marca a janela como usada (uso unico). Levanta JanelaRecusada."""
    dados = _ler_comprovante(comprovante)
    if dados.get("sub") != str(usuario_id):
        raise JanelaRecusada(422, "comprovante_de_outro_usuario", "Envio sem autorizacao valida. Comece de novo.")
    momento = agora()
    limite = momento - timedelta(seconds=settings.FOTO_JANELA_TOLERANCIA_SEGUNDOS)
    marcou = db.execute(
        update(JanelaEnvioFoto)
        .where(JanelaEnvioFoto.identificador == dados["jti"], JanelaEnvioFoto.usuario_id == usuario_id,
               JanelaEnvioFoto.usada_em.is_(None), JanelaEnvioFoto.cancelada_em.is_(None),
               JanelaEnvioFoto.expira_em >= limite)
        .values(usada_em=momento)
    ).rowcount
    janela = db.query(JanelaEnvioFoto).filter(JanelaEnvioFoto.identificador == dados["jti"]).first()
    if marcou:
        db.commit()
        return janela
    db.rollback()
    if not janela or janela.usuario_id != usuario_id:
        raise JanelaRecusada(422, "comprovante_invalido", "Envio sem autorizacao valida. Comece de novo.")
    if janela.usada_em is not None:
        raise JanelaRecusada(409, "comprovante_reutilizado", "Esta foto ja foi enviada. Para outra, comece de novo.")
    if janela.cancelada_em is not None:
        raise JanelaRecusada(409, "janela_substituida", "Outro envio foi aberto depois deste. Use o mais recente.")
    raise JanelaRecusada(410, "tempo_esgotado", "O tempo para enviar acabou. Comece de novo.")


def liberar_janela(db: Session, janela: JanelaEnvioFoto) -> None:
    """A foto foi recusada pelo ARQUIVO: a janela volta a valer (dentro do prazo)."""
    db.rollback()
    db.execute(update(JanelaEnvioFoto).where(JanelaEnvioFoto.id == janela.id).values(usada_em=None))
    db.commit()
