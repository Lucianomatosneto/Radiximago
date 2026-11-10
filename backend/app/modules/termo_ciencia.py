"""
TERMO DE CIENCIA APOS O LOGIN (10/11/2026, decisoes do Luciano).

Depois da senha (e do segundo fator, quando houver), a pessoa precisa marcar
que esta ciente de que as imagens do Radix Imago sao usadas EXCLUSIVAMENTE
para ensino e pesquisa e NAO tem validade para diagnostico.

Regras:
- vale para CADA login (cada sessao nova pede o aceite de novo);
- sem o aceite, NADA do sistema responde (403 "termo_ciencia_pendente"),
  menos as rotas deste termo, /auth/me e /auth/logout - a regra e do
  SERVIDOR, nao so da tela;
- "Nao aceito": a sessao e encerrada e a pessoa volta para o login;
- aceite e recusa ficam na auditoria, com a VERSAO do texto; a data e a
  versao do aceite ficam tambem na propria sessao (sessoes_usuario).

O texto exibido fica nas mensagens da tela (pt.json/en.json, chave
TermoCiencia). Se o texto mudar, suba TERMO_CIENCIA_VERSAO.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.sessao import COOKIE_DOMAIN, COOKIE_SECURE, NOME_COOKIE_TOKEN
from app.modules.audit_logs import AuditLog
from app.modules.auth import obter_usuario_atual
from app.modules.sessoes import SessaoUsuario, encerrar_sessao
from app.modules.users import User

TERMO_CIENCIA_VERSAO = "2026-11-10"
CODIGO_PENDENTE = "termo_ciencia_pendente"

router = APIRouter(prefix="/auth/termo-ciencia", tags=["Autenticação - termo de ciência"])

# rotas que funcionam ANTES do aceite (o resto do sistema responde 403)
ROTAS_LIVRES = frozenset({
    "/auth/me", "/auth/logout", "/auth/termo-ciencia",
    "/auth/termo-ciencia/aceitar", "/auth/termo-ciencia/recusar",
})


def termo_aceito(sessao: SessaoUsuario | None) -> bool:
    return bool(sessao and sessao.termo_aceito_em is not None and sessao.termo_versao == TERMO_CIENCIA_VERSAO)


def _sessao_atual(request: Request, db: Session) -> SessaoUsuario:
    sessao = db.get(SessaoUsuario, getattr(request.state, "sessao_jti", None) or "")
    if not sessao:
        raise HTTPException(status_code=401, detail="Sessão encerrada. Entre novamente.")
    return sessao


@router.get("")
def situacao(request: Request, usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    sessao = _sessao_atual(request, db)
    return {"pendente": not termo_aceito(sessao), "versao": TERMO_CIENCIA_VERSAO}


class Aceite(BaseModel):
    versao: str = Field(..., max_length=20)
    ciente: bool


@router.post("/aceitar")
def aceitar(dados: Aceite, request: Request, usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    if dados.versao != TERMO_CIENCIA_VERSAO:
        raise HTTPException(status_code=409, detail="O texto do termo mudou. Leia a versão atual.")
    if not dados.ciente:
        raise HTTPException(status_code=422, detail="Marque a caixa de ciência para continuar.")
    sessao = _sessao_atual(request, db)
    sessao.termo_aceito_em = datetime.now(timezone.utc)
    sessao.termo_versao = TERMO_CIENCIA_VERSAO
    db.add(AuditLog(usuario_id=usuario.id, acao="termo_ciencia_aceito", entidade="user", entidade_id=usuario.id,
                    resultado="sucesso", detalhes=f"versao={TERMO_CIENCIA_VERSAO}"))
    db.commit()
    return {"pendente": False, "versao": TERMO_CIENCIA_VERSAO}


@router.post("/recusar")
def recusar(request: Request, response: Response, usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    """Nao aceitou: a sessao e encerrada (nao entra no sistema)."""
    encerrar_sessao(db, getattr(request.state, "sessao_jti", None), "termo_recusado")
    response.delete_cookie(key=NOME_COOKIE_TOKEN, path="/", samesite="lax", secure=COOKIE_SECURE, domain=COOKIE_DOMAIN)
    db.add(AuditLog(usuario_id=usuario.id, acao="termo_ciencia_recusado", entidade="user", entidade_id=usuario.id,
                    resultado="sucesso", detalhes=f"versao={TERMO_CIENCIA_VERSAO}; sessao encerrada"))
    db.commit()
    return {"mensagem": "Sem o aceite do termo, o acesso ao sistema não é liberado."}
