import './globals.css'
import { NextIntlClientProvider } from 'next-intl'
import FundoAplicacao from '../components/fundo/FundoAplicacao'
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
    >
      <head>
        <meta name="google" content="notranslate" />
        <script
          // Aplica o tema salvo antes do 1o paint, pra nao "piscar" escuro
          // e depois trocar pra claro (ou vice-versa) - ve components/ThemeToggle.tsx.
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('tema');document.documentElement.classList.add(t==='light'?'light':'dark');}catch(e){document.documentElement.classList.add('dark');}})();",
          }}
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
