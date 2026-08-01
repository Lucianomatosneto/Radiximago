'use client'

// Barra de acoes da ficha ativa. Todos os botoes chamam funcoes que ja
// existiam na tela de Curadoria antes deste sprint (salvar rascunho,
// aprovar, abrir modal de descarte/segunda opiniao) - nada de logica nova
// aqui, so a barra que concentra os acessos no topo.
export default function BarraSuperiorCuradoria({
  posicaoAtual,
  totalFila,
  podeAnterior,
  podeProxima,
  onAnterior,
  onProxima,
  onSalvar,
  onAprovar,
  onDescartar,
  onSolicitarSegundaOpiniao,
  salvando,
  aprovando,
}: {
  posicaoAtual: number | null
  totalFila: number
  podeAnterior: boolean
  podeProxima: boolean
  onAnterior: () => void
  onProxima: () => void
  onSalvar: () => void
  onAprovar: () => void
  onDescartar: () => void
  onSolicitarSegundaOpiniao: () => void
  salvando: boolean
  aprovando: boolean
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-base-border bg-base-surface px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onAnterior}
            disabled={!podeAnterior}
            aria-label="Imagem anterior"
            title="Imagem anterior"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-base-border text-slate-300 hover:border-brand hover:text-brand-300 disabled:cursor-not-allowed disabled:opacity-30"
          >
            ←
          </button>
          <button
            type="button"
            onClick={onProxima}
            disabled={!podeProxima}
            aria-label="Próxima imagem"
            title="Próxima imagem"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-base-border text-slate-300 hover:border-brand hover:text-brand-300 disabled:cursor-not-allowed disabled:opacity-30"
          >
            →
          </button>
        </div>
        <span className="text-sm font-medium text-slate-300">
          {posicaoAtual !== null ? `Imagem ${posicaoAtual} de ${totalFila}` : '—'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSalvar}
          disabled={salvando || aprovando}
          className="rounded-lg border border-base-border px-4 py-2 text-sm text-slate-200 hover:border-brand hover:text-brand-300 disabled:opacity-50"
        >
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={onAprovar}
          disabled={aprovando || salvando}
          className="flex items-center gap-1.5 rounded-lg bg-brand hover:bg-brand-hover px-4 py-2 text-sm font-medium text-white shadow-glow transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {aprovando ? 'Aprovando...' : '✓ Aprovar'}
        </button>
        <button
          type="button"
          onClick={onSolicitarSegundaOpiniao}
          className="rounded-lg border border-purple-800/60 px-4 py-2 text-sm text-purple-300 hover:bg-purple-950/40"
        >
          Solicitar segunda opinião
        </button>
        <button
          type="button"
          onClick={onDescartar}
          className="rounded-lg border border-red-800/60 px-4 py-2 text-sm text-red-300 hover:bg-red-950/40"
        >
          Descartar
        </button>
      </div>
    </div>
  )
}
