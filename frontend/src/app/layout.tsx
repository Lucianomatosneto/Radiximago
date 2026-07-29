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
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
