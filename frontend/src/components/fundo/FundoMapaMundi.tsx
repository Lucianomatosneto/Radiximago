'use client'

import { useEffect, useRef } from 'react'

// Fundo animado com o mapa-mundi em pontos (mesma identidade do globo da
// tela de entrada). Ocupa a tela inteira, fica atras de todo o conteudo e
// e puramente decorativo: aria-hidden, sem foco e sem receber cliques.
// O desenho em si fica em motorMapaMundi.ts.

// Ceu "noite ate turquesa" (o mesmo da tela de entrada) no tema escuro e
// uma versao gelo-turquesa no tema claro. Fica aqui, junto do componente,
// para nao depender do globals.css.
const ESTILO = `
.fundo-mapa-mundi{background:
  radial-gradient(70% 45% at 50% 100%, rgba(45,212,191,.38), transparent 70%),
  linear-gradient(180deg,#000 0%,#02090C 40%,#03302D 78%,#0B5E58 100%);}
.fundo-mapa-vinheta{background:
  radial-gradient(120% 95% at 55% 45%, transparent 45%, rgba(0,0,0,.6) 100%),
  linear-gradient(180deg, rgba(0,0,0,.35), transparent 22%);}
.light .fundo-mapa-mundi{background:
  radial-gradient(70% 45% at 50% 100%, rgba(45,212,191,.22), transparent 70%),
  linear-gradient(180deg,#F8FAFC 0%,#EEF5F7 55%,#D3F1EC 100%);}
.light .fundo-mapa-vinheta{background:
  radial-gradient(120% 95% at 55% 45%, transparent 50%, rgba(148,163,184,.22) 100%);}
`

interface Props {
  aoMudarLongitude?: (longitude: number) => void
}

export default function FundoMapaMundi({ aoMudarLongitude }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lonRef = useRef(aoMudarLongitude)
  lonRef.current = aoMudarLongitude

  useEffect(() => {
    let desligar: (() => void) | null = null
    let cancelado = false
    import('./motorMapaMundi').then(({ iniciarMapaMundi }) => {
      if (cancelado || !canvasRef.current) return
      desligar = iniciarMapaMundi({
        canvas: canvasRef.current,
        mascaraContinentes: '/login/continentes.png',
        aoMudarLongitude: (l) => lonRef.current?.(l),
      }).desligar
    })
    return () => {
      cancelado = true
      desligar?.()
    }
  }, [])

  return (
    <div aria-hidden="true" className="fundo-mapa-mundi pointer-events-none fixed inset-0 z-0">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {/* vinheta: escurece as bordas para o conteudo continuar legivel */}
      <div className="fundo-mapa-vinheta absolute inset-0" />
      <style>{ESTILO}</style>
    </div>
  )
}
