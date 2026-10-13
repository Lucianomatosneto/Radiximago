'use client'

import { useTranslations } from 'next-intl'
import { pontoNumeroMarcacao, type Marcacao } from '../../lib/marcacoes'
import { textoMarcacao } from '../../lib/descricaoCuradoria'

// Selos com o numero de cada marcacao (ordem em que o curador marcou),
// desenhados em HTML por cima da imagem - em SVG esticado (viewBox 0..1
// com preserveAspectRatio="none") o numero sairia deformado. Deve ficar
// dentro de uma caixa do MESMO tamanho/posicao da imagem (ou do recorte
// visivel dela, no editor da Curadoria).
//
// Com `dica` (padrao), passar o mouse sobre o numero mostra a descricao
// daquela marcacao ("Marcação 1: Cárie"). No editor da Curadoria
// usa-se dica={false} para o selo nao atrapalhar o desenho.
export default function NumerosMarcacoes({
  marcacoes,
  recorte,
  dica = true,
}: {
  marcacoes: Marcacao[]
  recorte?: { x: number; y: number; largura: number; altura: number } | null
  dica?: boolean
}) {
  const t = useTranslations('DescricaoCuradoria')
  const r = recorte ?? { x: 0, y: 0, largura: 1, altura: 1 }
  return (
    <div className="pointer-events-none absolute inset-0">
      {marcacoes.map((m, i) => {
        const p = pontoNumeroMarcacao(m)
        const left = ((p.x - r.x) / r.largura) * 100
        const top = ((p.y - r.y) / r.altura) * 100
        if (left < -5 || left > 105 || top < -5 || top > 105) return null
        const texto = `${t('marcacaoN', { numero: i + 1 })}: ${textoMarcacao(m)}`
        const embaixo = top < 15
        const aDireita = left < 50
        return (
          <span
            key={m.id ?? i}
            className={`group absolute z-10 -translate-x-1/2 -translate-y-1/2 ${dica ? 'pointer-events-auto cursor-help' : ''}`}
            style={{ left: `${left}%`, top: `${top}%` }}
            aria-label={texto}
            tabIndex={dica ? 0 : -1}
          >
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full border border-white bg-amber-400 px-1 text-[11px] font-bold leading-none text-black shadow">
              {i + 1}
            </span>
            {dica && (
              <span
                role="tooltip"
                className={`invisible absolute z-20 w-max max-w-[260px] rounded-lg border border-amber-400 bg-slate-900/95 px-2.5 py-1.5 text-xs font-semibold leading-snug text-slate-50 opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100 ${
                  embaixo ? 'top-full mt-1.5' : 'bottom-full mb-1.5'
                } ${aDireita ? 'left-0' : 'right-0'}`}
              >
                {texto}
              </span>
            )}
          </span>
        )
      })}
    </div>
  )
}
