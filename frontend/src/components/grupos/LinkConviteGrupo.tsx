'use client'

// LINK DE CONVITE DO GRUPO (pedido do video, 22/11/2026), no cartao de cada
// grupo em "Grupos que criei". O dono gera um link e manda para a turma
// (WhatsApp, e-mail...); quem abre, com login, entra no grupo so se
// confirmar (tela /grupos/entrar). Vale 7 dias; gerar outro cancela o
// anterior; "Cancelar link" desliga na hora. O servidor guarda so o resumo
// do codigo: o endereco completo aparece AQUI, uma vez, para copiar.

import { useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Link2 } from 'lucide-react'
import { fetchOuNulo } from '../../lib/fetchSeguro'

const API = process.env.NEXT_PUBLIC_API_URL

export default function LinkConviteGrupo({ grupoId }: { grupoId: number }) {
  const t = useTranslations('LinkConvite')
  const tComum = useTranslations('Comum')
  const locale = useLocale()
  const [aberto, setAberto] = useState(false)
  const [ativo, setAtivo] = useState<{ expira_em: string; usos?: number } | null>(null)
  const [endereco, setEndereco] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [erro, setErro] = useState('')
  // cada acao ganha um numero; a resposta da consulta so vale se nada foi
  // feito depois dela (senao "sem link ativo" atrasado apagava o link gerado)
  const versao = useRef(0)

  const data = (iso: string) => new Date(iso).toLocaleDateString(locale === 'en' ? 'en-US' : 'pt-BR')

  async function abrir() {
    const vai = !aberto
    setAberto(vai)
    setErro('')
    if (!vai) return
    const minha = ++versao.current
    const r = await fetchOuNulo(`${API}/grupos/${grupoId}/link-convite`, { credentials: 'include' })
    if (r?.ok) {
      const d = await r.json()
      if (minha !== versao.current) return
      setAtivo(d.ativo ? { expira_em: d.expira_em, usos: d.usos } : null)
    }
  }

  async function gerar() {
    versao.current += 1
    setErro('')
    setCopiado(false)
    const r = await fetchOuNulo(`${API}/grupos/${grupoId}/link-convite`, { method: 'POST', credentials: 'include' })
    if (!r) return setErro(tComum('semConexao'))
    if (!r.ok) return setErro(t('erro'))
    const d = await r.json()
    setEndereco(`${window.location.origin}/grupos/entrar?c=${encodeURIComponent(d.codigo)}`)
    setAtivo({ expira_em: d.expira_em })
  }

  async function cancelar() {
    versao.current += 1
    setErro('')
    const r = await fetchOuNulo(`${API}/grupos/${grupoId}/link-convite`, { method: 'DELETE', credentials: 'include' })
    if (!r) return setErro(tComum('semConexao'))
    if (!r.ok) return setErro(t('erro'))
    setAtivo(null)
    setEndereco('')
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(endereco)
      setCopiado(true)
    } catch {
      // sem permissao para a area de transferencia: o campo continua selecionavel
    }
  }

  return (
    <section aria-label={t('titulo')}>
      <button type="button" onClick={() => void abrir()} aria-expanded={aberto}
              className="flex items-center gap-1 text-xs font-semibold text-brand underline">
        <Link2 aria-hidden="true" className="h-3.5 w-3.5" /> {t('titulo')}
      </button>
      {aberto && (
        <div className="mt-2 space-y-2 rounded-lg border border-base-border p-2 text-xs text-ink-2">
          <p>{t('explica')}</p>
          {endereco && (
            <div className="flex gap-2">
              <input readOnly value={endereco} aria-label={t('campo')} onFocus={(e) => e.currentTarget.select()}
                     className="min-w-0 flex-1 rounded border border-base-border bg-base-surface2 px-2 py-1 text-xs text-ink" />
              <button type="button" onClick={() => void copiar()} className="rounded-md border border-base-border px-2 py-0.5 text-xs text-ink hover:border-brand">
                {copiado ? t('copiado') : t('copiar')}
              </button>
            </div>
          )}
          {ativo ? (
            <p>
              {t('valeAte', { data: data(ativo.expira_em) })}
              {typeof ativo.usos === 'number' && ` · ${t('usos', { n: ativo.usos })}`}
              {!endereco && ` ${t('gerarDeNovo')}`}
            </p>
          ) : (
            <p className="text-ink-3">{t('nenhum')}</p>
          )}
          {erro && <p role="alert" className="text-red-600 dark:text-red-300">{erro}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void gerar()} className="rounded-md bg-brand px-2 py-1 text-xs text-white hover:bg-brand-hover">
              {ativo ? t('gerarNovo') : t('gerar')}
            </button>
            {ativo && (
              <button type="button" onClick={() => void cancelar()} className="rounded-md border border-base-border px-2 py-1 text-xs text-ink hover:border-red-500">
                {t('cancelar')}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
