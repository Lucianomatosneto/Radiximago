"""
SESSOES DE LOGIN (OWASP ASVS 5.0 - 7.2.4, 7.4.1, 7.4.3).

PROBLEMA QUE RESOLVE: o "cracha" de login (JWT) e autossuficiente - o
servidor so conferia a assinatura e a validade. Assim, "Sair" apenas
apagava o cookie: uma copia do token continuava valendo ate expirar, e um
novo login nao invalidava o anterior.

COMO FUNCIONA: cada login cria uma linha nesta tabela, com um identificador
aleatorio (o "jti" do token). A cada pedido, o servidor confere se a sessao
daquele token continua ABERTA (obter_usuario_atual, em auth.py).
- Sair: fecha a sessao atual.
- Novo login no mesmo navegador: fecha a sessao que estava no cookie.
- Trocar a senha: fecha as sessoes dos OUTROS aparelhos (mantem a atual).
- Redefinir a senha (esqueci a senha): fecha TODAS as sessoes.
Sessoes simultaneas em aparelhos diferentes sao permitidas (ex.: computador
da clinica e notebook) - ver docs/SEGURANCA.md.

Nada de dado pessoal fica aqui alem do id do usuario e horarios.
"""

import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from app.core.database import Base

# sessoes encerradas ou antigas sao apagadas depois deste prazo (limpeza)
DIAS_GUARDAR_SESSOES = 30


class SessaoUsuario(Base):
    __tablename__ = "sessoes_usuario"

    # identificador aleatorio de 256 bits (vai no token como "jti")
    id = Column(String(64), primary_key=True)
    usuario_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    criada_em = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    encerrada_em = Column(DateTime(timezone=True), nullable=True)
    # logout | novo_login | troca_senha | redefinicao_senha
    motivo_encerramento = Column(String(30), nullable=True)


def abrir_sessao(db: Session, usuario_id: int) -> str:
    """Cria a sessao e devolve o identificador (jti). Aproveita para apagar
    sessoes antigas do mesmo usuario (a tabela nao cresce sem limite)."""
    limite = datetime.now(timezone.utc) - timedelta(days=DIAS_GUARDAR_SESSOES)
    db.query(SessaoUsuario).filter(
        SessaoUsuario.usuario_id == usuario_id, SessaoUsuario.criada_em < limite
    ).delete(synchronize_session=False)
    jti = secrets.token_urlsafe(32)
    db.add(SessaoUsuario(id=jti, usuario_id=usuario_id))
    return jti


def sessao_aberta(db: Session, jti: str | None, usuario_id: int) -> bool:
    if not jti:
        return False
    sessao = db.get(SessaoUsuario, jti)
    return bool(sessao and sessao.usuario_id == usuario_id and sessao.encerrada_em is None)


def encerrar_sessao(db: Session, jti: str | None, motivo: str) -> None:
    if not jti:
        return
    sessao = db.get(SessaoUsuario, jti)
    if sessao and sessao.encerrada_em is None:
        sessao.encerrada_em = datetime.now(timezone.utc)
        sessao.motivo_encerramento = motivo


def encerrar_sessoes_do_usuario(db: Session, usuario_id: int, motivo: str, exceto_jti: str | None = None) -> int:
    """Fecha todas as sessoes abertas do usuario (menos `exceto_jti`).
    Devolve quantas foram fechadas."""
    consulta = db.query(SessaoUsuario).filter(
        SessaoUsuario.usuario_id == usuario_id, SessaoUsuario.encerrada_em.is_(None)
    )
    if exceto_jti:
        consulta = consulta.filter(SessaoUsuario.id != exceto_jti)
    return consulta.update(
        {SessaoUsuario.encerrada_em: datetime.now(timezone.utc), SessaoUsuario.motivo_encerramento: motivo},
        synchronize_session=False,
    )
