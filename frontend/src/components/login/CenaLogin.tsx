'use client'

import { useEffect, useRef, type MutableRefObject } from 'react'
import type { ControleCena } from './motorCenaLogin'

// Camadas visuais de fundo da tela de login (estrelas, globo, imagens em
// faixas e rastro do meteoro). Puramente decorativas: aria-hidden e sem foco
// de teclado. A logica fica em motorCenaLogin.ts; este componente so cria os
// elementos e liga/desliga o motor junto com a pagina.

// Ordem: RM, TC torax, coracao, panoramica, celulas, arvore, cao.
// Indices pares correm na faixa da frente; impares, na faixa de tras.
const IMAGENS = ['rm', 'tc', 'cardio', 'rxodonto', 'celulas', 'arvore', 'cao'].map((n) => `/login/${n}.webp`)

/** Largura da coluna de texto/login no desktop (deve bater com a classe lg:w-[640px] da pagina). */
export const LARGURA_COLUNA_LOGIN = 640

interface Props {
  controleRef: MutableRefObject<ControleCena | null>
  aoMudarFoco: (indice: number) => void
  aoMudarLongitude: (longitude: number) => void
}

export default function CenaLogin({ controleRef, aoMudarFoco, aoMudarLongitude }: Props) {
  const globoRef = useRef<HTMLCanvasElement>(null)
  const ceuRef = useRef<HTMLCanvasElement>(null)
  const rastroRef = useRef<HTMLDivElement>(null)
  // callbacks sempre atuais sem reiniciar a cena a cada render
  const focoRef = useRef(aoMudarFoco)
  const lonRef = useRef(aoMudarLongitude)
  focoRef.current = aoMudarFoco
  lonRef.current = aoMudarLongitude

  useEffect(() => {
    let desligar: (() => void) | null = null
    let cancelado = false
    // Three.js (~150 kB) so e baixado quando a tela abre, sem atrasar o formulario.
    import('./motorCenaLogin').then(({ iniciarCenaLogin }) => {
      if (cancelado || !globoRef.current || !ceuRef.current || !rastroRef.current) return
      const cena = iniciarCenaLogin({
        canvasGlobo: globoRef.current,
        canvasCeu: ceuRef.current,
        rastro: rastroRef.current,
        obterMargemEsquerda: () => LARGURA_COLUNA_LOGIN,
        aoMudarFoco: (i) => focoRef.current(i),
        aoMudarLongitude: (l) => lonRef.current(l),
        imagens: IMAGENS,
        mascaraContinentes: '/login/continentes.png',
      })
      desligar = cena.desligar
      controleRef.current = cena.controle
    })
    return () => {
      cancelado = true
      controleRef.current = null
      desligar?.()
    }
  }, [controleRef])

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
      <canvas ref={ceuRef} className="absolute inset-0 h-full w-full" />
      <canvas ref={globoRef} className="absolute inset-0 h-full w-full" />
      <div
        ref={rastroRef}
        className="absolute left-0 top-0 h-[3px] w-0 rounded-full opacity-0"
        style={{
          transformOrigin: '100% 50%',
          background: 'linear-gradient(90deg, rgba(204,251,241,0), rgba(204,251,241,.35) 55%, rgba(255,255,255,.95))',
          filter: 'drop-shadow(0 0 6px rgba(153,246,228,.9)) drop-shadow(0 0 18px rgba(45,212,191,.6))',
        }}
      />
      {/* sombra suave atras do titulo e do formulario (sem linha divisoria) */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(55% 75% at 18% 48%, rgba(0,0,0,.72), rgba(0,0,0,.35) 60%, transparent 100%)' }}
      />
    </div>
  )
}
