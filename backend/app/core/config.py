from pathlib import Path
import os
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
    # Endereco do OHIF DENTRO da rede do Docker (ex.: http://radix-ohif), so
    # para a tela Integracoes/Painel conferir se o visualizador responde
    # (B2, 01/11/2026). Vazio = a checagem fica so com o navegador.
    OHIF_URL: str = ""
    # Aparelhos de raio X da rede (etapa D, 08/11/2026): o que a tela
    # "Aparelhos da rede" mostra para configurar o aparelho. ORTHANC_AET e o
    # nome DICOM do Radix (o mesmo do Orthanc, ORTHANC__DICOM_AET no
    # docker-compose); DICOM_ENDERECO_SERVIDOR e o IP deste computador na rede
    # (vazio = a tela pede para o administrador conferir).
    # anexos da curadoria (08/11/2026): pasta FORA de /uploads (que e publica);
    # so a API entrega os arquivos, com login. Volume proprio na producao.
    ANEXOS_DIR: str = str(Path(__file__).resolve().parents[2] / "anexos_curadoria")
    ORTHANC_AET: str = "RADIXIMAGO"
    DICOM_PORTA: int = 4242
    DICOM_ENDERECO_SERVIDOR: str = ""
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
    # FOTO DO NEGATOSCOPIO PELO CELULAR (Fase 1, 10/11/2026 -
    # app/modules/janela_foto.py): tempo para concluir o envio, folga so para
    # a foto terminar de subir em rede lenta, e tamanho maximo da foto.
    FOTO_JANELA_MINUTOS: int = 5
    FOTO_JANELA_TOLERANCIA_SEGUNDOS: int = 30
    FOTO_TAMANHO_MAX_MB: int = 10
    # LOGIN EM DUAS ETAPAS (OWASP ASVS 6.5.5, 12/11/2026): quantos codigos
    # ANTERIORES do aplicativo ainda valem. 0 (padrao) = so o codigo do
    # momento, vale no maximo 30 s, como pede o ASVS. 1 = vale tambem o
    # anterior (ate 60 s), para celular com relogio atrasado. Nunca se aceita
    # o codigo do intervalo seguinte. Valores fora de 0-1 impedem de ligar.
    MFA_TOTP_JANELA: int = 0

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
    def _janela_do_codigo_valida(self):
        if self.MFA_TOTP_JANELA not in (0, 1):
            raise ValueError("MFA_TOTP_JANELA deve ser 0 (so o codigo do momento) ou 1 (tambem o anterior).")
        return self

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