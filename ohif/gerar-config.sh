#!/bin/sh
# Monta a configuracao do visualizador OHIF na hora de ligar o container
# (chamado pelo docker-compose.yml; a imagem e Alpine, so /bin/sh).
#
# 1. app-config.js: copia do template, trocando __RADIX_ORIGEM_CONFIAVEL__
#    pelo endereco das telas do Radix. O OHIF so aceita mensagens
#    (postMessage) vindas DESSE endereco - nunca de quem o colocou em
#    moldura (OWASP ASVS 3.5.5, 12/11/2026).
# 2. nginx: gera o default.conf da imagem e acrescenta
#    - "Content-Security-Policy: frame-ancestors <origem>": so as telas do
#      Radix podem mostrar o OHIF em moldura (ASVS 3.4.6). Vai em CADA bloco
#      "location" e tambem no servidor, porque no Nginx um add_header dentro
#      de um bloco faz o bloco ignorar os do servidor (o "location /" da
#      imagem 3.9.2 ja tem um add_header proprio);
#    - X-Frame-Options NAO e enviado de proposito: ele so sabe DENY ou
#      SAMEORIGIN, e as telas (porta 3000 / app.) e o OHIF (porta 3001 /
#      viewer.) sao origens diferentes - SAMEORIGIN quebraria o visualizador.
#      O frame-ancestors substitui o X-Frame-Options nos navegadores atuais;
#    - a portaria das imagens (radix-dicomweb.conf) e o app-config.js sem cache.
#
# Variaveis (com os caminhos reais do container como padrao; os testes
# automaticos trocam os caminhos):
#   RADIX_ORIGEM_CONFIAVEL  endereco das telas, ex.: https://app.radiximago.com.br
#   PORT                    porta do nginx (a imagem usa 80)
set -eu

ORIGEM="${RADIX_ORIGEM_CONFIAVEL:-http://localhost:3000}"
PORTA="${PORT:-80}"
TEMPLATE_APP_CONFIG="${TEMPLATE_APP_CONFIG:-/usr/src/app-config.template.js}"
SAIDA_APP_CONFIG="${SAIDA_APP_CONFIG:-/usr/share/nginx/html/app-config.js}"
TEMPLATE_NGINX="${TEMPLATE_NGINX:-/usr/src/default.conf.template}"
SAIDA_NGINX="${SAIDA_NGINX:-/etc/nginx/conf.d/default.conf}"

# so "http(s)://nome(:porta)" - sem barra, caminho, aspas ou espacos (o valor
# vai para dentro do JavaScript e da configuracao do nginx)
if ! printf '%s' "$ORIGEM" | grep -Eq '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$'; then
  echo "RADIX_ORIGEM_CONFIAVEL invalida: '$ORIGEM' (use, por exemplo, https://app.radiximago.com.br)" >&2
  exit 1
fi
if ! printf '%s' "$PORTA" | grep -Eq '^[0-9]{1,5}$'; then
  echo "PORT invalida: '$PORTA'" >&2
  exit 1
fi

# 1. app-config.js (tr: o Git no Windows pode trazer o template com CRLF)
tr -d '\r' < "$TEMPLATE_APP_CONFIG" | sed "s|__RADIX_ORIGEM_CONFIAVEL__|$ORIGEM|g" > "$SAIDA_APP_CONFIG"

# 2. nginx
CSP="add_header Content-Security-Policy \"frame-ancestors $ORIGEM\" always;"
sed "s|\${PORT}|$PORTA|g" "$TEMPLATE_NGINX" > "$SAIDA_NGINX"
# em cada bloco "location ... {" que ocupa varias linhas
sed -i "/^[[:space:]]*location[^{]*{[[:space:]]*\$/a\\    $CSP" "$SAIDA_NGINX"
# no servidor (vale para os blocos sem add_header proprio, inclusive os da portaria)
sed -i "/^server {/a\\  $CSP" "$SAIDA_NGINX"
sed -i '/^server {/a\  location = /app-config.js { root /usr/share/nginx/html; add_header Cache-Control "no-store"; }' "$SAIDA_NGINX"
sed -i '/^server {/a\  include /etc/nginx/radix-dicomweb.conf;' "$SAIDA_NGINX"
