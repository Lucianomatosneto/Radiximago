'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { FormularioFicha } from './FichaCuradoriaForm'
import { REGIOES, TIPOS_ACHADO_FICHA, comAchados, type AchadoFicha } from '../../lib/achadosFicha'
import { normalizar } from '../../lib/vozCuradoria'
import { corMarcacao } from '../../lib/marcacoes'

// SECAO UNICA "ACHADOS" da coluna da ficha (substitui o checklist de 26
// caixinhas "Alterações observadas" e a secao "Achados por dente/região").
// Um achado = uma linha: TIPO (lista padronizada) + DENTES + REGIAO +
// MARCACOES. O resumo usado pela Pesquisa (alteracoes_observadas) e montado
// sozinho a partir das linhas (ver lib/achadosFicha.ts e, no backend,
// curation/ficha.py::_sincronizar_achados).

const TODOS_DENTES = [
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
  48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
]

export default function PainelAchadosFicha({
  form,
  onChange,
}: {
  form: FormularioFicha
  onChange: (form: FormularioFicha) => void
}) {
  const t = useTranslations('Curadoria.achadosFicha')
  const tItens = useTranslations('AlteracoesObservadas.itens')
  const tCategorias = useTranslations('AlteracoesObservadas.categorias')
  const tRegioes = useTranslations('Curadoria.achadosEstruturados.regioes')
  const [busca, setBusca] = useState('')
  const [selecionado, setSelecionado] = useState(0)

  const rotulo = (valor: string) => {
    try {
      return tItens(valor)
    } catch {
      return valor
    }
  }

  const achados = form.achados
  const filtro = normalizar(busca.trim())
  const sugestoes = filtro
    ? TIPOS_ACHADO_FICHA.filter((tp) => normalizar(rotulo(tp.valor)).includes(filtro) || normalizar(tp.label).includes(filtro)).slice(0, 8)
    : []

  function mudarLista(lista: AchadoFicha[]) {
    onChange(comAchados(form, lista))
  }
  function adicionar(tipo: string) {
    // linha nova; nao repete uma linha identica ainda sem dente/regiao
    if (achados.some((a) => a.tipo === tipo && !a.dentes.length && !a.regiao)) {
      setBusca('')
      return
    }
    mudarLista([...achados, { tipo, dentes: [], regiao: '', marcacoes: [] }])
    setBusca('')
    setSelecionado(0)
  }
  function mudar(i: number, parcial: Partial<AchadoFicha>) {
    mudarLista(achados.map((a, j) => (j === i ? { ...a, ...parcial } : a)))
  }

  const dentesOrdenados = [...form.dentes, ...TODOS_DENTES.filter((d) => !form.dentes.includes(d))]

  return (
    <div className="space-y-3">
      {/* Imagem normal: 1 clique (bloqueado quando ja ha achados) */}
      <button
        type="button"
        onClick={() => onChange({ ...form, sem_alteracoes: !form.sem_alteracoes })}
        disabled={achados.length > 0}
        aria-pressed={form.sem_alteracoes}
        title={achados.length ? t('normalBloqueado') : undefined}
        className={`w-full rounded-lg border px-3 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
          form.sem_alteracoes
            ? 'border-emerald-400 bg-emerald-500/15 font-semibold text-emerald-200'
            : 'border-dashed border-slate-500 text-slate-200 hover:border-emerald-400'
        }`}
      >
        {form.sem_alteracoes ? `✓ ${t('normalMarcado')}` : t('normal')}
      </button>

      {/* adicionar achado: busca ao digitar */}
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-2 text-sm text-slate-400" aria-hidden="true">🔎</span>
        <input
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value)
            setSelecionado(0)
          }}
          onKeyDown={(e) => {
            if (!sugestoes.length) return
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              setSelecionado((s) => (s + (e.key === 'ArrowDown' ? 1 : -1) + sugestoes.length) % sugestoes.length)
            }
            if (e.key === 'Enter') {
              e.preventDefault()
              adicionar(sugestoes[selecionado].valor)
            }
            if (e.key === 'Escape') setBusca('')
          }}
          disabled={form.sem_alteracoes}
          placeholder={t('adicionarPlaceholder')}
          aria-label={t('adicionar')}
          className="w-full rounded-lg border border-teal-500/40 bg-teal-100/70 py-1.5 pl-8 pr-2.5 text-sm text-ink outline-none focus:border-brand disabled:opacity-40 dark:bg-teal-600/20"
        />
        {sugestoes.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-lg border border-base-border bg-base-surface shadow-2xl" role="listbox">
            {sugestoes.map((tp, i) => (
              <li key={tp.valor} role="option" aria-selected={i === selecionado}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    adicionar(tp.valor)
                  }}
                  className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm ${i === selecionado ? 'bg-teal-400/15' : 'hover:bg-white/5'}`}
                >
                  <span className="text-ink">{rotulo(tp.valor)}</span>
                  <span className="text-[11px] text-slate-500">{tCategorias(tp.categoriaChave)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {achados.length === 0 && !form.sem_alteracoes && <p className="text-xs text-slate-500">{t('vazio')}</p>}

      <ul className="space-y-2">
        {achados.map((a, i) => {
          const semLocal = !a.dentes.length && !a.regiao
          return (
            <li key={`${a.tipo}-${i}`} className={`rounded-lg border p-2 ${semLocal ? 'border-amber-300/40' : 'border-base-border'} bg-black/10`}>
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-slate-300">{i + 1}</span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-ink">{rotulo(a.tipo)}</span>
                <button
                  type="button"
                  onClick={() => mudarLista(achados.filter((_, j) => j !== i))}
                  aria-label={t('remover')}
                  title={t('remover')}
                  className="rounded px-1.5 text-base text-slate-400 hover:text-red-300"
                >
                  ×
                </button>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {/* dentes: chips + adicionar */}
                {a.dentes.map((d) => (
                  <span key={d} className="flex items-center gap-1 rounded-md border border-base-border bg-white/5 px-1.5 py-0.5 text-xs text-slate-200">
                    {t('dente')} {d}
                    <button type="button" onClick={() => mudar(i, { dentes: a.dentes.filter((x) => x !== d) })} aria-label={t('removerDente', { dente: d })} className="text-slate-400 hover:text-red-300">
                      ×
                    </button>
                  </span>
                ))}
                <select
                  value=""
                  onChange={(e) => e.target.value && mudar(i, { dentes: Array.from(new Set([...a.dentes, Number(e.target.value)])).sort((x, y) => x - y) })}
                  aria-label={t('adicionarDente')}
                  className={`rounded-md border bg-transparent px-1 py-0.5 text-xs outline-none ${a.dentes.length ? 'border-base-border text-slate-300' : 'border-dashed border-amber-300/60 text-amber-200'}`}
                >
                  <option value="">{a.dentes.length ? '+ dente' : t('denteQual')}</option>
                  {dentesOrdenados.filter((d) => !a.dentes.includes(d)).map((d) => (
                    <option key={d} value={d}>
                      {d}
                      {form.dentes.includes(d) ? ' ★' : ''}
                    </option>
                  ))}
                </select>
                {/* regiao */}
                <select
                  value={a.regiao}
                  onChange={(e) => mudar(i, { regiao: e.target.value })}
                  aria-label={t('regiao')}
                  className={`rounded-md border bg-transparent px-1 py-0.5 text-xs outline-none ${a.regiao ? 'border-base-border text-slate-300' : 'border-dashed border-amber-300/60 text-amber-200'}`}
                >
                  <option value="">{t('regiaoQual')}</option>
                  {REGIOES.map((r) => (
                    <option key={r} value={r}>
                      {tRegioes(r)}
                    </option>
                  ))}
                </select>
                {/* marcacoes */}
                {form.marcacoes.length > 0 && (
                  <span className="flex flex-wrap items-center gap-1">
                    {form.marcacoes.map((m, n) => {
                      const ligada = a.marcacoes.includes(m.id)
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => mudar(i, { marcacoes: ligada ? a.marcacoes.filter((x) => x !== m.id) : [...a.marcacoes, m.id] })}
                          aria-pressed={ligada}
                          title={ligada ? t('desligarMarcacao', { numero: n + 1 }) : t('ligarMarcacao', { numero: n + 1 })}
                          className={`flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border px-1 text-[10px] font-bold ${
                            ligada ? 'border-transparent text-slate-900' : 'border-slate-500 text-slate-400 hover:border-teal-300'
                          }`}
                          style={ligada ? { background: corMarcacao(m) } : undefined}
                        >
                          M{n + 1}
                        </button>
                      )
                    })}
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {/* resumo automatico = o que a Pesquisa usa */}
      <div className="border-t border-white/10 pt-2">
        <p className="mb-1 text-[11px] text-slate-500">{t('resumo')}</p>
        <div className="flex flex-wrap gap-1">
          {form.sem_alteracoes ? (
            <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-200">{t('normalMarcado')}</span>
          ) : form.alteracoes_observadas.length ? (
            form.alteracoes_observadas.map((v) => (
              <span key={v} className="rounded-full border border-violet-300/40 bg-violet-400/10 px-2 py-0.5 text-[11px] text-violet-100">
                {rotulo(v)}
              </span>
            ))
          ) : (
            <span className="text-[11px] text-slate-500">—</span>
          )}
        </div>
      </div>
    </div>
  )
}
