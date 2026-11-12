// k6 (Grafana) = simulador de usuários simultâneos. Mede quanto tempo a API leva para responder.
//
// REGRAS DE SEGURANÇA (nunca quebrar):
//   - SÓ rodar contra ambiente ISOLADO (nunca contra o servidor de produção);
//   - só rotas públicas, sem login e sem dados reais;
//   - carga GRADUAL: começa com poucos usuários e sobe aos poucos.
//
// Como rodar:  k6 run -e BASE_URL=http://127.0.0.1:8000 auditoria/ferramentas/k6/linha_de_base.js
import http from 'k6/http'
import { check, sleep } from 'k6'

const BASE = __ENV.BASE_URL || 'http://127.0.0.1:8000'

if (/radiximago\.com\.br/.test(BASE)) {
  throw new Error('RECUSADO: não rode teste de carga contra o endereço de produção.')
}

export const options = {
  stages: [
    { duration: '15s', target: 3 }, // aquecimento
    { duration: '20s', target: 10 }, // carga leve
    { duration: '20s', target: 25 }, // carga moderada
    { duration: '10s', target: 0 }, // descida
  ],
  thresholds: {
    // 95% das respostas em menos de 500 ms; menos de 1% de falhas inesperadas
    'http_req_duration{rota:health}': ['p(95)<500'],
    'http_req_duration{rota:termos}': ['p(95)<800'],
    inesperadas: ['rate<0.01'],
  },
}

import { Rate } from 'k6/metrics'
const inesperadas = new Rate('inesperadas')

export default function () {
  const saude = http.get(`${BASE}/health`, { tags: { rota: 'health' } })
  inesperadas.add(saude.status !== 200 && saude.status !== 429)
  check(saude, { 'health 200 ou limitado (429)': (r) => r.status === 200 || r.status === 429 })

  const termos = http.get(`${BASE}/termos`, { tags: { rota: 'termos' } })
  inesperadas.add(termos.status !== 200 && termos.status !== 429)
  check(termos, { 'termos 200 ou limitado (429)': (r) => r.status === 200 || r.status === 429 })

  sleep(1)
}
