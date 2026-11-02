#!/bin/sh
# ENSAIO DE RESTAURACAO do backup diario do banco (02/11/2026).
#
# Um backup que nunca foi restaurado nao e garantia. Este ensaio restaura o
# backup mais recente (nao vazio) num banco TEMPORARIO e confere se os dados
# voltaram. NAO toca no banco do sistema: so le dele para comparar, e o banco
# temporario e apagado no fim.
#
# Roda DENTRO do container radix-backup (ele ja tem pg_restore, psql e as
# credenciais). Copie o arquivo para la e rode (PowerShell ou Linux, na pasta
# do projeto):
#   docker compose cp scripts/testar-restauracao.sh radix-backup:/tmp/testar-restauracao.sh
#   docker compose exec radix-backup sh /tmp/testar-restauracao.sh
#
# O que confere:
#   1. o arquivo existe, nao esta vazio e o pg_restore consegue le-lo;
#   2. a restauracao termina sem erro;
#   3. a versao do esquema (alembic) e a mesma do sistema;
#   4. as tabelas principais voltaram com dados (o sistema pode ter recebido
#      novos registros depois do backup, entao o banco real pode ter MAIS linhas);
#   5. a protecao da auditoria (registros nao podem ser apagados) voltou junto;
#   6. o arquivo mais recente do Orthanc abre e tem tamanho coerente (leitura completa: COMPLETO=1).
# Fotos cifradas das pastas de pacientes (dados_clinicos) e a CASOS_CHAVE NAO
# sao verificadas aqui: ver docs/IMPLANTACAO.md.
set -u

TEMP_DB="radix_restauracao_teste"
REAL_DB="${PGDATABASE:?PGDATABASE nao definido}"
[ "$TEMP_DB" != "$REAL_DB" ] || { echo "RECUSADO: o banco temporario nao pode ser o do sistema."; exit 2; }

ok()   { echo "  [OK]    $1"; }
erro() { echo "  [ERRO]  $1"; FALHAS=$((FALHAS + 1)); }
FALHAS=0

limpar() { psql -d postgres -qAt -c "DROP DATABASE IF EXISTS $TEMP_DB" >/dev/null 2>&1; }
trap limpar EXIT

echo "== Ensaio de restauracao do backup do banco =="

# 1. o backup mais recente que nao esta vazio
ARQ=$(ls -1t /backups/postgres/radix-imago-*.dump 2>/dev/null | while read -r f; do [ -s "$f" ] && echo "$f" && break; done)
[ -n "$ARQ" ] || { echo "  [ERRO]  nenhum backup do banco com conteudo em /backups/postgres"; exit 1; }
TAM=$(wc -c < "$ARQ")
echo "Arquivo: $(basename "$ARQ") ($TAM bytes)"
if pg_restore --list "$ARQ" >/dev/null 2>&1; then ok "o arquivo e legivel pelo pg_restore"; else erro "o pg_restore nao consegue ler o arquivo"; exit 1; fi

# 2. restaura num banco temporario
limpar
psql -d postgres -qAt -c "CREATE DATABASE $TEMP_DB" >/dev/null 2>&1 || { echo "  [ERRO]  nao consegui criar o banco temporario (permissao?)"; exit 1; }
if pg_restore -d "$TEMP_DB" --no-owner --exit-on-error "$ARQ" >/tmp/restauracao.log 2>&1; then
  ok "restauracao concluida sem erro"
else
  erro "a restauracao falhou (ultimas linhas abaixo)"; tail -5 /tmp/restauracao.log; exit 1
fi

q() { psql -d "$1" -qAt -c "$2" 2>/dev/null; }

# 3. versao do esquema
V_REAL=$(q "$REAL_DB" "SELECT version_num FROM alembic_version")
V_REST=$(q "$TEMP_DB" "SELECT version_num FROM alembic_version")
if [ "$V_REAL" = "$V_REST" ] && [ -n "$V_REST" ]; then ok "versao do esquema igual ao sistema ($V_REST)"; else erro "versao do esquema diferente (sistema: $V_REAL; backup: $V_REST)"; fi

