'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import type { Marcacao } from '../../lib/marcacoes'
import { textoMarcacao } from '../../lib/descricaoCuradoria'
import type { ViewerInfo } from './tipos'

function origemDe(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

function estudoDe(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).searchParams.get('StudyInstanceUIDs')?.split(',')[0] ?? null
  } catch {
    return null
  }
}

// O OHIF com TODAS as ferramentas dele (medir, zoom, janela, girar...),
// sem a coluna "Studies" (radixRecolherEstudos=1 - ver
// ohif/app-config.template.js). As marcacoes do curador sao desenhadas DENTRO
// do OHIF (mesma mensagem usada no visualizador da Pesquisa) e acompanham
// zoom e arraste; o botao no canto liga/desliga.
export default function VisualizadorRevisao({
  carregando,
  viewerInfo,
  marcacoes,
  mostrarMarcacoes,
  onAlternarMarcacoes,
}: {
  carregando: boolean
  viewerInfo: ViewerInfo | null
  marcacoes: Marcacao[]
  mostrarMarcacoes: boolean
  onAlternarMarcacoes: () => void
}) {
  const t = useTranslations('SegundaOpiniao.visualizador')
  const tDescricao = useTranslations('DescricaoCuradoria')
  const ohifRef = useRef<HTMLIFrameElement>(null)
  const url = viewerInfo?.abrivel ? viewerInfo.viewer_url : null
  const urlOhif = url ? `${url}${url.includes('?') ? '&' : '?'}radixRecolherEstudos=1` : null
  const origem = origemDe(url)
  const estudo = estudoDe(url)

  const enviarRef = useRef<() => void>(() => {})
  enviarRef.current = () => {
    const janela = ohifRef.current?.contentWindow
    if (!janela || !origem || !estudo) return
    janela.postMessage(
      {
        tipo: 'radix-marcacoes',
        estudos: {
          [estudo]: marcacoes.map((m, i) => ({ ...m, texto: `${tDescricao('marcacaoN', { numero: i + 1 })}: ${textoMarcacao(m)}` })),
        },
        visiveis: mostrarMarcacoes ? [estudo] : [],
        foco: null,
        holofote: false,
        espacoDireita: 0,
      },
      origem
    )
  }
  useEffect(() => {
    enviarRef.current()
  })
  useEffect(() => {
    if (!origem) return
    function aoReceber(ev: MessageEvent) {
      if (ev.origin !== origem) return
      const d = ev.data as { tipo?: unknown } | null
      if (d && d.tipo === 'radix-ohif-pronto') enviarRef.current()
    }
    window.addEventListener('message', aoReceber)
    return () => window.removeEventListener('message', aoReceber)
  }, [origem])

  return (
    <div className="relative h-full min-h-[320px] w-full overflow-hidden rounded-xl border border-base-border bg-black">
      {carregando ? (
        <div className="flex h-full items-center justify-center text-sm text-slate-400">{t('carregando')}</div>
      ) : urlOhif ? (
        <iframe ref={ohifRef} key={urlOhif} src={urlOhif} referrerPolicy="origin" title={t('titulo')} className="h-full w-full border-0" />
      ) : (
        <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-400">
          {viewerInfo?.motivo ?? t('indisponivel')}
        </div>
      )}
      {urlOhif && marcacoes.length > 0 && (
        <button
          type="button"
          onClick={onAlternarMarcacoes}
          aria-pressed={mostrarMarcacoes}
          className={`absolute bottom-3 left-3 z-10 flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold backdrop-blur-sm transition ${
            mostrarMarcacoes
              ? 'border-amber-300 bg-amber-300/20 text-amber-100'
              : 'border-white/30 bg-black/60 text-slate-200 hover:border-amber-300/70'
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z" />
            <circle cx="12" cy="11" r="2" />
          </svg>
          {mostrarMarcacoes ? t('esconderMarcacoes', { total: marcacoes.length }) : t('mostrarMarcacoes', { total: marcacoes.length })}
        </button>
      )}
    </div>
  )
}
