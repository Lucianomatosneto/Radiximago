'use client'

import { useEffect, useState } from 'react'

type Tema = 'dark' | 'light'

function aplicarTema(tema: Tema) {
  document.documentElement.classList.remove('dark', 'light')
  document.documentElement.classList.add(tema)
  localStorage.setItem('tema', tema)
}

export default function ThemeToggle() {
  const [tema, setTema] = useState<Tema>('dark')

  useEffect(() => {
    const salvo = localStorage.getItem('tema')
    setTema(salvo === 'light' ? 'light' : 'dark')
  }, [])

  function alternar() {
    const proximo: Tema = tema === 'dark' ? 'light' : 'dark'
    setTema(proximo)
    aplicarTema(proximo)
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={tema === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
      title={tema === 'dark' ? 'Modo claro' : 'Modo escuro'}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-base-border bg-base-surface text-sm text-ink-3 transition-colors hover:border-brand/50 hover:text-ink"
    >
      {tema === 'dark' ? '☀️' : '🌙'}
    </button>
  )
}
