import './globals.css'
import { NextIntlClientProvider } from 'next-intl'
import FundoAplicacao from '../components/fundo/FundoAplicacao'
import { SCRIPT_TEMA_INICIAL } from '../lib/tema'
import { getLocale, getTranslations } from 'next-intl/server'

// Descricao do <meta> segue o mesmo idioma detectado pra pagina (ver
// i18n/request.ts) - reaproveita Inicio.subtitulo em vez de duplicar o
// texto aqui. O titulo da aba ("Rádix Imago") e nome proprio da marca,
// entao continua igual nos dois idiomas de proposito.
export async function generateMetadata() {
  const t = await getTranslations('Inicio')
  return {
    title: 'Rádix Imago',
    description: t('subtitulo'),
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Idioma detectado para esta visita (navegador da pessoa ou escolha
  // manual dela - ver src/i18n/request.ts). So usado aqui pro atributo
  // "lang" do HTML (importante pra acessibilidade e leitores de tela);
  // o NextIntlClientProvider abaixo ja pega o idioma e as traducoes
  // certas sozinho, sem precisar passar como propriedade.
  const locale = await getLocale()

  return (
    <html
      lang={locale === 'en' ? 'en' : 'pt-BR'}
      // Impede a traducao automatica do navegador (Google Tradutor do
      // Chrome): ela troca os textos da pagina por baixo do React e causa
      // o erro "o conteudo do texto nao corresponde" (hidratacao). O
      // sistema ja tem portugues e ingles proprios (seletor PT/EN).
      translate="no"
      // o tema (classe "dark"/"light") e posto por um script ANTES do React
      // carregar (sem piscar a tela) - entao a classe do <html> difere do
      // HTML do servidor de proposito. Aviso padrao do Next para esse caso.
      suppressHydrationWarning
    >
      <head>
        <meta name="google" content="notranslate" />
        <script
          // Aplica o tema antes do 1o paint, pra nao "piscar" escuro e
          // depois trocar pra claro (ou vice-versa): a escolha salva ou, sem
          // escolha, o tema do computador/celular - ve lib/tema.ts.
          dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA_INICIAL }}
        />
      </head>
      <body>
        <NextIntlClientProvider>
          {/* mapa-mundi de fundo (padrao visual de todas as telas - ver FundoAplicacao) */}
          <FundoAplicacao />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
