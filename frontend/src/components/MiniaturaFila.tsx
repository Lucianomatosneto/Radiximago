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
export default function MiniaturaFila({
  orthancReferenceId,
  alt,
  className,
}: {
  orthancReferenceId: number
  alt: string
  className?: string
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
    if (!visivel) return

    let urlObjeto = ''
    let cancelado = false

    async function carregar() {
      const token = localStorage.getItem('access_token')
      if (!token) return
      try {
        const resposta = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/curation/${orthancReferenceId}/preview`,
          { headers: { Authorization: `Bearer ${token}` } }
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
  }, [visivel, orthancReferenceId])

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
