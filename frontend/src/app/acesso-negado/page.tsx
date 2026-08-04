'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import { obterSessaoAtual } from '../../lib/sessao'

export default function AcessoNegadoPage() {
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    obterSessaoAtual().then((sessao) => {
      if (!sessao) {
        router.push('/login')
        return
      }
      setCarregando(false)
    })
  }, [router])

  if (carregando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-base">
        <p className="text-slate-300">Carregando...</p>
      </main>
    )
  }

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar />

      <div className="flex flex-1 flex-col">
        <Topbar />

        <main className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-md text-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="mx-auto mb-4 h-16 w-16 text-amber-400"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>

            <h1 className="text-xl font-semibold text-slate-100">Acesso não autorizado</h1>
            <p className="mt-3 text-sm text-slate-400">
              Você não possui permissão para acessar esta área ou visualizar esta imagem.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Caso acredite que isso seja um erro, entre em contato com o administrador do
              sistema.
            </p>

            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="mt-6 rounded-md bg-brand px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
            >
              Voltar ao início
            </button>
          </div>
        </main>
      </div>
    </div>
  )
}
