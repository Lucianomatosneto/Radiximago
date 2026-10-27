'use client'

import { useId, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { procurarNoCatalogo, token, type ItemCatalogo, type TermoBusca } from '../../lib/catalogoTermos'

/**
 * Caixa de BUSCA POR TERMOS com sugestoes enquanto se digita (padrao dos
 * buscadores modernos - "autocomplete"):
 *   - digite as iniciais: aparecem os termos que combinam (sem acento,
 *     iniciais de qualquer palavra, sinonimos);
 *   - ↑/↓ escolhem, Enter adiciona, Esc fecha, Backspace no campo vazio
 *     tira o ultimo termo;
 *   - cada termo escolhido vira uma "etiqueta" (chip) com ✕.
 * Usada na Pesquisa avancada (catalogo completo) e na Curadoria (termos do
 * vocabulario ligados a ficha).
 */
export default function BuscaTermos({
  catalogo,
  selecionados,
  onChange,
  permitirTexto = false,
  placeholder,
  rotuloCampo,
  estilo,
}: {
  catalogo: ItemCatalogo[]
  selecionados: TermoBusca[]
  onChange: (termos: TermoBusca[]) => void
  /** oferece "procurar as palavras nos textos" quando nada combina exatamente */
  permitirTexto?: boolean
  placeholder: string
  rotuloCampo: string
  estilo?: React.CSSProperties
}) {
  const t = useTranslations('BuscaTermos')
  const id = useId()
  const [consulta, setConsulta] = useState('')
  const [aberto, setAberto] = useState(false)
  const [cursor, setCursor] = useState(0)
  const campoRef = useRef<HTMLInputElement>(null)

  const escolhidos = new Set(selecionados.map(token))
  const sugestoes = useMemo(() => {
    const achados = procurarNoCatalogo(catalogo, consulta).filter((i) => !escolhidos.has(token(i)))
    const texto = consulta.trim()
    if (permitirTexto && texto.length >= 2) {
      achados.push({ tipo: 'texto', valor: texto, rotulo: texto, chaves: [] })
    }
    return achados
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogo, consulta, permitirTexto, selecionados])

  function adicionar(item: TermoBusca) {
    onChange([...selecionados, { tipo: item.tipo, valor: item.valor, rotulo: item.rotulo }])
    setConsulta('')
    setCursor(0)
    campoRef.current?.focus()
  }

  function tirar(alvo: TermoBusca) {
    onChange(selecionados.filter((s) => token(s) !== token(alvo)))
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
      adicionar(sugestoes[cursor])
    } else if (e.key === 'Escape') {
      setAberto(false)
    } else if (e.key === 'Backspace' && !consulta && selecionados.length) {
      tirar(selecionados[selecionados.length - 1])
    }
  }

  const corTipo: Record<string, string> = {
    grupo: 'border-rose-400/60 bg-rose-500/15 text-rose-800 dark:text-rose-100',
    achado: 'border-amber-400/60 bg-amber-500/15 text-amber-800 dark:text-amber-100',
    regiao: 'border-sky-400/60 bg-sky-500/15 text-sky-800 dark:text-sky-100',
    vocab: 'border-teal-400/60 bg-teal-500/15 text-teal-800 dark:text-teal-100',
    texto: 'border-slate-400/60 bg-slate-500/15 text-slate-800 dark:text-slate-100',
  }

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-slate-400">
        {rotuloCampo}
      </label>
      <div
        className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-lg border border-base-border bg-base-surface2 px-2 py-1.5 focus-within:border-brand"
        style={estilo}
        onClick={() => campoRef.current?.focus()}
      >
        {selecionados.map((s) => (
          <span key={token(s)} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${corTipo[s.tipo]}`}>
            <span className="opacity-70">{t(`tipo.${s.tipo}`)}:</span> {s.rotulo}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                tirar(s)
              }}
              aria-label={t('tirar', { termo: s.rotulo })}
              className="ml-0.5 rounded-full px-1 hover:bg-black/10"
            >
              ✕
            </button>
          </span>
        ))}
        <input
          ref={campoRef}
          id={id}
          type="search"
          role="combobox"
          aria-expanded={aberto && sugestoes.length > 0}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          autoComplete="off"
          value={consulta}
          maxLength={150}
          onChange={(e) => {
            setConsulta(e.target.value)
            setAberto(true)
            setCursor(0)
          }}
          onFocus={() => setAberto(true)}
          onBlur={() => window.setTimeout(() => setAberto(false), 150)}
          onKeyDown={aoTeclar}
          placeholder={selecionados.length ? t('maisUm') : placeholder}
          className="min-w-[160px] flex-1 bg-transparent px-1 py-0.5 text-sm text-ink outline-hidden placeholder:text-slate-500"
        />
      </div>
      {aberto && consulta.trim() && (
        <ul
          id={`${id}-lista`}
          role="listbox"
          className="absolute z-40 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-base-border bg-base-surface p-1 shadow-2xl"
        >
          {sugestoes.length === 0 && <li className="px-3 py-2 text-xs text-slate-500">{t('nada')}</li>}
          {sugestoes.map((s, i) => (
            <li
              key={token(s)}
              role="option"
              aria-selected={i === cursor}
              onMouseDown={(e) => {
                e.preventDefault()
                adicionar(s)
              }}
              onMouseEnter={() => setCursor(i)}
              className={`flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-1.5 text-sm ${i === cursor ? 'bg-brand/15' : ''}`}
            >
              <span className={`mt-0.5 shrink-0 rounded-full border px-1.5 text-[10px] font-semibold ${corTipo[s.tipo]}`}>{t(`tipo.${s.tipo}`)}</span>
              <span className="min-w-0">
                <span className="block text-ink">{s.tipo === 'texto' ? t('procurarTexto', { texto: s.rotulo }) : s.rotulo}</span>
                {'detalhe' in s && s.detalhe && <span className="block truncate text-[11px] text-slate-500">{s.detalhe}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
