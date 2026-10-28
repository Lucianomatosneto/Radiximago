import warnings
from typing import Optional

from pydantic import model_validator
from pydantic_settings import BaseSettings

# Tamanho minimo da chave do JWT (HS256): 32 bytes = 256 bits (OWASP ASVS
# 11.2.3; RFC 7518 3.2). Gerar com:
#   python -c "import secrets; print(secrets.token_urlsafe(48))"
JWT_CHAVE_MIN_BYTES = 32
# chave do servico de voz (mesmo minimo do whisper/app.py)
WHISPER_CHAVE_MIN_CARACTERES = 32

class Settings(BaseSettings):
    # Banco de dados
    DATABASE_URL: str    
    # JWT - Token de autenticação. Sem default: se faltar no .env, a
    # aplicacao falha ao subir em vez de rodar silenciosamente com uma
    # chave conhecida/previsivel (ver Settings.Config abaixo).
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60
    # sessao renovada enquanto o usuario usa o sistema, mas no maximo por
    # este tempo depois do login (ver app/core/sessao.py - OWASP ASVS 3.3.2)
    SESSAO_MAXIMA_HORAS: int = 12
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
    # Dominio do cookie de login na internet (ex.: ".radiximago.com.br"): as
    # telas (app.), a API (api.) e o visualizador (viewer.) ficam em
    # subdominios diferentes e todos precisam do mesmo login. Vazio = so o
    # proprio endereco (desenvolvimento, tudo em localhost).
    COOKIE_DOMAIN: str = ""
    # servico de transcricao de voz (container radix-whisper, rede interna)
    WHISPER_URL: str = "http://radix-whisper:9000"
    # chave compartilhada com o servico de voz (cabecalho X-Radix-Chave -
    # OWASP ASVS 13.2.1). O MESMO valor vai para o container radix-whisper
    # pelo docker-compose.yml. Gerar com:
    #   python -c "import secrets; print(secrets.token_hex(32))"
    WHISPER_CHAVE: str = ""
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
    # Intervalo (segundos) da anonimizacao automatica das imagens que chegam
    # do aparelho pela porta 4242 (app/modules/anonimizacao_automatica.py).
    # 0 desliga.
    ANONIMIZACAO_AUTOMATICA_SEGUNDOS: int = 60
    
    @model_validator(mode="after")
    def _chave_jwt_forte(self):
        """Producao NAO liga com chave curta; em desenvolvimento so avisa (docs/CRIPTOGRAFIA.md)."""
        if len(self.JWT_SECRET_KEY.encode("utf-8")) < JWT_CHAVE_MIN_BYTES:
            mensagem = (
                f"JWT_SECRET_KEY tem menos de {JWT_CHAVE_MIN_BYTES} bytes (256 bits). Gere uma nova com: "
                'python -c "import secrets; print(secrets.token_urlsafe(48))"'
            )
            if self.ENVIRONMENT == "production":
                raise ValueError(mensagem)
            warnings.warn(mensagem, stacklevel=2)
        if self.ENVIRONMENT == "production" and len(self.WHISPER_CHAVE) < WHISPER_CHAVE_MIN_CARACTERES:
            raise ValueError(
                f"WHISPER_CHAVE ausente ou com menos de {WHISPER_CHAVE_MIN_CARACTERES} caracteres "
                "(comunicacao com o servico de voz precisa ser autenticada - docs/COMUNICACOES.md)."
            )
        return self

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()