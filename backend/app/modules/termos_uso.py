"""
TERMOS DE USO E POLITICA DE PRIVACIDADE (10/11/2026, decisoes do Luciano).

- Um documento geral (Termos de Uso), um ANEXO por perfil (estudante,
  professor, curador, pesquisador, suporte, administrador) e a Politica de
  Privacidade. Os textos ficam em app/termos_texto/*.md.
- Aceite OBRIGATORIO no primeiro acesso e de novo a cada NOVA VERSAO (ou
  quando o perfil da pessoa muda, porque o anexo muda). Sem o aceite, o
  servidor recusa tudo (403 "termos_uso_pendentes"), menos estas rotas, o
  termo de ciencia, /auth/me e /auth/logout.
- Os textos ficam sempre disponiveis, tambem SEM login (GET /termos), na
  pagina "Termos e privacidade".
- Cada aceite fica guardado (aceites_termos_uso) com versao, perfil, data e
  um RESUMO (SHA-256) do texto exato aceito - prova do que a pessoa leu - e
  tambem na auditoria. "Nao aceito" encerra a sessao.

Para publicar uma versao nova: altere os textos, troque TERMOS_VERSAO e
TERMOS_VIGENCIA e escreva o que mudou em TERMOS_MUDANCAS.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Session

from app.core.database import Base, get_db
from app.core.sessao import COOKIE_DOMAIN, COOKIE_SECURE, NOME_COOKIE_TOKEN
from app.modules.audit_logs import AuditLog
from app.modules.auth import obter_usuario_atual
from app.modules.sessoes import encerrar_sessao
from app.modules.users import User, UserRole

TERMOS_VERSAO = "1.0"
TERMOS_VIGENCIA = "10/11/2026"
TERMOS_MUDANCAS = "Primeira versão dos Termos de Uso, dos anexos por perfil e da Política de Privacidade."
CODIGO_PENDENTE = "termos_uso_pendentes"
PASTA_TEXTOS = Path(__file__).resolve().parents[1] / "termos_texto"
PERFIS = [p.value for p in UserRole]

ROTAS_LIVRES = frozenset({"/termos", "/termos/meus", "/termos/aceitar", "/termos/recusar"})

router = APIRouter(prefix="/termos", tags=["Termos de uso e privacidade"])


class AceiteTermosUso(Base):
    __tablename__ = "aceites_termos_uso"

    id = Column(Integer, primary_key=True)
    usuario_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    versao = Column(String(20), nullable=False)
    perfil = Column(String(20), nullable=False)
    resumo_textos = Column(String(64), nullable=False)  # SHA-256 do texto exato aceito
    aceito_em = Column(DateTime(timezone=True), nullable=False)


def _ler(nome: str) -> str:
    texto = (PASTA_TEXTOS / nome).read_text(encoding="utf-8")
    return texto.replace("{versao}", TERMOS_VERSAO).replace("{vigencia}", TERMOS_VIGENCIA)


def textos() -> dict:
    # lidos a cada pedido (arquivos pequenos): sem copia guardada em memoria
    return {
        "termos_uso": _ler("termos_uso.md"),
        "privacidade": _ler("privacidade.md"),
        "perfis": {p: _ler(f"perfis/{p}.md") for p in PERFIS},
    }


def documentos_do_perfil(perfil: str) -> dict:
    t = textos()
    return {"termos_uso": t["termos_uso"], "anexo_perfil": t["perfis"][perfil], "privacidade": t["privacidade"]}


def resumo_do_perfil(perfil: str) -> str:
    docs = documentos_do_perfil(perfil)
    juntos = "\n\f\n".join([TERMOS_VERSAO, perfil, docs["termos_uso"], docs["anexo_perfil"], docs["privacidade"]])
    return hashlib.sha256(juntos.encode("utf-8")).hexdigest()


def _perfil(usuario: User) -> str:
    return getattr(usuario.perfil, "value", usuario.perfil)


def termos_aceitos(db: Session, usuario: User) -> bool:
    """Aceitou a versao ATUAL, no perfil ATUAL?"""
    return db.query(AceiteTermosUso.id).filter(
        AceiteTermosUso.usuario_id == usuario.id, AceiteTermosUso.versao == TERMOS_VERSAO,
        AceiteTermosUso.perfil == _perfil(usuario),
    ).first() is not None


@router.get("")
def termos_publicos():
    """Versao vigente de todos os textos - sem login (direito de informacao, LGPD art. 9)."""
    return {"versao": TERMOS_VERSAO, "vigencia": TERMOS_VIGENCIA, "mudancas": TERMOS_MUDANCAS, **textos()}


@router.get("/meus")
def meus_termos(usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    perfil = _perfil(usuario)
    historico = (db.query(AceiteTermosUso).filter(AceiteTermosUso.usuario_id == usuario.id)
                 .order_by(AceiteTermosUso.aceito_em.desc()).limit(20).all())
    return {
        "versao": TERMOS_VERSAO, "vigencia": TERMOS_VIGENCIA, "mudancas": TERMOS_MUDANCAS, "perfil": perfil,
        "pendente": not termos_aceitos(db, usuario),
        "primeiro_aceite": not historico,
        "documentos": documentos_do_perfil(perfil),
        "historico": [{"versao": a.versao, "perfil": a.perfil, "aceito_em": a.aceito_em.isoformat()} for a in historico],
    }


class Aceite(BaseModel):
    versao: str = Field(..., max_length=20)
    anexo: str = Field(..., max_length=20)  # o anexo de perfil que a pessoa leu
    li_e_concordo: bool


@router.post("/aceitar")
def aceitar(dados: Aceite, usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    perfil = _perfil(usuario)
    if dados.versao != TERMOS_VERSAO or dados.anexo != perfil:
        raise HTTPException(status_code=409, detail="Os termos foram atualizados. Leia a versão atual.")
    if not dados.li_e_concordo:
        raise HTTPException(status_code=422, detail="Marque \"Li e concordo\" para continuar.")
    if not termos_aceitos(db, usuario):
        resumo = resumo_do_perfil(perfil)
        db.add(AceiteTermosUso(usuario_id=usuario.id, versao=TERMOS_VERSAO, perfil=perfil, resumo_textos=resumo,
                               aceito_em=datetime.now(timezone.utc)))
        db.add(AuditLog(usuario_id=usuario.id, acao="termos_uso_aceitos", entidade="user", entidade_id=usuario.id,
                        resultado="sucesso", detalhes=f"versao={TERMOS_VERSAO}; perfil={perfil}; sha256={resumo[:16]}"))
        db.commit()
    return {"pendente": False, "versao": TERMOS_VERSAO}


@router.post("/recusar")
def recusar(request: Request, response: Response, usuario: User = Depends(obter_usuario_atual),
            db: Session = Depends(get_db)):
    """Nao aceitou: a sessao e encerrada (sem o aceite nao ha acesso)."""
    encerrar_sessao(db, getattr(request.state, "sessao_jti", None), "termos_recusados")
    response.delete_cookie(key=NOME_COOKIE_TOKEN, path="/", samesite="lax", secure=COOKIE_SECURE, domain=COOKIE_DOMAIN)
    db.add(AuditLog(usuario_id=usuario.id, acao="termos_uso_recusados", entidade="user", entidade_id=usuario.id,
                    resultado="sucesso", detalhes=f"versao={TERMOS_VERSAO}; sessao encerrada"))
    db.commit()
    return {"mensagem": "Sem o aceite dos Termos de Uso e da Política de Privacidade, o acesso não é liberado."}
