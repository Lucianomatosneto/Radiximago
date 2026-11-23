'use client'

// IMAGENS ENVIADAS AO GRUPO - visao do DONO (17/11/2026, Etapa 3).
// Para cada imagem enviada em "modo aula": a mensagem, a chave
// "Participantes podem comentar" (liga e desliga a qualquer momento),
// as conversas (uma por participante, particulares - D4) com campo para
// responder, e "Retirar do grupo". Para enviar uma imagem nova, o dono abre
// a imagem no Banco de imagens e usa "Preparar aula para um grupo".

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { fetchOuNulo } from '../../lib/fetchSeguro'
import { useConfirmacao } from '../useConfirmacao'

const API = process.env.NEXT_PUBLIC_API_URL
const COMENTARIO_MAX = 500

type Envio = { id: number; curation_id: number; tipo_radiografia: string | null; mensagem: string | null; permite_comentar: boolean; destaques: string[]; comentarios: number; criado_em: string | null }
type Comentario = { id: number; autor: string; texto: string }
type Conversa = { participante: { id: number; nome: string }; comentarios: Comentario[] }

async function lerErro(r: Response, padrao: string) {
  try {
    const d = await r.json()
    if (typeof d?.detail === 'string') return d.detail
  } catch {
    // sem corpo
  }
  return padrao
}

