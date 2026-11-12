'use client'

import { useEffect } from 'react'
import ErroTecnico from '../components/ErroTecnico'

export default function ErroDaPagina({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return <ErroTecnico onRetry={reset} />
}
