const CORES_DESTAQUE = {
  teal: 'text-teal-300',
  green: 'text-emerald-400',
  red: 'text-red-400',
  amber: 'text-amber-400',
  blue: 'text-blue-400',
  purple: 'text-purple-400',
  slate: 'text-slate-400',
} as const

export type CorDestaque = keyof typeof CORES_DESTAQUE

interface DashboardCardProps {
  label: string
  valor: number
  cor?: CorDestaque
}

export default function DashboardCard({ label, valor, cor = 'teal' }: DashboardCardProps) {
  return (
    <div className="rounded-xl border border-base-border bg-base-surface p-5 shadow-sm">
      <p className="text-sm text-slate-400">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${CORES_DESTAQUE[cor]}`}>{valor}</p>
    </div>
  )
}
