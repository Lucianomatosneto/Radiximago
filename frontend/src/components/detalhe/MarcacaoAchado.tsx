'use client'

import { useState } from 'react'
import MiniaturaImagem from '../MiniaturaImagem'
import FormasMarcacoes from './FormasMarcacoes'
import type { Marcacao } from '../../lib/marcacoes'
import { useHoverMarcacao } from '../../lib/useHoverMarcacao'

// Mostra as marcacoes feitas pelo curador (formas desenhadas durante a
// curadoria) sobre a mesma imagem estatica de preview usada nos cards -
// nao sobre o OHIF, que roda em outra origem e nao tem como receber
// overlays. Passar o mouse em cima de uma marcacao mostra o tipo de lesao
// que o curador indicou ali.
//
// `comImagem=false` (usado pelo VisualizadorSequencial) renderiza so o
// checkbox - quem chama ja mostra uma imagem grande centralizada (o
// visualizador principal) e precisa desenhar as marcacoes exatamente ali
// em cima, no MESMO lugar/tamanho, em vez de duplicar a imagem num bloco
// separado. Nesse modo o estado do checkbox tambem fica com quem chama
// (`mostrar`/`onMostrarChange`), pra poder decidir o que desenhar no
// visualizador principal.
export default function MarcacaoAchado({
  curationId,
  marcacoes,
  mostrar: mostrarControlado,
  onMostrarChange,
  comImagem = true,
}: {
  curationId: number
  marcacoes: Marcacao[]
  mostrar?: boolean
  onMostrarChange?: (valor: boolean) => void
  comImagem?: boolean
}) {
  const [mostrarInterno, setMostrarInterno] = useState(false)
  const [hover, setHover] = useHoverMarcacao()
  const mostrar = mostrarControlado ?? mostrarInterno
  const definirMostrar = onMostrarChange ?? setMostrarInterno
  const disponivel = marcacoes.length > 0

  return (
    <div className={comImagem ? 'mt-3 rounded-xl border border-base-border bg-base-surface p-3' : ''}>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={mostrar}
          onChange={(evento) => definirMostrar(evento.target.checked)}
          disabled={!disponivel}
          className="h-4 w-4 rounded border-base-border"
        />
        Mostrar marcação do curador
      </label>
      {!disponivel && (
        <p className="mt-1 text-xs text-slate-500">O curador não marcou nenhuma lesão nesta imagem.</p>
      )}
      {comImagem && disponivel && (
        <div className="relative mt-3 inline-block max-w-full overflow-hidden rounded-lg border border-base-border">
          <MiniaturaImagem curationId={curationId} alt="Imagem das lesões marcadas" className="block max-h-[50vh] w-auto" />
          {mostrar && (
            <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
              <FormasMarcacoes marcacoes={marcacoes} idPrefixo={`bloco-${curationId}`} onHover={setHover} />
            </svg>
          )}
        </div>
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
