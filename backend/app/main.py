import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text
from app.core.database import SessionLocal
from app.core.rate_limit import limite_geral, limiter, resposta_limite_excedido
from app.modules import orthanc_client

logger = logging.getLogger(__name__)
from app.modules.auth import router as auth_router
from app.modules.mfa_router import router as mfa_router
from app.modules.search_router import router as search_router
from app.modules.admin_router import router as admin_router
from app.modules.users_router import router as users_router
from app.modules.images_router import router as images_router
from app.modules.curation import router as curation_router
from app.modules.saved_images_router import router as saved_images_router
from app.modules.anotacoes_router import router as anotacoes_router
from app.modules.compartilhamentos_router import router as compartilhamentos_router
from app.modules.vocabulario_router import router as vocabulario_router
from app.modules.voz_router import router as voz_router
from app.modules.macros_router import router_frases, router_macros
from app.modules.visualizador_router import router as visualizador_router

from app.core.cabecalhos import ORIGENS_PERMITIDAS, protecao_de_navegador, sem_cache_em_dados
from app.core.sessao import renovar_sessao
from app.modules.anonimizacao_automatica import vigiar_chegadas
from app.modules.retencao import limpeza_diaria
from app.core.registro_json import configurar_registros
from app.core.registro_seguranca import registrar_eventos_de_seguranca

configurar_registros()  # saida em JSON (app/core/registro_json.py - ASVS 16.2.4)

@asynccontextmanager
async def ciclo_de_vida(app: FastAPI):
    """Tarefas que rodam junto com o servidor enquanto ele estiver ligado."""
    tarefas = [
        asyncio.create_task(vigiar_chegadas()),  # ver app/modules/anonimizacao_automatica.py
        asyncio.create_task(limpeza_diaria()),   # prazos de guarda - app/modules/retencao.py
    ]
    try:
        yield
    finally:
        for tarefa in tarefas:
            tarefa.cancel()


app = FastAPI(
    lifespan=ciclo_de_vida,
    title="Radix Imago API",
    description="Plataforma para curadoria e pesquisa de imagens radiograficas odontologicas",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGENS_PERMITIDAS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Limites de frequencia (ver app/core/rate_limit.py): um limite geral em
# todas as rotas + limites proprios decorados nas rotas sensiveis/pesadas
# (login, redefinicao de senha, e-mail, ZIP). Resposta 429 em portugues.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, resposta_limite_excedido)

# sessao renovada enquanto o usuario esta usando (ver app/core/sessao.py)
app.middleware("http")(renovar_sessao)
# dados em JSON nunca ficam no cache do navegador (ver app/core/cabecalhos.py)
app.middleware("http")(sem_cache_em_dados)
# limite geral por conta em todas as rotas (ver app/core/rate_limit.py);
# fica DENTRO da protecao de navegador, entao o 429 tambem sai com os
# cabecalhos de protecao, e dentro do registro de seguranca (limite_excedido)
app.middleware("http")(limite_geral)
# registrado por ULTIMO = roda PRIMEIRO: confere a origem dos pedidos que
# alteram dados e poe os cabecalhos de protecao em todas as respostas,
# inclusive nas de erro (ver app/core/cabecalhos.py)
app.middleware("http")(protecao_de_navegador)
# registrado por ULTIMO de todos = roda PRIMEIRO: guarda ip/rota do pedido para
# a auditoria e registra acesso negado, excesso, origem recusada, dado
# recusado e erro inesperado (ver app/core/registro_seguranca.py)
app.middleware("http")(registrar_eventos_de_seguranca)

# Arquivos enviados pelos usuarios (hoje so fotos de perfil - ver
# POST /users/me/avatar). Sem autenticacao: sao imagens publicas por
# natureza (avatar), servidas diretamente por caminho/nome unico.
_DIRETORIO_UPLOADS = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(os.path.join(_DIRETORIO_UPLOADS, "avatars"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=_DIRETORIO_UPLOADS), name="uploads")

app.include_router(auth_router)
app.include_router(mfa_router)
app.include_router(search_router)
app.include_router(admin_router)
app.include_router(users_router)
app.include_router(images_router)
app.include_router(curation_router)
app.include_router(saved_images_router)
app.include_router(anotacoes_router)
app.include_router(compartilhamentos_router)
app.include_router(vocabulario_router)
app.include_router(voz_router)
app.include_router(router_macros)
app.include_router(router_frases)
app.include_router(visualizador_router)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "radix-api"}

@app.get("/health/database")
async def health_database():
    try:
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
        finally:
            db.close()
        return {"status": "ok", "database": "conectado"}
    except Exception:
        logger.exception("Falha na checagem de saude do banco de dados.")
        return {"status": "erro", "database": "indisponivel"}

@app.get("/health/orthanc")
async def health_orthanc():
    try:
        orthanc_client.listar_instancias()
        return {"status": "ok", "orthanc": "conectado"}
    except Exception:
        logger.exception("Falha na checagem de saude do Orthanc.")
        return {"status": "erro", "orthanc": "indisponivel"}