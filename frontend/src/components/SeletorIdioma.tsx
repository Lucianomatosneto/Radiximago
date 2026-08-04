'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { COOKIE_IDIOMA, IDIOMAS_SUPORTADOS, type Idioma } from '../i18n/config'

// Botao PT/EN pra trocar o idioma na mao. O idioma normalmente ja e
// detectado sozinho pelo navegador de quem acessa (ver i18n/request.ts),
// mas isso permite corrigir se a deteccao automatica errar - por exemplo,
// alguem com o navegador configurado em portugues acessando de fora do
// Brasil, ou um avaliador estrangeiro cujo navegador esta em ingles mas
// prefere ver em portugues mesmo assim.
export default function SeletorIdioma() {
  const idiomaAtual = useLocale()
  const t = useTranslations('SeletorIdioma')
  const router = useRouter()
  const [pendente, iniciarTransicao] = useTransition()

  function trocarIdioma(idioma: Idioma) {
    if (idioma === idiomaAtual) return
    // 1 ano de validade - a escolha fica valendo ate a pessoa trocar de
    // novo (ou limpar os cookies do navegador).
    document.cookie = `${COOKIE_IDIOMA}=${idioma}; path=/; max-age=${60 * 60 * 24 * 365}`
    iniciarTransicao(() => {
      router.refresh()
    })
  }

  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-white/20 bg-black/60 p-0.5 text-xs shadow-lg backdrop-blur-md">
      {IDIOMAS_SUPORTADOS.map((idioma) => (
        <button
          key={idioma}
          type="button"
          onClick={() => trocarIdioma(idioma)}
          disabled={pendente}
          aria-current={idioma === idiomaAtual}
          className={`rounded-full px-2.5 py-1 font-medium transition-colors disabled:opacity-60 ${
            idioma === idiomaAtual ? 'bg-white text-black' : 'text-slate-300 hover:text-white'
          }`}
        >
          {t(idioma)}
        </button>
      ))}
    </div>
  )
}
