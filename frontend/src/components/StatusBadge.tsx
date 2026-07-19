const MAPA_STATUS: Record<string, { label: string; classe: string }> = {
  pendente: { label: 'Pendente', classe: 'bg-orange-500/15 text-orange-300 border-orange-600/40' },
  em_analise: { label: 'Em análise', classe: 'bg-blue-500/15 text-blue-300 border-blue-600/40' },
  aprovada: { label: 'Aprovada', classe: 'bg-emerald-500/15 text-emerald-300 border-emerald-600/40' },
  segunda_opiniao: {
    label: 'Segunda opinião',
    classe: 'bg-purple-500/15 text-purple-300 border-purple-600/40',
  },
  baixa_qualidade: {
    label: 'Baixa qualidade',
    classe: 'bg-red-500/15 text-red-300 border-red-600/40',
  },
  descartada: {
    label: 'Descartada',
    classe: 'bg-slate-700/60 text-slate-300 border-slate-500/40',
  },
}

const STATUS_DESCONHECIDO = {
  classe: 'bg-slate-500/15 text-slate-300 border-slate-600/40',
}

interface StatusBadgeProps {
  status: string
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const info = MAPA_STATUS[status]
  const label = info?.label ?? status
  const classe = info?.classe ?? STATUS_DESCONHECIDO.classe

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${classe}`}
    >
      {label}
    </span>
  )
}
