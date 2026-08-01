import { useRef, useState } from 'react'
import type { HoverMarcacao } from '../components/detalhe/FormasMarcacoes'

// Mesma logica de hover usada em MarcacaoAchado.tsx e
// ImagemPrincipalMarcada.tsx - centralizada aqui pra nao duplicar. Da uma
// pequena folga (atraso) antes de esconder o tooltip: sem isso, um hover
// levemente impreciso em cima de uma linha fina (a seta, por exemplo) faz
// o mouse "sair" da area sensivel por uma fracao de segundo e o tooltip
// sumir na hora, mesmo com o usuario ainda olhando pra marcacao.
export function useHoverMarcacao(atrasoSaidaMs = 700) {
  const [hover, setHoverState] = useState<HoverMarcacao | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onHover(info: HoverMarcacao | null) {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (info) {
      setHoverState(info)
    } else {
      timeoutRef.current = setTimeout(() => setHoverState(null), atrasoSaidaMs)
    }
  }

  return [hover, onHover] as const
}
