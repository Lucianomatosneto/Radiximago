"""
Limites de frequencia e de quantidade (anti-abuso) - OWASP ASVS 2.1.3,
2.3.2, 2.4.1 e 15.2.2; regras escritas em docs/REGRAS_DE_NEGOCIO.md,
secao 3 (o teste tests/test_documentacao_confere.py confere os valores).

Fica em modulo proprio (em vez de dentro de main.py ou auth.py) pra
evitar import circular: main.py precisa registrar o limiter na app, e
os routers precisam do mesmo limiter pra decorar suas rotas.

QUEM e contado:
- usuario logado -> pela CONTA ("u:<id>"). Assim uma turma inteira atras
  do mesmo endereco de rede da UFSC (NAT) nao divide o mesmo limite, e um
  robo nao escapa trocando de endereco;
- sem login (login, cadastro, redefinicao de senha) -> pelo endereco de rede.

TRES camadas:
1) LIMITE_GERAL em TODAS as rotas da API (robo varrendo o sistema);
2) limites proprios nas rotas sensiveis ou pesadas (login, e-mail, ZIP...),
   decorados em cada rota com @limiter.limit(...);
3) tetos de quantidade e de trabalho simultaneo nas funcoes pesadas (ZIP,
   e-mail em lote) - ver o fim deste arquivo.

Fora do limite geral: a portaria das imagens (/visualizador/autorizar), que
o visualizador chama uma vez por corte (uma tomografia tem centenas), e as
checagens de saude (/health).

Por que o limite geral e um "vigia" proprio (limite_geral, abaixo) e nao o
modo automatico da biblioteca slowapi: na versao do FastAPI usada aqui
(0.143) as rotas ficam agrupadas por roteador, e o modo automatico nao as
encontra - ele simplesmente deixava passar tudo (achado no teste
test_2_4_1_limite_geral_em_todas_as_rotas). O vigia usa o mesmo contador
da biblioteca, entao `limiter.reset()` zera os dois.
"""

import threading

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from limits import parse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

# --- frequencia ---------------------------------------------------------
LIMITE_GERAL = "600/minute"            # 10 por segundo, por conta (ou endereco)
LIMITE_EMAIL_IMAGEM = "20/hour"         # envio de UMA imagem para o proprio e-mail
LIMITE_EMAIL_LOTE = "5/hour"            # envio de varias imagens num e-mail so
LIMITE_DOWNLOAD_ZIP = "20/hour"         # ZIP de serie (PNG ou DICOM), somados
LIMITE_UPLOAD_DICOM = "300/hour"        # envio de arquivo DICOM (cada um passa por anonimizacao e leitura de texto)
LIMITE_IMPORTACAO_ORTHANC = "10/hour"   # sincronizacao em lote com o Orthanc (varre todas as imagens)
LIMITE_PRANCHA = "60/hour"              # prancha (folha com imagens e informacoes) para baixar/imprimir
LIMITE_PRANCHA_EMAIL = "5/hour"         # prancha por e-mail (mesmo teto do envio em lote)

# --- quantidade ---------------------------------------------------------
MAX_IMAGENS_EMAIL_LOTE = 10   # anexos por e-mail (servidores de e-mail recusam mensagens grandes)
MAX_CORTES_ZIP_PNG = 1000     # cortes renderizados num ZIP de imagens
MAX_IMAGENS_PRANCHA = 30     # imagens numa prancha para baixar/imprimir (ate 15 folhas)
MAX_IMAGENS_PRANCHA_EMAIL = 15  # imagens numa prancha por e-mail (ate ~5 MB de PDF)
MAX_ZIPS_SIMULTANEOS = 2      # ZIPs sendo montados ao mesmo tempo no servidor

MENSAGEM_LIMITE = "Muitos pedidos em pouco tempo. Aguarde alguns minutos e tente novamente."


def chave_do_pedido(request: Request) -> str:
    """Conta do usuario logado; sem login, o endereco de rede."""
    from app.core.registro_seguranca import usuario_do_pedido

    usuario_id = usuario_do_pedido(request)
    return f"u:{usuario_id}" if usuario_id is not None else get_remote_address(request)


limiter = Limiter(key_func=chave_do_pedido)

ROTAS_FORA_DO_LIMITE_GERAL = ("/visualizador/autorizar", "/health")
_ITEM_GERAL = parse(LIMITE_GERAL)


def _resposta_429(request: Request) -> JSONResponse:
    resposta = JSONResponse({"detail": MENSAGEM_LIMITE}, status_code=429)
    # o vigia roda antes do CORS: sem isto, a tela (outra origem) veria so
    # "erro de rede" em vez da mensagem
    from app.core.cabecalhos import ORIGENS_PERMITIDAS

    origem = (request.headers.get("origin") or "").rstrip("/")
    if origem in ORIGENS_PERMITIDAS:
        resposta.headers["Access-Control-Allow-Origin"] = origem
        resposta.headers["Access-Control-Allow-Credentials"] = "true"
        resposta.headers["Vary"] = "Origin"
    return resposta


async def limite_geral(request: Request, call_next):
    """Limite geral por conta (ou endereco) em todas as rotas da API (ASVS 2.4.1)."""
    caminho = request.url.path
    if (
        limiter.enabled
        and request.method != "OPTIONS"  # consulta previa do navegador (CORS), nao e uso
        and not caminho.startswith(ROTAS_FORA_DO_LIMITE_GERAL)
        and not limiter.limiter.hit(_ITEM_GERAL, "geral", chave_do_pedido(request))
    ):
        return _resposta_429(request)
    return await call_next(request)


def resposta_limite_excedido(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Limite proprio de uma rota estourado: 429 com mensagem em portugues
    no campo "detail" (o mesmo que as telas leem)."""
    return _resposta_429(request)


# --- trabalho pesado simultaneo (ASVS 15.2.2) -----------------------------
_zips_em_andamento = threading.BoundedSemaphore(MAX_ZIPS_SIMULTANEOS)


class VagaDeTrabalhoPesado:
    """`with VagaDeTrabalhoPesado():` - se ja houver MAX_ZIPS_SIMULTANEOS
    ZIPs sendo montados, responde 503 na hora (em vez de enfileirar e deixar
    o servidor sem memoria/CPU para os demais usuarios)."""

    def __enter__(self):
        if not _zips_em_andamento.acquire(blocking=False):
            raise HTTPException(
                status_code=503,
                detail="O servidor está preparando outros downloads agora. Tente de novo em instantes.",
            )
        return self

    def __exit__(self, *exc):
        _zips_em_andamento.release()
        return False
