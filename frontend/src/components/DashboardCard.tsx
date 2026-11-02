const CORES_DESTAQUE = {
  teal: 'text-teal-300',
  green: 'text-emerald-400',
  red: 'text-red-400',
  amber: 'text-amber-400',
  blue: 'text-blue-400',
  purple: 'text-purple-400',
  orange: 'text-orange-400',
  slate: 'text-slate-400',
} as const

export type CorDestaque = keyof typeof CORES_DESTAQUE

interface DashboardCardProps {
  label: string
  valor: number
  cor?: CorDestaque
  /** linha pequena abaixo do numero (ex.: de onde vem o total) */
  detalhe?: string
  /** quando informado, o cartao vira botao (ex.: filtrar a lista) */
  onClick?: () => void
  ativo?: boolean
}

export default function DashboardCard({ label, valor, cor = 'teal', detalhe, onClick, ativo }: DashboardCardProps) {
  const conteudo = (
    <>
      <p className="text-sm leading-snug text-slate-400 [overflow-wrap:anywhere]">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${CORES_DESTAQUE[cor]}`}>{valor}</p>
      {detalhe && <p className="mt-1 text-xs leading-snug text-slate-500">{detalhe}</p>}
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={!!ativo}
        className={`rounded-xl border bg-base-surface p-5 text-left shadow-xs transition hover:border-teal-600 ${
          ativo ? 'border-teal-500 ring-1 ring-teal-500' : 'border-base-border'
        }`}
      >
        {conteudo}
      </button>
    )
  }
  return <div className="rounded-xl border border-base-border bg-base-surface p-5 shadow-xs">{conteudo}</div>
}
