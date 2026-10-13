'use client'

import { pontoNumeroMarcacao, type Marcacao } from '../../lib/marcacoes'

// Selos com o numero de cada marcacao (ordem em que o curador marcou),
// desenhados em HTML por cima da imagem - em SVG esticado (viewBox 0..1
// com preserveAspectRatio="none") o numero sairia deformado. Deve ficar
// dentro de uma caixa do MESMO tamanho/posicao da imagem (ou do recorte
// visivel dela, no editor da Curadoria).
export default function NumerosMarcacoes({
  marcacoes,
  recorte,
}: {
  marcacoes: Marcacao[]
  recorte?: { x: number; y: number; largura: number; altura: number } | null
}) {
  const r = recorte ?? { x: 0, y: 0, largura: 1, altura: 1 }
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {marcacoes.map((m, i) => {
        const p = pontoNumeroMarcacao(m)
        const left = ((p.x - r.x) / r.largura) * 100
        const top = ((p.y - r.y) / r.altura) * 100
        if (left < -5 || left > 105 || top < -5 || top > 105) return null
        return (
          <span
            key={m.id ?? i}
            className="absolute flex h-5 min-w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white bg-amber-400 px-1 text-[11px] font-bold leading-none text-black shadow"
            style={{ left: `${left}%`, top: `${top}%` }}
          >
            {i + 1}
          </span>
        )
      })}
    </div>
  )
}
