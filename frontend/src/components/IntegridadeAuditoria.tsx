'use client'

import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

/**
 * INTEGRIDADE DA AUDITORIA (01/11/2026 - auditoria do administrador, A1).
 * Mostra o resultado da ultima verificacao do lacre encadeado e o botao
 * "Verificar agora" (refaz a conta em todos os registros). So administrador.
 * - Registro integro: nenhum registro alterado ou apagado.
 * - "Fora de ordem por gravacao simultanea": elos antigos (antes da correcao
 *   de 01/11/2026) conferidos com o vizinho - conteudo intacto.
 */
interface Resultado {
  verificado_em: string | null
  integro?: boolean
  registros_conferidos?: number
  quantidade_com_problema?: number
  quantidade_ordem_concorrente?: number
  primeiro_problema_id?: number | null
}

const API = process.env.NEXT_PUBLIC_API_URL

export default function IntegridadeAuditoria({ compacto = false }: { compacto?: boolean }) {
  const t = useTranslations('IntegridadeAuditoria')
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [verificando, setVerificando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    // reteste do administrador: se nunca verificou, se a ultima achou
    // problema ou se faz mais de 24 h, refaz a verificacao sozinho (o aviso
    // antigo ficava na tela ate alguem clicar)
    fetch(`${API}/admin/audit-logs/integridade/ultima`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Resultado | null) => {
        if (!d) return
        setResultado(d)
        const antiga = !d.verificado_em || Date.now() - new Date(d.verificado_em).getTime() > 24 * 3600 * 1000
        if (antiga || !d.integro) verificar()
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function verificar() {
    if (verificando) return
    setVerificando(true)
    setErro('')
    try {
      const r = await fetch(`${API}/admin/audit-logs/integridade`, { credentials: 'include' })
      if (!r.ok) {
        setErro(t('erro'))
        return
      }
      setResultado(await r.json())
    } catch {
      setErro(t('erro'))
    } finally {
      setVerificando(false)
    }
  }

  const nunca = !resultado || !resultado.verificado_em
  const ok = !nunca && resultado.integro
  const quando = resultado?.verificado_em ? new Date(resultado.verificado_em).toLocaleString('pt-BR') : ''

  return (
    <section
      role="status"
      className={`rounded-xl border p-4 ${nunca ? 'border-base-border bg-base-surface' : ok ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-red-500/50 bg-red-500/10'} ${compacto ? '' : 'mb-4'}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        {ok || nunca ? (
          <ShieldCheck aria-hidden="true" className={`h-5 w-5 ${ok ? 'text-emerald-500' : 'text-slate-400'}`} />
        ) : (
          <ShieldAlert aria-hidden="true" className="h-5 w-5 text-red-500" />
        )}
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold text-ink">
            {nunca
              ? t('nunca')
              : ok
                ? t('integro')
                : t('problema', { n: resultado.quantidade_com_problema ?? 0, id: resultado.primeiro_problema_id ?? '—' })}
          </p>
          {!nunca && (
            <p className="text-xs text-slate-500">
              {t('detalhe', { conferidos: resultado.registros_conferidos ?? 0, quando })}
              {(resultado.quantidade_ordem_concorrente ?? 0) > 0 && <> · {t('ordemConcorrente', { n: resultado.quantidade_ordem_concorrente ?? 0 })}</>}
            </p>
          )}
          {erro && <p className="text-xs text-red-500">{erro}</p>}
        </div>
        <button
          type="button"
          onClick={verificar}
          disabled={verificando}
          aria-busy={verificando}
          className="rounded-md border border-base-border px-3 py-1.5 text-xs font-semibold text-ink hover:bg-white/5 disabled:opacity-50"
        >
          {verificando ? t('verificando') : t('verificarAgora')}
        </button>
      </div>
    </section>
  )
}
