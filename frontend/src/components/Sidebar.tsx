'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

interface ItemMenu {
  chave: string
  titulo: string
  href: string
  ativo: boolean
  /** Perfis que veem este item. Omitido = visivel pra qualquer perfil
   * autenticado (ex.: Início, Pesquisa avançada, Banco de imagens). */
  perfis?: string[]
  /** Cor da "caixinha" deste item (fundo em gradiente + borda + texto) -
   * mesmo esquema usado nas caixas de tipo de radiografia da Pesquisa
   * avançada (Periapical/Panorâmica/Interproximal/Oclusal), so que aqui
   * cada item do menu tem a SUA PROPRIA cor (por pedido), pra ficar facil
   * de diferenciar um item do outro so pela cor. */
  cor: string
}

const PERFIS_ADMIN_APENAS = ['administrador']
const PERFIS_ADMIN_E_CURADOR = ['administrador', 'curador']

// So tons ENTRE azul e verde no circulo cromatico (por pedido) - nessa
// ordem, do lado mais azul pro lado mais verde: blue -> sky -> cyan -> teal
// -> emerald -> green -> lime. Com 13 itens de menu e so 7 tons nessa
// faixa, os tons se repetem uma vez (o 8o item volta pro blue) - ainda
// assim nao ha repeticao entre itens vizinhos.
const COR_BLUE = 'from-blue-100 to-blue-50 border-blue-300 text-blue-700 dark:from-blue-600/30 dark:to-blue-900/10 dark:border-blue-700/40 dark:text-blue-300'
const COR_SKY = 'from-sky-100 to-sky-50 border-sky-300 text-sky-700 dark:from-sky-600/30 dark:to-sky-900/10 dark:border-sky-700/40 dark:text-sky-300'
const COR_CYAN = 'from-cyan-100 to-cyan-50 border-cyan-300 text-cyan-700 dark:from-cyan-600/30 dark:to-cyan-900/10 dark:border-cyan-700/40 dark:text-cyan-300'
const COR_TEAL = 'from-teal-100 to-teal-50 border-teal-300 text-teal-700 dark:from-teal-600/30 dark:to-teal-900/10 dark:border-teal-700/40 dark:text-teal-300'
const COR_EMERALD = 'from-emerald-100 to-emerald-50 border-emerald-300 text-emerald-700 dark:from-emerald-600/30 dark:to-emerald-900/10 dark:border-emerald-700/40 dark:text-emerald-300'
const COR_GREEN = 'from-green-100 to-green-50 border-green-300 text-green-700 dark:from-green-600/30 dark:to-green-900/10 dark:border-green-700/40 dark:text-green-300'
const COR_LIME = 'from-lime-100 to-lime-50 border-lime-300 text-lime-700 dark:from-lime-600/30 dark:to-lime-900/10 dark:border-lime-700/40 dark:text-lime-300'

const ITENS_MENU: ItemMenu[] = [
  { chave: 'inicio', titulo: 'Início', href: '/dashboard', ativo: true, cor: COR_BLUE },
  { chave: 'painelAdministrativo', titulo: 'Painel administrativo', href: '/painel-admin', ativo: true, perfis: PERFIS_ADMIN_APENAS, cor: COR_SKY },
  { chave: 'usuarios', titulo: 'Usuários', href: '/usuarios', ativo: true, perfis: PERFIS_ADMIN_APENAS, cor: COR_CYAN },
  { chave: 'imagensRecebidas', titulo: 'Imagens recebidas', href: '/imagens', ativo: true, perfis: PERFIS_ADMIN_E_CURADOR, cor: COR_TEAL },
  { chave: 'curadoria', titulo: 'Curadoria', href: '/curadoria', ativo: true, perfis: PERFIS_ADMIN_E_CURADOR, cor: COR_EMERALD },
  { chave: 'segundaOpiniao', titulo: 'Segunda opinião', href: '/segunda-opiniao', ativo: true, perfis: PERFIS_ADMIN_E_CURADOR, cor: COR_GREEN },
  { chave: 'pesquisaAvancada', titulo: 'Pesquisa avançada', href: '/pesquisa', ativo: true, cor: COR_LIME },
  { chave: 'bancoImagens', titulo: 'Banco de imagens', href: '/banco-imagens', ativo: true, cor: COR_BLUE },
  { chave: 'minhasImagens', titulo: 'Minhas imagens', href: '/minhas-imagens', ativo: true, cor: COR_SKY },
  { chave: 'relatorios', titulo: 'Relatórios', href: '/relatorios', ativo: true, perfis: PERFIS_ADMIN_E_CURADOR, cor: COR_CYAN },
  { chave: 'auditoria', titulo: 'Auditoria', href: '/auditoria', ativo: true, perfis: PERFIS_ADMIN_APENAS, cor: COR_TEAL },
  { chave: 'integracoes', titulo: 'Integrações', href: '/integracoes', ativo: true, perfis: PERFIS_ADMIN_APENAS, cor: COR_EMERALD },
  { chave: 'configuracoes', titulo: 'Configurações', href: '/configuracoes', ativo: true, perfis: PERFIS_ADMIN_APENAS, cor: COR_GREEN },
]

export default function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()
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
          {itensVisiveis.map((item) => {
            if (!item.ativo) {
              return (
                <span
                  key={item.chave}
                  className="cursor-not-allowed rounded-lg px-3 py-2 text-sm text-slate-500 opacity-50"
                >
                  {item.titulo}
                </span>
              )
            }

            // Destaque do item ativo: rota atual === href do item, ou uma
            // sub-rota dele (ex.: /visualizar/123 mantem "Banco de imagens"
            // aceso quando aplicavel). Apenas leitura de rota - visual.
            const estaAtivo = pathname === item.href || pathname?.startsWith(`${item.href}/`)

            return (
              <Link
                key={item.chave}
                href={item.href}
                aria-current={estaAtivo ? 'page' : undefined}
                className={`rounded-lg border bg-gradient-to-br px-3 py-2 text-sm font-medium transition-transform hover:-translate-y-0.5 ${item.cor} ${
                  estaAtivo ? 'ring-2 ring-brand ring-offset-2 ring-offset-base' : ''
                }`}
              >
                {item.titulo}
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="border-t border-base-border px-3 py-4">
        <button
          type="button"
          onClick={handleSair}
          className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-status-danger transition-colors hover:bg-red-950/40"
        >
          Sair
        </button>
      </div>
    </aside>
  )
}
