from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    # Banco de dados
    DATABASE_URL: str = "postgresql://radix_user:senha@radix-postgres:5432/radix_imago"
    
    # JWT - Token de autenticação
    JWT_SECRET_KEY: str = "chave-secreta-trocar"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60
    
    # Ambiente
    ENVIRONMENT: str = "development"
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()