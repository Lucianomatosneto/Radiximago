'use client'

import type { Segmentacao } from '../../lib/segmentacoes'

/**
 * Mostra as estruturas pintadas pelo curador por cima da imagem, cada uma na
 * sua cor e semitransparente (a anatomia aparece por baixo). A mascara (PNG
 * branco onde foi pintado) vira um "molde" (CSS mask-image) sobre um bloco
 * da cor da estrutura - sem desenhar pixel a pixel no navegador.
 *
 * Precisa ficar dentro de uma caixa do MESMO tamanho e posicao da imagem
 * (igual a CamadaMarcacoes): a mascara cobre a imagem inteira.
 */
export default function CamadaSegmentacoes({
  segmentacoes,
  opacidade = 0.35,
  ocultas = [],
}: {
  segmentacoes: Pick<Segmentacao, 'id' | 'cor' | 'mascara' | 'nome'>[]
  opacidade?: number
  /** ids das estruturas escondidas */
  ocultas?: number[]
}) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {segmentacoes
        .filter((s) => !ocultas.includes(s.id))
        .map((s) => (
          <div
            key={s.id}
            className="absolute inset-0"
            style={{
              backgroundColor: s.cor,
              opacity: opacidade,
              WebkitMaskImage: `url(${s.mascara})`,
              maskImage: `url(${s.mascara})`,
              WebkitMaskSize: '100% 100%',
              maskSize: '100% 100%',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
            }}
          />
        ))}
    </div>
  )
}
