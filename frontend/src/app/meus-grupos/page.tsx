'use client'

// "Meus grupos" virou a 2a aba da tela Grupos (pedido do video, 22/11/2026).
// Este endereco continua valendo (links antigos, e-mails): abre Grupos na aba
// "Grupos de que participo".

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function MeusGruposPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/grupos?aba=participo')
  }, [router])
  return null
}
