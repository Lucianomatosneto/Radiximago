'use client'

export interface ReviewInfo {
  solicitante_id: number
  motivo: string
  observacoes: string | null
  criado_em: string | null
}

function formatarData(valor: string | null): string {
  if (!valor) return '—'
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return '—'
  return data.toLocaleString('pt-BR')
}

// So aparece quando a ficha em edicao esta com status "segunda_opiniao" -
// hoje isso nao acontece dentro do fluxo da Curadoria (a fila de
// /curation/pending so lista imagens sem ficha, e uma ficha em segunda
// opiniao ja tem ficha), mas o componente fica pronto caso a Curadoria 2.0
// unifique as filas. Os dados (quem solicitou, data, observacoes) vem do
// endpoint ja existente GET /curation/{id}/reviews.
export default function SegundaOpiniaoBanner({ review }: { review: ReviewInfo | null }) {
  if (!review) return null

  return (
    <div className="border-b border-purple-800/40 bg-purple-950/30 px-4 py-3 text-sm">
      <p className="font-semibold text-purple-300">Imagem aguardando segunda opinião</p>
      <dl className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-purple-200/80 sm:grid-cols-3">
        <div>
          <dt className="text-purple-300/60">Solicitado por</dt>
          <dd>usuário #{review.solicitante_id}</dd>
        </div>
        <div>
          <dt className="text-purple-300/60">Data</dt>
          <dd>{formatarData(review.criado_em)}</dd>
        </div>
        <div className="sm:col-span-1">
          <dt className="text-purple-300/60">Observações</dt>
          <dd>{review.observacoes || review.motivo || '—'}</dd>
        </div>
      </dl>
    </div>
  )
}
