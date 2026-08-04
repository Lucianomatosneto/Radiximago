from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    # Banco de dados
    DATABASE_URL: str    
    # JWT - Token de autenticação. Sem default: se faltar no .env, a
    # aplicacao falha ao subir em vez de rodar silenciosamente com uma
    # chave conhecida/previsivel (ver Settings.Config abaixo).
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60
    # Orthanc - servidor DICOM
    ORTHANC_URL: str = "http://radix-orthanc:8042"
    ORTHANC_USERNAME: str = "admin"
    # Sem default, mesmo motivo do JWT_SECRET_KEY acima: evita subir o
    # sistema com uma senha fixa e conhecida. Corrigido em 31/07/2026 -
    # o valor anterior (hardcoded) ja estava exposto no historico do Git,
    # foi trocado no Orthanc e removido do codigo-fonte.
    ORTHANC_PASSWORD: str
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