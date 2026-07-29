FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
# --reload so em desenvolvimento (ENVIRONMENT=development, o default) - liga
# um watcher de arquivos que nao deve rodar em producao (custo de CPU,
# pode reiniciar o processo por engano se o volume mudar). Continua com um
# unico worker: rodar mais de um exigiria um backend compartilhado (Redis)
# pro rate limiter (app/core/rate_limit.py), que hoje guarda o contador em
# memoria por processo.
CMD ["sh", "-c", "if [ \"$ENVIRONMENT\" = \"production\" ]; then uvicorn app.main:app --host 0.0.0.0 --port 8000; else uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload; fi"]