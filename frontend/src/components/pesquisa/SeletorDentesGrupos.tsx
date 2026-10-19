'use client'

import type { KeyboardEvent } from 'react'
import { useTranslations } from 'next-intl'

// PESQUISA AVANCADA - busca por DENTE ou por GRUPO DE DENTES (notacao FDI).
// Substitui os antigos filtros "Arcada", "Lado" e "Quadrante": o usuario
// clica nos dentes (odontograma unico, igual ao da Curadoria) ou num grupo
// (incisivos, caninos, pre-molares, molares, terceiros molares), que marca
// ou desmarca todos os dentes daquele grupo de uma vez.
//
// Teclado: Tab chega na caixa; ← / → andam pelos botoes (grupos e dentes);
// Enter ou espaco marcam/desmarcam.

const ARCADA_SUPERIOR = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]
const ARCADA_INFERIOR = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]

export const GRUPOS_DENTES: { chave: string; dentes: number[] }[] = [
  { chave: 'incisivos', dentes: [11, 12, 21, 22, 31, 32, 41, 42] },
  { chave: 'caninos', dentes: [13, 23, 33, 43] },
  { chave: 'preMolares', dentes: [14, 15, 24, 25, 34, 35, 44, 45] },
  { chave: 'molares', dentes: [16, 17, 18, 26, 27, 28, 36, 37, 38, 46, 47, 48] },
  { chave: 'terceirosMolares', dentes: [18, 28, 38, 48] },
]

/** ← / → movem o foco entre os botoes da mesma caixa */
export function setasEntreBotoes(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  const botoes = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])'))
  const i = botoes.indexOf(document.activeElement as HTMLButtonElement)
  if (i < 0) return
  e.preventDefault()
  const j = (i + (e.key === 'ArrowRight' ? 1 : -1) + botoes.length) % botoes.length
  botoes[j].focus()
}

export default function SeletorDentesGrupos({
  dentesSelecionados,
  onChange,
}: {
  dentesSelecionados: number[]
  onChange: (dentes: number[]) => void
}) {
  const t = useTranslations('Pesquisa.gruposDentes')
  const marcado = (d: number) => dentesSelecionados.includes(d)

  function alternarDente(d: number) {
    onChange(marcado(d) ? dentesSelecionados.filter((x) => x !== d) : [...dentesSelecionados, d].sort((a, b) => a - b))
  }

  function alternarGrupo(dentes: number[]) {
    const todos = dentes.every(marcado)
    const novos = todos
      ? dentesSelecionados.filter((d) => !dentes.includes(d))
      : Array.from(new Set([...dentesSelecionados, ...dentes]))
    onChange(novos.sort((a, b) => a - b))
  }

  const linha = (lista: number[]) => (
    <div className="grid grid-cols-16 gap-0.5">
      {lista.map((d, i) => (
        <button
          key={d}
          type="button"
          onClick={() => alternarDente(d)}
          aria-pressed={marcado(d)}
          className={`rounded py-1 text-[11px] font-semibold outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-amber-300 ${i === 8 ? 'ml-1' : ''} ${
            marcado(d) ? 'bg-brand text-white' : 'bg-white/5 text-slate-300 hover:bg-white/15'
          }`}
        >
          {d}
        </button>
      ))}
    </div>
  )

  return (
    <div onKeyDown={setasEntreBotoes} className="space-y-2">
      {/* grupos em colunas iguais (alinhados com o odontograma abaixo) */}
      <div className="grid grid-cols-[1fr_1fr_1.2fr_1fr_1.55fr] gap-1.5">
        {GRUPOS_DENTES.map((g) => {
          const ativo = g.dentes.every(marcado)
          return (
            <button
              key={g.chave}
              type="button"
              onClick={() => alternarGrupo(g.dentes)}
              aria-pressed={ativo}
              className={`whitespace-nowrap rounded-full border px-1 py-1 text-center text-xs outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-amber-300 ${
                ativo ? 'border-brand bg-brand text-white' : 'border-base-border text-slate-300 hover:border-brand/50'
              }`}
            >
              {t(g.chave)}
            </button>
          )
        })}
      </div>
      <div className="space-y-1 rounded-lg border border-white/10 bg-black/10 p-1.5">
        {linha(ARCADA_SUPERIOR)}
        <div className="border-t border-white/10" />
        {linha(ARCADA_INFERIOR)}
      </div>
      {dentesSelecionados.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onChange([])}
            className="rounded-sm px-1 text-xs text-slate-400 outline-hidden hover:text-red-300 focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            {t('limpar')}
          </button>
        </div>
      )}
    </div>
  )
}
