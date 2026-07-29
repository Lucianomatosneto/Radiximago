'use client'

import { useEffect, useState } from 'react'

// <img src> nao manda o header Authorization, e o preview e uma rota
// protegida - por isso buscamos via fetch (com o token) e convertemos pra
// blob URL. Usado tanto nos cards de resultado quanto no visualizador em
// sequencia.
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

  useEffect(() => {
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
  }, [curationId])

  if (erro) {
    return (
      <div className={`flex items-center justify-center bg-base-surface2 text-slate-600 ${className}`}>
        <span className="text-xs">Sem preview</span>
      </div>
    )
  }

  if (!src) {
    return <div className={`animate-pulse bg-base-surface2 ${className}`} />
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />
}
