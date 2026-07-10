from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

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

@app.get("/health")
async def health():
    return {"status": "ok", "service": "radix-api"}

@app.get("/health/database")
async def health_database():
    # Sera expandido na Fase 4
    return {"status": "ok", "database": "pendente configuracao"}

@app.get("/health/orthanc")
async def health_orthanc():
    # Sera expandido na Fase 4
    return {"status": "ok", "orthanc": "pendente configuracao"}
