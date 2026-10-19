"""
Registro automatico de eventos de seguranca na auditoria
(OWASP ASVS 16.2.1, 16.3.2, 16.3.3 e 16.3.4 - docs/REGISTROS.md).

Um "vigia" que olha a RESPOSTA de cada pedido e anota na auditoria:

| resposta                         | acao gravada        | por que importa                          |
|----------------------------------|---------------------|------------------------------------------|
| 403 (sem permissao)              | acesso_negado       | tentativa de acessar o que nao pode      |
| 403 vindo de outro site          | origem_recusada     | possivel ataque CSRF                     |
| 429 (pedidos demais)             | limite_excedido     | forca bruta / robo                       |
| 422 (dado recusado na validacao) | entrada_recusada    | tentativa de burlar a validacao          |
| 500 (erro inesperado)            | erro_inesperado     | falha do sistema (visivel ao admin)      |

Tambem guarda, para todo o pedido, o endereco de rede e a rota em
pedido_atual (app/core/contexto_pedido.py) - assim QUALQUER registro de
auditoria feito durante o pedido sai com "de onde".

Freio contra enxurrada: o mesmo evento, do mesmo endereco e na mesma rota,
e gravado no maximo 1 vez por minuto - um ataque com milhares de pedidos
nao enche o banco (o primeiro de cada minuto ja basta como evidencia).
Erros inesperados e acessos negados de usuarios logados sao sempre
gravados. Nunca grava corpo do pedido, senha, cookie ou texto de busca:
so metodo, caminho e codigo da resposta.
"""

from __future__ import annotations

import asyncio
import logging
import time

from fastapi import Request
from fastapi.responses import JSONResponse

from app.core.contexto_pedido import pedido_atual

logger = logging.getLogger("radix_imago.seguranca")

# 1 registro por (evento, endereco, rota) a cada INTERVALO_FREIO segundos
INTERVALO_FREIO = 60
_ultimo_registro: dict[tuple[str, str, str], float] = {}
_MAX_CHAVES_FREIO = 10_000

# a portaria das imagens ja grava os proprios acessos negados
# ("acesso_imagem_negado", com o motivo) - nao duplicar
_ROTAS_COM_REGISTRO_PROPRIO = ("/visualizador/autorizar",)

# nomes das acoes gravadas por este modulo (conferidos com docs/REGISTROS.md
# por tests/test_documentacao_confere.py)
ACOES_REGISTRADAS = ("acesso_negado", "origem_recusada", "limite_excedido", "entrada_recusada", "erro_inesperado")

MENSAGEM_ERRO_GENERICA = "Erro interno. A equipe foi avisada pelo registro do sistema."


def _ip(request: Request) -> str:
    # IP da conexao direta. Atras de um proxy (implantacao) o proxy deve
    # repassar o IP real de forma confiavel - ASVS 15.3.4, docs/COMUNICACOES.md
    return request.client.host if request.client else "desconhecido"


def _usuario_do_pedido(request: Request) -> int | None:
    """Quem fez o pedido, se estava logado (sem consultar o banco)."""
    from app.core.security import decodificar_token
    from app.core.sessao import NOME_COOKIE_TOKEN

    token = request.cookies.get(NOME_COOKIE_TOKEN)
    if not token:
        cabecalho = request.headers.get("authorization", "")
        token = cabecalho[7:] if cabecalho.lower().startswith("bearer ") else None
    dados = decodificar_token(token) if token else None
    try:
        return int(dados["sub"]) if dados and "sub" in dados else None
    except (TypeError, ValueError):
        return None


def _deve_registrar(acao: str, ip: str, rota: str, sempre: bool) -> bool:
    if sempre:
        return True
    agora = time.monotonic()
    chave = (acao, ip, rota)
    if agora - _ultimo_registro.get(chave, -INTERVALO_FREIO) < INTERVALO_FREIO:
        return False
    if len(_ultimo_registro) >= _MAX_CHAVES_FREIO:
        _ultimo_registro.clear()
    _ultimo_registro[chave] = agora
    return True


def _registrar_evento(acao: str, resultado: str, detalhes: str, usuario_id: int | None) -> None:
    """Grava o evento numa sessao propria do banco (independente do pedido)."""
    from app.core.database import SessionLocal
    from app.modules.audit_logs import AuditLog

    db = SessionLocal()
    try:
        db.add(AuditLog(usuario_id=usuario_id, acao=acao, entidade="pedido", resultado=resultado, detalhes=detalhes))
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Nao foi possivel gravar o evento de seguranca %s na auditoria.", acao)
    finally:
        db.close()


async def registrar_eventos_de_seguranca(request: Request, call_next):
    ip, rota = _ip(request), f"{request.method} {request.url.path}"[:200]
    marca = pedido_atual.set({"ip": ip, "rota": rota, "navegador": request.headers.get("user-agent", "")[:300]})
    try:
        try:
            resposta = await call_next(request)
        except Exception:
            # erro inesperado: detalhes tecnicos so na saida do servidor
            # (logger.exception); o usuario recebe mensagem generica (16.5.1)
            logger.exception("Erro inesperado em %s", rota)
            await asyncio.to_thread(
                _registrar_evento, "erro_inesperado", "erro", f"{rota} -> 500", _usuario_do_pedido(request)
            )
            return JSONResponse(status_code=500, content={"detail": MENSAGEM_ERRO_GENERICA})

        status = resposta.status_code
        if status not in (403, 422, 429) or request.url.path.startswith(_ROTAS_COM_REGISTRO_PROPRIO):
            return resposta
        usuario_id = _usuario_do_pedido(request)
        if status == 403:
            acao = "origem_recusada" if getattr(request.state, "origem_recusada", False) else "acesso_negado"
        elif status == 429:
            acao = "limite_excedido"
        else:
            acao = "entrada_recusada"
        sempre = acao == "acesso_negado" and usuario_id is not None
        if _deve_registrar(acao, ip, rota, sempre):
            await asyncio.to_thread(_registrar_evento, acao, "negado", f"{rota} -> {status}", usuario_id)
        return resposta
    finally:
        pedido_atual.reset(marca)
