'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Sidebar from '../Sidebar'
import Topbar from '../Topbar'
import AvisoNaoDiagnostico from './AvisoNaoDiagnostico'
import { obterSessaoAtual, type SessaoUsuario } from '../../lib/sessao'

// Moldura comum das telas das pastas: confere login e perfil, menu,
// titulo e o conteudo. O aviso de "nao e diagnostico" fica junto das
// imagens/listas (ListaPacientes); `aviso` o poe tambem no topo.
export default function LayoutCasos({
  perfis,
  titulo,
  subtitulo,
  children,
  aviso = false,
}: {
  perfis: string[]
  titulo: string
  subtitulo?: string
  children: (sessao: SessaoUsuario) => ReactNode
  aviso?: boolean
}) {
  const router = useRouter()
  const t = useTranslations('Casos')
  const [sessao, setSessao] = useState<SessaoUsuario | null>(null)
  useEffect(() => {
    obterSessaoAtual().then((s) => {
      if (!s) return router.push('/login')
      if (!perfis.includes(s.perfil)) return router.push('/acesso-negado')
      setSessao(s)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])
  if (!sessao) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-base">
        <p className="text-sm text-slate-400">{t('carregando')}</p>
      </main>
    )
  }
  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar recolhivel />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 space-y-4 p-3 sm:p-6">
          <div>
            <h1 className="titulo-pagina tela-entra">{titulo}</h1>
            {subtitulo && <p className="mt-1 max-w-3xl text-sm text-slate-400">{subtitulo}</p>}
          </div>
          {aviso && <AvisoNaoDiagnostico />}
          {children(sessao)}
        </main>
      </div>
    </div>
  )
}
