'use client'

import { useEffect, useRef, useState } from 'react'

// Mesma logica da MiniaturaImagem (fetch com token + blob URL, pois a rota
// e protegida), mas para imagens AINDA sem ficha aprovada - usa
// /curation/{orthancReferenceId}/preview em vez de /search/{curationId}/preview.
// Usada na fila lateral da tela de Curadoria.
//
// A fila pode ter dezenas de itens montados ao mesmo tempo numa lista com
// scroll, e o /preview do Orthanc devolve a imagem em resolucao completa
// (varios MB cada) - buscar todas de uma vez satura as conexoes do
// navegador e atrasa outras chamadas (ex.: abrir uma imagem). Por isso o
// fetch so dispara quando a miniatura entra na area visivel (lazy load via
// IntersectionObserver), igual ao lazy-loading nativo de <img loading="lazy">.
//
// `habilitado` (default true, entao nenhum outro uso deste componente e
// afetado) e um segundo portao, alem da visibilidade: na Curadoria, a
// fileira horizontal de miniaturas passa `habilitado={false}` ate a
// imagem principal + painel de marcacao da primeira ficha estarem
// prontos - sem isso, dezenas de miniaturas entram visiveis de uma vez
// (a fileira inteira cabe na tela) e disparam seus fetches (cada um de
// varios MB) exatamente na janela em que as chamadas CRITICAS (criar a
// ficha, buscar viewer-url, buscar a ficha completa) tambem estao
// disputando as mesmas poucas conexoes simultaneas do navegador, atrasando
// a imagem principal. `priority: 'low'` no fetch (linha abaixo) reforça
// isso pro navegador que suporta a Fetch Priority API (Chrome/Edge) -
// nos que nao suportam, o gate por `habilitado` sozinho ja resolve.
export default function MiniaturaFila({
  orthancReferenceId,
  alt,
  className,
  habilitado = true,
}: {
  orthancReferenceId: number
  alt: string
  className?: string
  habilitado?: boolean
}) {
  const [src, setSrc] = useState('')
  const [erro, setErro] = useState(false)
  const [visivel, setVisivel] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const elemento = containerRef.current
    if (!elemento) return

    const observer = new IntersectionObserver(
      (entradas) => {
        if (entradas[0]?.isIntersecting) {
          setVisivel(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(elemento)

    // Rede de seguranca: em abas em segundo plano (ou navegadores sem
    // suporte a IntersectionObserver) o callback pode nunca disparar -
    // depois de alguns segundos carrega mesmo assim, pra nao deixar a
    // miniatura presa no "carregando" pra sempre.
    const timeoutSeguranca = setTimeout(() => setVisivel(true), 4000)

    return () => {
      observer.disconnect()
      clearTimeout(timeoutSeguranca)
    }
  }, [])

  useEffect(() => {
    if (!visivel || !habilitado) return

    let urlObjeto = ''
    let cancelado = false

    async function carregar() {
      try {
        const resposta = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/curation/${orthancReferenceId}/preview`,
          // "priority" (Fetch Priority API) e ignorado silenciosamente em
          // navegadores sem suporte - nao precisa de feature-detection.
          { credentials: 'include', priority: 'low' } as RequestInit
        )
        if (!resposta.ok) {
          if (!cancelado) setErro(true)
          return
        }
        const blob = await resposta.blob()
        urlObjeto = URL.createObjectURL(blob)
        if (!cancelado) setSrc(urlObjeto)
      } catch {
        if (!cancelado) setErro(true)
      }
    }

    carregar()
    return () => {
      cancelado = true
      if (urlObjeto) URL.revokeObjectURL(urlObjeto)
    }
  }, [visivel, habilitado, orthancReferenceId])

  return (
    <div ref={containerRef} className={className}>
      {src && !erro && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      )}
      {!src && !erro && <div className="h-full w-full animate-pulse bg-base-surface2" />}
    </div>
  )
}
