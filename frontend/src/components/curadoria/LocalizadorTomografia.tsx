'use client'

// LOCALIZADOR DA TOMOGRAFIA (pedido do Luciano, 23/11/2026): enquanto o
// curador passa os cortes, uma MINIATURA na margem de cima do quadro da
// imagem mostra, com uma LINHA DE REFERENCIA, onde esta o corte aberto:
// - axial: miniatura SAGITAL (meio do exame), linha horizontal na altura do
//   corte (alto da cabeca em cima, como em GET /reconstrucao/{ref}/plano.png);
// - sagital: miniatura AXIAL, linha vertical na coluna do corte;
// - coronal: miniatura AXIAL, linha horizontal na linha do corte;
// - faixa (MIP, na reconstrucao): a linha vira uma faixa com a espessura;
// - clicar na miniatura leva ao corte daquele ponto.

import { useState, type MouseEvent } from 'react'
import { useTranslations } from 'next-intl'

const API = process.env.NEXT_PUBLIC_API_URL

export type PlanoTomografia = 'axial' | 'sagital' | 'coronal'

interface Props {
  refId: number
  geo: { cortes: number; linhas: number; colunas: number }
  plano: PlanoTomografia
  /** corte aberto (0 = primeiro) no plano atual */
  corte: number
  /** espessura da faixa MIP, em cortes (so no axial da reconstrucao) */
  faixaCortes?: number
  onIr: (corte: number) => void
  /** "sobre": no canto de cima da imagem; "coluna": no alto de uma coluna
   * ao lado (quando a imagem tem barra de ferramentas em cima) */
  posicao?: 'sobre' | 'coluna'
  /** endereco da imagem de um corte (padrao: a rota da curadoria,
   * /reconstrucao/{ref}/plano.png); a tela de quem estuda usa a da
   * pesquisa, /search/{ficha}/tomografia/plano.png (24/11/2026) */
  urlPlano?: (plano: PlanoTomografia, indice: number) => string
}

const pct = (v: number) => `${Number((v * 100).toFixed(2))}%`

export default function LocalizadorTomografia({ refId, geo, plano, corte, faixaCortes = 1, onIr, posicao = 'sobre', urlPlano }: Props) {
  const lugar = posicao === 'sobre' ? 'absolute right-2 top-2 z-10' : 'relative'
  const t = useTranslations('Curadoria.localizador')
  const [escondido, setEscondido] = useState(false)
  const miniatura: PlanoTomografia = plano === 'axial' ? 'sagital' : 'axial'
  const indiceMiniatura = miniatura === 'sagital' ? Math.floor(geo.colunas / 2) : Math.floor(geo.cortes / 2)
  const total = plano === 'axial' ? geo.cortes : plano === 'sagital' ? geo.colunas : geo.linhas

  // linha (ou faixa) de referencia, em fracao da miniatura
  const f = Math.max(1, faixaCortes)
  const linha =
    plano === 'axial'
      ? { x: 0, y: 1 - (corte + 0.5 + f / 2) / total, largura: 1, altura: f / total }
      : plano === 'sagital'
        ? { x: (corte + 1) / total, y: 0, largura: 0, altura: 1 }
        : { x: 0, y: (corte + 1) / total, largura: 1, altura: 0 }

  function ir(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    const caixa = e.currentTarget.getBoundingClientRect()
    if (!caixa.width || !caixa.height) return
    const fx = (e.clientX - caixa.left) / caixa.width
    const fy = (e.clientY - caixa.top) / caixa.height
    const fracao = plano === 'axial' ? 1 - fy : plano === 'sagital' ? fx : fy
    onIr(Math.min(total - 1, Math.max(0, Math.floor(fracao * total))))
  }

  if (escondido) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setEscondido(false)
        }}
        className={`${lugar} rounded-md border border-teal-400/60 bg-black/70 px-2 py-0.5 text-xs text-teal-100`}
      >
        {t('mostrar')}
      </button>
    )
  }

  return (
    <figure
      className={`${lugar} w-36 overflow-hidden rounded-md border border-teal-400/70 bg-black shadow-lg`}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button type="button" onClick={ir} aria-label={t('irPara')} className="relative block w-full cursor-pointer">
        {/* eslint-disable-next-line @next/next/no-img-element -- PNG gerado pela API com login */}
        <img
          src={urlPlano ? urlPlano(miniatura, indiceMiniatura) : `${API}/reconstrucao/${refId}/plano.png?plano=${miniatura}&indice=${indiceMiniatura}`}
          alt={t('alt', { miniatura: t(miniatura), plano: t(plano) })}
          draggable={false}
          className="block w-full select-none"
        />
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
          {plano === 'axial' ? (
            <rect
              data-testid="linha-referencia"
              x="0%"
              y={pct(linha.y)}
              width="100%"
              height={pct(linha.altura)}
              fill={f > 1 ? 'rgba(250, 204, 21, 0.35)' : 'none'}
              stroke="#facc15"
              strokeWidth={1.5}
            />
          ) : plano === 'sagital' ? (
            <rect data-testid="linha-referencia" x={pct(linha.x)} y="0%" width="0" height="100%" stroke="#facc15" strokeWidth={1.5} />
          ) : (
            <rect data-testid="linha-referencia" x="0%" y={pct(linha.y)} width="100%" height="0" stroke="#facc15" strokeWidth={1.5} />
          )}
        </svg>
      </button>
      <figcaption className="flex items-center justify-between bg-black/80 px-1.5 py-0.5 text-[10px] text-teal-100">
        <span>{t(miniatura)}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setEscondido(true)
          }}
          className="hover:underline"
        >
          {t('esconder')}
        </button>
      </figcaption>
    </figure>
  )
}
