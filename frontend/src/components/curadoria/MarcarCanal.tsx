'use client'

// CANAL MANDIBULAR NA PANORAMICA RECONSTRUIDA (pedido do Luciano,
// 23/11/2026). Decisoes dele: o curador marca o trajeto NA PANORAMICA
// reconstruida e o canal aparece DESENHADO nas series geradas (traco na
// panoramica, marca na altura em cada corte transversal), para ensino.
// - ate 2 tracados (os dois lados), cada um com pelo menos 2 pontos, do
//   forame mandibular ao forame mentual;
// - os pontos vao em PIXELS da panoramica (coluna, linha);
// - POST /reconstrucao/{ref}/{rec}/canal gera as series novas.

import { useEffect, useState, type MouseEvent } from 'react'
import { useTranslations } from 'next-intl'
import { fetchOuNulo } from '../../lib/fetchSeguro'

const API = process.env.NEXT_PUBLIC_API_URL
const CORES = ['#ffd700', '#00dcff'] // as mesmas do servidor (amarelo, ciano)
const MAX_TRACADOS = 2

type Ponto = [number, number]

interface Props {
  refId: number
  recId: number
  aoGravar: () => void
  aoFechar: () => void
}

async function lerErro(r: Response, padrao: string): Promise<string> {
  try {
    const corpo = await r.json()
    if (typeof corpo?.detail === 'string') return corpo.detail
  } catch {
    // sem corpo legivel
  }
  return padrao
}

const arred = (n: number) => Math.round(n * 10) / 10

export default function MarcarCanal({ refId, recId, aoGravar, aoFechar }: Props) {
  const t = useTranslations('Reconstrucao')
  const tComum = useTranslations('Comum')
  const [medidas, setMedidas] = useState<{ largura: number; altura: number } | null>(null)
  const [tracados, setTracados] = useState<Ponto[][]>([[]])
  const [gravando, setGravando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    void (async () => {
      const r = await fetchOuNulo(`${API}/reconstrucao/${refId}/${recId}/panoramica`, { credentials: 'include' })
      if (!vivo) return
      if (!r) {
        setErro(tComum('semConexao'))
        return
      }
      if (!r.ok) {
        setErro(await lerErro(r, t('canalErroCarregar')))
        return
      }
      const d = await r.json()
      if (!vivo) return
      setMedidas({ largura: d.largura, altura: d.altura })
      // marcado antes: comeca do trajeto salvo, para ajustar
      if (d.canal?.tracados?.length) setTracados(d.canal.tracados)
    })()
    return () => {
      vivo = false
    }
  }, [refId, recId, t, tComum])

  const atual = tracados.length - 1
  const prontos = tracados.filter((p) => p.length > 0)
  const podeGravar = prontos.length > 0 && prontos.every((p) => p.length >= 2) && !gravando

  function clicar(e: MouseEvent<HTMLDivElement>) {
    if (!medidas) return
    const caixa = e.currentTarget.getBoundingClientRect()
    if (!caixa.width || !caixa.height) return
    const coluna = ((e.clientX - caixa.left) / caixa.width) * medidas.largura
    const linha = ((e.clientY - caixa.top) / caixa.height) * medidas.altura
    if (coluna < 0 || linha < 0 || coluna > medidas.largura - 1 || linha > medidas.altura - 1) return
    setTracados((ts) => ts.map((p, i) => (i === ts.length - 1 ? [...p, [arred(coluna), arred(linha)] as Ponto] : p)))
    setAviso('')
  }

  function desfazer() {
    setTracados((ts) => {
      const ultimo = ts[ts.length - 1]
      if (ultimo.length === 0 && ts.length > 1) return ts.slice(0, -1)
      return ts.map((p, i) => (i === ts.length - 1 ? p.slice(0, -1) : p))
    })
  }

  async function gravar() {
    setGravando(true)
    setErro('')
    setAviso('')
    const r = await fetchOuNulo(`${API}/reconstrucao/${refId}/${recId}/canal`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracados: prontos }),
    })
    setGravando(false)
    if (!r) {
      setErro(tComum('semConexao'))
      return
    }
    if (!r.ok) {
      setErro(await lerErro(r, t('canalErroGravar')))
      return
    }
    const d = await r.json()
    setAviso(t('canalPronto', { n: d.total_cortes }))
    aoGravar()
  }

  const raio = medidas ? Math.max(medidas.largura, medidas.altura) / 150 : 1
  const total = tracados.reduce((s, p) => s + p.length, 0)

  return (
    <section aria-label={t('canalTitulo')} className="space-y-3 rounded-xl border border-base-border bg-base-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-ink">{t('canalTitulo')}</h2>
          <p className="max-w-3xl text-sm text-slate-400">{t('canalExplica')}</p>
        </div>
        <button type="button" onClick={aoFechar} className="rounded-lg border border-base-border px-3 py-1 text-sm text-ink hover:bg-white/5">
          {t('canalFechar')}
        </button>
      </div>
      {aviso && (
        <p role="status" className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {aviso}
        </p>
      )}
      {erro && (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {erro}
        </p>
      )}
      {medidas && (
        <>
          <div
            data-testid="area-canal"
            onClick={clicar}
            className="relative w-full cursor-crosshair overflow-hidden rounded-lg border border-base-border bg-black"
            style={{ aspectRatio: `${medidas.largura} / ${medidas.altura}` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- PNG gerado pela API com login */}
            <img
              src={`${API}/reconstrucao/${refId}/${recId}/panoramica.png`}
              alt={t('canalAltImagem')}
              draggable={false}
              className="absolute inset-0 h-full w-full select-none object-fill"
            />
            <svg viewBox={`0 0 ${medidas.largura} ${medidas.altura}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
              {tracados.map((p, i) => (
                <g key={i}>
                  {p.length > 1 && (
                    <polyline
                      points={[...p].sort((a, b) => a[0] - b[0]).map(([x, y]) => `${x},${y}`).join(' ')}
                      fill="none"
                      stroke={CORES[i % CORES.length]}
                      strokeWidth={raio / 2}
                    />
                  )}
                  {p.map(([x, y], k) => (
                    <circle key={`${x}-${y}-${k}`} cx={x} cy={y} r={raio} fill={CORES[i % CORES.length]} stroke="#000" strokeWidth={raio / 4} />
                  ))}
                </g>
              ))}
            </svg>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-ink-2">{t('canalTracadoAtual', { n: atual + 1, pontos: tracados[atual].length })}</span>
            <button
              type="button"
              disabled={tracados.length >= MAX_TRACADOS || tracados[atual].length < 2}
              onClick={() => setTracados((ts) => [...ts, []])}
              className="text-teal-300 hover:underline disabled:opacity-40"
            >
              {t('canalNovoTracado')}
            </button>
            <button type="button" disabled={total === 0} onClick={desfazer} className="text-teal-300 hover:underline disabled:opacity-40">
              {t('desfazer')}
            </button>
            <button type="button" disabled={total === 0} onClick={() => setTracados([[]])} className="text-slate-400 hover:underline disabled:opacity-40">
              {t('limpar')}
            </button>
            <button
              type="button"
              disabled={!podeGravar}
              onClick={() => void gravar()}
              className="ml-auto rounded-lg bg-brand px-3 py-1.5 font-semibold text-white disabled:opacity-40"
            >
              {gravando ? t('gerando') : t('canalGravar')}
            </button>
          </div>
          <p className="text-xs text-slate-400">{t('canalLimite')}</p>
        </>
      )}
    </section>
  )
}