function Conversas({ grupoId, envio, aoMudar }: { grupoId: number; envio: Envio; aoMudar: () => void }) {
  const t = useTranslations('Grupos')
  const tComum = useTranslations('Comum')
  const [conversas, setConversas] = useState<Conversa[] | null>(null)
  const [respostas, setRespostas] = useState<Record<number, string>>({})
  const [erro, setErro] = useState('')

  async function carregar() {
    const r = await fetchOuNulo(`${API}/grupos/${grupoId}/envios/${envio.id}/conversas`, { credentials: 'include' })
    try {
      setConversas(r?.ok ? ((await r.json()).conversas ?? []) : [])
    } catch {
      setConversas([])
    }
  }

  useEffect(() => {
    void carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function responder(e: React.FormEvent, participanteId: number) {
    e.preventDefault()
    setErro('')
    const texto = (respostas[participanteId] ?? '').trim()
    if (!texto) return
    const r = await fetchOuNulo(`${API}/grupos/${grupoId}/envios/${envio.id}/conversas/${participanteId}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto }),
    })
    if (!r) setErro(tComum('semConexao'))
    else if (!r.ok) setErro(await lerErro(r, t('erroAcao')))
    else {
      setRespostas((atual) => ({ ...atual, [participanteId]: '' }))
      void carregar()
      aoMudar()
    }
  }

  if (conversas === null) return <p className="text-xs text-ink-3">{t('carregando')}</p>
  if (conversas.length === 0) return <p className="text-xs text-ink-3">{t('semConversas')}</p>
  return (
    <div className="space-y-2">
      {erro && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{erro}</p>}
      {conversas.map((c) => (
        <section key={c.participante.id} aria-label={t('conversaCom', { nome: c.participante.nome })} className="rounded-lg border border-base-border p-2">
          <h5 className="text-xs font-semibold text-ink">{c.participante.nome}</h5>
          <ul className="mt-1 space-y-1">
            {c.comentarios.map((m) => (
              <li key={m.id} className={`text-xs ${m.autor === 'dono' ? 'text-brand' : 'text-ink-2'}`}>
                <span className="font-medium">{m.autor === 'dono' ? t('voce') : c.participante.nome}:</span> {m.texto}
              </li>
            ))}
          </ul>
          <form method="post" onSubmit={(e) => responder(e, c.participante.id)} className="mt-2 flex gap-2">
            <label htmlFor={`resposta-${envio.id}-${c.participante.id}`} className="sr-only">{t('responderRotulo', { nome: c.participante.nome })}</label>
            <input id={`resposta-${envio.id}-${c.participante.id}`} value={respostas[c.participante.id] ?? ''} maxLength={COMENTARIO_MAX}
                   onChange={(e) => setRespostas((atual) => ({ ...atual, [c.participante.id]: e.target.value }))}
                   className="min-w-0 flex-1 rounded-md border border-base-border bg-base-surface2 px-2 py-1 text-xs text-ink" />
            <button type="submit" className="rounded-md border border-base-border px-2 py-1 text-xs text-ink hover:border-brand">{t('responder')}</button>
          </form>
        </section>
      ))}
    </div>
  )
}

export default function ImagensGrupoDono({ grupoId }: { grupoId: number }) {
  const t = useTranslations('Grupos')
  const tComum = useTranslations('Comum')
  const tAlteracao = useTranslations('AlteracoesObservadas.itens')
  const { pedirConfirmacao, quadroConfirmacao } = useConfirmacao()
  const [envios, setEnvios] = useState<Envio[] | null>(null)
  const [aberta, setAberta] = useState<number | null>(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  async function carregar() {
    const r = await fetchOuNulo(`${API}/grupos/${grupoId}/envios`, { credentials: 'include' })
    try {
      setEnvios(r?.ok ? ((await r.json()).envios ?? []) : [])
    } catch {
      setEnvios([])
    }
  }

  useEffect(() => {
    void carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupoId])

  async function agir(caminho: string, init: RequestInit, sucesso: string) {
    setErro('')
    setAviso('')
    const r = await fetchOuNulo(`${API}${caminho}`, { credentials: 'include', ...init })
    if (!r) setErro(tComum('semConexao'))
    else if (!r.ok) setErro(await lerErro(r, t('erroAcao')))
    else setAviso(sucesso)
    void carregar()
  }

  async function retirar(e: Envio) {
    const sim = await pedirConfirmacao({
      titulo: t('retirarImagemTitulo'),
      texto: t('retirarImagemTexto'),
      botao: t('retirarImagemSim'),
      cancelar: t('cancelar'),
    })
    if (sim) await agir(`/grupos/${grupoId}/envios/${e.id}`, { method: 'DELETE' }, t('imagemRetirada'))
  }

  const rotulo = (valor: string) => (tAlteracao.has(valor) ? tAlteracao(valor) : valor)

  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-3">{t('comoEnviar')} <Link href="/pesquisa" className="text-brand underline">{t('irBanco')}</Link></p>
      {aviso && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">{aviso}</p>}
      {erro && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{erro}</p>}
      {envios === null ? (
        <p className="text-xs text-ink-3">{t('carregando')}</p>
      ) : envios.length === 0 ? (
        <p className="text-xs text-ink-3">{t('semImagens')}</p>
      ) : (
        <ul className="space-y-2">
          {envios.map((e) => (
            <li key={e.id} className="space-y-1 rounded-lg border border-base-border p-2 text-xs text-ink-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/visualizar/${e.curation_id}`} className="font-medium text-brand underline">{t('imagemNumero', { n: e.curation_id })}</Link>
                <button type="button" onClick={() => retirar(e)} className="text-rose-600 underline dark:text-rose-400"
                        aria-label={t('retirarImagemRotulo', { n: e.curation_id })}>{t('retirarImagem')}</button>
              </div>
              {e.mensagem && <p className="italic">“{e.mensagem}”</p>}
              {e.destaques.length > 0 && <p>{t('destaquesEnvio')}: {e.destaques.map(rotulo).join(', ')}</p>}
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={e.permite_comentar}
                       onChange={(ev) => agir(`/grupos/${grupoId}/envios/${e.id}`, {
                         method: 'PATCH',
                         headers: { 'Content-Type': 'application/json' },
                         body: JSON.stringify({ permite_comentar: ev.target.checked }),
                       }, ev.target.checked ? t('comentariosAbertos') : t('comentariosFechados'))} />
                {t('permiteComentar')}
              </label>
              <button type="button" onClick={() => setAberta(aberta === e.id ? null : e.id)} aria-expanded={aberta === e.id} className="text-brand underline">
                {t('verConversas', { n: e.comentarios })}
              </button>
              {aberta === e.id && <Conversas grupoId={grupoId} envio={e} aoMudar={() => void carregar()} />}
            </li>
          ))}
        </ul>
      )}
      {quadroConfirmacao}
    </div>
  )
}
