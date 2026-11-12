'use client'

import { Pencil } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { obterSessaoAtual } from '../../lib/sessao'

// "EDITAR DEPOIS DO ENVIO" (31/10/2026): o curador reabre uma ficha ja
// aprovada para corrigir. Ela volta para "em analise" (sai da busca ate ser
// aprovada de novo) e abre na tela de Curadoria. Historico guardado.
// Backend: POST /curation/{id}/reabrir (curation/aprovacao_descarte.py)
const PERFIS = ['administrador', 'curador']

export default function BotaoEditarCuradoria({ curationId }: { curationId: number }) {
  const t = useTranslations('Curadoria')
  const router = useRouter()
  const [pode, setPode] = useState(false)
  const [erro, setErro] = useState('')
  // confirmacao na propria tela (a janela nativa podia ser aceita sozinha)
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  useEffect(() => {
    void obterSessaoAtual().then((s) => setPode(!!s && PERFIS.includes(s.perfil)))
  }, [])
  if (!pode) return null
  async function reabrir() {
    if (enviando) return
    setEnviando(true)
    setErro('')
    const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/curation/${curationId}/reabrir`, { method: 'POST', credentials: 'include' }).catch(() => null)
    setEnviando(false)
    if (!r || !r.ok) {
      setErro(t('editarDepoisErro'))
      return
    }
    const d = await r.json()
    router.push(`/curadoria?editar=${d.curation_id}&ref=${d.orthanc_reference_id}`)
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={() => setConfirmando(true)} aria-expanded={confirmando} className="rounded-lg border border-violet-400/60 px-3 py-1.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-500/10 dark:text-violet-200">
        <Pencil aria-hidden="true" className="mr-1 inline h-4 w-4 align-[-2px]" />{t('editarDepois')}
      </button>
      {confirmando && (
        <span role="alertdialog" className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-amber-400/60 bg-amber-400/10 px-2 py-1 text-xs text-ink">
          {t('editarDepoisConfirmar')}
          <button type="button" onClick={() => setConfirmando(false)} disabled={enviando} className="rounded-md border border-base-border px-2 py-0.5">
            {t('cancelarReabrir')}
          </button>
          <button type="button" onClick={reabrir} disabled={enviando} className="rounded-md bg-violet-600 px-2 py-0.5 font-semibold text-white disabled:opacity-50">
            {t('confirmarReabrir')}
          </button>
        </span>
      )}
      {erro && <span className="text-xs text-red-500" role="alert">{erro}</span>}
    </span>
  )
}
