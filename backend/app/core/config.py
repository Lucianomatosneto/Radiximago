from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    # Banco de dados
    DATABASE_URL: str = "postgresql://radix_user:senha@radix-postgres:5432/radix_imago"
    
    # JWT - Token de autenticação
    JWT_SECRET_KEY: str = "chave-secreta-trocar"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60
    # Orthanc - servidor DICOM
    ORTHANC_URL: str = "http://radix-orthanc:8042"
    ORTHANC_USERNAME: str = "admin"
    ORTHANC_PASSWORD: str = "mgd3172"
    DICOMWEB_URL: str = "http://radix-orthanc:8042/dicom-web"
    OHIF_BASE_URL: str = "http://localhost:3001"
    MAX_UPLOAD_SIZE_MB: int = 50

    # E-mail (SMTP) - usado pra redefinicao de senha. Se SMTP_HOST ficar
    # vazio (default), o envio real e pulado e o conteudo do e-mail (com o
    # link) e so impresso no log - util em dev/teste sem precisar de
    # credenciais reais. Preencher no .env pra envio de verdade.
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "Radix Imago <nao-responda@radiximago.local>"
    SMTP_USE_TLS: bool = True
    FRONTEND_URL: str = "http://localhost:3000"

    # Ambiente
    ENVIRONMENT: str = "development"
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()