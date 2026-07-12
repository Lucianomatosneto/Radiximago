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
    
    # Ambiente
    ENVIRONMENT: str = "development"
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()