'use client'

import { useId, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ERROS_TECNICOS } from '../../lib/errosTecnicos'
import { normalizarBusca } from '../../lib/catalogoTermos'

/**
 * ERRO TECNICO na Pesquisa avancada (e nas Macros).
 * 27/10/2026: em vez da lista sempre aberta, fica SO a caixa de texto; as
 * opcoes aparecem conforme a pessoa digita as iniciais ("sub" ->
 * Subexposição; "cab" -> Rotação/Inclinação da cabeça) - todos os erros
 * que a Curadoria permite marcar. Cada erro escolhido vira uma etiqueta
 * com ✕; varios ao mesmo tempo valem como "qualquer um deles".
 * Teclado: ↑/↓ escolhem, Enter marca, Esc fecha, Backspace no campo vazio
 * tira o ultimo.
 */
export default function FiltroErrosTecnicos({
  selecionados,
  onChange,
  estilo,
}: {
  selecionados: string[]
  onChange: (valores: string[]) => void
  estilo?: React.CSSProperties
}) {
  const t = useTranslations('Pesquisa')
  const id = useId()
  const [consulta, setConsulta] = useState('')
  const [aberto, setAberto] = useState(false)
  const [cursor, setCursor] = useState(0)
  const campoRef = useRef<HTMLInputElement>(null)

  const sugestoes = useMemo(() => {
    const q = normalizarBusca(consulta)
    if (!q) return []
    return ERROS_TECNICOS.filter((e) => !selecionados.includes(e.valor)).filter((e) => {
      const chaves = [e.rotulo, ...e.formas].map(normalizarBusca)
      return q.split(' ').every((p) => chaves.some((c) => c.split(' ').some((w) => w.startsWith(p)) || c.includes(p)))
    })
  }, [consulta, selecionados])

  function adicionar(valor: string) {
    onChange([...selecionados, valor])
    setConsulta('')
    setCursor(0)
    campoRef.current?.focus()
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && sugestoes.length) {
      e.preventDefault()
      setAberto(true)
      setCursor((c) => (c + 1) % sugestoes.length)
    } else if (e.key === 'ArrowUp' && sugestoes.length) {
      e.preventDefault()
      setCursor((c) => (c - 1 + sugestoes.length) % sugestoes.length)
    } else if (e.key === 'Enter' && aberto && sugestoes[cursor]) {
      e.preventDefault()
      e.stopPropagation()
      adicionar(sugestoes[cursor].valor)
    } else if (e.key === 'Escape') {
      setAberto(false)
    } else if (e.key === 'Backspace' && !consulta && selecionados.length) {
      onChange(selecionados.slice(0, -1))
    }
  }

  const rotulo = (valor: string) => ERROS_TECNICOS.find((e) => e.valor === valor)?.rotulo ?? valor

  return (
    <div className="relative">
      <div
        className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-lg border border-base-border bg-base-surface2 px-2 py-1.5 focus-within:border-brand"
        style={estilo}
        onClick={() => campoRef.current?.focus()}
      >
        {selecionados.map((v) => (
          <span
            key={v}
            className="flex items-center gap-1 rounded-full border border-orange-400/60 bg-orange-500/15 px-2 py-0.5 text-xs font-semibold text-orange-800 dark:text-orange-100"
          >
            {rotulo(v)}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onChange(selecionados.filter((x) => x !== v))
              }}
              aria-label={`✕ ${rotulo(v)}`}
              className="ml-0.5 rounded-full px-1 hover:bg-black/10"
            >
              ✕
            </button>
          </span>
        ))}
        <input
          ref={campoRef}
          type="search"
          role="combobox"
          aria-expanded={aberto && sugestoes.length > 0}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          autoComplete="off"
          value={consulta}
          maxLength={60}
          onChange={(e) => {
            setConsulta(e.target.value)
            setAberto(true)
            setCursor(0)
          }}
          onFocus={() => setAberto(true)}
          onBlur={() => window.setTimeout(() => setAberto(false), 150)}
          onKeyDown={aoTeclar}
          placeholder={selecionados.length ? t('errosMaisUm') : t('errosDigite')}
          aria-label={t('errosDigite')}
          className="min-w-[160px] flex-1 bg-transparent px-1 py-0.5 text-sm text-ink outline-hidden placeholder:text-slate-500"
        />
      </div>
      {aberto && consulta.trim() && (
        <ul
          id={`${id}-lista`}
          role="listbox"
          className="absolute z-40 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-base-border bg-base-surface p-1 shadow-2xl"
        >
          {sugestoes.length === 0 && <li className="px-3 py-2 text-xs text-slate-500">{t('errosNenhum')}</li>}
          {sugestoes.map((e, i) => (
            <li
              key={e.valor}
              role="option"
              aria-selected={i === cursor}
              onMouseDown={(ev) => {
                ev.preventDefault()
                adicionar(e.valor)
              }}
              onMouseEnter={() => setCursor(i)}
              className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm ${i === cursor ? 'bg-brand/15' : ''}`}
            >
              <span className="text-ink">{e.rotulo}</span>
              <span className="text-[10px] uppercase tracking-wide text-slate-500">{t(`errosGrupo.${e.grupo}`)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
