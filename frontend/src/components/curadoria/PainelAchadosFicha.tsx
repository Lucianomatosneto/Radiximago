'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { FormularioFicha } from './FichaCuradoriaForm'
import { REGIOES, TIPOS_ACHADO_FICHA, comAchados, type AchadoFicha } from '../../lib/achadosFicha'
import { normalizar } from '../../lib/vozCuradoria'
import { corMarcacao } from '../../lib/marcacoes'
import { PalavraChave } from './PainelDadosSobrepostos'

// ACHADOS = AS MARCACOES DA IMAGEM (secao 2 da ficha).
// O curador desenha cada lesao na imagem de marcacao (que abre sozinha
// quando esta secao fica em destaque) e cada marcacao vira uma linha:
// M1, M2... -> TIPO (lista padronizada de 26) + DENTE(S) + REGIAO.
// Por voz: "um lesão periapical no dente 36", "dois cárie em dentina"...
// (ou so o achado: vai para a proxima marcacao ainda sem achado).
// Imagem normal: "Imagem sem alterações" (sem marcacoes).
// O resumo usado pela Pesquisa (alteracoes_observadas) continua sendo
// montado sozinho (lib/achadosFicha.ts), so nao aparece mais na tela.

const TODOS_DENTES = [
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
  48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
]
const NUMEROS = ['um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez']

