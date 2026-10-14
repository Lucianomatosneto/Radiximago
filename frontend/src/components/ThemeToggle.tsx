'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  aoMudarTemaDoSistema,
  aplicarTema,
  preferenciaSalva,
  proximaPreferencia,
  salvarPreferencia,
  temaDoSistema,
  type PreferenciaTema,
  type Tema,
} from '../lib/tema'

// Botao do tema (sol/lua) no topo da tela. Por padrao o Radix segue o tema
// do computador/celular (modo "automatico", com um "A" pequeno no botao).
// Cada clique passa para: o tema oposto ao da tela -> o outro tema ->
// automatico de novo. Detalhes em lib/tema.ts.
export default function ThemeToggle() {
  const t = useTranslations('ThemeToggle')
  const [preferencia, setPreferencia] = useState<PreferenciaTema>('auto')
  const [sistema, setSistema] = useState<Tema>('dark')
  // so aplica depois de ler a escolha salva (senao a 1a pintura ja feita
  // pelo script de app/layout.tsx seria desfeita por um instante)
  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    setPreferencia(preferenciaSalva())
    setPronto(true)
    setSistema(temaDoSistema())
    return aoMudarTemaDoSistema(setSistema)
  }, [])

  const tema = preferencia === 'auto' ? sistema : preferencia

  // aplica sempre que a escolha ou o tema do sistema mudarem
  useEffect(() => {
    if (pronto) aplicarTema(tema)
  }, [pronto, tema])

  function alternar() {
    const proxima = proximaPreferencia(preferencia, sistema)
    setPreferencia(proxima)
    salvarPreferencia(proxima)
  }

  const proxima = proximaPreferencia(preferencia, sistema)
  const dica =
    (preferencia === 'auto' ? t('estadoAuto', { tema: t(tema === 'dark' ? 'escuro' : 'claro') }) : t(tema === 'dark' ? 'estadoEscuro' : 'estadoClaro')) +
    ' · ' +
    t(proxima === 'auto' ? 'cliqueAuto' : proxima === 'dark' ? 'cliqueEscuro' : 'cliqueClaro')

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={dica}
      title={dica}
      className="relative flex h-9 w-9 items-center justify-center rounded-full border border-base-border bg-base-surface text-sm text-ink-3 transition-colors hover:border-brand/50 hover:text-ink"
    >
      {tema === 'dark' ? '🌙' : '☀️'}
      {preferencia === 'auto' && (
        <span
          aria-hidden="true"
          className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-base-border bg-base text-[9px] font-bold leading-none text-teal-300"
        >
          A
        </span>
      )}
    </button>
  )
}
