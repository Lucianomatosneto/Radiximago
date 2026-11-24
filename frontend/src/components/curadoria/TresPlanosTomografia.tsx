'use client'

// TRES PLANOS JUNTOS, SINCRONIZADOS (pedido do Luciano, 24/11/2026,
// recurso 7): axial, sagital e coronal lado a lado, como nos grandes
// sistemas, com um CURSOR 3D comum (coluna, linha, corte).
// - cada quadro mostra o corte que passa pelo cursor e uma cruz amarela
//   onde ele esta;
// - clicar num ponto de um quadro move o cursor: os outros dois vao ao
//   mesmo lugar;
// - duplo clique faz do quadro o plano principal (onde se marca).
// As imagens sao as de plano.png: axial (x = coluna, y = linha); sagital
// (x = linha; de cima para baixo, do ultimo corte ao primeiro) e coronal
// (x = coluna; idem).

import type { MouseEvent } from 'react'
import { useTranslations } from 'next-intl'
import type { PlanoTomografia } from './LocalizadorTomografia'

export interface Cursor3d {
  coluna: number
  linha: number
  corte: number
}

const PLANOS: PlanoTomografia[] = ['axial', 'sagital', 'coronal']
const pct = (v: number) => Number((v * 100).toFixed(2))
/** fracao (0-1) -> indice inteiro; o epsilon evita 19,999... virar 19 */
const indice = (fracao: number, total: number) => Math.min(total - 1, Math.max(0, Math.floor(fracao * total + 1e-9)))

export default function TresPlanosTomografia({
  geo,
  urlPlano,
  cursor,
  onCursor,
  planoPrincipal,
  onEscolherPlano,
}: {
  geo: { cortes: number; linhas: number; colunas: number }
  urlPlano: (plano: PlanoTomografia, indice: number) => string
  cursor: Cursor3d
  onCursor: (c: Cursor3d) => void
  planoPrincipal: PlanoTomografia
  onEscolherPlano: (p: PlanoTomografia) => void
}) {
  const t = useTranslations('Curadoria.tresPlanos')

  // indice do corte e posicao da cruz (em %) de cada quadro
  const doQuadro = (p: PlanoTomografia) => {
    const alto = 1 - (cursor.corte + 0.5) / geo.cortes // alto da cabeca em cima
    if (p === 'axial') return { i: cursor.corte, x: (cursor.coluna + 0.5) / geo.colunas, y: (cursor.linha + 0.5) / geo.linhas }
    if (p === 'sagital') return { i: cursor.coluna, x: (cursor.linha + 0.5) / geo.linhas, y: alto }
    return { i: cursor.linha, x: (cursor.coluna + 0.5) / geo.colunas, y: alto }
  }

  function clicar(p: PlanoTomografia, e: MouseEvent<HTMLButtonElement>) {
    const caixa = e.currentTarget.getBoundingClientRect()
    if (!caixa.width || !caixa.height) return
    const fx = Math.min(1, Math.max(0, (e.clientX - caixa.left) / caixa.width))
    const fy = Math.min(1, Math.max(0, (e.clientY - caixa.top) / caixa.height))
    if (p === 'axial') onCursor({ ...cursor, coluna: indice(fx, geo.colunas), linha: indice(fy, geo.linhas) })
    else if (p === 'sagital') onCursor({ ...cursor, linha: indice(fx, geo.linhas), corte: indice(1 - fy, geo.cortes) })
    else onCursor({ ...cursor, coluna: indice(fx, geo.colunas), corte: indice(1 - fy, geo.cortes) })
  }

  return (
    <div role="group" aria-label={t('titulo')} className="grid grid-cols-3 gap-2">
      {PLANOS.map((p) => {
        const q = doQuadro(p)
        const nome = t(p)
        return (
          <figure key={p} className="flex min-w-0 flex-col items-center gap-1">
            <button
              type="button"
              aria-pressed={planoPrincipal === p}
              aria-label={`${nome}: ${t('dicaQuadro')}`}
              title={t('dicaQuadro')}
              onClick={(e) => clicar(p, e)}
              onDoubleClick={() => onEscolherPlano(p)}
              className={`relative block cursor-crosshair overflow-hidden rounded-md border-2 bg-black ${
                planoPrincipal === p ? 'border-teal-400' : 'border-base-border hover:border-teal-600'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- PNG gerado pela API com login */}
              <img src={urlPlano(p, q.i)} alt={`${nome} ${t('corteN', { n: q.i + 1 })}`} draggable={false} className="block h-40 w-auto max-w-full select-none" />
              <span
                data-testid={`cruz-${p}`}
                data-x={String(pct(q.x))}
                data-y={String(pct(q.y))}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
              >
                <span className="absolute inset-y-0 w-px bg-yellow-400/90" style={{ left: `${pct(q.x)}%` }} />
                <span className="absolute inset-x-0 h-px bg-yellow-400/90" style={{ top: `${pct(q.y)}%` }} />
              </span>
            </button>
            <figcaption className="text-[11px] text-ink-2">
              {nome} · {t('corteN', { n: q.i + 1 })}
            </figcaption>
          </figure>
        )
      })}
    </div>
  )
}
