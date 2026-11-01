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
const PERFIS = ['administrador', 'curador', 'suporte']

export default function BotaoEditarCuradoria({ curationId }: { curationId: number }) {
  const t = useTranslations('Curadoria')
  const router = useRouter()
  const [pode, setPode] = useState(false)
  const [erro, setErro] = useState('')
  useEffect(() => {
    obterSessaoAtual().then((s) => setPode(!!s && PERFIS.includes(s.perfil)))
  }, [])
  if (!pode) return null
  async function reabrir() {
    if (!confirm(t('editarDepoisConfirmar'))) return
    setErro('')
    const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/curation/${curationId}/reabrir`, { method: 'POST', credentials: 'include' })
    if (!r.ok) {
      setErro(t('editarDepoisErro'))
      return
    }
    const d = await r.json()
    router.push(`/curadoria?editar=${d.curation_id}&ref=${d.orthanc_reference_id}`)
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={reabrir} className="rounded-lg border border-violet-400/60 px-3 py-1.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-500/10 dark:text-violet-200">
        <Pencil aria-hidden="true" className="mr-1 inline h-4 w-4 align-[-2px]" />{t('editarDepois')}
      </button>
      {erro && <span className="text-xs text-red-500" role="alert">{erro}</span>}
    </span>
  )
}
