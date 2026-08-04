'use client'

import { useTranslations } from 'next-intl'

const campoLabel = 'mb-1.5 block text-xs font-medium text-slate-400'
const campoInput =
  'w-full rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand'

// Extraido de curadoria/page.tsx sem mudanca de comportamento - mesmo
// modal de "motivo" usado tanto pra descartar quanto pra solicitar
// segunda opiniao (o backend usa o mesmo campo `motivo` nos dois casos).
export default function ModalMotivo({
  tipo,
  motivoTexto,
  onMotivoChange,
  erro,
  enviando,
  onCancelar,
  onConfirmar,
}: {
  tipo: 'descartar' | 'segunda_opiniao'
  motivoTexto: string
  onMotivoChange: (valor: string) => void
  erro: string
  enviando: boolean
  onCancelar: () => void
  onConfirmar: () => void
}) {
  const t = useTranslations('Curadoria.modalMotivo')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-2xl border border-base-border bg-base-surface p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-semibold text-ink">
          {tipo === 'descartar' ? t('descartarTitulo') : t('segundaOpiniaoTitulo')}
        </h2>
        <label className={campoLabel}>{t('motivo')}</label>
        <textarea
          value={motivoTexto}
          onChange={(e) => onMotivoChange(e.target.value)}
          rows={4}
          className={campoInput}
        />
        {erro && (
          <p className="mt-2 text-sm text-red-400" role="alert">
            {erro}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-lg border border-base-border px-4 py-2 text-sm text-slate-300 hover:border-slate-500"
          >
            {t('cancelar')}
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={enviando}
            className="rounded-lg bg-brand hover:bg-brand-hover px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {enviando ? t('enviando') : t('confirmar')}
          </button>
        </div>
      </div>
      <button type="button" aria-label={t('fechar')} onClick={onCancelar} className="fixed inset-0 -z-10" />
    </div>
  )
}
