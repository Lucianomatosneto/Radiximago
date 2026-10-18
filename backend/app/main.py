import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import text
from app.core.database import SessionLocal
from app.core.rate_limit import limiter
from app.modules import orthanc_client

logger = logging.getLogger(__name__)
from app.modules.auth import router as auth_router
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

app = FastAPI(
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

# Protecao contra forca bruta (ver app/core/rate_limit.py) - os limites em
# si ficam decorados em cada rota sensivel (login, redefinicao de senha).
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# sessao renovada enquanto o usuario esta usando (ver app/core/sessao.py)
app.middleware("http")(renovar_sessao)
# dados em JSON nunca ficam no cache do navegador (ver app/core/cabecalhos.py)
app.middleware("http")(sem_cache_em_dados)
# registrado por ULTIMO = roda PRIMEIRO: confere a origem dos pedidos que
# alteram dados e poe os cabecalhos de protecao em todas as respostas,
# inclusive nas de erro (ver app/core/cabecalhos.py)
app.middleware("http")(protecao_de_navegador)

# Arquivos enviados pelos usuarios (hoje so fotos de perfil - ver
# POST /users/me/avatar). Sem autenticacao: sao imagens publicas por
# natureza (avatar), servidas diretamente por caminho/nome unico.
_DIRETORIO_UPLOADS = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(os.path.join(_DIRETORIO_UPLOADS, "avatars"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=_DIRETORIO_UPLOADS), name="uploads")

app.include_router(auth_router)
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