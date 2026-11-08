#!/usr/bin/env bash
# COPIA COMPLETA DO RADIX (servidor) - um unico arquivo com tudo:
#   banco de dados, imagens do Orthanc, fotos de perfil e o .env.
# Serve para PAUSAR o servidor (cancelar o VPS) e reativar depois num
# servidor novo com scripts/restaurar-copia.sh. Passo a passo:
# docs/IMPLANTACAO.md, secao "Pausar e reativar".
#
# Uso (no servidor):   bash scripts/copia-completa.sh
# Resultado:           ~/radiximago/copias/radix-copia-completa-DATA.tar.gz
#
# ATENCAO: o arquivo contem o .env (senhas). Guarde-o so no seu computador
# ou num lugar protegido; nunca no GitHub nem por e-mail.
set -euo pipefail

cd "$(dirname "$0")/.."
DC=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)
CARIMBO=$(date +%Y%m%d-%H%M)
TEMP=$(mktemp -d)
DESTINO="copias/radix-copia-completa-$CARIMBO.tar.gz"
ORTHANC_PARADO=0

limpar() {
  # se algo falhar no meio, o visualizador nao fica desligado
  if [ "$ORTHANC_PARADO" = 1 ]; then "${DC[@]}" start radix-orthanc >/dev/null 2>&1 || true; fi
  rm -rf "$TEMP"
}
trap limpar EXIT

[ -f .env ] || { echo "ERRO: rode na pasta do Radix (falta o .env)."; exit 1; }
mkdir -p copias
chmod 700 copias

echo "1/4 Banco de dados..."
"${DC[@]}" up -d --wait radix-postgres >/dev/null
"${DC[@]}" exec -T radix-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$TEMP/banco.dump"

echo "2/4 Imagens (Orthanc) - o visualizador fica parado por alguns segundos..."
if [ -n "$("${DC[@]}" ps -q --status running radix-orthanc 2>/dev/null)" ]; then
  "${DC[@]}" stop radix-orthanc >/dev/null
  ORTHANC_PARADO=1
fi
"${DC[@]}" run --rm --no-deps -T --entrypoint tar radix-backup -czf - -C / orthanc_data > "$TEMP/orthanc.tar.gz"
if [ "$ORTHANC_PARADO" = 1 ]; then
  "${DC[@]}" start radix-orthanc >/dev/null
  ORTHANC_PARADO=0
fi

echo "3/4 Fotos de perfil e configuracao..."
mkdir -p backend/uploads
tar -czf "$TEMP/fotos.tar.gz" -C backend uploads
cp .env "$TEMP/env"
{
  echo "Copia completa do Radix Imago"
  echo "Data: $(date '+%Y-%m-%d %H:%M')"
  echo "Versao do codigo: $(git rev-parse --short HEAD 2>/dev/null || echo desconhecida) ($(git branch --show-current 2>/dev/null || echo ?))"
} > "$TEMP/LEIA-ME.txt"

echo "4/4 Juntando tudo num arquivo..."
tar -czf "$DESTINO" -C "$TEMP" .
chmod 600 "$DESTINO"

echo
echo "PRONTO: $(pwd)/$DESTINO  ($(du -h "$DESTINO" | cut -f1))"
echo
echo "Baixe para o seu computador (PowerShell no PC, troque o IP):"
echo "  scp root@IP_DO_SERVIDOR:$(pwd)/$DESTINO C:\\Users\\lmnvo\\Radiximago_copias\\"
echo "Confira que o arquivo chegou ANTES de cancelar o servidor."
