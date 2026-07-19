'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Topbar() {
  const router = useRouter()
  const [nome, setNome] = useState('')
  const [perfil, setPerfil] = useState('')

  useEffect(() => {
    setNome(localStorage.getItem('nome') ?? '')
    setPerfil(localStorage.getItem('perfil') ?? '')
  }, [])

  function handleSair() {
    localStorage.removeItem('access_token')
    localStorage.removeItem('perfil')
    localStorage.removeItem('nome')
    router.push('/login')
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-800 bg-slate-900 px-6">
      <span className="text-lg font-semibold tracking-wide text-teal-300">RADIX IMAGO</span>

      <div className="flex items-center gap-4">
        <button
          type="button"
          aria-label="Notificações"
          className="cursor-default rounded-full p-2 text-lg text-slate-400"
        >
          🔔
        </button>

        <div className="text-right text-sm leading-tight">
          <p className="font-medium text-slate-100">{nome || '—'}</p>
          <p className="text-xs capitalize text-slate-400">{perfil || '—'}</p>
        </div>

        <button
          type="button"
          onClick={handleSair}
          className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:border-red-500 hover:text-red-400"
        >
          Sair
        </button>
      </div>
    </header>
  )
}
