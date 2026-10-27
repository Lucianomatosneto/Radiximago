'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRotularValor } from './useItensFicha'
import {
  lerDentes,
  type Avaliacao,
  type AnotacaoRascunho,
  type Classificacao,
  type ItemFicha,
} from './tipos'

// Mesma caixa de texto da Curadoria (cor solida turquesa clara)
const campo =
  'w-full rounded-lg border border-teal-500/40 bg-teal-100/70 px-3 py-2 text-sm text-ink outline-hidden focus:border-brand dark:bg-teal-600/20'

// HOLOFOTE (mesmo da Curadoria): o item da vez fica aceso, com contorno
// turquesa brilhante e letras maiores; os demais ficam quase apagados.
export const ACESO =
  'relative z-10 bg-base-surface shadow-[0_0_0_2px_rgba(45,212,191,.85),0_0_32px_-4px_rgba(45,212,191,.6)]'
export const APAGADO = 'opacity-[.22] saturate-0 hover:opacity-60 cursor-pointer'

/** a pessoa esta digitando (nao roubar as teclas) */
export function digitando(alvo: EventTarget | null): boolean {
  const el = alvo as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

export const COR_AVALIACAO: Record<Avaliacao, { borda: string; esquerda: string; fundo: string; texto: string; icone: string }> = {
  concordo: { borda: 'border-emerald-400/70', esquerda: 'border-l-emerald-400', fundo: 'bg-emerald-400/15', texto: 'text-emerald-700 dark:text-emerald-200', icone: '✓' },
  ajustar: { borda: 'border-amber-400/70', esquerda: 'border-l-amber-400', fundo: 'bg-amber-400/15', texto: 'text-amber-700 dark:text-amber-200', icone: '✎' },
  discordo: { borda: 'border-rose-400/70', esquerda: 'border-l-rose-400', fundo: 'bg-rose-400/15', texto: 'text-rose-700 dark:text-rose-200', icone: '✕' },
}

export const CLASSIFICACOES: Classificacao[] = ['concordo', 'discordancia_menor', 'discordancia_importante']
export const COR_CLASSIFICACAO: Record<Classificacao, string> = {
  concordo: 'border-emerald-400/70 bg-emerald-400/10 text-emerald-800 dark:text-emerald-100',
  discordancia_menor: 'border-amber-400/70 bg-amber-400/10 text-amber-800 dark:text-amber-100',
  discordancia_importante: 'border-rose-400/70 bg-rose-400/10 text-rose-800 dark:text-rose-100',
}

export function rascunhoValido(item: ItemFicha, r: AnotacaoRascunho | undefined): boolean {
  if (!r || r.avaliacao === 'concordo') return true
  if (item.tipo === 'dentes' && r.valor.trim() && lerDentes(r.valor) === null) return false
  return r.nota.trim().length > 0 || r.valor.trim().length > 0
}

/** Formulario do REVISOR: avalia cada item, da a avaliacao geral e envia. */
export default function PainelParecer({
  itens,
  rascunho,
  onRascunho,
  classificacao,
  onClassificacao,
  parecer,
  onParecer,
  somenteLeitura,
  etapa,
  onEtapa,
}: {
  itens: ItemFicha[]
  rascunho: Record<string, AnotacaoRascunho>
  onRascunho: (chave: string, valor: AnotacaoRascunho) => void
  classificacao: Classificacao | null
  onClassificacao: (c: Classificacao) => void
  parecer: string
  onParecer: (v: string) => void
  somenteLeitura: boolean
  /** holofote: indice do item aceso; itens.length = avaliacao geral; itens.length + 1 = enviar */
  etapa: number
  onEtapa: (n: number) => void
}) {
  const t = useTranslations('SegundaOpiniao')
  const holofote = !somenteLeitura
  const etapaGeral = itens.length
  const geralRef = useRef<HTMLElement>(null)
  const avancar = () => onEtapa(Math.min(etapa + 1, itens.length + 1))

  // teclado: ↑/↓ muda de item; 1, 2, 3 escolhem; Enter passa adiante
  useEffect(() => {
    if (!holofote) return
    function aoTeclar(ev: KeyboardEvent) {
      if (ev.ctrlKey && ev.key === 'Enter') {
        ev.preventDefault()
        onEtapa(Math.min(etapa + 1, itens.length + 1))
        return
      }
      if (ev.altKey || ev.metaKey || ev.ctrlKey || digitando(ev.target)) return
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault()
        onEtapa(Math.max(0, Math.min(itens.length + 1, etapa + (ev.key === 'ArrowDown' ? 1 : -1))))
        return
      }
      const n = ['1', '2', '3'].indexOf(ev.key)
      if (n >= 0 && etapa < itens.length) {
        ev.preventDefault()
        const item = itens[etapa]
        const atual = rascunho[item.chave] ?? { avaliacao: 'concordo' as Avaliacao, nota: '', valor: '' }
        const avaliacao = (['concordo', 'ajustar', 'discordo'] as Avaliacao[])[n]
        onRascunho(item.chave, { ...atual, avaliacao })
        if (avaliacao === 'concordo') onEtapa(etapa + 1)
        return
      }
      if (n >= 0 && etapa === itens.length) {
        ev.preventDefault()
        onClassificacao(CLASSIFICACOES[n])
        onEtapa(itens.length + 1)
        return
      }
      if (ev.key === 'Enter' && etapa < itens.length) {
        const item = itens[etapa]
        if (!rascunhoValido(item, rascunho[item.chave])) return
        ev.preventDefault()
        onEtapa(etapa + 1)
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [holofote, etapa, itens, rascunho, onEtapa, onRascunho, onClassificacao])

  useEffect(() => {
    if (holofote && etapa === etapaGeral) geralRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [holofote, etapa, etapaGeral])

  const grupos: { chave: ItemFicha['grupo']; titulo: string }[] = [
    { chave: 'dados', titulo: t('grupos.dados') },
    { chave: 'achados', titulo: t('grupos.achados') },
    { chave: 'textos', titulo: t('grupos.textos') },
  ]
  const anotados = itens.filter((i) => (rascunho[i.chave]?.avaliacao ?? 'concordo') !== 'concordo')
  const temDiscordo = itens.some((i) => rascunho[i.chave]?.avaliacao === 'discordo')
  const sugestao: Classificacao = temDiscordo ? 'discordancia_importante' : anotados.length ? 'discordancia_menor' : 'concordo'

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-base-border bg-base-surface p-4">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">{t('parecer.tituloItens')}</h2>
          <span className="text-xs text-slate-400">{t('parecer.contagem', { anotados: anotados.length, total: itens.length })}</span>
        </div>
        <p className="mb-2 text-xs text-slate-400">{somenteLeitura ? t('parecer.propriaSolicitacao') : t('parecer.instrucaoItens')}</p>
        {holofote && (
          <p className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
            <Tecla>↑</Tecla>
            <Tecla>↓</Tecla> {t('holofote.mudar')} · <Tecla>1</Tecla> {t('avaliacao.concordo')} · <Tecla>2</Tecla> {t('avaliacao.ajustar')} ·{' '}
            <Tecla>3</Tecla> {t('avaliacao.discordo')} · <Tecla>Enter</Tecla> {t('holofote.proximo')}
          </p>
        )}
        {grupos.map((g) => {
          const doGrupo = itens.filter((i) => i.grupo === g.chave)
          if (!doGrupo.length) return null
          return (
            <div key={g.chave} className="mb-3 last:mb-0">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">{g.titulo}</p>
              <ul className="space-y-2">
                {doGrupo.map((item) => {
                  const indice = itens.indexOf(item)
                  return (
                    <ItemRevisao
                      key={item.chave}
                      item={item}
                      valor={rascunho[item.chave] ?? { avaliacao: 'concordo', nota: '', valor: '' }}
                      onChange={(v) => {
                        onRascunho(item.chave, v)
                        // concordo (clique) no item aceso: passa adiante
                        if (holofote && indice === etapa && v.avaliacao === 'concordo') onEtapa(etapa + 1)
                      }}
                      desabilitado={somenteLeitura}
                      aceso={holofote && indice === etapa}
                      apagado={holofote && indice !== etapa}
                      onAcender={() => onEtapa(indice)}
                      onProximo={avancar}
                    />
                  )
                })}
              </ul>
            </div>
          )
        })}
      </section>

      <section
        ref={geralRef}
        onClickCapture={(e) => {
          // apagada: o primeiro clique so acende
          if (holofote && etapa < etapaGeral) {
            e.preventDefault()
            e.stopPropagation()
            onEtapa(etapaGeral)
          }
        }}
        className={`scroll-my-6 rounded-xl border border-base-border bg-base-surface p-4 transition-[opacity,box-shadow] duration-200 ${
          holofote ? (etapa === etapaGeral ? ACESO : etapa < etapaGeral ? APAGADO : '') : ''
        }`}
      >
        <h2 className={`font-semibold text-ink ${holofote && etapa === etapaGeral ? 'text-base' : 'text-sm'}`}>{t('parecer.tituloGeral')}</h2>
        <p className="mb-3 text-xs text-slate-400">{t('parecer.instrucaoGeral')}</p>
        <div role="radiogroup" aria-label={t('parecer.tituloGeral')} className="grid gap-2">
          {CLASSIFICACOES.map((c, n) => {
            const escolhida = classificacao === c
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={escolhida}
                disabled={somenteLeitura}
                onClick={() => {
                  onClassificacao(c)
                  if (holofote) onEtapa(itens.length + 1)
                }}
                className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-50 ${
                  escolhida ? `${COR_CLASSIFICACAO[c]} ring-1 ring-current` : 'border-base-border text-slate-300 hover:border-teal-400/50'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                    escolhida ? 'border-current' : 'border-slate-500'
                  }`}
                >
                  {n + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {t(`classificacao.${c}`)}
                    {!classificacao && c === sugestao && !somenteLeitura && (
                      <span className="ml-2 rounded-full bg-teal-400/15 px-1.5 py-0.5 text-[10px] font-medium text-teal-700 dark:text-teal-200">
                        {t('parecer.sugerida')}
                      </span>
                    )}
                  </span>
                  <span className="block text-xs opacity-80">{t(`classificacao.${c}Dica`)}</span>
                </span>
              </button>
            )
          })}
        </div>
        <label className="mt-3 block text-xs font-medium text-slate-400" htmlFor="parecer-geral">
          {t('parecer.comentarioGeral')}
        </label>
        <textarea
          id="parecer-geral"
          value={parecer}
          onChange={(e) => onParecer(e.target.value)}
          disabled={somenteLeitura}
          maxLength={2000}
          rows={3}
          placeholder={t('parecer.comentarioGeralDica')}
          className={`${campo} mt-1 disabled:opacity-50`}
        />
        <p className="mt-2 text-[11px] text-slate-500">{t('parecer.referenciaRadpeer')}</p>
      </section>
    </div>
  )
}

export function Tecla({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-slate-500/50 bg-base-surface2/60 px-1 font-mono text-[10px] text-slate-300">{children}</kbd>
  )
}

function ItemRevisao({
  item,
  valor,
  onChange,
  desabilitado,
  aceso,
  apagado,
  onAcender,
  onProximo,
}: {
  item: ItemFicha
  valor: AnotacaoRascunho
  onChange: (v: AnotacaoRascunho) => void
  desabilitado: boolean
  aceso: boolean
  apagado: boolean
  onAcender: () => void
  onProximo: () => void
}) {
  const ref = useRef<HTMLLIElement>(null)
  const notaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (aceso) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [aceso])
  // ajustar/discordar no item aceso: o cursor ja vai para a anotacao
  useEffect(() => {
    if (aceso && valor.avaliacao !== 'concordo') notaRef.current?.focus({ preventScroll: true })
  }, [aceso, valor.avaliacao])
  const t = useTranslations('SegundaOpiniao')
  const rotular = useRotularValor()
  const [aberto, setAberto] = useState(false)
  const longo = item.valor.length > 140
  const anotando = valor.avaliacao !== 'concordo'
  const dentesInvalidos = item.tipo === 'dentes' && valor.valor.trim() !== '' && lerDentes(valor.valor) === null
  const faltaTexto = anotando && !valor.nota.trim() && !valor.valor.trim()

  return (
    <li
      ref={ref}
      onClickCapture={(e) => {
        // item apagado: o primeiro clique so acende (nao muda nada)
        if (apagado) {
          e.preventDefault()
          e.stopPropagation()
          onAcender()
        }
      }}
      className={`scroll-my-6 rounded-lg border p-2.5 transition-[opacity,box-shadow,background-color] duration-200 ${
        anotando ? COR_AVALIACAO[valor.avaliacao].borda : 'border-base-border'
      } ${aceso ? `${ACESO} p-3.5` : 'bg-base-surface2/40'} ${apagado ? (anotando ? 'opacity-50 hover:opacity-80 cursor-pointer' : APAGADO) : ''}`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className={`font-medium ${aceso ? 'text-sm text-teal-700 dark:text-teal-200' : 'text-xs text-slate-400'}`}>{item.rotulo}</p>
          <p className={`whitespace-pre-line text-ink ${aceso ? 'text-lg font-semibold' : 'text-sm'} ${longo && !aberto && !aceso ? 'line-clamp-3' : ''}`}>
            {item.valor}
          </p>
          {longo && (
            <button type="button" onClick={() => setAberto((v) => !v)} className="text-[11px] text-teal-700 dark:text-teal-300 hover:underline">
              {aberto ? t('item.verMenos') : t('item.verMais')}
            </button>
          )}
        </div>
        <div role="radiogroup" aria-label={t('item.avaliarItem', { item: item.rotulo })} className="flex shrink-0 overflow-hidden rounded-lg border border-base-border">
          {(['concordo', 'ajustar', 'discordo'] as Avaliacao[]).map((a) => {
            const escolhida = valor.avaliacao === a
            return (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={escolhida}
                disabled={desabilitado}
                title={t(`avaliacao.${a}`)}
                aria-label={t(`avaliacao.${a}`)}
                onClick={() => onChange({ ...valor, avaliacao: a })}
                className={`flex items-center justify-center gap-1 font-bold transition disabled:opacity-40 ${aceso ? 'h-10 px-2.5 text-sm' : 'h-8 w-8 text-sm'} ${
                  escolhida ? `${COR_AVALIACAO[a].fundo} ${COR_AVALIACAO[a].texto}` : 'text-slate-500 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                {COR_AVALIACAO[a].icone}
                {aceso && <span className="text-xs font-semibold">{t(`avaliacao.${a}`)}</span>}
              </button>
            )
          })}
        </div>
      </div>

      {anotando && (
        <div className="mt-2 space-y-2 border-t border-base-border pt-2">
          {item.tipo === 'valor' && item.opcoes && (
            <label className="block text-xs text-slate-400">
              {t('item.valorProposto')}
              <select
                value={valor.valor}
                onChange={(e) => onChange({ ...valor, valor: e.target.value })}
                disabled={desabilitado}
                className={`${campo} mt-1`}
              >
                <option value="">{t('item.semValorProposto')}</option>
                {item.opcoes.map((o) => (
                  <option key={o} value={o}>
                    {rotular(item.chave, o)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {item.tipo === 'dentes' && (
            <label className="block text-xs text-slate-400">
              {t('item.dentesPropostos')}
              <input
                value={valor.valor}
                onChange={(e) => onChange({ ...valor, valor: e.target.value })}
                disabled={desabilitado}
                placeholder="11, 21"
                inputMode="numeric"
                className={`${campo} mt-1`}
                aria-invalid={dentesInvalidos}
              />
              {dentesInvalidos && <span className="mt-0.5 block text-[11px] text-rose-700 dark:text-rose-300">{t('item.dentesInvalidos')}</span>}
            </label>
          )}
          <label className="block text-xs text-slate-400">
            {item.tipo === 'texto' ? t('item.textoSugerido') : t('item.anotacao')}
            <textarea
              ref={notaRef}
              value={valor.nota}
              onChange={(e) => onChange({ ...valor, nota: e.target.value })}
              disabled={desabilitado}
              rows={2}
              maxLength={2000}
              placeholder={t(`item.dica.${item.tipo}`)}
              className={`${campo} mt-1`}
            />
          </label>
          {faltaTexto && <p className="text-[11px] text-amber-700 dark:text-amber-300">{t('item.expliqueAnotacao')}</p>}
          {aceso && (
            <div className="flex items-center justify-end gap-2">
              <span className="text-[11px] text-slate-500">
                <Tecla>Ctrl</Tecla> + <Tecla>Enter</Tecla>
              </span>
              <button
                type="button"
                onClick={onProximo}
                disabled={faltaTexto || dentesInvalidos}
                className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-40"
              >
                {t('holofote.proximoItem')} ↓
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}
