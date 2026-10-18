"""
Cabecalhos HTTP de protecao nas respostas da API.

Cache-Control: no-store nas respostas JSON (dados de usuarios, fichas,
anotacoes): o navegador e proxies nao guardam copia desses dados - depois
de "Sair", nada fica no cache (OWASP ASVS 5.0 - 14.3.1 e 14.3.2).
Imagens/miniaturas e arquivos estaticos (/uploads) nao sao afetados: elas
definem o proprio cabecalho quando precisam, e o cache delas e o que deixa
as telas rapidas.
"""

from fastapi import Request


async def sem_cache_em_dados(request: Request, call_next):
    resposta = await call_next(request)
    tipo = resposta.headers.get("content-type", "")
    if tipo.startswith("application/json") and "cache-control" not in resposta.headers:
        resposta.headers["Cache-Control"] = "no-store"
    return resposta
