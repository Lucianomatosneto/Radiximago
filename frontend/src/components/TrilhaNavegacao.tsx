'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronRight, House } from 'lucide-react'
import { ROTAS_SEM_TRILHA, SEGMENTOS, casaRota, paginaInicial } from '../lib/navegacao'

// TRILHA DE NAVEGACAO (breadcrumb, 01/11/2026): "Inicio › Minhas imagens",
// montada a partir do endereco da tela. Os numeros (ex.: /visualizar/12)
// viram "Imagem nº 12".
export default function TrilhaNavegacao({ perfil }: { perfil: string }) {
  const rota = usePathname() || '/'
  const t = useTranslations('Navegacao')
  if (casaRota(rota, ROTAS_SEM_TRILHA)) return null
  const inicio = paginaInicial(perfil)
  const partes = rota.split('/').filter(Boolean)
  if (!partes.length || `/${partes.join('/')}` === inicio) return null

  const itens: { rotulo: string; href: string }[] = []
  partes.forEach((p, i) => {
    const href = `/${partes.slice(0, i + 1).join('/')}`
    if (/^\d+$/.test(p)) {
      itens.push({ rotulo: t('itemN', { id: p }), href })
      return
    }
    const chave = SEGMENTOS[p]
    if (!chave) return
    const destino = p === 'visualizar' ? '/banco-imagens' : href
    itens.push({ rotulo: t(`segmentos.${chave}`), href: destino })
  })
  if (!itens.length) return null

  return (
    <nav aria-label={t('trilha')} className="border-b border-base-border/60 px-4 py-2 text-[13px] sm:px-6 print:hidden">
      <ol className="trilha-lista flex flex-wrap items-center gap-1 text-slate-500">
        <li>
          <Link href={inicio} className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-brand">
            <House aria-hidden="true" className="h-3.5 w-3.5" />
            {t('inicio')}
          </Link>
        </li>
        {itens.map((item, i) => {
          const ultimo = i === itens.length - 1
          return (
            <li key={item.href + i} className="inline-flex items-center gap-1">
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
              {ultimo ? (
                <span aria-current="page" className="font-medium text-ink">{item.rotulo}</span>
              ) : (
                <Link href={item.href} className="rounded px-1 py-0.5 hover:text-brand">{item.rotulo}</Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
