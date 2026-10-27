'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ACESO, APAGADO, COR_AVALIACAO, COR_CLASSIFICACAO, Tecla, digitando } from './PainelParecer'
import { useRotularValor } from './useItensFicha'
import { formatarData, iniciais, type AnotacaoServidor, type DetalheRevisao, type ItemFicha } from './tipos'

const TAG_LOCALE: Record<string, string> = { pt: 'pt-BR', en: 'en-US' }
const campo =
  'w-full rounded-lg border border-teal-500/40 bg-teal-100/70 px-3 py-2 text-sm text-ink outline-hidden focus:border-brand dark:bg-teal-600/20'

/**
 * Tela de QUEM PEDIU, quando a segunda opiniao volta: o parecer do revisor e
 * cada anotacao no item correspondente, com "Acrescentar a curadoria" ou
 * "Dispensar"; no fim, a decisao final (aprovar ou descartar a ficha).
 */
export default function PainelDevolvida({
  detalhe,
  itens,
  ocupado,
  onIncorporar,
  onDispensar,
  onAprovar,
  onDescartar,
  decidindo,
}: {
  detalhe: DetalheRevisao
  itens: ItemFicha[]
  ocupado: number | null
  onIncorporar: (nota: AnotacaoServidor) => void
  onDispensar: (nota: AnotacaoServidor) => void
  onAprovar: () => void
  onDescartar: (motivo: string) => void
  decidindo: boolean
}) {
  const t = useTranslations('SegundaOpiniao')
  const tagLocale = TAG_LOCALE[useLocale()] ?? 'pt-BR'
  const rotular = useRotularValor()
  const [anonimizacaoOk, setAnonimizacaoOk] = useState(false)
  const [descartando, setDescartando] = useState(false)
  const [motivo, setMotivo] = useState('')

  const ordem = new Map(itens.map((i, n) => [i.chave, n]))
  const notas = [...detalhe.anotacoes].sort((a, b) => (ordem.get(a.item) ?? 99) - (ordem.get(b.item) ?? 99))
  const anotados = new Set(notas.map((n) => n.item))
  const semAnotacao = itens.filter((i) => !anotados.has(i.chave))
  const pendentes = notas.filter((n) => n.situacao === 'pendente').length
  const podeDecidir = detalhe.pode_incorporar

  // HOLOFOTE (mesmo da Curadoria): uma anotacao acesa por vez - a primeira
  // ainda sem decisao; resolvida, o destaque passa sozinho para a proxima e,
  // no fim, para a decisao final. Clicar numa apagada acende ela. DECISAO = -1.
  const DECISAO = -1
  const [foco, setFoco] = useState<number | null>(null)
  const primeiraPendente = notas.find((n) => n.situacao === 'pendente')?.id ?? DECISAO
  const focoValido = foco !== null && (foco === DECISAO || notas.some((n) => n.id === foco && n.situacao !== 'incorporada'))
  const aceso = podeDecidir ? (focoValido ? (foco as number) : primeiraPendente) : null
  const decisaoRef = useRef<HTMLElement>(null)
  useEffect(() => {
    // anotacao escolhida a mao ja resolvida: volta a seguir a fila
    if (foco !== null && foco !== DECISAO && notas.some((n) => n.id === foco && n.situacao !== 'pendente')) setFoco(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detalhe])
  useEffect(() => {
    if (aceso === DECISAO) decisaoRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [aceso, DECISAO])
  useEffect(() => {
    if (!podeDecidir) return
    function aoTeclar(ev: KeyboardEvent) {
      if (ev.ctrlKey || ev.altKey || ev.metaKey || digitando(ev.target) || ocupado !== null) return
      const ordem = [...notas.filter((n) => n.situacao !== 'incorporada').map((n) => n.id), DECISAO]
      const atual = ordem.indexOf(aceso ?? DECISAO)
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault()
        setFoco(ordem[Math.max(0, Math.min(ordem.length - 1, atual + (ev.key === 'ArrowDown' ? 1 : -1)))])
        return
      }
      const nota = notas.find((n) => n.id === aceso)
      if (!nota) return
      if (ev.key === 'a' || ev.key === 'A') {
        ev.preventDefault()
        onIncorporar(nota)
      } else if ((ev.key === 'd' || ev.key === 'D') && nota.situacao === 'pendente') {
        ev.preventDefault()
        onDispensar(nota)
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [podeDecidir, notas, aceso, ocupado, onIncorporar, onDispensar, DECISAO])

  function sugestaoTexto(n: AnotacaoServidor): string | null {
    if (n.valor_sugerido === null || n.valor_sugerido === undefined) return null
    if (Array.isArray(n.valor_sugerido)) return n.valor_sugerido.join(', ')
    return rotular(n.item, n.valor_sugerido)
  }

  return (
    <div className="space-y-4">
      {/* parecer do revisor */}
      <section className="rounded-xl border border-teal-400/30 bg-teal-500/5 p-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-sm font-bold text-teal-800 dark:text-teal-100 ring-1 ring-teal-400/40"
          >
            {iniciais(detalhe.revisor?.nome)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">{t('devolvida.parecerDe')}</p>
            <p className="truncate text-sm font-semibold text-ink">{detalhe.revisor?.nome ?? '—'}</p>
            <p className="text-xs text-slate-400">{t('devolvida.respondidoEm', { data: formatarData(detalhe.respondido_em, tagLocale) })}</p>
          </div>
          {detalhe.classificacao ? (
            <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${COR_CLASSIFICACAO[detalhe.classificacao]}`}>
              {t(`classificacao.${detalhe.classificacao}`)}
            </span>
          ) : detalhe.concordancia ? (
            <span className="shrink-0 rounded-full border border-base-border px-2.5 py-1 text-xs text-slate-300">
              {detalhe.concordancia === 'concorda' ? t('classificacao.concordo') : t('devolvida.discorda')}
            </span>
          ) : null}
        </div>
        {detalhe.parecer_revisor && (
          <p className="mt-3 whitespace-pre-line border-l-2 border-teal-400/50 pl-2.5 text-sm text-slate-200">{detalhe.parecer_revisor}</p>
        )}
      </section>

      {/* anotacoes, item por item */}
      <section className="rounded-xl border border-base-border bg-base-surface p-4">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">{t('devolvida.tituloAnotacoes')}</h2>
          {notas.length > 0 && <span className="text-xs text-slate-400">{t('devolvida.pendentes', { total: pendentes })}</span>}
        </div>
        <p className="mb-2 text-xs text-slate-400">{notas.length ? t('devolvida.instrucao') : t('devolvida.semAnotacoes')}</p>
        {podeDecidir && notas.length > 0 && (
          <p className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
            <Tecla>↑</Tecla>
            <Tecla>↓</Tecla> {t('holofote.mudar')} · <Tecla>A</Tecla> {t('devolvida.incorporar')} · <Tecla>D</Tecla> {t('devolvida.dispensar')}
          </p>
        )}
        <ul className="space-y-2.5">
          {notas.map((n) => {
            const item = itens.find((i) => i.chave === n.item)
            const cor = COR_AVALIACAO[n.avaliacao]
            const sugerido = sugestaoTexto(n)
            const efeito =
              n.tipo_item === 'texto'
                ? t('devolvida.efeitoTexto')
                : (n.tipo_item === 'valor' || n.tipo_item === 'dentes') && sugerido
                  ? t('devolvida.efeitoValor')
                  : t('devolvida.efeitoNota')
            return (
              <NotaComHolofote
                key={n.id}
                aceso={aceso === n.id}
                apagado={aceso !== null && aceso !== n.id}
                onAcender={() => setFoco(n.id)}
                className={`rounded-lg border border-base-border border-l-4 p-3 ${cor.esquerda}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className={`font-semibold ${aceso === n.id ? 'text-sm text-teal-700 dark:text-teal-200' : 'text-xs text-slate-300'}`}>
                    {item?.rotulo ?? n.rotulo}
                  </p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cor.fundo} ${cor.texto}`}>
                    {cor.icone} {t(`avaliacao.${n.avaliacao}`)}
                  </span>
                </div>
                <dl className="mt-1.5 space-y-1 text-sm">
                  <div className="flex gap-1.5">
                    <dt className="shrink-0 text-xs text-slate-500">{t('devolvida.vocesRegistrou')}</dt>
                    <dd className="line-clamp-3 whitespace-pre-line text-slate-300">{item?.valor ?? '—'}</dd>
                  </div>
                  {sugerido && (
                    <div className="flex gap-1.5">
                      <dt className="shrink-0 text-xs text-slate-500">{t('devolvida.proposta')}</dt>
                      <dd className="font-semibold text-ink">{sugerido}</dd>
                    </div>
                  )}
                  {n.nota && (
                    <div className="flex gap-1.5">
                      <dt className="shrink-0 text-xs text-slate-500">{t('devolvida.anotacao')}</dt>
                      <dd className="whitespace-pre-line text-ink">{n.nota}</dd>
                    </div>
                  )}
                </dl>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {n.situacao === 'incorporada' ? (
                    <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-200">
                      ✓ {t('devolvida.incorporada')}
                    </span>
                  ) : (
                    <>
                      {n.situacao === 'dispensada' && (
                        <span className="rounded-full bg-slate-500/20 px-2.5 py-1 text-xs text-slate-300">{t('devolvida.dispensada')}</span>
                      )}
                      {podeDecidir && (
                        <>
                          <button
                            type="button"
                            disabled={ocupado !== null}
                            onClick={() => onIncorporar(n)}
                            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-glow hover:bg-brand-hover disabled:opacity-50"
                          >
                            {ocupado === n.id ? t('devolvida.aplicando') : `+ ${t('devolvida.incorporar')}`}
                          </button>
                          {n.situacao === 'pendente' && (
                            <button
                              type="button"
                              disabled={ocupado !== null}
                              onClick={() => onDispensar(n)}
                              className="rounded-lg border border-base-border px-3 py-1.5 text-xs text-slate-300 hover:border-slate-400 disabled:opacity-50"
                            >
                              {t('devolvida.dispensar')}
                            </button>
                          )}
                          <span className="text-[11px] text-slate-500">{efeito}</span>
                        </>
                      )}
                    </>
                  )}
                </div>
              </NotaComHolofote>
            )
          })}
        </ul>
        {semAnotacao.length > 0 && (
          <p className="mt-3 text-xs text-slate-400">
            <span className="font-semibold text-emerald-700 dark:text-emerald-300">✓ {t('devolvida.concordouCom')}</span> {semAnotacao.map((i) => i.rotulo).join(', ')}
          </p>
        )}
      </section>

      {/* decisao final */}
      {podeDecidir && (
        <section
          ref={decisaoRef}
          onClickCapture={(e) => {
            if (aceso !== DECISAO) {
              e.preventDefault()
              e.stopPropagation()
              setFoco(DECISAO)
            }
          }}
          className={`scroll-my-6 rounded-xl border border-base-border bg-base-surface p-4 transition-[opacity,box-shadow] duration-200 ${
            aceso === DECISAO ? ACESO : APAGADO
          }`}
        >
          <h2 className={`font-semibold text-ink ${aceso === DECISAO ? 'text-base' : 'text-sm'}`}>{t('devolvida.decisaoTitulo')}</h2>
          <p className="mb-3 text-xs text-slate-400">
            {pendentes > 0 ? t('devolvida.decisaoComPendentes', { total: pendentes }) : t('devolvida.decisaoInstrucao')}
          </p>
          {!descartando ? (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input type="checkbox" checked={anonimizacaoOk} onChange={(e) => setAnonimizacaoOk(e.target.checked)} className="h-4 w-4 accent-teal-400" />
                {t('devolvida.anonimizacao')}
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!anonimizacaoOk || decidindo}
                  onClick={onAprovar}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
                >
                  ✓ {decidindo ? t('devolvida.enviando') : t('devolvida.aprovar')}
                </button>
                <button
                  type="button"
                  disabled={decidindo}
                  onClick={() => setDescartando(true)}
                  className="rounded-lg border border-rose-400/50 px-4 py-2 text-sm text-rose-700 dark:text-rose-200 hover:bg-rose-500/10 disabled:opacity-40"
                >
                  {t('devolvida.descartar')}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-xs text-slate-400" htmlFor="motivo-descarte">
                {t('devolvida.motivoDescarte')}
              </label>
              <textarea id="motivo-descarte" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={2000} className={campo} />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!motivo.trim() || decidindo}
                  onClick={() => onDescartar(motivo.trim())}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-40"
                >
                  {decidindo ? t('devolvida.enviando') : t('devolvida.confirmarDescarte')}
                </button>
                <button type="button" onClick={() => setDescartando(false)} className="rounded-lg border border-base-border px-4 py-2 text-sm text-slate-300">
                  {t('devolvida.voltar')}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function NotaComHolofote({
  aceso,
  apagado,
  onAcender,
  className,
  children,
}: {
  aceso: boolean
  apagado: boolean
  onAcender: () => void
  className: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (aceso) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [aceso])
  return (
    <li
      ref={ref}
      onClickCapture={(e) => {
        // apagada: o primeiro clique so acende
        if (apagado) {
          e.preventDefault()
          e.stopPropagation()
          onAcender()
        }
      }}
      className={`scroll-my-6 transition-[opacity,box-shadow] duration-200 ${className} ${
        aceso ? `${ACESO} text-base` : 'bg-base-surface2/40'
      } ${apagado ? APAGADO : ''}`}
    >
      {children}
    </li>
  )
}
