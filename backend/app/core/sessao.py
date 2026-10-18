"""
Renovacao automatica da sessao ("sessao deslizante").

PROBLEMA QUE RESOLVE: o login vale JWT_EXPIRE_MINUTES (60 min). Antes, ele
NUNCA era renovado - quem passava mais de 1 hora curando (com a tela aberta,
falando com o microfone) de repente recebia "Não autenticado" no meio do
trabalho, mesmo estando ativo o tempo todo.

COMO FUNCIONA (padrao "sliding session" com limite absoluto):
- Cada pedido AUTENTICADO bem-sucedido (passou por obter_usuario_atual, que
  confere no banco se o usuario continua ativo e nao bloqueado) pode renovar
  o cookie. A renovacao so acontece quando ja passou metade da validade -
  assim nao se gera um token novo a cada clique.
- Inatividade: quem fica JWT_EXPIRE_MINUTES sem usar o sistema perde a
  sessao (igual a antes).
- Limite absoluto: SESSAO_MAXIMA_HORAS depois do login, a sessao acaba
  mesmo com uso continuo e e preciso entrar de novo (OWASP ASVS 4.0, 3.3.2,
  nivel 2: reautenticacao periodica - ate 12 h de uso ou 30 min parado).
- O token guarda o horario do login ("inicio"); a renovacao mantem esse
  horario, entao o limite absoluto nao e "empurrado" para frente.
- Nunca renova em logout (a resposta ja apaga o cookie) nem em respostas de
  erro de acesso (401/403).
"""

import time

from fastapi import Request

from app.core.config import settings
from app.core.security import criar_token_acesso, decodificar_token

NOME_COOKIE_TOKEN = "access_token"
COOKIE_SECURE = settings.ENVIRONMENT == "production"


def definir_cookie_token(response, token: str) -> None:
    response.set_cookie(
        key=NOME_COOKIE_TOKEN,
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=settings.JWT_EXPIRE_MINUTES * 60,
        path="/",
    )


def token_renovado(payload: dict, usuario_id: int, perfil: str, agora: float | None = None) -> str | None:
    """Token novo para a mesma sessao, ou None se ainda nao e hora (ou se a
    sessao ja passou do limite absoluto)."""
    agora = agora if agora is not None else time.time()
    if str(payload.get("sub")) != str(usuario_id):
        return None
    validade = settings.JWT_EXPIRE_MINUTES * 60
    restante = float(payload.get("exp", 0)) - agora
    if restante > validade / 2:
        return None  # ainda novo: nao precisa renovar
    inicio = payload.get("inicio")
    if not isinstance(inicio, (int, float)):
        inicio = agora  # token antigo (anterior a esta regra)
    if agora - inicio >= settings.SESSAO_MAXIMA_HORAS * 3600:
        return None  # limite absoluto: precisa entrar de novo
    # mesma sessao (jti): renovar nao abre sessao nova nem reabre uma fechada
    return criar_token_acesso({"sub": str(usuario_id), "perfil": perfil, "inicio": int(inicio), "jti": payload.get("jti")})


async def renovar_sessao(request: Request, call_next):
    resposta = await call_next(request)
    usuario = getattr(request.state, "usuario_sessao", None)
    if not usuario or resposta.status_code in (401, 403):
        return resposta
    # a propria rota ja mexeu no cookie (login, logout): nao interferir
    if any(
        nome.lower() == b"set-cookie" and valor.startswith(NOME_COOKIE_TOKEN.encode() + b"=")
        for nome, valor in resposta.raw_headers
    ):
        return resposta
    token = request.cookies.get(NOME_COOKIE_TOKEN)
    payload = decodificar_token(token) if token else None
    if not payload:
        return resposta
    novo = token_renovado(payload, usuario[0], usuario[1])
    if novo:
        definir_cookie_token(resposta, novo)
    return resposta
