'use client'

// MARCAR LESAO NA TOMOGRAFIA - NO CORTE (pedido do Luciano, 23/11/2026,
// "opcao 1"): o curador escolhe o PLANO (axial, sagital ou coronal), passa
// os CORTES ate onde a lesao aparece melhor e desenha como nas radiografias
// (o mesmo MarcadorAchado: oval, retangulo, seta).
// - a imagem do corte vem de GET /reconstrucao/{ref}/plano.png (pixels
//   quadrados em mm; no sagital e no coronal o alto da cabeca fica em cima);
// - cada marcacao nova leva o plano e o numero do corte (Marcacao.plano /
//   Marcacao.corte); so aparecem as do corte aberto;
// - a lista "Marcações do exame" mostra todas; "Ir" abre o corte de cada uma.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import MarcadorAchado from './MarcadorAchado'
import LocalizadorTomografia from './LocalizadorTomografia'
import { fetchOuNulo } from '../../lib/fetchSeguro'
import type { Marcacao } from '../../lib/marcacoes'

const API = process.env.NEXT_PUBLIC_API_URL

type Plano = 'axial' | 'sagital' | 'coronal'
const PLANOS: Plano[] = ['axial', 'sagital', 'coronal']

interface Geometria {
  cortes: number
  linhas: number
  colunas: number
}

const totalNoPlano = (g: Geometria, p: Plano) => (p === 'axial' ? g.cortes : p === 'sagital' ? g.colunas : g.linhas)

export default function MarcadorTomografia({
  orthancReferenceId,
  marcacoes,
  onMarcar,
  onCarregou,
}: {
  orthancReferenceId: number
  marcacoes: Marcacao[]
  onMarcar: (marcacoes: Marcacao[]) => void
  onCarregou?: () => void
}) {
  const t = useTranslations('Curadoria.marcadorTomografia')
  const [geo, setGeo] = useState<Geometria | null>(null)
  const [erro, setErro] = useState('')
  const [plano, setPlano] = useState<Plano>('axial')
  const [corte, setCorte] = useState(0)
  const passarRef = useRef<(sentido: number) => void>(() => {})

  useEffect(() => {
    let vivo = true
    void (async () => {
      const r = await fetchOuNulo(`${API}/reconstrucao/${orthancReferenceId}/geometria`, { credentials: 'include' })
      if (!vivo) return
      if (!r || !r.ok) {
        setErro(t('erroCarregar'))
        return
      }
      const g: Geometria = await r.json()
      if (!vivo) return
      setGeo(g)
      setCorte(Math.floor(g.cortes / 2))
    })()
    return () => {
      vivo = false
    }
  }, [orthancReferenceId, t])

  const total = geo ? totalNoPlano(geo, plano) : 0

  const passar = useCallback(
    (sentido: number) => setCorte((c) => Math.min(Math.max(0, total - 1), Math.max(0, c + sentido))),
    [total],
  )

  passarRef.current = passar

  // roda do mouse: para cima avanca um corte; nao rola a pagina. O ouvinte
  // entra assim que a area aparece (ref de funcao), sem esperar efeito, e
  // e "passive: false" para poder cancelar a rolagem da pagina.
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

  function trocarPlano(p: Plano) {
    if (!geo || p === plano) return
    setPlano(p)
    setCorte(Math.floor(totalNoPlano(geo, p) / 2))
  }

  function irPara(m: Marcacao) {
    if (!m.plano || typeof m.corte !== 'number') return
    setPlano(m.plano)
    setCorte(m.corte)
  }

  const doCorte = (m: Marcacao) => m.plano === plano && m.corte === corte
  const visiveis = marcacoes.filter(doCorte)

  function aoMarcar(novas: Marcacao[]) {
    // as do corte aberto sao trocadas pelas novas (com plano e corte); as de
    // outros cortes (e as antigas sem corte) continuam como estavam
    onMarcar([...marcacoes.filter((m) => !doCorte(m)), ...novas.map((m) => ({ ...m, plano, corte }))])
  }

  if (erro) {
    return (
      <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
        {erro}
      </p>
    )
  }
  if (!geo) return <p className="text-sm text-slate-400">{t('carregando')}</p>

  const nomes: Record<Plano, string> = { axial: t('axial'), sagital: t('sagital'), coronal: t('coronal') }
  const doExame = marcacoes.filter((m) => m.plano && typeof m.corte === 'number')

  return (
    <div className="flex h-full min-h-0 gap-3">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div role="group" aria-label={t('plano')} className="flex gap-1">
            {PLANOS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={plano === p}
                onClick={() => trocarPlano(p)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  plano === p ? 'border-teal-500 bg-teal-500/15 text-teal-800 dark:text-teal-100' : 'border-base-border text-ink-2 hover:border-teal-500'
                }`}
              >
                {nomes[p]}
              </button>
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(0, total - 1)}
            value={corte}
            onChange={(e) => setCorte(Number(e.target.value))}
            aria-label={t('corte')}
            className="w-48"
          />
          <span className="tabular-nums text-ink-2">{t('corteDe', { n: corte + 1, total })}</span>
          <span className="text-xs text-slate-400">{t('dica')}</span>
        </div>
        <div
          ref={areaRef}
          data-testid="area-tomografia"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'PageUp') {
              e.preventDefault()
              passar(1)
            } else if (e.key === 'ArrowDown' || e.key === 'PageDown') {
              e.preventDefault()
              passar(-1)
            }
          }}
          className="min-h-0 flex-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
        >
          <MarcadorAchado
            urlImagem={`${API}/reconstrucao/${orthancReferenceId}/plano.png?plano=${plano}&indice=${corte}`}
            semRecorte
            semAchado
            marcacoes={visiveis}
            onMarcar={aoMarcar}
            onCarregou={onCarregou}
          />
        </div>
      </div>
      <aside className="w-48 shrink-0 space-y-2 overflow-y-auto text-xs">
        {/* localizador (23/11/2026): onde esta o corte nos outros planos; fica
            no alto da coluna para nao cobrir a barra de formas da imagem */}
        <LocalizadorTomografia refId={orthancReferenceId} geo={geo} plano={plano} corte={corte} onIr={setCorte} posicao="coluna" />
        <h3 className="font-semibold text-ink">{t('marcacoesDoExame')}</h3>
        {doExame.length === 0 ? (
          <p className="text-slate-400">{t('nenhuma')}</p>
        ) : (
          <ul aria-label={t('marcacoesDoExame')} className="space-y-1">
            {doExame.map((m, i) => (
              <li key={m.id} className={`flex items-center justify-between gap-2 rounded border px-2 py-1 ${doCorte(m) ? 'border-teal-500' : 'border-base-border'}`}>
                <span className="text-ink-2">
                  {i + 1}. {nomes[m.plano as Plano]} · {t('corteN', { n: (m.corte ?? 0) + 1 })}
                </span>
                <button type="button" onClick={() => irPara(m)} className="text-teal-300 hover:underline">
                  {t('ir')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  )
}
