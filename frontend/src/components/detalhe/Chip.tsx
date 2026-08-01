'use client'

// Etiqueta visual generica (badge/chip) - usada hoje pra dentes e pro tipo
// de radiografia/achado principal. E generica de proposito: uma lista de
// "alteracoes observadas" ou de "achados" futuros (Sprint 7, quando
// existir a tabela findings) pode usar o mesmo componente, so trocando o
// texto de cada chip.
export function Chip({ children, tom = 'neutro' }: { children: React.ReactNode; tom?: 'neutro' | 'marca' }) {
  const classe =
    tom === 'marca'
      ? 'border-brand/40 bg-brand/10 text-brand-300'
      : 'border-base-border bg-base-surface2 text-slate-200'
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${classe}`}>
      {children}
    </span>
  )
}

export function ChipList({
  itens,
  tom,
  vazio = '—',
}: {
  itens: (string | number)[]
  tom?: 'neutro' | 'marca'
  vazio?: string
}) {
  if (itens.length === 0) {
    return <p className="text-sm text-slate-500">{vazio}</p>
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {itens.map((item) => (
        <Chip key={item} tom={tom}>
          {item}
        </Chip>
      ))}
    </div>
  )
}