function SeletorTipo({
  valor,
  rotulo,
  onEscolher,
  placeholder,
}: {
  valor: string
  rotulo: (v: string) => string
  onEscolher: (tipo: string) => void
  placeholder: string
}) {
  const [busca, setBusca] = useState<string | null>(null)
  const [sel, setSel] = useState(0)
  const filtro = normalizar((busca ?? '').trim())
  const sugestoes =
    busca !== null
      ? TIPOS_ACHADO_FICHA.filter((tp) => !filtro || normalizar(rotulo(tp.valor)).includes(filtro)).slice(0, 8)
      : []
  return (
    <div className="relative min-w-0 flex-1">
      <input
        value={busca ?? (valor ? rotulo(valor) : '')}
        onFocus={() => setBusca('')}
        onBlur={() => setTimeout(() => setBusca(null), 120)}
        onChange={(e) => {
          setBusca(e.target.value)
          setSel(0)
        }}
        onKeyDown={(e) => {
          if (!sugestoes.length) return
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setSel((s) => (s + (e.key === 'ArrowDown' ? 1 : -1) + sugestoes.length) % sugestoes.length)
          }
          if (e.key === 'Enter') {
            e.preventDefault()
            onEscolher(sugestoes[sel].valor)
            setBusca(null)
            ;(e.target as HTMLInputElement).blur()
          }
          if (e.key === 'Escape') setBusca(null)
        }}
        placeholder={placeholder}
        className={`w-full rounded-lg border px-2.5 py-1 text-sm outline-hidden focus:border-brand ${
          valor ? 'border-teal-500/40 bg-teal-600/15 font-semibold text-ink' : 'border-dashed border-amber-300/60 bg-amber-300/5 text-amber-100'
        }`}
      />
      {sugestoes.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-lg border border-base-border bg-base-surface shadow-2xl">
          {sugestoes.map((tp, i) => (
            <li key={tp.valor}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onEscolher(tp.valor)
                  setBusca(null)
                }}
                className={`w-full px-3 py-1.5 text-left text-sm ${i === sel ? 'bg-teal-400/15' : 'hover:bg-white/5'}`}
              >
                {rotulo(tp.valor)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function PainelAchadosFicha({
  form,
  onChange,
  palavrasChave = false,
}: {
  form: FormularioFicha
  onChange: (form: FormularioFicha) => void
  palavrasChave?: boolean
}) {
  const t = useTranslations('Curadoria.achadosFicha')
  const tItens = useTranslations('AlteracoesObservadas.itens')
  const tRegioes = useTranslations('Curadoria.achadosEstruturados.regioes')
  const rotulo = (valor: string) => {
    try {
      return tItens(valor)
    } catch {
      return valor
    }
  }

  const achados = form.achados
  // achado de cada marcacao (indice -> achado)
  const daMarcacao = (id: string) => achados.find((a) => a.marcacoes.includes(id))
  // achados antigos sem marcacao (fichas anteriores) - continuam visiveis
  const idsMarcacoes = new Set(form.marcacoes.map((m) => m.id))
  const semMarcacao = achados.filter((a) => !a.marcacoes.some((id) => idsMarcacoes.has(id)))

  function salvar(lista: AchadoFicha[]) {
    onChange(comAchados(form, lista))
  }
  function mudarDaMarcacao(id: string, parcial: Partial<AchadoFicha>) {
    const atual = daMarcacao(id)
    if (atual) salvar(achados.map((a) => (a === atual ? { ...a, ...parcial } : a)))
    else if (parcial.tipo) salvar([...achados, { tipo: parcial.tipo, dentes: parcial.dentes ?? [], regiao: parcial.regiao ?? '', marcacoes: [id] }])
  }

  const camposOnde = (a: AchadoFicha | undefined, mudar: (p: Partial<AchadoFicha>) => void) => (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {(a?.dentes ?? []).map((d) => (
        <span key={d} className="flex items-center gap-1 rounded-md border border-base-border bg-white/5 px-1.5 py-0.5 text-xs text-slate-200">
          {t('dente')} {d}
          <button type="button" onClick={() => mudar({ dentes: (a?.dentes ?? []).filter((x) => x !== d) })} aria-label={t('removerDente', { dente: d })} className="text-slate-400 hover:text-red-300">
            ×
          </button>
        </span>
      ))}
      <select
        value=""
        disabled={!a}
        onChange={(e) => e.target.value && mudar({ dentes: Array.from(new Set([...(a?.dentes ?? []), Number(e.target.value)])).sort((x, y) => x - y) })}
        aria-label={t('adicionarDente')}
        className={`rounded-md border bg-transparent px-1 py-0.5 text-xs outline-hidden disabled:opacity-40 ${a?.dentes.length ? 'border-base-border text-slate-300' : 'border-dashed border-amber-300/60 text-amber-200'}`}
      >
        <option value="">{a?.dentes.length ? '+ dente' : t('denteQual')}</option>
        {[...form.dentes, ...TODOS_DENTES.filter((d) => !form.dentes.includes(d))]
          .filter((d) => !(a?.dentes ?? []).includes(d))
          .map((d) => (
            <option key={d} value={d}>
              {d}
              {form.dentes.includes(d) ? ' ★' : ''}
            </option>
          ))}
      </select>
      <select
        value={a?.regiao ?? ''}
        disabled={!a}
        onChange={(e) => mudar({ regiao: e.target.value })}
        aria-label={t('regiao')}
        className={`rounded-md border bg-transparent px-1 py-0.5 text-xs outline-hidden disabled:opacity-40 ${a?.regiao ? 'border-base-border text-slate-300' : 'border-dashed border-amber-300/60 text-amber-200'}`}
      >
        <option value="">{t('regiaoQual')}</option>
        {REGIOES.map((r) => (
          <option key={r} value={r}>
            {tRegioes(r)}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <div className="space-y-3">
      {form.marcacoes.length === 0 ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => onChange({ ...form, sem_alteracoes: !form.sem_alteracoes })}
            aria-pressed={form.sem_alteracoes}
            className={`w-full rounded-lg border px-3 py-2 text-sm transition ${
              form.sem_alteracoes ? 'border-emerald-400 bg-emerald-500/15 font-semibold text-emerald-200' : 'border-dashed border-slate-500 text-slate-200 hover:border-emerald-400'
            }`}
          >
            {form.sem_alteracoes ? `✓ ${t('normalMarcado')}` : t('normal')}
            <span className="ml-2">
              <PalavraChave texto={t('chaveNormal')} visivel={palavrasChave && !form.sem_alteracoes} />
            </span>
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {form.marcacoes.map((m, n) => {
            const a = daMarcacao(m.id)
            return (
              <li key={m.id} className={`rounded-lg border p-2 ${a ? 'border-base-border' : 'border-amber-300/50 bg-amber-300/5'}`}>
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-xs font-bold text-slate-900 ring-2 ring-black/40"
                    style={{ background: corMarcacao(m) }}
                    title={t('marcacaoN', { numero: n + 1 })}
                  >
                    {n + 1}
                  </span>
                  <SeletorTipo
                    valor={a?.tipo ?? ''}
                    rotulo={rotulo}
                    onEscolher={(tipo) => mudarDaMarcacao(m.id, { tipo })}
                    placeholder={t('qualAchado', { numero: n + 1 })}
                  />
                  <PalavraChave texto={`${NUMEROS[n] ?? n + 1} …`} visivel={palavrasChave && !a} />
                </div>
                {camposOnde(a, (p) => mudarDaMarcacao(m.id, p))}
              </li>
            )
          })}
        </ul>
      )}

      {semMarcacao.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-slate-500">{t('semMarcacaoAntigos')}</p>
          {semMarcacao.map((a, i) => (
            <div key={`${a.tipo}-${i}`} className="rounded-lg border border-base-border p-2">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 text-sm font-semibold text-ink">{rotulo(a.tipo)}</span>
                <button type="button" onClick={() => salvar(achados.filter((x) => x !== a))} aria-label={t('remover')} className="rounded-sm px-1.5 text-base text-slate-400 hover:text-red-300">
                  ×
                </button>
              </div>
              {camposOnde(a, (p) => salvar(achados.map((x) => (x === a ? { ...x, ...p } : x))))}
            </div>
          ))}
        </div>
      )}

      {/* texto livre antigo (a secao "Achados detalhados" saiu): so aparece
          se a ficha ja tinha conteudo, para nada se perder */}
      {form.achados_detalhe.trim() && (
        <div>
          <p className="mb-1 text-[11px] text-slate-500">{t('textoAntigo')}</p>
          <textarea
            maxLength={8000}
            value={form.achados_detalhe}
            onChange={(e) => onChange({ ...form, achados_detalhe: e.target.value })}
            rows={2}
            className="w-full rounded-lg border border-base-border bg-white/5 px-2.5 py-1.5 text-sm text-ink outline-hidden focus:border-brand"
          />
        </div>
      )}

    </div>
  )
}
