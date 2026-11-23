'use client'

// IMAGENS DO GRUPO - visao do PARTICIPANTE (17/11/2026, Etapa 3).
// Cada imagem que o dono enviou em "modo aula": a imagem com as marcacoes
// DA AULA (com o selo "Marcacoes do professor para esta aula", para nao
// confundir com a ficha oficial), os destaques, a mensagem e a PROPRIA
// conversa com o dono (particular - D4). Se o dono permitiu, aparece o campo
// "Comentar"; se desligou, a conversa continua visivel, mas o campo some.
// A pessoa apaga os proprios comentarios. Imagens que chegaram desde a
// ultima visita vem com a etiqueta "Nova"; abrir a lista marca como vistas
// (o menu e a tela reconta: aoVer).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import ImagemPrincipalMarcada from '../detalhe/ImagemPrincipalMarcada'
import { fetchOuNulo } from '../../lib/fetchSeguro'
import type { Marcacao } from '../../lib/marcacoes'

const API = process.env.NEXT_PUBLIC_API_URL
const COMENTARIO_MAX = 500

type Comentario = { id: number; autor: 'eu' | 'dono'; texto: string }
type Envio = {
  id: number; curation_id: number; remetente: string; mensagem: string | null; permite_comentar: boolean
  marcacoes: Marcacao[]; destaques: string[]; comentarios: Comentario[]; nova?: boolean
}

async function lerErro(r: Response, padrao: string) {
  try {
    const d = await r.json()
    if (typeof d?.detail === 'string') return d.detail
  } catch {
    // sem corpo
  }
  return padrao
}

export default function ImagensGrupoParticipante({ grupoId, aoVer }: { grupoId: number; aoVer?: () => void }) {
  const t = useTranslations('MeusGrupos')
  const tComum = useTranslations('Comum')
  const tAlteracao = useTranslations('AlteracoesObservadas.itens')
  const [envios, setEnvios] = useState<Envio[] | null>(null)
  const [textos, setTextos] = useState<Record<number, string>>({})
  const [erro, setErro] = useState('')

  async function carregar() {
    const r = await fetchOuNulo(`${API}/grupos/participo/${grupoId}/envios`, { credentials: 'include' })
    try {
      setEnvios(r?.ok ? ((await r.json()).envios ?? []) : [])
    } catch {
      setEnvios([])
    }
  }

  useEffect(() => {
    // abrir as imagens marca as novas como vistas no servidor: o menu e a tela recontam
    void carregar().then(() => {
      window.dispatchEvent(new Event('radix-grupos-mudou'))
      aoVer?.()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupoId])

  async function agir(caminho: string, init: RequestInit, aoDarCerto?: () => void) {
    setErro('')
    const r = await fetchOuNulo(`${API}${caminho}`, { credentials: 'include', ...init })
    if (!r) setErro(tComum('semConexao'))
    else if (!r.ok) setErro(await lerErro(r, t('erro')))
    else aoDarCerto?.()
    void carregar()
  }

  function comentar(e: React.FormEvent, envio: Envio) {
    e.preventDefault()
    const texto = (textos[envio.id] ?? '').trim()
    if (!texto) return
    void agir(`/grupos/participo/${grupoId}/envios/${envio.id}/comentarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto }),
    }, () => setTextos((atual) => ({ ...atual, [envio.id]: '' })))
  }

  const rotulo = (valor: string) => (tAlteracao.has(valor) ? tAlteracao(valor) : valor)

  if (envios === null) return <p className="text-xs text-ink-3">{t('carregando')}</p>
  return (
    <div className="space-y-3">
      {erro && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{erro}</p>}
      {envios.length === 0 ? (
        <p className="text-xs text-ink-3">{t('semImagens')}</p>
      ) : (
        <ul className="space-y-4">
          {envios.map((e) => (
            <li key={e.id} aria-label={t('imagemNumero', { n: e.curation_id })} className="space-y-2 rounded-lg border border-base-border p-3 text-sm text-ink-2">
              <p className="flex flex-wrap items-center gap-2">
                {e.nova && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-black">{t('nova')}</span>}
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-ink">{t('seloAula', { quem: e.remetente })}</span>
              </p>
              <div className="h-72 overflow-hidden rounded-lg bg-black">
                <ImagemPrincipalMarcada curationId={e.curation_id} alt={t('imagemNumero', { n: e.curation_id })} marcacoes={e.marcacoes} />
              </div>
              {e.mensagem && <p className="italic">“{e.mensagem}”</p>}
              {e.destaques.length > 0 && (
                <p className="text-xs"><span className="font-semibold">{t('destaques')}:</span> {e.destaques.map(rotulo).join(', ')}</p>
              )}
              <Link href={`/visualizar/${e.curation_id}`} className="text-xs text-brand underline">{t('verFichaOficial')}</Link>

              <section aria-label={t('conversa')} className="space-y-1">
                {e.comentarios.length > 0 && (
                  <ul className="space-y-1">
                    {e.comentarios.map((c) => (
                      <li key={c.id} className={`flex flex-wrap items-center gap-2 text-xs ${c.autor === 'dono' ? 'text-brand' : ''}`}>
                        <span><span className="font-medium">{c.autor === 'eu' ? t('voce') : e.remetente}:</span> {c.texto}</span>
                        {c.autor === 'eu' && (
                          <button type="button" className="text-rose-600 underline dark:text-rose-400" aria-label={t('apagarComentarioRotulo')}
                                  onClick={() => agir(`/grupos/participo/${grupoId}/envios/${e.id}/comentarios/${c.id}`, { method: 'DELETE' })}>
                            {t('apagarComentario')}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {e.permite_comentar ? (
                  <form method="post" onSubmit={(ev) => comentar(ev, e)} className="flex gap-2">
                    <label htmlFor={`comentario-${e.id}`} className="sr-only">{t('comentarRotulo')}</label>
                    <input id={`comentario-${e.id}`} value={textos[e.id] ?? ''} maxLength={COMENTARIO_MAX} placeholder={t('comentarExemplo')}
                           onChange={(ev) => setTextos((atual) => ({ ...atual, [e.id]: ev.target.value }))}
                           className="min-w-0 flex-1 rounded-md border border-base-border bg-base-surface2 px-2 py-1 text-xs text-ink" />
                    <button type="submit" className="rounded-md border border-base-border px-2 py-1 text-xs text-ink hover:border-brand">{t('comentar')}</button>
                  </form>
                ) : (
                  <p className="text-xs text-ink-3">{t('comentariosFechados')}</p>
                )}
                <p className="text-[11px] text-ink-3">{t('comentarioParticular')}</p>
              </section>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
