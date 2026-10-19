import createNextIntlPlugin from 'next-intl/plugin'

// Liga o Radix Imago ao next-intl (biblioteca de idiomas) SEM mudar
// nenhuma URL existente (ex.: /pesquisa continua sendo /pesquisa, nao
// /pt/pesquisa) - o idioma e detectado por tras dos panos, conforme a
// logica em src/i18n/request.ts.
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

// Cabecalhos de protecao em todas as telas (OWASP ASVS 3.4.4 a 3.4.6 -
// ver docs/SEGURANCA.md):
// - nosniff: o navegador nao "adivinha" o tipo dos arquivos;
// - same-origin: o endereco das telas (que pode ter numero de imagem ou
//   ficha) nao e enviado a outros sites;
// - DENY / frame-ancestors 'none': nenhum outro site consegue colocar o
//   Radix dentro de uma moldura (iframe) para enganar o usuario
//   ("clickjacking"). O Radix continua podendo mostrar o OHIF em moldura -
//   a regra vale para quem embute o Radix, nao para o que o Radix embute.
//
// Politica de conteudo (Content-Security-Policy - OWASP ASVS 3.4.3): lista
// FECHADA do que as telas podem carregar. Se alguem conseguir injetar um
// <script src="https://site-atacante/..."> ou um <object>, o navegador
// recusa. Origens permitidas:
// - a propria tela ('self');
// - a API do Radix (dados e imagens) - NEXT_PUBLIC_API_URL;
// - o visualizador OHIF, so dentro de moldura - NEXT_PUBLIC_OHIF_URL
//   (padrao http://localhost:3001, o mesmo OHIF_BASE_URL da API);
// - "blob:" e "data:": imagens montadas no proprio navegador (miniaturas,
//   marcacoes, impressao) e audio da curadoria por voz.
// Limites declarados (docs/SEGURANCA.md): 'unsafe-inline' em scripts e
// estilos continua permitido, porque o Next.js escreve pequenos scripts
// dentro da pagina e o tema e aplicado antes da 1a pintura. Sem ele seria
// preciso "nonce" por resposta (exigencia do Nivel 3, nao do Nivel 2).
// 'unsafe-eval' e "ws:" so em desenvolvimento (recarga automatica do
// "npm run dev").
const DESENVOLVIMENTO = process.env.NODE_ENV !== 'production'

function origem(url, padrao) {
  try {
    return new URL(url || padrao).origin
  } catch {
    return new URL(padrao).origin
  }
}

const ORIGEM_API = origem(process.env.NEXT_PUBLIC_API_URL, 'http://localhost:8000')
const ORIGEM_OHIF = origem(process.env.NEXT_PUBLIC_OHIF_URL, 'http://localhost:3001')

export const POLITICA_DE_CONTEUDO = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${DESENVOLVIMENTO ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${ORIGEM_API}`,
  "font-src 'self' data:",
  `connect-src 'self' ${ORIGEM_API} ${ORIGEM_OHIF}${DESENVOLVIMENTO ? ' ws:' : ''}`,
  `frame-src ${ORIGEM_OHIF}`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const CABECALHOS_DE_PROTECAO = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: POLITICA_DE_CONTEUDO },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: CABECALHOS_DE_PROTECAO }]
  },
}

export default withNextIntl(nextConfig)
