'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface ItemMenu {
  label: string
  href: string
  ativo: boolean
  /** Perfis que veem este item. Omitido = visivel pra qualquer perfil
   * autenticado (ex.: Início, Pesquisa avançada, Banco de imagens). */
  perfis?: string[]
}

const PERFIS_ADMIN_APENAS = ['administrador']
const PERFIS_ADMIN_E_CURADOR = ['administrador', 'curador']

const ITENS_MENU: ItemMenu[] = [
  { label: 'Início', href: '/dashboard', ativo: true },
  { label: 'Painel administrativo', href: '/painel-admin', ativo: true, perfis: PERFIS_ADMIN_APENAS },
  { label: 'Usuários', href: '/usuarios', ativo: true, perfis: PERFIS_ADMIN_APENAS },
  { label: 'Imagens recebidas', href: '/imagens', ativo: true, perfis: PERFIS_ADMIN_E_CURADOR },
  { label: 'Curadoria', href: '/curadoria', ativo: true, perfis: PERFIS_ADMIN_E_CURADOR },
  { label: 'Segunda opinião', href: '/segunda-opiniao', ativo: true, perfis: PERFIS_ADMIN_E_CURADOR },
  { label: 'Pesquisa avançada', href: '/pesquisa', ativo: true },
  { label: 'Banco de imagens', href: '/banco-imagens', ativo: true },
  { label: 'Minhas imagens', href: '/minhas-imagens', ativo: true },
  { label: 'Relatórios', href: '/relatorios', ativo: true, perfis: PERFIS_ADMIN_E_CURADOR },
  { label: 'Auditoria', href: '/auditoria', ativo: true, perfis: PERFIS_ADMIN_APENAS },
  { label: 'Integrações', href: '/integracoes', ativo: true, perfis: PERFIS_ADMIN_APENAS },
  { label: 'Configurações', href: '/configuracoes', ativo: true, perfis: PERFIS_ADMIN_APENAS },
]

export default function Sidebar() {
  const router = useRouter()
  const [perfil, setPerfil] = useState<string | null>(null)

  useEffect(() => {
    setPerfil(localStorage.getItem('perfil'))
  }, [])

  function handleSair() {
    localStorage.removeItem('access_token')
    localStorage.removeItem('perfil')
    localStorage.removeItem('nome')
    localStorage.removeItem('foto_perfil_url')
    router.push('/login')
  }

  // Antes do perfil carregar do localStorage (1o render), nao mostra os
  // itens restritos - evita um "flash" deles pra quem nao tem acesso.
  const itensVisiveis = ITENS_MENU.filter((item) => !item.perfis || (perfil !== null && item.perfis.includes(perfil)))

  return (
    <aside className="flex h-screen w-64 flex-col justify-between border-r border-base-border bg-base">
      <div>
        <div className="border-b border-base-border px-6 py-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Navegação</p>
        </div>

        <nav className="mt-3 flex flex-col gap-1 px-3">
          {itensVisiveis.map((item) =>
            item.ativo ? (
              <Link
                key={item.label}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-blue-500/10 hover:text-blue-300"
              >
                {item.label}
              </Link>
            ) : (
              <span
                key={item.label}
                className="cursor-not-allowed rounded-lg px-3 py-2 text-sm text-slate-500 opacity-50"
              >
                {item.label}
              </span>
            )
          )}
        </nav>
      </div>

      <div className="border-t border-base-border px-3 py-4">
        <button
          type="button"
          onClick={handleSair}
          className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-400 transition-colors hover:bg-red-950/40"
        >
          Sair
        </button>
      </div>
    </aside>
  )
}
