"""
SUGESTOES DE MELHORIA DO SISTEMA (30/10/2026).

Qualquer usuario logado envia uma sugestao (texto + contato opcional). O
nome e o PERFIL de quem enviou (aluno/estudante, professor, pesquisador,
curador...) sao gravados automaticamente, a partir do login - o perfil fica
"congelado" na sugestao, mesmo que a pessoa mude de perfil depois.

So o ADMINISTRADOR ve a lista completa (ordem de chegada) e muda o
andamento: recebida -> em analise -> feita / nao sera feita (com motivo).
Cada pessoa ve apenas as proprias sugestoes e o andamento delas.

Rotas:
- POST  /sugestoes             -> envia (qualquer perfil logado)
- GET   /sugestoes/minhas      -> as minhas, mais novas primeiro
- GET   /sugestoes             -> todas (so administrador), mais antigas primeiro
- PATCH /sugestoes/{id}        -> muda o andamento (so administrador)
Tudo fica na auditoria (sugestao_enviada, sugestao_andamento_alterado).
"""

import enum
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Session, relationship
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime

from app.core.database import Base, get_db
from app.core.rate_limit import LIMITE_SUGESTAO, limiter
from app.modules.audit_logs import AuditLog
from app.modules.auth import PERFIS_ADMIN, exigir_perfis, obter_usuario_atual
from app.modules.users import User


class AndamentoSugestao(str, enum.Enum):
    RECEBIDA = "recebida"
    EM_ANALISE = "em_analise"
    FEITA = "feita"
    NAO_SERA_FEITA = "nao_sera_feita"


class Sugestao(Base):
    __tablename__ = "sugestoes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # perfil de quem enviou, no momento do envio
    perfil: Mapped[str] = mapped_column(String(20), nullable=False)
    texto: Mapped[str] = mapped_column(Text, nullable=False)
    contato: Mapped[str | None] = mapped_column(String(200), nullable=True)
    andamento: Mapped[str] = mapped_column(String(20), nullable=False, default=AndamentoSugestao.RECEBIDA.value, index=True)
    motivo: Mapped[str | None] = mapped_column(Text, nullable=True)
    criado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    atualizado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    atualizado_por_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)

    usuario = relationship("User", foreign_keys=[usuario_id])


router = APIRouter(prefix="/sugestoes", tags=["Sugestões de melhoria"])


class SugestaoNova(BaseModel):
    texto: str = Field(min_length=1, max_length=4000)
    contato: Optional[str] = Field(default=None, max_length=200)

    @field_validator("texto")
    @classmethod
    def _texto(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 5:
            raise ValueError("Escreva a sugestão com pelo menos 5 caracteres.")
        return v

    @field_validator("contato")
    @classmethod
    def _contato(cls, v: Optional[str]) -> Optional[str]:
        v = (v or "").strip()
        return v or None


class MudancaAndamento(BaseModel):
    andamento: AndamentoSugestao
    motivo: Optional[str] = Field(default=None, max_length=2000)


def _perfil(usuario: User) -> str:
    return usuario.perfil.value if hasattr(usuario.perfil, "value") else str(usuario.perfil)


def _dados(s: Sugestao, completo: bool) -> dict:
    dados = {
        "id": s.id,
        "texto": s.texto,
        "andamento": s.andamento,
        "motivo": s.motivo,
        "criado_em": s.criado_em.isoformat() if s.criado_em else None,
        "atualizado_em": s.atualizado_em.isoformat() if s.atualizado_em else None,
    }
    if completo:
        dados.update({
            "perfil": s.perfil,
            "nome": s.usuario.nome if s.usuario else None,
            "contato": s.contato,
        })
    return dados


@router.post("")
@limiter.limit(LIMITE_SUGESTAO)
def enviar_sugestao(
    request: Request,
    dados: SugestaoNova,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    s = Sugestao(usuario_id=usuario.id, perfil=_perfil(usuario), texto=dados.texto, contato=dados.contato)
    db.add(s)
    db.flush()
    db.add(AuditLog(usuario_id=usuario.id, acao="sugestao_enviada", entidade="sugestao", entidade_id=s.id,
                    resultado="sucesso", detalhes=f"perfil={s.perfil}"))
    db.commit()
    db.refresh(s)
    return _dados(s, completo=False)


@router.get("/minhas")
def minhas_sugestoes(usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    lista = (
        db.query(Sugestao).filter(Sugestao.usuario_id == usuario.id)
        .order_by(Sugestao.criado_em.desc(), Sugestao.id.desc()).limit(200).all()
    )
    return {"sugestoes": [_dados(s, completo=False) for s in lista]}


@router.get("")
def todas_as_sugestoes(
    andamento: Optional[AndamentoSugestao] = None,
    usuario: User = Depends(exigir_perfis(*PERFIS_ADMIN)),
    db: Session = Depends(get_db),
):
    consulta = db.query(Sugestao)
    if andamento is not None:
        consulta = consulta.filter(Sugestao.andamento == andamento.value)
    lista = consulta.order_by(Sugestao.criado_em.asc(), Sugestao.id.asc()).limit(1000).all()
    return {"sugestoes": [_dados(s, completo=True) for s in lista]}


@router.patch("/{sugestao_id}")
def mudar_andamento(
    sugestao_id: int,
    dados: MudancaAndamento,
    usuario: User = Depends(exigir_perfis(*PERFIS_ADMIN)),
    db: Session = Depends(get_db),
):
    s = db.query(Sugestao).filter(Sugestao.id == sugestao_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Sugestão não encontrada.")
    motivo = (dados.motivo or "").strip() or None
    if dados.andamento == AndamentoSugestao.NAO_SERA_FEITA and not motivo:
        raise HTTPException(status_code=422, detail="Informe o motivo de a sugestão não ser feita.")
    anterior = s.andamento
    s.andamento = dados.andamento.value
    s.motivo = motivo
    s.atualizado_em = func.now()
    s.atualizado_por_id = usuario.id
    db.add(AuditLog(usuario_id=usuario.id, acao="sugestao_andamento_alterado", entidade="sugestao",
                    entidade_id=s.id, resultado="sucesso", detalhes=f"{anterior} -> {s.andamento}"))
    db.commit()
    db.refresh(s)
    return _dados(s, completo=True)
