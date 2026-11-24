'use client'

// PANORAMICA E CANAL PARA QUEM ESTUDA (pedido do Luciano, 24/11/2026,
// recurso 5). Na tela da imagem aprovada (/visualizar/[id]), quando o
// curador gerou uma reconstrucao desta tomografia:
// - a PANORAMICA reconstruida em cima, com uma linha amarela onde esta o
//   corte transversal aberto; clicar na panoramica abre o corte daquele
//   ponto (corte n = distancia ao longo da arcada / intervalo + 1, a mesma
//   regra do servidor, reconstrucao/canal.py: coluna_do_corte);
// - o CORTE TRANSVERSAL embaixo: barra, roda do mouse e setas;
// - "Mostrar canal mandibular" (quando o curador marcou) troca as imagens
//   pelas versoes com o canal desenhado. A panoramica so mostra a ALTURA do
//   canal (nao a posicao vestibulolingual) - aviso na tela;
// - mais de uma reconstrucao: escolhe qual.
// Imagens de GET /search/{ficha}/tomografia/reconstrucoes/{rec}/imagem.png
// (ficha aprovada, imagem ativa).

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { fetchOuNulo } from '../../lib/fetchSeguro'

const API = process.env.NEXT_PUBLIC_API_URL

interface Reconstrucao {
  id: number
  criado_em: string | null
  total_cortes: number
  tamanho_pixel_mm: number
  intervalo_mm: number
  largura_mm: number
  tem_canal: boolean
}

const meio = (r: Reconstrucao) => Math.floor(r.total_cortes / 2) + 1
const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export default function ReconstrucoesTomografia({ curationId }: { curationId: number }) {
  const t = useTranslations('VisualizarImagem.reconstrucoes')
  const formato = useFormatter()
  const [lista, setLista] = useState<Reconstrucao[]>([])
  const [recId, setRecId] = useState<number | null>(null)
  const [n, setN] = useState(1)
  const [canal, setCanal] = useState(true)
  const [larguraPano, setLarguraPano] = useState(0)
  const passarRef = useRef<(sentido: number) => void>(() => {})

  useEffect(() => {
    let vivo = true
    void (async () => {
      const r = await fetchOuNulo(`${API}/search/${curationId}/tomografia/reconstrucoes`, { credentials: 'include' })
      if (!vivo || !r || !r.ok) return
      const dados = (await r.json().catch(() => null)) as Reconstrucao[] | null
      if (!vivo || !Array.isArray(dados) || dados.length === 0) return
      setLista(dados)
      setRecId(dados[0].id)
      setN(meio(dados[0]))
    })()
    return () => {
      vivo = false
    }
  }, [curationId])

  const rec = lista.find((r) => r.id === recId) ?? null
  const total = rec?.total_cortes ?? 1
  const passar = useCallback((sentido: number) => setN((v) => limitar(v + sentido, 1, total)), [total])
  passarRef.current = passar

  const areaRef = useCallback((area: HTMLDivElement | null) => {
    if (!area) return
    area.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        e.preventDefault()
        if (e.deltaY !== 0) passarRef.current(e.deltaY < 0 ? 1 : -1)
      },
      { passive: false },
    )
  }, [])

  if (!rec) return null

  const comCanal = rec.tem_canal && canal
  const url = (tipo: 'panoramica' | 'corte') =>
    `${API}/search/${curationId}/tomografia/reconstrucoes/${rec.id}/imagem.png?tipo=${tipo}${tipo === 'corte' ? `&n=${n}` : ''}&canal=${comCanal}`
  // coluna da panoramica do corte aberto (mesma regra do servidor)
  const colunaDoCorte = ((n - 1) * rec.intervalo_mm) / rec.tamanho_pixel_mm
  const posicaoLinha = larguraPano > 0 ? Math.min(1, colunaDoCorte / larguraPano) : null

  function trocarReconstrucao(id: number) {
    const nova = lista.find((r) => r.id === id)
    if (!nova) return
    setRecId(id)
    setN(meio(nova))
    setLarguraPano(0)
  }

  function irParaPonto(e: MouseEvent<HTMLImageElement>) {
    if (!rec || !larguraPano) return
    const caixa = e.currentTarget.getBoundingClientRect()
    if (!caixa.width) return
    const coluna = ((e.clientX - caixa.left) / caixa.width) * larguraPano
    setN(limitar(Math.round((coluna * rec.tamanho_pixel_mm) / rec.intervalo_mm) + 1, 1, rec.total_cortes))
  }

  const mm = (v: number) => formato.number(v, { maximumFractionDigits: 1 })

  return (
    <section aria-labelledby="titulo-reconstrucoes-tc" className="mt-4 rounded-2xl border border-base-border bg-base-surface p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 id="titulo-reconstrucoes-tc" className="text-base font-semibold text-ink">
          {t('titulo')}
        </h2>
        {lista.length > 1 && (
          <label className="flex items-center gap-1 text-xs text-ink-2">
            {t('reconstrucao')}
            <select
              value={rec.id}
              onChange={(e) => trocarReconstrucao(Number(e.target.value))}
              aria-label={t('reconstrucao')}
              className="rounded border border-base-border bg-base-surface px-1 py-0.5"
            >
              {lista.map((r, i) => (
                <option key={r.id} value={r.id}>
                  {t('opcao', { n: lista.length - i, cortes: r.total_cortes })}
                </option>
              ))}
            </select>
          </label>
        )}
        {rec.tem_canal && (
          <label className="flex items-center gap-1 text-xs text-ink-2">
            <input type="checkbox" checked={canal} onChange={(e) => setCanal(e.target.checked)} />
            {t('mostrarCanal')}
          </label>
        )}
      </div>
      <p className="mb-2 text-xs text-slate-400">
        {t('dica')}
        {comCanal ? ` ${t('limiteCanal')}` : ''}
      </p>
      <div className="relative overflow-x-auto rounded-lg bg-black">
        <div className="relative inline-block min-w-full">
          {/* eslint-disable-next-line @next/next/no-img-element -- PNG gerado pela API com login */}
          <img
            src={url('panoramica')}
            alt={t('altPanoramica')}
            draggable={false}
            onLoad={(e) => setLarguraPano(e.currentTarget.naturalWidth)}
            onClick={irParaPonto}
            className="block h-auto w-full cursor-crosshair select-none"
          />
          {posicaoLinha !== null && (
            <span
              data-testid="linha-corte-transversal"
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 w-0.5 bg-yellow-400"
              style={{ left: `${Number((posicaoLinha * 100).toFixed(2))}%` }}
            />
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <input
          type="range"
          min={1}
          max={rec.total_cortes}
          value={n}
          onChange={(e) => setN(Number(e.target.value))}
          aria-label={t('corteTransversal')}
          className="w-56"
        />
        <span className="tabular-nums text-ink-2">{t('corteDe', { n, total: rec.total_cortes, mm: mm((n - 1) * rec.intervalo_mm) })}</span>
      </div>
      <div
        ref={areaRef}
        data-testid="area-corte-transversal"
        tabIndex={0}
        onKeyDown={(e) => {
          const passos: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }
          if (e.key in passos) {
            e.preventDefault()
            passar(passos[e.key])
          }
        }}
        className="mt-2 flex justify-center rounded-lg bg-black p-2 outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- PNG gerado pela API com login */}
        <img src={url('corte')} alt={t('altCorte', { n })} draggable={false} className="block h-[40vh] w-auto max-w-none select-none" />
      </div>
    </section>
  )
}
