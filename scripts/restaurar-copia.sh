#!/usr/bin/env bash
# RESTAURAR UMA COPIA COMPLETA DO RADIX (gerada por scripts/copia-completa.sh)
# num servidor - normalmente um servidor NOVO, ao reativar o Radix.
#
# Uso (no servidor, na pasta do Radix):
#   bash scripts/restaurar-copia.sh ~/radix-copia-completa-DATA.tar.gz
#
# Se ainda nao houver .env nesta pasta, usa o .env que esta dentro da copia
# (mesmas senhas de antes). Se ja houver, mantem o .env atual.
# ATENCAO: APAGA o banco e as imagens que estiverem neste servidor e coloca
# os da copia no lugar. Pede confirmacao antes.
set -euo pipefail

cd "$(dirname "$0")/.."
DC=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)
ARQUIVO="${1:-}"
[ -n "$ARQUIVO" ] && [ -f "$ARQUIVO" ] || { echo "Uso: bash scripts/restaurar-copia.sh CAMINHO/radix-copia-completa-....tar.gz"; exit 1; }
ARQUIVO=$(realpath "$ARQUIVO")
TEMP=$(mktemp -d)
trap 'rm -rf "$TEMP"' EXIT

tar -xzf "$ARQUIVO" -C "$TEMP"
for parte in banco.dump orthanc.tar.gz fotos.tar.gz env; do
  [ -f "$TEMP/$parte" ] || { echo "ERRO: a copia esta incompleta (falta $parte)."; exit 1; }
done
cat "$TEMP/LEIA-ME.txt" 2>/dev/null || true
echo
echo "Isto vai SUBSTITUIR o banco de dados e as imagens deste servidor pelos da copia."
read -r -p "Para continuar, digite RESTAURAR: " resposta
[ "$resposta" = "RESTAURAR" ] || { echo "Cancelado. Nada foi alterado."; exit 1; }

if [ ! -f .env ]; then
  cp "$TEMP/env" .env
  chmod 600 .env
  echo "- .env recuperado da copia"
else
  echo "- mantendo o .env que ja existe nesta pasta"
fi

echo "1/4 Parando o Radix..."
"${DC[@]}" stop >/dev/null 2>&1 || true

echo "2/4 Banco de dados..."
"${DC[@]}" up -d --wait radix-postgres >/dev/null
"${DC[@]}" exec -T radix-postgres sh -c 'dropdb -U "$POSTGRES_USER" --if-exists --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
"${DC[@]}" exec -T radix-postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error' < "$TEMP/banco.dump"

echo "3/4 Imagens (Orthanc) e fotos de perfil..."
"${DC[@]}" run --rm --no-deps -T --entrypoint sh radix-orthanc -c \
  'rm -rf /var/lib/orthanc/db/* && tar -xzf - -C /var/lib/orthanc/db --strip-components=1' < "$TEMP/orthanc.tar.gz"
mkdir -p backend
rm -rf backend/uploads
tar -xzf "$TEMP/fotos.tar.gz" -C backend

echo "4/4 Ligando o Radix..."
"${DC[@]}" up -d --build
"${DC[@]}" exec -T radix-api alembic upgrade head

echo
echo "PRONTO. Confira em https://app.radiximago.com.br (login, imagens e visualizador)."
