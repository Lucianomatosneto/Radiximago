'use client'

export interface SerieEstudo {
  series_instance_uid: string
  series_number: string | null
  modality: string | null
  total_instancias: number
}

// Coluna com as series ("pastas" de imagens) do estudo aberto no momento,
// alinhadas uma abaixo da outra, com rolagem propria. Usada tanto na
// Curadoria (via /curation/{orthancReferenceId}/series) quanto na tela de
// Detalhes da imagem (via /search/{curationId}/series, ja existente) - a
// pagina busca a lista e so passa pra ca exibir e deixar clicar.
export default function ColunaSeries({
  series,
  indiceAtual,
  onSelecionar,
  carregando,
}: {
  series: SerieEstudo[]
  indiceAtual: number
  onSelecionar: (indice: number) => void
  carregando: boolean
}) {
  return (
    <section className="flex w-full flex-col overflow-hidden rounded-2xl border border-base-border bg-base-surface lg:w-[220px] lg:shrink-0">
      <div className="border-b border-base-border px-3 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink">Séries do estudo</h2>
      </div>
      <div className="max-h-[75vh] overflow-y-auto p-2">
        {carregando ? (
          <p className="p-2 text-xs text-slate-500">Carregando séries...</p>
        ) : series.length === 0 ? (
          <p className="p-2 text-xs text-slate-500">Sem informação de série para esta imagem.</p>
        ) : (
          <ul className="space-y-1.5">
            {series.map((serie, indice) => (
              <li key={serie.series_instance_uid}>
                <button
                  type="button"
                  onClick={() => onSelecionar(indice)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left text-xs transition-colors ${
                    indice === indiceAtual
                      ? 'border-brand/60 bg-brand/10 text-brand-300'
                      : 'border-transparent text-slate-300 hover:border-brand/40 hover:bg-brand/5'
                  }`}
                >
                  <p className="font-medium">Série {serie.series_number ?? indice + 1}</p>
                  <p className="mt-0.5 text-slate-500">
                    {serie.modality ?? '—'} · {serie.total_instancias}{' '}
                    {serie.total_instancias === 1 ? 'corte' : 'cortes'}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
