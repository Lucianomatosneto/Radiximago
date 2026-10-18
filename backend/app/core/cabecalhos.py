"""
Cabecalhos HTTP de protecao nas respostas da API e conferencia da origem
dos pedidos que alteram dados.

1) Cache-Control: no-store nas respostas JSON (dados de usuarios, fichas,
   anotacoes): o navegador e proxies nao guardam copia desses dados -
   depois de "Sair", nada fica no cache (OWASP ASVS 5.0 - 14.3.1 e 14.3.2).
   Imagens/miniaturas e arquivos estaticos (/uploads) nao sao afetados:
   elas definem o proprio cabecalho quando precisam, e o cache delas e o
   que deixa as telas rapidas.

2) Cabecalhos de protecao em TODAS as respostas (ASVS 3.2.1, 3.4.4-3.4.6):
   - X-Content-Type-Options: nosniff -> o navegador nao "adivinha" o tipo
     do arquivo (uma foto enviada nunca e tratada como pagina ou script);
   - Referrer-Policy: no-referrer -> enderecos internos nao vazam para
     outros sites;
   - X-Frame-Options / frame-ancestors -> a API nao pode ser embutida em
     moldura (iframe) de outro site;
   - Content-Security-Policy restrita nas respostas que nao sao paginas
     (JSON, imagens, arquivos enviados): mesmo aberta direto no navegador,
     nada nela e executado. Em /uploads ainda vai "sandbox".
   A documentacao interativa (/docs, pagina HTML com scripts) fica de fora
   da CSP restrita, senao deixaria de funcionar.

3) Origem dos pedidos que alteram dados (ASVS 3.5.1 e 3.5.2 - protecao
   contra CSRF, "falsificacao de pedido entre sites"): POST/PUT/PATCH/DELETE
   vindos de um navegador so sao aceitos se a origem for a tela do Radix.
   O navegador sempre informa a origem (cabecalho Origin, ou Sec-Fetch-Site)
   e o site atacante nao consegue falsifica-la. Pedidos sem navegador
   (scripts, testes, o proprio Next.js no servidor) nao trazem Origin e
   continuam passando - eles ja dependem do login normal.
"""

from fastapi import Request
from fastapi.responses import JSONResponse

from app.core.config import settings

# Unica lista de origens confiaveis: usada pelo CORS (main.py) e pela
# conferencia de origem abaixo.
ORIGENS_PERMITIDAS: list[str] = sorted({"http://localhost:3000", settings.FRONTEND_URL.rstrip("/")})

_METODOS_QUE_ALTERAM = {"POST", "PUT", "PATCH", "DELETE"}
_ROTAS_DOCUMENTACAO = ("/docs", "/redoc", "/openapi.json")

CSP_API = "default-src 'none'; frame-ancestors 'none'"
CSP_ARQUIVOS_ENVIADOS = "default-src 'none'; frame-ancestors 'none'; sandbox"


async def sem_cache_em_dados(request: Request, call_next):
    resposta = await call_next(request)
    tipo = resposta.headers.get("content-type", "")
    if tipo.startswith("application/json") and "cache-control" not in resposta.headers:
        resposta.headers["Cache-Control"] = "no-store"
    return resposta


def origem_recusada(request: Request) -> bool:
    """True quando um pedido que altera dados vem de OUTRO site."""
    if request.method not in _METODOS_QUE_ALTERAM:
        return False
    origem = request.headers.get("origin")
    if origem is not None:
        return origem.rstrip("/") not in ORIGENS_PERMITIDAS  # inclui "null" (sandbox/arquivo local)
    # navegadores antigos podem omitir Origin, mas enviam Sec-Fetch-Site
    return request.headers.get("sec-fetch-site") == "cross-site"


async def protecao_de_navegador(request: Request, call_next):
    if origem_recusada(request):
        resposta = JSONResponse(
            status_code=403,
            content={"detail": "Pedido recusado: origem não autorizada."},
        )
    else:
        resposta = await call_next(request)
    h = resposta.headers
    h.setdefault("X-Content-Type-Options", "nosniff")
    h.setdefault("Referrer-Policy", "no-referrer")
    h.setdefault("X-Frame-Options", "DENY")
    caminho = request.url.path
    eh_pagina = h.get("content-type", "").startswith("text/html")
    if caminho.startswith("/uploads/"):
        h["Content-Security-Policy"] = CSP_ARQUIVOS_ENVIADOS
    elif not eh_pagina and not caminho.startswith(_ROTAS_DOCUMENTACAO):
        h.setdefault("Content-Security-Policy", CSP_API)
    return resposta
