'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface ItemMenu {
  label: string
  href?: string
  ativo: boolean
}

const ITENS_MENU: ItemMenu[] = [
  { label: 'Início', href: '/dashboard', ativo: true },
  { label: 'Usuários', href: '/usuarios', ativo: true },
  { label: 'Imagens recebidas', href: '/imagens', ativo: true },
  { label: 'Curadoria', href: '/curadoria', ativo: true },
  { label: 'Segunda opinião', ativo: false },
  { label: 'Pesquisa avançada', ativo: false },
  { label: 'Banco de imagens', ativo: false },
  { label: 'Relatórios', ativo: false },
  { label: 'Auditoria', ativo: false },
  { label: 'Integrações', ativo: false },
  { label: 'Configurações', ativo: false },
]

export default function Sidebar() {
  const router = useRouter()

  function handleSair() {
    localStorage.removeItem('access_token')
    localStorage.removeItem('perfil')
    localStorage.removeItem('nome')
    router.push('/login')
  }

  return (
    <aside className="flex h-screen w-64 flex-col justify-between border-r border-slate-800 bg-slate-950">
      <div>
        <div className="border-b border-slate-800 px-6 py-5">
          <span className="text-lg font-bold tracking-wide text-teal-300">RADIX IMAGO</span>
        </div>

        <nav className="mt-2 flex flex-col gap-1 px-3">
          {ITENS_MENU.map((item) =>
            item.ativo ? (
              <Link
                key={item.label}
                href={item.href as string}
                className="rounded-md bg-teal-900/40 px-3 py-2 text-sm font-medium text-teal-200"
              >
                {item.label}
              </Link>
            ) : (
              <span
                key={item.label}
                className="cursor-not-allowed rounded-md px-3 py-2 text-sm text-slate-400 opacity-50"
              >
                {item.label}
              </span>
            )
          )}
        </nav>
      </div>

      <div className="border-t border-slate-800 px-3 py-4">
        <button
          type="button"
          onClick={handleSair}
          className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-red-400 transition-colors hover:bg-red-950/40"
        >
          Sair
        </button>
      </div>
    </aside>
  )
}
