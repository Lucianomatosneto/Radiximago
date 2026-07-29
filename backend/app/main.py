import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from app.core.database import SessionLocal
from app.modules import orthanc_client

logger = logging.getLogger(__name__)
from app.modules.auth import router as auth_router
from app.modules.search_router import router as search_router
from app.modules.admin_router import router as admin_router
from app.modules.users_router import router as users_router
from app.modules.images_router import router as images_router
from app.modules.curation_router import router as curation_router
from app.modules.saved_images_router import router as saved_images_router

app = FastAPI(
    title="Radix Imago API",
    description="Plataforma para curadoria e pesquisa de imagens radiograficas odontologicas",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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