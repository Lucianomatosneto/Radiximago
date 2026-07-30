import './globals.css'

export const metadata = {
  title: 'Rádix Imago',
  description: 'Base inteligente de imagens para ensino e pesquisa em saúde',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <head>
        <script
          // Aplica o tema salvo antes do 1o paint, pra nao "piscar" escuro
          // e depois trocar pra claro (ou vice-versa) - ve components/ThemeToggle.tsx.
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('tema');document.documentElement.classList.add(t==='light'?'light':'dark');}catch(e){document.documentElement.classList.add('dark');}})();",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
