#!/bin/sh
# Backup automatico local do Postgres (pg_dump) e dos dados do Orthanc
# (volume orthanc_data, arquivos DICOM anonimizados). Roda em loop dentro
# do container radix-backup (ver docker-compose.yml), uma vez por dia.
#
# Mantem apenas os N backups mais recentes de cada tipo (BACKUP_RETENCAO,
# default 14) - nao e um backup off-site: se o disco do servidor for
# perdido por completo, esses arquivos vao junto. Para retencao fora do
# servidor, seria necessario enviar essas copias pra um armazenamento
# externo (S3, Backblaze etc.), o que fica pra quando houver essa conta.
set -eu

RETENCAO="${BACKUP_RETENCAO:-14}"

manter_recentes() {
  diretorio="$1"
  padrao="$2"
  quantidade="$3"
  # shellcheck disable=SC2086
  arquivos_antigos=$(ls -1t "$diretorio"/$padrao 2>/dev/null | tail -n "+$((quantidade + 1))")
  if [ -n "$arquivos_antigos" ]; then
    echo "$arquivos_antigos" | xargs rm -f
  fi
}

fazer_backup() {
  carimbo=$(date +%Y%m%d-%H%M%S)
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Iniciando backup $carimbo"

  # Grava num arquivo PROVISORIO e so o promove a backup se ficou completo e
  # legivel (02/11/2026). Antes, o arquivo era criado vazio no inicio: se o
  # computador ou o Docker parasse no meio, sobrava um .dump de 0 bytes que
  # ainda contava entre os N guardados e empurrava backups bons para fora.
  destino="/backups/postgres/radix-imago-$carimbo.dump"
  provisorio="$destino.parcial"
  if pg_dump --format=custom --file="$provisorio" && [ -s "$provisorio" ] \
     && pg_restore --list "$provisorio" >/dev/null 2>&1; then
    mv "$provisorio" "$destino"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Postgres OK: radix-imago-$carimbo.dump ($(wc -c < "$destino") bytes)"
  else
    rm -f "$provisorio"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERRO no backup do Postgres (arquivo descartado)" >&2
  fi

  if tar -czf "/backups/orthanc/orthanc-dados-$carimbo.tar.gz" -C / orthanc_data; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Orthanc OK: orthanc-dados-$carimbo.tar.gz"
  else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERRO no backup do Orthanc" >&2
  fi

  # fotos CIFRADAS das pastas de pacientes (so no servidor - docker-compose.prod.yml)
  if [ -d /dados_clinicos ]; then
    mkdir -p /backups/dados_clinicos
    if tar -czf "/backups/dados_clinicos/dados-clinicos-$carimbo.tar.gz" -C / dados_clinicos; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] Pastas de pacientes OK: dados-clinicos-$carimbo.tar.gz"
    else
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERRO no backup das pastas de pacientes" >&2
    fi
    manter_recentes /backups/dados_clinicos '*.tar.gz' "$RETENCAO"
  fi

  # backups vazios (de interrupcoes antigas) nao servem para nada e nao podem
  # ocupar a cota de retencao
  find /backups/postgres -name '*.dump' -size 0 -delete 2>/dev/null || true
  find /backups/postgres -name '*.dump.parcial' -mmin +120 -delete 2>/dev/null || true
  manter_recentes /backups/postgres '*.dump' "$RETENCAO"
  manter_recentes /backups/orthanc '*.tar.gz' "$RETENCAO"

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup concluido - mantendo os $RETENCAO mais recentes de cada tipo"
}

mkdir -p /backups/postgres /backups/orthanc

while true; do
  fazer_backup
  sleep 86400
done
