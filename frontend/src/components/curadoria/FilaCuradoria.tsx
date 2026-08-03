'use client'

import MiniaturaFila from '../MiniaturaFila'
import StatusBadge from '../StatusBadge'

export interface ImagemPendente {
  orthanc_reference_id: number
  orthanc_id: string
  resource_type: string
  dicomweb_url: string | null
}

// Faixa horizontal na parte inferior da tela de Curadoria: fila de imagens
// ainda sem ficha. Era uma coluna lateral com lista vertical rolavel - virou
// uma fileira horizontal de cartoes compactos pra nao obrigar rolagem
// vertical constante durante o trabalho (a barra de rolagem vertical da
// coluna antiga atrapalhava o fluxo de quem cura). Se a fila for grande
// demais pra largura da tela, ganha rolagem HORIZONTAL como fallback -
// aceitavel, ja que o problema original era especificamente o vertical.
//
// A fila de /curation/pending so devolve orthanc_reference_id, orthanc_id,
// resource_type e dicomweb_url - nao ha tipo de radiografia, data de
// entrada nem status real vindos da API pra um item que ainda nao tem
// ficha (isso so existe depois que a curadoria comeca). Por isso:
// - "status" e sempre "Pendente" aqui (garantido pela propria consulta do
//   backend, que so lista itens sem ficha).
export default function FilaCuradoria({
  fila,
  carregando,
  erro,
  criandoId,
  ativoOrthancReferenceId,
  colapsada,
  onSelecionar,
  onColapsar,
  onExpandir,
}: {
  fila: ImagemPendente[]
  carregando: boolean
  erro: string
  criandoId: number | null
  ativoOrthancReferenceId?: number | null
  colapsada: boolean
  onSelecionar: (imagem: ImagemPendente) => void
  onColapsar: () => void
  onExpandir: () => void
}) {
  if (colapsada) {
    return (
      <button
        type="button"
        onClick={onExpandir}
        aria-label="Expandir fila de curadoria"
        title="Expandir fila de curadoria"
        className="flex w-full items-center justify-center gap-2 px-4 py-2 text-slate-400 hover:text-brand-300"
      >
        <span aria-hidden="true">▲</span>
        <span className="text-xs font-semibold tracking-wide">
          Fila de curadoria{fila.length > 0 ? ` (${fila.length})` : ''}
        </span>
      </button>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between border-b border-base-border px-4 py-2">
        <h2 className="text-sm font-semibold text-ink">
          Fila de curadoria{fila.length > 0 ? ` (${fila.length})` : ''}
        </h2>
        <button
          type="button"
          onClick={onColapsar}
          aria-label="Recolher fila de curadoria"
          title="Recolher fila de curadoria"
          className="text-slate-400 hover:text-brand-300"
        >
          ▼
        </button>
      </div>

      {erro && (
        <p className="px-4 py-2 text-xs text-red-400" role="alert">
          {erro}
        </p>
      )}

      <div className="flex items-stretch gap-2 overflow-x-auto p-2">
        {carregando ? (
          <p className="p-3 text-sm text-slate-500">Carregando fila...</p>
        ) : fila.length === 0 ? (
          <p className="p-3 text-sm text-slate-500">Nenhuma imagem pendente.</p>
        ) : (
          fila.map((imagem) => {
            const ativo = ativoOrthancReferenceId === imagem.orthanc_reference_id
            return (
              <button
                key={imagem.orthanc_reference_id}
                type="button"
                disabled={criandoId !== null}
                onClick={() => onSelecionar(imagem)}
                className={`flex w-[104px] shrink-0 flex-col items-center gap-1 rounded-xl border px-1.5 py-1.5 text-center transition-colors disabled:opacity-50 ${
                  ativo
                    ? 'border-brand/60 bg-brand/10'
                    : 'border-transparent hover:border-brand/40 hover:bg-brand/5'
                }`}
              >
                <MiniaturaFila
                  orthancReferenceId={imagem.orthanc_reference_id}
                  alt={imagem.orthanc_id}
                  className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-base-surface2"
                />
                <p className="w-full truncate font-mono text-[11px] text-slate-300">
                  #{imagem.orthanc_reference_id}
                </p>
                {criandoId === imagem.orthanc_reference_id ? (
                  <span className="text-[10px] text-slate-500">Abrindo...</span>
                ) : (
                  <StatusBadge status="pendente" />
                )}
              </button>
            )
          })
        )}
      </div>
    </>
  )
}
