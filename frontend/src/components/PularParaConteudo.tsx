'use client'

import { useTranslations } from 'next-intl'

// "PULAR PARA O CONTEUDO" (01/11/2026): primeiro item da pagina ao usar o
// Tab; fica escondido e aparece quando recebe foco. Leva o foco ao <main>
// da tela (todas as telas tem um), pulando menu e barra superior.
export default function PularParaConteudo() {
  const t = useTranslations('Comum')
  function pular(e: React.MouseEvent<HTMLAnchorElement>) {
    const principal = document.querySelector('main')
    if (!principal) return
    e.preventDefault()
    if (!principal.hasAttribute('tabindex')) principal.setAttribute('tabindex', '-1')
    principal.focus()
    principal.scrollIntoView({ block: 'start' })
  }
  return (
    <a
      href="#conteudo"
      onClick={pular}
      className="sr-only z-[100] rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white shadow-lg focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
    >
      {t('pularConteudo')}
    </a>
  )
}
