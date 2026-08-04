'use client'

import { useEffect, useRef, useState } from 'react'
import FormasMarcacoes from './FormasMarcacoes'
import type { Marcacao } from '../../lib/marcacoes'
import { useHoverMarcacao } from '../../lib/useHoverMarcacao'

// Substitui o visualizador principal (iframe do OHIF ou miniatura simples)
// pela mesma imagem estatica de preview, com as marcacoes do curador
// desenhadas por cima. O wrapper usa h-full w-full - a MESMA caixa que o
// iframe ocupava - pra nao mudar tamanho/posicao na tela ao ligar/desligar
// a marcacao. O overlay SVG e posicionado (via getBoundingClientRect) pra
// bater exatamente com o retangulo REAL da imagem ja renderizada, nao com
// o wrapper inteiro - a imagem fica centralizada dentro dele e pode sobrar
// espaco nas bordas quando a proporcao dela e diferente da area do
// visualizador, e desenhar sobre o wrapper inteiro cairia fora do lugar
// certo nesse caso. Com o SVG do tamanho exato da imagem e viewBox 0 0 1 1,
// os valores relativos (0-1) das marcacoes mapeiam direto, sem conta extra.
export default function ImagemPrincipalMarcada({
  curationId,
  alt,
  marcacoes,
  srcPreCarregado,
}: {
  curationId: number
  alt: string
  marcacoes: Marcacao[]
  // Blob URL ja baixado antecipadamente (enquanto o visualizador
  // principal ainda mostrava o OHIF/miniatura) - evita esperar o
  // download da imagem (varios MB) so no instante em que o usuario liga
  // "Mostrar marcação". Se ainda nao chegou, o componente busca por
  // conta propria (mesmo comportamento de antes).
  srcPreCarregado?: string
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [src, setSrc] = useState('')
  const [caixa, setCaixa] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const [hover, setHover] = useHoverMarcacao()

  useEffect(() => {
    if (srcPreCarregado) {
      setCaixa(null)
      setSrc(srcPreCarregado)
      return
    }

    let urlObjeto = ''
    let cancelado = false

    async function carregar() {
      try {
        const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/search/${curationId}/preview`, {
          credentials: 'include',
        })
        if (!resposta.ok) return
        const blob = await resposta.blob()
        urlObjeto = URL.createObjectURL(blob)
        if (!cancelado) setSrc(urlObjeto)
      } catch {
        // sem preview disponivel, a marcacao simplesmente nao aparece
      }
    }

    setCaixa(null)
    carregar()
    return () => {
      cancelado = true
      if (urlObjeto) URL.revokeObjectURL(urlObjeto)
    }
  }, [curationId, srcPreCarregado])

  function medir() {
    const img = imgRef.current
    const wrapper = wrapperRef.current
    if (!img || !wrapper) return
    const imgRect = img.getBoundingClientRect()
    const wrapperRect = wrapper.getBoundingClientRect()
    setCaixa({
      left: imgRect.left - wrapperRect.left,
      top: imgRect.top - wrapperRect.top,
      width: imgRect.width,
      height: imgRect.height,
    })
  }

  useEffect(() => {
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  return (
    <div ref={wrapperRef} className="relative flex h-full w-full items-center justify-center">
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          onLoad={medir}
          className="max-h-full max-w-full rounded-lg object-contain"
        />
      )}
      {caixa && (
        <svg
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          className="absolute"
          style={{ left: caixa.left, top: caixa.top, width: caixa.width, height: caixa.height }}
        >
          <FormasMarcacoes marcacoes={marcacoes} idPrefixo={`principal-${curationId}`} onHover={setHover} />
        </svg>
      )}
      {hover && (
        <span
          role="tooltip"
          className="pointer-events-none fixed z-50 max-w-xs rounded-lg border border-base-border bg-base-surface2 px-3 py-1.5 text-xs leading-relaxed text-slate-200 shadow-xl"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          {hover.texto}
        </span>
      )}
    </div>
  )
}
