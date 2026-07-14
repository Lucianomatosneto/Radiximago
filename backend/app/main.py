from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.modules.auth import router as auth_router
from app.modules.search_router import router as search_router
from app.modules.users_router import router as users_router
from app.modules.images_router import router as images_router
from app.modules.curation_router import router as curation_router

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

app.include_router(auth_router)
app.include_router(search_router)
app.include_router(users_router)
app.include_router(images_router)
app.include_router(curation_router)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "radix-api"}

@app.get("/health/database")
async def health_database():
    return {"status": "ok", "database": "pendente configuracao"}

@app.get("/health/orthanc")
async def health_orthanc():
    return {"status": "ok", "orthanc": "pendente configuracao"}