# 4. tabelas principais
echo "  Tabela                    backup   sistema agora"
for T in users audit_logs curations casos_clinicos casos_imagens casos_historico compartilhamentos_imagem sessoes_usuario; do
  N_REST=$(q "$TEMP_DB" "SELECT count(*) FROM $T")
  N_REAL=$(q "$REAL_DB" "SELECT count(*) FROM $T")
  printf "  %-24s %7s   %7s\n" "$T" "${N_REST:-?}" "${N_REAL:-?}"
  if [ -z "$N_REST" ]; then erro "tabela $T nao voltou"; fi
done
USERS=$(q "$TEMP_DB" "SELECT count(*) FROM users")
LOGS=$(q "$TEMP_DB" "SELECT count(*) FROM audit_logs")
[ "${USERS:-0}" -gt 0 ] && ok "usuarios restaurados ($USERS)" || erro "nenhum usuario restaurado"
[ "${LOGS:-0}" -gt 0 ] && ok "registros de auditoria restaurados ($LOGS)" || erro "auditoria vazia"

# 5. protecao da auditoria
GATILHO=$(q "$TEMP_DB" "SELECT count(*) FROM pg_proc WHERE proname = 'radix_auditoria_protegida'")
[ "${GATILHO:-0}" -ge 1 ] && ok "protecao da auditoria (nao apagar/alterar) voltou" || erro "protecao da auditoria NAO voltou"

# 6. ultimo backup do Orthanc. Por padrao a checagem e RAPIDA (o arquivo tem alguns GB e
#    ler tudo no Docker do Windows leva minutos): confere que o arquivo e um .gz valido (assinatura do inicio) e que o
#    tamanho e parecido com o do backup anterior (um arquivo cortado ao meio fica bem menor).
#    Para ler o arquivo inteiro (gzip -t), rode com COMPLETO=1.
ORTS=$(ls -1t /backups/orthanc/orthanc-dados-*.tar.gz 2>/dev/null)
ORT=$(echo "$ORTS" | sed -n 1p)
ANT=$(echo "$ORTS" | sed -n 2p)
if [ -z "$ORT" ]; then
  erro "nenhum backup do Orthanc encontrado"
else
  T1=$(stat -c %s "$ORT")
  ASSINATURA=$(head -c 2 "$ORT" | od -An -tx1 | tr -d ' \n')
  if [ "$T1" -gt 0 ] && [ "$ASSINATURA" = "1f8b" ]; then
    ok "backup do Orthanc tem formato .gz valido ($(basename "$ORT"), $T1 bytes)"
  else
    erro "backup do Orthanc vazio ou ilegivel: $(basename "$ORT")"
  fi
  if [ -n "$ANT" ]; then
    T0=$(stat -c %s "$ANT")
    if [ "$T1" -ge $((T0 * 8 / 10)) ]; then ok "tamanho coerente com o backup anterior ($T1 x $T0 bytes)"; else erro "backup do Orthanc bem menor que o anterior ($T1 x $T0): pode estar cortado"; fi
  fi
  if [ "${COMPLETO:-0}" = "1" ]; then
    echo "  ... lendo o arquivo inteiro do Orthanc (pode demorar varios minutos)"
    if gzip -t "$ORT" 2>/dev/null; then ok "arquivo do Orthanc integro de ponta a ponta"; else erro "arquivo do Orthanc corrompido (gzip -t)"; fi
  fi
fi

echo
if [ "$FALHAS" -eq 0 ]; then echo "RESULTADO: ENSAIO APROVADO. O backup restaura e os dados voltam."; else echo "RESULTADO: $FALHAS PROBLEMA(S). Veja os [ERRO] acima."; exit 1; fi
