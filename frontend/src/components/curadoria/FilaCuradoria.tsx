'use client'

import MiniaturaFila from '../MiniaturaFila'
import StatusBadge from '../StatusBadge'

export interface ImagemPendente {
  orthanc_reference_id: number
  orthanc_id: string
  resource_type: string
  dicomweb_url: string | null
}

function truncarOrthancId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 12)}...` : id
}

// Painel esquerdo da Curadoria: fila de imagens ainda sem ficha, em coluna
// vertical fixa. A lista rola internamente (flex-1 + overflow-y-auto,
// dentro da altura que a coluna recebe do layout pai) - com dezenas/
// centenas de itens pendentes nao ha como evitar rolagem aqui, mas ela fica
// contida dentro da propria coluna, sem empurrar o resto da tela.
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
        className="flex h-full w-full flex-col items-center gap-3 py-4 text-slate-400 hover:text-brand-300"
      >
        <span aria-hidden="true">»</span>
        <span className="text-xs font-semibold tracking-wide [writing-mode:vertical-rl]">
          Fila de curadoria{fila.length > 0 ? ` (${fila.length})` : ''}
        </span>
      </button>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-base-border px-4 py-3.5">
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
          «
        </button>
      </div>

      {erro && (
        <p className="px-4 py-2 text-xs text-red-400" role="alert">
          {erro}
        </p>
      )}

      <div className="flex-1 overflow-y-auto p-2">
        {carregando ? (
          <p className="p-3 text-sm text-slate-500">Carregando fila...</p>
        ) : fila.length === 0 ? (
          <p className="p-3 text-sm text-slate-500">Nenhuma imagem pendente.</p>
        ) : (
          <ul className="space-y-1.5">
            {fila.map((imagem) => {
              const ativo = ativoOrthancReferenceId === imagem.orthanc_reference_id
              return (
                <li key={imagem.orthanc_reference_id}>
                  <button
                    type="button"
                    disabled={criandoId !== null}
                    onClick={() => onSelecionar(imagem)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-50 ${
                      ativo
                        ? 'border-brand/60 bg-brand/10'
                        : 'border-transparent hover:border-brand/40 hover:bg-brand/5'
                    }`}
                  >
                    <MiniaturaFila
                      orthancReferenceId={imagem.orthanc_reference_id}
                      alt={imagem.orthanc_id}
                      className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-base-surface2"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-mono text-xs text-slate-300">
                          #{imagem.orthanc_reference_id} · {truncarOrthancId(imagem.orthanc_id)}
                        </p>
                      </div>
                      <p className="mt-1 text-slate-400">{imagem.resource_type}</p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-600">
                          {criandoId === imagem.orthanc_reference_id ? 'Abrindo...' : 'data: —'}
                        </span>
                        <StatusBadge status="pendente" />
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
