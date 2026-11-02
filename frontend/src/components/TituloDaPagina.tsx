'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const MARCA = 'Rádix Imago'

// TITULO DA ABA POR PAGINA (02/11/2026, WCAG 2.4.2): todas as paginas tinham o
// mesmo titulo ("Rádix Imago"), entao quem usa leitor de tela, varias abas ou o
// historico nao distinguia uma tela da outra. Aqui o titulo vira
// "<titulo da tela> · Rádix Imago", tirado do <h1> da propria pagina (que ja
// segue o idioma escolhido). Espera o <h1> aparecer porque as telas carregam
// seus dados depois de abrir; para de tentar apos ~4 s (fica so a marca).
export default function TituloDaPagina() {
  const caminho = usePathname()

  useEffect(() => {
    let tentativas = 0
    const id = setInterval(() => {
      tentativas += 1
      const h1 = document.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim()
      if (h1) {
        const titulo = h1.toLowerCase() === MARCA.toLowerCase() ? MARCA : `${h1} · ${MARCA}`
        if (document.title !== titulo) document.title = titulo
      }
      if (tentativas >= 20) clearInterval(id)
    }, 200)
    return () => clearInterval(id)
  }, [caminho])

  return null
}
