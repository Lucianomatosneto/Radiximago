'use client'

import { useEffect, useRef, useState } from 'react'

// <img src> nao manda o header Authorization, e o preview e uma rota
// protegida - por isso buscamos via fetch (com o token) e convertemos pra
// blob URL. Usado tanto nos cards de resultado quanto no visualizador em
// sequencia - cada lugar passa um `className` diferente (ex.: object-cover
// vs. object-contain), entao o componente aplica esse className direto no
// elemento final, igual antes, em vez de embrulhar tudo numa div fixa.
//
// O /preview devolve a imagem em resolucao completa (varios MB cada), e a
// grade de resultados da Pesquisa pode ter dezenas de cards montados ao
// mesmo tempo - buscar todos de uma vez satura as conexoes do navegador e
// atrasa qualquer outra chamada (ex.: abrir os detalhes de uma imagem).
// Por isso o fetch so dispara quando a miniatura entra na area visivel
// (mesmo padrao de lazy load ja usado em MiniaturaFila).
export default function MiniaturaImagem({
  curationId,
  alt,
  className,
}: {
  curationId: number
  alt: string
  className?: string
}) {
  const [src, setSrc] = useState('')
  const [erro, setErro] = useState(false)
  const [visivel, setVisivel] = useState(false)
  const placeholderRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const elemento = placeholderRef.current
    if (!elemento || visivel) return

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
  }, [visivel])

  useEffect(() => {
    if (!visivel) return

    let urlObjeto = ''
    let cancelado = false

    async function carregar() {
      const token = localStorage.getItem('access_token')
      if (!token) return
      try {
        const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/search/${curationId}/preview`, {
          headers: { Authorization: `Bearer ${token}` },
        })
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
  }, [visivel, curationId])

  if (erro) {
    return (
      <div className={`flex items-center justify-center bg-base-surface2 text-slate-600 ${className}`}>
        <span className="text-xs">Sem preview</span>
      </div>
    )
  }

  if (!src) {
    return <div ref={placeholderRef} className={`animate-pulse bg-base-surface2 ${className}`} />
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />
}
