'use client'

// MEDIDAS NO CORTE DA TOMOGRAFIA (24/11/2026, pedido do Luciano: recursos
// dos melhores sistemas). Fica POR CIMA da imagem do corte, no mesmo quadro
// do MarcadorAchado (prop "sobreposicao"), entao acompanha zoom e
// deslocamento.
// - Regua: dois cliques -> distancia em mm;
// - Angulo: tres cliques (o do meio e o vertice) -> graus;
// - com uma ferramenta ligada, esta camada recebe os cliques (o desenho de
//   marcacoes fica parado); desligada, so mostra as medidas do corte.
// Os pontos ficam em FRACAO da imagem; as contas estao em lib/tomografia.ts.

import { useState, type MouseEvent } from 'react'
import { anguloGraus, distanciaMm, type Ponto, type TamanhoMm } from '../../lib/tomografia'

export type FerramentaMedida = 'regua' | 'angulo'

export interface Medida {
  id: string
  tipo: FerramentaMedida
  pontos: Ponto[]
  valor: number
}

const PONTOS: Record<FerramentaMedida, number> = { regua: 2, angulo: 3 }
const pct = (v: number) => `${Number((v * 100).toFixed(3))}%`

export default function MedidasTomografia({
  modo,
  tamanho,
  medidas,
  onNova,
  rotulo,
}: {
  modo: FerramentaMedida | null
  tamanho: TamanhoMm
  medidas: Medida[]
  onNova: (m: Medida) => void
  /** texto da medida ja formatado ("75,0 mm", "90,0°") */
  rotulo: (m: Medida) => string
}) {
  const [pendentes, setPendentes] = useState<Ponto[]>([])

  function aoClicar(e: MouseEvent<HTMLDivElement>) {
    if (!modo) return
    e.stopPropagation()
    const caixa = e.currentTarget.getBoundingClientRect()
    if (!caixa.width || !caixa.height) return
    const p = {
      x: Math.min(1, Math.max(0, (e.clientX - caixa.left) / caixa.width)),
      y: Math.min(1, Math.max(0, (e.clientY - caixa.top) / caixa.height)),
    }
    const pontos = [...pendentes, p]
    if (pontos.length < PONTOS[modo]) {
      setPendentes(pontos)
      return
    }
    setPendentes([])
    const valor = modo === 'regua' ? distanciaMm(pontos[0], pontos[1], tamanho) : anguloGraus(pontos[0], pontos[1], pontos[2], tamanho)
    onNova({ id: `med-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, tipo: modo, pontos, valor })
  }

  const linha = (pontos: Ponto[], chave: string, tracejada = false) => (
    <polyline
      key={chave}
      points={pontos.map((p) => `${p.x},${p.y}`).join(' ')}
      fill="none"
      stroke="#facc15"
      strokeWidth={2}
      strokeDasharray={tracejada ? '4 3' : undefined}
      vectorEffect="non-scaling-stroke"
    />
  )

  return (
    <div
      data-testid={modo ? 'camada-medida' : 'medidas-desenhadas'}
      onClick={aoClicar}
      onMouseDown={(e) => {
        // so o botao esquerdo e da medida; o do meio e o direito continuam
        // deslocando e mudando brilho/contraste
        if (modo && e.button === 0) e.stopPropagation()
      }}
      className={`absolute inset-0 ${modo ? 'cursor-crosshair' : 'pointer-events-none'}`}
    >
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        {medidas.map((m) => linha(m.pontos, m.id))}
        {pendentes.length > 0 && linha(pendentes, 'pendente', true)}
        {[...medidas.flatMap((m) => m.pontos), ...pendentes].map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={0.004} fill="#facc15" />
        ))}
      </svg>
      {medidas.map((m) => {
        const ancora = m.tipo === 'angulo' ? m.pontos[1] : { x: (m.pontos[0].x + m.pontos[1].x) / 2, y: (m.pontos[0].y + m.pontos[1].y) / 2 }
        return (
          <span
            key={`r-${m.id}`}
            className="pointer-events-none absolute -translate-y-full rounded bg-black/75 px-1 text-[11px] font-semibold text-yellow-300"
            style={{ left: pct(ancora.x), top: pct(ancora.y) }}
          >
            {rotulo(m)}
          </span>
        )
      })}
    </div>
  )
}
