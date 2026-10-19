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

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from app.core.contexto_pedido import pedido_atual
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
    # logout | novo_login | troca_senha | redefinicao_senha | pelo_usuario |
    # pelo_administrador | administrador_todas
    motivo_encerramento = Column(String(30), nullable=True)
    # de onde a sessao foi aberta (ASVS 7.5.2) - so o RESUMO do aparelho
    ip = Column(String(45), nullable=True)
    aparelho = Column(String(80), nullable=True)
    ultimo_uso = Column(DateTime(timezone=True), nullable=True)


def abrir_sessao(db: Session, usuario_id: int) -> str:
    """Cria a sessao e devolve o identificador (jti). Aproveita para apagar
    sessoes antigas do mesmo usuario (a tabela nao cresce sem limite)."""
    limite = datetime.now(timezone.utc) - timedelta(days=DIAS_GUARDAR_SESSOES)
    db.query(SessaoUsuario).filter(
        SessaoUsuario.usuario_id == usuario_id, SessaoUsuario.criada_em < limite
    ).delete(synchronize_session=False)
    jti = secrets.token_urlsafe(32)
    pedido = pedido_atual.get() or {}
    db.add(SessaoUsuario(
        id=jti, usuario_id=usuario_id, ip=pedido.get("ip"),
        aparelho=resumo_do_aparelho(pedido.get("navegador")), ultimo_uso=datetime.now(timezone.utc),
    ))
    return jti


def resumo_do_aparelho(navegador: str | None) -> str | None:
    """Ex.: "Chrome · Windows" (neutro: serve para a tela em qualquer idioma). Guarda so isso - nunca o texto completo
    do navegador, que ajuda a rastrear pessoas (minimizacao, LGPD)."""
    if not navegador:
        return None
    n = navegador.lower()
    programa = next((nome for chave, nome in (
        ("edg/", "Edge"), ("opr/", "Opera"), ("firefox/", "Firefox"), ("chrome/", "Chrome"),
        ("safari/", "Safari"), ("curl/", "curl"), ("python", "programa Python"),
    ) if chave in n), "outro navegador")
    sistema = next((nome for chave, nome in (
        ("android", "Android"), ("iphone", "iPhone"), ("ipad", "iPad"), ("windows", "Windows"),
        ("mac os", "Mac"), ("linux", "Linux"),
    ) if chave in n), None)
    return f"{programa} · {sistema}" if sistema else programa


def identificador_publico(jti: str) -> str:
    """O que a tela mostra/usa para escolher uma sessao: um resumo do jti,
    nunca o jti em si (que identifica a sessao no servidor)."""
    return hashlib.sha256(jti.encode("utf-8")).hexdigest()[:16]


def sessoes_abertas(db: Session, usuario_id: int) -> list["SessaoUsuario"]:
    return (
        db.query(SessaoUsuario)
        .filter(SessaoUsuario.usuario_id == usuario_id, SessaoUsuario.encerrada_em.is_(None))
        .order_by(SessaoUsuario.criada_em.desc())
        .all()
    )


def registrar_uso(db: Session, jti: str) -> None:
    """Atualiza o "ultimo uso" no maximo a cada 5 minutos (evita gravar no
    banco a cada clique)."""
    sessao = db.get(SessaoUsuario, jti)
    agora = datetime.now(timezone.utc)
    if sessao and (sessao.ultimo_uso is None or agora - sessao.ultimo_uso > timedelta(minutes=5)):
        sessao.ultimo_uso = agora
        db.commit()


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
