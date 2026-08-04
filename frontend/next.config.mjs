import createNextIntlPlugin from 'next-intl/plugin'

// Liga o Radix Imago ao next-intl (biblioteca de idiomas) SEM mudar
// nenhuma URL existente (ex.: /pesquisa continua sendo /pesquisa, nao
// /pt/pesquisa) - o idioma e detectado por tras dos panos, conforme a
// logica em src/i18n/request.ts.
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {}

export default withNextIntl(nextConfig)
