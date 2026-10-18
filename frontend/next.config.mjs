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
const CABECALHOS_DE_PROTECAO = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: CABECALHOS_DE_PROTECAO }]
  },
}

export default withNextIntl(nextConfig)
