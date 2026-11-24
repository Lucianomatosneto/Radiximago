"""
RESULTADOS DO MODO DESAFIO PARA A PESQUISA (pedido do Luciano, 24/11/2026:
"vamos inserir no sistema, mas nao vou rodar ate que consigamos o TCLE").

O modo desafio (tela da tomografia aprovada) mostra ao estudante quantas
lesoes ele encontrou. Guardar esse resultado serve para MEDIR O APRENDIZADO
na pesquisa do mestrado - mas sao dados de estudantes (pessoas), entao so
podem ser guardados com o TCLE (Termo de Consentimento Livre e Esclarecido)
aprovado pelo comite de etica e com o consentimento de CADA estudante
(LGPD, art. 7, I e art. 11, II, c / Resolucao CNS 510/2016).

Duas travas, as duas no servidor:
1. DESAFIO_REGISTRO_ATIVO (configuracao) - desligado por padrao;
2. TCLE_PESQUISA_VERSAO (configuracao) preenchida E o estudante com o
   consentimento DESSA versao aceito e nao revogado.
Faltando qualquer uma, o resultado e descartado (nada e gravado).

Minimizacao (LGPD art. 6, III): guarda so contagens - total de lesoes,
quantas encontrou e quantos palpites - sem as coordenadas dos cliques.
Apagar a conta do estudante (ou a ficha) apaga os resultados (CASCADE).
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.core.config import settings
from app.core.database import Base, get_db
from app.modules.audit_logs import AuditLog
from app.modules.auth import obter_usuario_atual
from app.modules.users import User


class ConsentimentoPesquisa(Base):
    """Aceite do TCLE da pesquisa por um usuario (uma linha por versao)."""

    __tablename__ = "consentimentos_pesquisa"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    versao_tcle: Mapped[str] = mapped_column(String(20), nullable=False)
    aceito_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    revogado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ResultadoDesafio(Base):
    """Resultado de uma rodada do modo desafio (so contagens)."""

    __tablename__ = "resultados_desafio"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    curation_id: Mapped[int] = mapped_column(Integer, ForeignKey("curations.id", ondelete="CASCADE"), nullable=False, index=True)
    total_lesoes: Mapped[int] = mapped_column(Integer, nullable=False)
    encontradas: Mapped[int] = mapped_column(Integer, nullable=False)
    palpites: Mapped[int] = mapped_column(Integer, nullable=False)
    versao_tcle: Mapped[str] = mapped_column(String(20), nullable=False)
    criado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())


router = APIRouter(prefix="/desafio", tags=["Modo desafio (pesquisa)"])


class ResultadoEntrada(BaseModel):
    total_lesoes: int = Field(..., ge=1, le=500)
    encontradas: int = Field(..., ge=0, le=500)
    palpites: int = Field(..., ge=0, le=502)

    @model_validator(mode="after")
    def _coerente(self):
        if self.encontradas > self.total_lesoes:
            raise ValueError("Encontradas nao pode passar do total de lesoes.")
        if self.palpites > self.total_lesoes + 2:
            raise ValueError("Palpites acima do permitido (lesoes + 2).")
        return self


def _consentimento_vigente(db: Session, usuario_id: int, versao: str) -> ConsentimentoPesquisa | None:
    return (
        db.query(ConsentimentoPesquisa)
        .filter(
            ConsentimentoPesquisa.usuario_id == usuario_id,
            ConsentimentoPesquisa.versao_tcle == versao,
            ConsentimentoPesquisa.revogado_em.is_(None),
        )
        .first()
    )


@router.post("/{curation_id}/resultado")
def registrar_resultado(
    curation_id: int,
    dados: ResultadoEntrada,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """Recebe o resultado de uma rodada; so GRAVA com as duas travas abertas
    (registro ligado + TCLE configurado e aceito pelo usuario). Senao
    descarta e diz o motivo."""
    from app.modules.search_router import _buscar_ficha_aprovada

    ficha = _buscar_ficha_aprovada(db, curation_id)
    if not settings.DESAFIO_REGISTRO_ATIVO:
        return {"registrado": False, "motivo": "registro_desligado"}
    versao = settings.TCLE_PESQUISA_VERSAO.strip()
    if not versao:
        return {"registrado": False, "motivo": "tcle_indisponivel"}
    if not _consentimento_vigente(db, usuario.id, versao):
        return {"registrado": False, "motivo": "sem_consentimento"}
    db.add(ResultadoDesafio(
        usuario_id=usuario.id, curation_id=ficha.id, total_lesoes=dados.total_lesoes,
        encontradas=dados.encontradas, palpites=dados.palpites, versao_tcle=versao,
    ))
    db.commit()
    return {"registrado": True, "motivo": None}


@router.get("/consentimento")
def situacao_consentimento(usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    versao = settings.TCLE_PESQUISA_VERSAO.strip()
    return {
        "versao_tcle": versao or None,
        "aceito": bool(versao) and _consentimento_vigente(db, usuario.id, versao) is not None,
        "registro_ativo": settings.DESAFIO_REGISTRO_ATIVO,
    }


@router.post("/consentimento", status_code=201)
def aceitar_consentimento(usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    versao = settings.TCLE_PESQUISA_VERSAO.strip()
    if not versao:
        raise HTTPException(status_code=409, detail="O TCLE da pesquisa ainda não está disponível.")
    if not _consentimento_vigente(db, usuario.id, versao):
        db.add(ConsentimentoPesquisa(usuario_id=usuario.id, versao_tcle=versao))
        db.add(AuditLog(
            usuario_id=usuario.id, acao="consentimento_pesquisa_aceito", entidade="user", entidade_id=usuario.id,
            resultado="sucesso", detalhes=f"Aceitou o TCLE da pesquisa (versão {versao}).",
        ))
        db.commit()
    return {"versao_tcle": versao, "aceito": True}


@router.delete("/consentimento")
def revogar_consentimento(usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    vigentes = (
        db.query(ConsentimentoPesquisa)
        .filter(ConsentimentoPesquisa.usuario_id == usuario.id, ConsentimentoPesquisa.revogado_em.is_(None))
        .all()
    )
    agora = datetime.now(timezone.utc)
    for c in vigentes:
        c.revogado_em = agora
    if vigentes:
        db.add(AuditLog(
            usuario_id=usuario.id, acao="consentimento_pesquisa_revogado", entidade="user", entidade_id=usuario.id,
            resultado="sucesso", detalhes="Revogou o consentimento da pesquisa (novos resultados deixam de ser guardados).",
        ))
    db.commit()
    return {"aceito": False}
