'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import GradeCategoriasImagens from '../../components/GradeCategoriasImagens'

export default function BancoImagensPage() {
  const router = useRouter()
  const t = useTranslations('BancoImagens')
  const tComum = useTranslations('Comum')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      router.push('/login')
      return
    }
    setCarregando(false)
  }, [router])

  if (carregando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-base">
        <p className="text-slate-300">{tComum('carregando')}</p>
      </main>
    )
  }

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar />

      <div className="flex flex-1 flex-col">
        <Topbar />

        <main className="flex-1 overflow-y-auto p-6">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h1 className="mb-1 text-xl font-semibold text-slate-100">{t('titulo')}</h1>
              <p className="text-sm text-slate-500">
                {t('subtitulo')}
              </p>
            </div>
            <Link
              href="/pesquisa"
              className="shrink-0 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
            >
              {t('buscaAvancada')}
            </Link>
          </div>

          <GradeCategoriasImagens />
        </main>
      </div>
    </div>
  )
}
