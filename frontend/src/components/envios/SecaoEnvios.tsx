'use client'

// Listas da etapa B (08/11/2026):
// - modo "meus": o que EU enviei (Minhas imagens), com a situacao de cada
//   imagem e as acoes do dono (mandar para analise, retirar);
// - modo "analisar": o que mandaram para EU analisar (professor/curador),
//   com "Colocar na fila de curadoria" e "Devolver com recado".

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import MiniaturaFila from '../MiniaturaFila'
import SeletorPessoasGrupos, { type Pessoa } from './SeletorPessoasGrupos'
import { useConfirmacao } from '../useConfirmacao'

const API = process.env.NEXT_PUBLIC_API_URL

type Item = {
  id: number
  situacao: 'so_para_mim' | 'devolvida' | 'em_analise' | 'na_fila' | 'no_banco'
  enviado_em: string | null
  enviado_por: string | null
  analista: string | null
  analise_nota: string | null
  devolucao_nota: string | null
  curation_id: number | null
  viewer_url: string | null
  enviada_para?: number
  nova?: boolean
}
type Analista = { id: number; nome: string; perfil: string }

const CORES: Record<Item['situacao'], string> = {
  so_para_mim: 'bg-slate-500/15 text-ink-2',
  devolvida: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  em_analise: 'bg-sky-500/15 text-sky-800 dark:text-sky-300',
  na_fila: 'bg-violet-500/15 text-violet-800 dark:text-violet-300',
  no_banco: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
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

export default function SecaoEnvios({ modo, equipe = false }: { modo: 'meus' | 'analisar' | 'recebidas'; equipe?: boolean }) {
  const t = useTranslations('EnviarImagem.lista')
  const { pedirConfirmacao, quadroConfirmacao } = useConfirmacao()
  const [itens, setItens] = useState<Item[] | null>(null)
  const [analistas, setAnalistas] = useState<Analista[]>([])
  const [escolhido, setEscolhido] = useState<Record<number, string>>({})
  const [recado, setRecado] = useState<Record<number, string>>({})
  const [aberto, setAberto] = useState<number | null>(null)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  const [enviarPara, setEnviarPara] = useState<number | null>(null)
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [grupos, setGrupos] = useState<number[]>([])

  const carregar = useCallback(async () => {
    try {
      const caminho = modo === 'meus' ? 'meus' : modo === 'analisar' ? 'para-analisar' : 'recebidas'
      const r = await fetch(`${API}/envios/${caminho}`, { credentials: 'include' })
      const lista: Item[] = r.ok ? (await r.json()).itens : []
      setItens(lista)
      // recebidas: ao abrir a tela, as novas passam a "vistas"
      if (modo === 'recebidas' && lista.some((i) => i.nova)) {
        fetch(`${API}/envios/recebidas/vistas`, { method: 'POST', credentials: 'include' }).catch(() => undefined)
      }
    } catch {
      setItens([])
    }
  }, [modo])

  useEffect(() => {
    void carregar()
    if (modo === 'meus') {
      fetch(`${API}/envios/analistas`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : { pessoas: [] }))
        .then((d) => setAnalistas(d.pessoas ?? []))
        .catch(() => setAnalistas([]))
    }
  }, [carregar, modo])

  async function chamar(caminho: string, metodo: string, corpo?: object) {
    setErro('')
    setMensagem('')
    const r = await fetch(`${API}${caminho}`, {
      method: metodo,
      credentials: 'include',
      headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
    })
    if (!r.ok) {
      setErro(await lerErro(r, t('erro')))
      return false
    }
    setMensagem((await r.json()).mensagem ?? '')
    setAberto(null)
    void carregar()
    return true
  }

  async function retirar(item: Item) {
    const sim = await pedirConfirmacao({
      titulo: t('retirarTitulo'),
      texto: t('retirarTexto'),
      botao: t('retirarSim'),
      cancelar: t('cancelar'),
    })
    if (sim) void chamar(`/envios/${item.id}`, 'DELETE')
  }

  if (itens === null) return null
  if (!itens.length && modo !== 'meus') return null

  const titulo = modo === 'meus' ? 'tituloMeus' : modo === 'analisar' ? 'tituloAnalisar' : 'tituloRecebidas'
  const explica = modo === 'meus' ? 'explicaMeus' : modo === 'analisar' ? 'explicaAnalisar' : 'explicaRecebidas'

  async function mandar(item: Item) {
    if (await chamar(`/envios/${item.id}/enviar-para`, 'POST', { pessoas_ids: pessoas.map((p) => p.id), grupos_ids: grupos })) {
      setEnviarPara(null)
      setPessoas([])
      setGrupos([])
    }
  }

  return (
    <section className="mt-6" data-teste={`secao-envios-${modo}`}>
      <h2 className="mb-1 text-lg font-semibold text-ink">{t(titulo)}</h2>
      <p className="mb-3 text-xs text-ink-2">{t(explica)}</p>
      {mensagem && <p role="status" className="mb-3 rounded-lg bg-emerald-500/10 p-2 text-sm text-emerald-800 dark:text-emerald-300">{mensagem}</p>}
      {erro && <p role="alert" className="mb-3 rounded-lg bg-red-500/10 p-2 text-sm text-red-700 dark:text-red-300">{erro}</p>}
      {!itens.length ? (
        <p className="text-sm text-ink-3">{t('vazioMeus')}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {itens.map((item) => (
            <li key={item.id} className="overflow-hidden rounded-xl border border-base-border bg-base-surface">
              <MiniaturaFila orthancReferenceId={item.id} caminho={`/envios/${item.id}/preview`}
                             alt={t('imagemN', { id: item.id })} className="h-40 w-full bg-black" />
              <div className="space-y-2 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-ink">{t('imagemN', { id: item.id })}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CORES[item.situacao]}`}>{t(`situacoes.${item.situacao}`)}</span>
                </div>
                {modo !== 'meus' && item.enviado_por && (
                  <p className="text-xs text-ink-2">{t('enviadaPor', { nome: item.enviado_por })}{item.nova ? ` · ${t('nova')}` : ''}</p>
                )}
                {modo === 'meus' && !!item.enviada_para && <p className="text-xs text-ink-2">{t('enviadaParaN', { n: item.enviada_para })}</p>}
                {item.viewer_url && (
                  <a href={item.viewer_url} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-brand underline">{t('abrir')}</a>
                )}
                {modo === 'meus' && equipe && (
                  enviarPara === item.id ? (
                    <div className="space-y-2 rounded-lg border border-base-border p-2">
                      <SeletorPessoasGrupos pessoas={pessoas} grupos={grupos} aoMudar={(p, g) => { setPessoas(p); setGrupos(g) }} />
                      <div className="flex gap-2">
                        <button type="button" disabled={!pessoas.length && !grupos.length} onClick={() => mandar(item)}
                                className="rounded bg-brand px-3 py-1 text-xs text-white disabled:opacity-50">{t('enviar')}</button>
                        <button type="button" onClick={() => setEnviarPara(null)} className="text-xs text-ink-3">{t('cancelar')}</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => { setEnviarPara(item.id); setPessoas([]); setGrupos([]) }}
                            className="block text-xs text-brand underline">{t('enviarPessoas')}</button>
                  )
                )}
                {item.situacao === 'em_analise' && modo === 'meus' && item.analista && (
                  <p className="text-xs text-ink-2">{t('comQuem', { nome: item.analista })}</p>
                )}
                {item.analise_nota && <p className="rounded bg-base-surface2 p-2 text-xs text-ink-2">“{item.analise_nota}”</p>}
                {item.situacao === 'devolvida' && item.devolucao_nota && (
                  <p className="rounded bg-amber-500/10 p-2 text-xs text-ink-2">{t('motivoDevolucao')}: “{item.devolucao_nota}”</p>
                )}

                {modo === 'meus' && (item.situacao === 'so_para_mim' || item.situacao === 'devolvida') && (
                  aberto === item.id ? (
                    <div className="space-y-2">
                      <select value={escolhido[item.id] ?? ''} onChange={(e) => setEscolhido({ ...escolhido, [item.id]: e.target.value })}
                              className="w-full rounded border border-base-border bg-base-surface2 px-2 py-1 text-xs text-ink" aria-label={t('quemAnalisa')}>
                        <option value="">{t('quemAnalisa')}</option>
                        {analistas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                      <textarea value={recado[item.id] ?? ''} onChange={(e) => setRecado({ ...recado, [item.id]: e.target.value })}
                                maxLength={500} rows={2} placeholder={t('recadoOpcional')} aria-label={t('recadoOpcional')}
                                className="w-full rounded border border-base-border bg-base-surface2 px-2 py-1 text-xs text-ink" />
                      <div className="flex gap-2">
                        <button type="button" disabled={!escolhido[item.id]}
                                onClick={() => chamar(`/envios/${item.id}/analise`, 'POST', { analista_id: Number(escolhido[item.id]), nota: recado[item.id] || null })}
                                className="rounded bg-brand px-3 py-1 text-xs text-white disabled:opacity-50">{t('enviarAnalise')}</button>
                        <button type="button" onClick={() => setAberto(null)} className="text-xs text-ink-3">{t('cancelar')}</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-3 text-xs">
                      {analistas.length > 0 && (
                        <button type="button" onClick={() => setAberto(item.id)} className="text-brand underline">{t('mandarParaAnalise')}</button>
                      )}
                      <button type="button" onClick={() => retirar(item)} className="text-rose-600 underline dark:text-rose-400">{t('retirar')}</button>
                    </div>
                  )
                )}

                {modo === 'analisar' && (
                  <div className="space-y-2">
                    <button type="button" onClick={() => chamar(`/envios/${item.id}/decidir`, 'POST', { acao: 'fila' })}
                            className="w-full rounded bg-brand px-3 py-1.5 text-xs font-medium text-white">{t('colocarNaFila')}</button>
                    {aberto === item.id ? (
                      <div className="space-y-2">
                        <textarea value={recado[item.id] ?? ''} onChange={(e) => setRecado({ ...recado, [item.id]: e.target.value })}
                                  maxLength={500} rows={2} placeholder={t('recadoDevolucao')} aria-label={t('recadoDevolucao')}
                                  className="w-full rounded border border-base-border bg-base-surface2 px-2 py-1 text-xs text-ink" />
                        <button type="button" disabled={!(recado[item.id] ?? '').trim()}
                                onClick={() => chamar(`/envios/${item.id}/decidir`, 'POST', { acao: 'devolver', nota: recado[item.id] })}
                                className="rounded border border-amber-500/60 px-3 py-1 text-xs text-ink disabled:opacity-50">{t('confirmarDevolucao')}</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setAberto(item.id)} className="text-xs text-amber-700 underline dark:text-amber-300">{t('devolver')}</button>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {quadroConfirmacao}
    </section>
  )
}
