'use client'

import { useEffect, useRef } from 'react'
import type { ControleMapaMundi, IntensidadeFundo } from './motorMapaMundi'

// Fundo animado com o mapa-mundi em pontos (mesma identidade do globo da
// tela de entrada). Ocupa a tela inteira, fica ATRAS de todo o conteudo
// (z-index negativo) e e puramente decorativo: aria-hidden, sem foco e sem
// receber cliques. O desenho em si fica em motorMapaMundi.ts.
//
// O motor e criado uma unica vez; ao trocar de tela so o "modo" muda
// (intensidade e tema), sem recarregar a mascara nem piscar.

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
/* leitura (escuro): em vez de preto, um cinza-azulado (ardosia) medio -
   preto absoluto com texto branco cansa a vista em leituras longas; aqui a
   area de trabalho fica clara o bastante para ler sem esforco */
.fundo-mapa-mundi[data-intensidade="leitura"]{background:
  radial-gradient(70% 45% at 50% 100%, rgba(45,212,191,.16), transparent 70%),
  linear-gradient(180deg,#172129 0%,#18242C 45%,#19302F 80%,#1B3D38 100%);}
.fundo-mapa-mundi[data-intensidade="leitura"] .fundo-mapa-vinheta{background:
  radial-gradient(120% 95% at 55% 45%, transparent 60%, rgba(0,0,0,.18) 100%);}
.light .fundo-mapa-mundi:not([data-forcar-escuro]){background:
  radial-gradient(70% 45% at 50% 100%, rgba(45,212,191,.22), transparent 70%),
  linear-gradient(180deg,#FAFCFD 0%,#F2F8F9 55%,#DDF4F0 100%);}
.light .fundo-mapa-mundi:not([data-forcar-escuro])[data-intensidade="leitura"]{background:
  radial-gradient(70% 45% at 50% 100%, rgba(45,212,191,.12), transparent 70%),
  linear-gradient(180deg,#FBFCFD 0%,#F6F9FA 60%,#EAF6F4 100%);}
.light .fundo-mapa-mundi:not([data-forcar-escuro]) .fundo-mapa-vinheta{background:
  radial-gradient(120% 95% at 55% 45%, transparent 60%, rgba(148,163,184,.12) 100%);}
`

interface Props {
  intensidade: IntensidadeFundo
  forcarEscuro?: boolean
  aoMudarLongitude?: (longitude: number) => void
}

export default function FundoMapaMundi({ intensidade, forcarEscuro = false, aoMudarLongitude }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const controleRef = useRef<ControleMapaMundi | null>(null)
  const lonRef = useRef(aoMudarLongitude)
  lonRef.current = aoMudarLongitude
  const modoRef = useRef({ intensidade, forcarEscuro })
  modoRef.current = { intensidade, forcarEscuro }

  useEffect(() => {
    let cancelado = false
    import('./motorMapaMundi').then(({ iniciarMapaMundi }) => {
      if (cancelado || !canvasRef.current) return
      controleRef.current = iniciarMapaMundi({
        canvas: canvasRef.current,
        mascaraContinentes: '/login/continentes.png',
        aoMudarLongitude: (l) => lonRef.current?.(l),
        ...modoRef.current,
      })
    })
    return () => {
      cancelado = true
      controleRef.current?.desligar()
      controleRef.current = null
    }
  }, [])

  useEffect(() => {
    controleRef.current?.definirModo({ intensidade, forcarEscuro })
  }, [intensidade, forcarEscuro])

  return (
    <div
      aria-hidden="true"
      data-intensidade={intensidade}
      data-forcar-escuro={forcarEscuro ? '' : undefined}
      className="fundo-mapa-mundi pointer-events-none fixed inset-0 -z-10"
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {/* vinheta: escurece as bordas para o conteudo continuar legivel */}
      <div className="fundo-mapa-vinheta absolute inset-0" />
      <style dangerouslySetInnerHTML={{ __html: ESTILO }} />
    </div>
  )
}
