# Servico de transcricao de voz (Whisper local) - ver app.py
# Base FIXADA em Debian 12 "bookworm": no Debian 13 "trixie" (o padrao
# atual de python:3.11-slim) a glibc 2.41 recusa bibliotecas que pedem
# "pilha executavel", e o ctranslate2 (motor do faster-whisper) pede -
# erro "cannot enable executable stack as shared object requires".
FROM python:3.11-slim-bookworm
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Baixa o modelo NA CONSTRUCAO da imagem (precisa de internet so aqui);
# depois, em uso, o servico funciona sem internet (RADIX_WHISPER_OFFLINE=1).
ARG MODELO=small
ENV RADIX_WHISPER_MODELO=${MODELO} RADIX_WHISPER_PASTA=/modelos
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('${MODELO}', device='cpu', compute_type='int8', download_root='/modelos')"
COPY app.py .
# usuario sem privilegios de administrador dentro do container
RUN useradd --create-home --uid 10001 radix && chown -R radix /modelos /app
USER radix
EXPOSE 9000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "9000", "--workers", "1"]
