'use client'

// "IMAGENS ENVIADAS POR MIM" EM GRADE (pedido do video, 22/11/2026), usada
// em Minhas imagens. Mesmo padrao das outras telas: quadrados numerados com a
// situacao, caixa de selecao, "i" (informacoes) e lupa (abrir no
// visualizador). A barra fica presa no topo enquanto a grade esta na tela e
// tem as acoes alinhadas ao lado de "Ver selecionadas":
// - equipe (professor, curador, administrador): Enviar a pessoas ou grupos
//   (so grupos do proprio usuario - o servidor confere);
// - imagens "so para mim" ou devolvidas: Enviar para analise e Retirar;
// - Ver selecionadas: abre o visualizador com as selecionadas juntas.
// Cada acao chama as rotas que ja existiam, uma por imagem
// (backend/app/modules/envios_router.py), que conferem dono e perfil.
// O filtro por tipo vem da tela (filtroTipo); imagem sem tipo conhecido so
// aparece em "Todos".
// modo "recebidas" (Compartilhadas comigo, 22/11/2026): o que colegas me
// enviaram - mesma grade, "i" com quem enviou, as novas viram "vistas" ao
// abrir, e a unica acao e "Ver selecionadas". Sem nenhuma, a secao some.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import MiniaturaFila from '../MiniaturaFila'
import SeletorPessoasGrupos, { type Pessoa } from './SeletorPessoasGrupos'
import { useConfirmacao } from '../useConfirmacao'
import { fetchOuNulo } from '../../lib/fetchSeguro'

const API = process.env.NEXT_PUBLIC_API_URL

type Situacao = 'so_para_mim' | 'devolvida' | 'em_analise' | 'na_fila' | 'no_banco'
type Item = {
  id: number
  situacao: Situacao
  enviado_por?: string | null
  nova?: boolean
  analista: string | null
  analise_nota: string | null
  devolucao_nota: string | null
  viewer_url: string | null
  enviada_para?: number
  em_volume?: boolean
  cortes?: number
  tipo_radiografia?: string | null
}
type Analista = { id: number; nome: string; perfil: string }

const CORES: Record<Situacao, string> = {
  so_para_mim: 'bg-slate-700/90 text-white',
  devolvida: 'bg-amber-600/90 text-white',
  em_analise: 'bg-sky-700/90 text-white',
  na_fila: 'bg-violet-700/90 text-white',
  no_banco: 'bg-emerald-700/90 text-white',
}
const DO_DONO: Situacao[] = ['so_para_mim', 'devolvida']

/** Junta os enderecos do visualizador numa so janela (StudyInstanceUIDs=a,b). */
export function urlVisualizadorJunto(urls: string[]): string | null {
  const validas = urls.filter(Boolean)
  if (!validas.length) return null
  try {
    const base = new URL(validas[0])
    const estudos = validas.flatMap((u) => (new URL(u).searchParams.get('StudyInstanceUIDs') ?? '').split(',')).filter(Boolean)
    base.searchParams.set('StudyInstanceUIDs', Array.from(new Set(estudos)).join(','))
    return base.toString()
  } catch {
    return null
  }
}

export default function GradeEnvios({
  equipe,
  filtroTipo,
  modo = 'meus',
}: {
  equipe: boolean
  filtroTipo: string | null
  modo?: 'meus' | 'recebidas'
}) {
  const meus = modo === 'meus'
  const t = useTranslations('EnviarImagem.lista')
  const tGrade = useTranslations('EnviarImagem.grade')
  const tComum = useTranslations('Comum')
  const { pedirConfirmacao, quadroConfirmacao } = useConfirmacao()
  const [itens, setItens] = useState<Item[] | null>(null)
  const [analistas, setAnalistas] = useState<Analista[]>([])
  const [selecionados, setSelecionados] = useState<number[]>([])
  const [painel, setPainel] = useState<'pessoas' | 'analise' | null>(null)
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [grupos, setGrupos] = useState<number[]>([])
  const [analista, setAnalista] = useState('')
  const [recado, setRecado] = useState('')
  const [info, setInfo] = useState<number | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    const r = await fetchOuNulo(`${API}/envios/${meus ? 'meus' : 'recebidas'}`, { credentials: 'include' })
    const lista: Item[] = r && r.ok ? ((await r.json()).itens ?? []) : []
    setItens(lista)
    // recebidas: ao abrir a tela, as novas passam a "vistas"
    if (!meus && lista.some((i) => i.nova)) {
      fetch(`${API}/envios/recebidas/vistas`, { method: 'POST', credentials: 'include' }).catch(() => undefined)
    }
  }, [meus])

  useEffect(() => {
    void carregar()
    if (!meus) return
    fetch(`${API}/envios/analistas`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { pessoas: [] }))
      .then((d) => setAnalistas(d.pessoas ?? []))
      .catch(() => setAnalistas([]))
  }, [carregar, meus])

  const visiveis = useMemo(
    () => (itens ?? []).filter((i) => !filtroTipo || i.tipo_radiografia === filtroTipo),
    [itens, filtroTipo],
  )
  // a selecao so vale para o que esta na tela (o filtro pode esconder)
  useEffect(() => {
    setSelecionados((atual) => atual.filter((id) => visiveis.some((i) => i.id === id)))
  }, [visiveis])

  const escolhidos = visiveis.filter((i) => selecionados.includes(i.id))
  const temSelecao = escolhidos.length > 0
  const todasDoDono = meus && temSelecao && escolhidos.every((i) => DO_DONO.includes(i.situacao))

  function alternar(id: number) {
    setSelecionados((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]))
  }

  /** Chama a mesma rota para cada selecionada; para no primeiro erro. */
  async function paraCada(caminho: (i: Item) => string, metodo: string, corpo?: object): Promise<number> {
    setErro('')
    setMensagem('')
    setOcupado(true)
    let feitas = 0
    try {
      for (const i of escolhidos) {
        const r = await fetchOuNulo(`${API}${caminho(i)}`, {
          method: metodo,
          credentials: 'include',
          headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
          body: corpo ? JSON.stringify(corpo) : undefined,
        })
        if (!r) {
          setErro(tComum('semConexao'))
          break
        }
        if (!r.ok) {
          let motivo = t('erro')
          try {
            const d = await r.json()
            if (typeof d?.detail === 'string') motivo = d.detail
          } catch {
            // sem corpo
          }
          setErro(motivo)
          break
        }
        feitas += 1
      }
    } finally {
      setOcupado(false)
    }
    if (feitas) {
      setMensagem(tGrade('feito', { n: feitas }))
      setPainel(null)
      setSelecionados([])
      void carregar()
    }
    return feitas
  }

  async function enviarPessoas() {
    await paraCada((i) => `/envios/${i.id}/enviar-para`, 'POST', { pessoas_ids: pessoas.map((p) => p.id), grupos_ids: grupos })
    setPessoas([])
    setGrupos([])
  }

  async function enviarAnalise() {
    await paraCada((i) => `/envios/${i.id}/analise`, 'POST', { analista_id: Number(analista), nota: recado.trim() || null })
    setAnalista('')
    setRecado('')
  }

  async function retirar() {
    const sim = await pedirConfirmacao({
      titulo: tGrade('retirarTitulo', { n: escolhidos.length }),
      texto: t('retirarTexto'),
      botao: t('retirarSim'),
      cancelar: t('cancelar'),
    })
    if (sim) await paraCada((i) => `/envios/${i.id}`, 'DELETE')
  }

  function verSelecionadas() {
    const url = urlVisualizadorJunto(escolhidos.map((i) => i.viewer_url ?? ''))
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  if (itens === null) return null
  // recebidas de colegas: sem nenhuma, a secao nem aparece
  if (!meus && !itens.length) return null

  const botao =
    'flex h-8 items-center gap-1.5 rounded-lg border border-base-border bg-base-surface/50 px-3 text-xs text-ink-2 transition hover:border-brand hover:text-brand disabled:opacity-60'

  return (
    <section className="mt-6" data-teste={`grade-envios-${modo}`}>
      <h2 className="mb-1 text-lg font-semibold text-ink">{t(meus ? 'tituloMeus' : 'tituloRecebidas')}</h2>
      <p className="mb-2 text-xs text-ink-2">{t(meus ? 'explicaMeus' : 'explicaRecebidas')}</p>
      {mensagem && <p role="status" className="mb-2 rounded-lg bg-emerald-500/10 p-2 text-sm text-emerald-800 dark:text-emerald-300">{mensagem}</p>}
      {erro && <p role="alert" className="mb-2 rounded-lg bg-red-500/10 p-2 text-sm text-red-700 dark:text-red-300">{erro}</p>}

      {!itens.length ? (
        <p className="text-sm text-ink-3">{t('vazioMeus')}</p>
      ) : (
        <>
          {/* barra presa no topo enquanto a grade esta na tela */}
          <div className="sticky top-0 z-30 -mx-6 mb-2 border-b border-base-border/70 bg-base/90 px-6 py-2 backdrop-blur-md">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-8 items-center rounded-full bg-brand/10 px-3 text-xs font-medium text-brand">
                {tGrade('quantidade', { n: visiveis.length })}
              </span>
              <button type="button" onClick={() => setSelecionados(visiveis.map((i) => i.id))} className={botao}>
                {tGrade('selecionarTodas', { n: visiveis.length })}
              </button>
              {temSelecao && (
                <button type="button" onClick={() => setSelecionados([])} className={botao}>
                  {tGrade('limpar')}
                </button>
              )}
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                {temSelecao && equipe && meus && (
                  <button type="button" onClick={() => setPainel(painel === 'pessoas' ? null : 'pessoas')} aria-expanded={painel === 'pessoas'} className={botao}>
                    {t('enviarPessoas')}
                  </button>
                )}
                {todasDoDono && analistas.length > 0 && (
                  <button type="button" onClick={() => setPainel(painel === 'analise' ? null : 'analise')} aria-expanded={painel === 'analise'} className={botao}>
                    {t('mandarParaAnalise')}
                  </button>
                )}
                {todasDoDono && (
                  <button type="button" onClick={() => void retirar()} disabled={ocupado} className={`${botao} hover:border-red-500 hover:text-red-500`}>
                    {tGrade('retirar', { n: escolhidos.length })}
                  </button>
                )}
                {temSelecao && (
                  <button
                    type="button"
                    onClick={verSelecionadas}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-semibold text-white shadow-glow transition hover:bg-brand-hover"
                  >
                    ▶ {tGrade('verSelecionadas', { n: escolhidos.length })}
                  </button>
                )}
              </div>
            </div>

            {painel === 'pessoas' && temSelecao && (
              <div className="mt-2 space-y-2 rounded-lg border border-base-border bg-base-surface p-2">
                <SeletorPessoasGrupos pessoas={pessoas} grupos={grupos} aoMudar={(p, g) => { setPessoas(p); setGrupos(g) }} />
                <div className="flex gap-2">
                  <button type="button" disabled={ocupado || (!pessoas.length && !grupos.length)} onClick={() => void enviarPessoas()}
                          className="rounded bg-brand px-3 py-1 text-xs text-white disabled:opacity-50">{t('enviar')}</button>
                  <button type="button" onClick={() => setPainel(null)} className="text-xs text-ink-3">{t('cancelar')}</button>
                </div>
              </div>
            )}
            {painel === 'analise' && todasDoDono && (
              <div className="mt-2 space-y-2 rounded-lg border border-base-border bg-base-surface p-2">
                <select value={analista} onChange={(e) => setAnalista(e.target.value)} aria-label={t('quemAnalisa')}
                        className="w-full rounded border border-base-border bg-base-surface2 px-2 py-1 text-xs text-ink">
                  <option value="">{t('quemAnalisa')}</option>
                  {analistas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
                <textarea value={recado} onChange={(e) => setRecado(e.target.value)} maxLength={500} rows={2}
                          placeholder={t('recadoOpcional')} aria-label={t('recadoOpcional')}
                          className="w-full rounded border border-base-border bg-base-surface2 px-2 py-1 text-xs text-ink" />
                <div className="flex gap-2">
                  <button type="button" disabled={ocupado || !analista} onClick={() => void enviarAnalise()}
                          className="rounded bg-brand px-3 py-1 text-xs text-white disabled:opacity-50">{t('enviarAnalise')}</button>
                  <button type="button" onClick={() => setPainel(null)} className="text-xs text-ink-3">{t('cancelar')}</button>
                </div>
              </div>
            )}
          </div>

          {!visiveis.length ? (
            <p className="py-4 text-sm text-ink-3">{tGrade('nenhumDoTipo')}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 pb-2 sm:grid-cols-3 md:grid-cols-5">
              {visiveis.map((item, indice) => {
                const marcada = selecionados.includes(item.id)
                const infoAberta = info === item.id
                return (
                  <div key={item.id} data-cartao-envio className={`relative aspect-square overflow-hidden rounded-lg border bg-black ${marcada ? 'border-brand ring-2 ring-brand/60' : 'border-base-border'}`}>
                    <div role="img" aria-label={t('imagemN', { id: item.id })} className="h-full w-full">
                      <MiniaturaFila orthancReferenceId={item.id} caminho={`/envios/${item.id}/preview`} alt=""
                                     className="h-full w-full bg-black object-contain" />
                    </div>
                    <span className="absolute left-1 top-1 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-black/70 px-1 text-[10px] font-semibold text-white">
                      {indice + 1}
                    </span>
                    <label className="absolute right-1 top-1 z-20 flex h-5 w-5 cursor-pointer items-center justify-center rounded-md bg-black/70">
                      <input type="checkbox" checked={marcada} onChange={() => alternar(item.id)}
                             aria-label={tGrade('selecionar', { id: item.id })} className="h-3.5 w-3.5 accent-brand" />
                    </label>
                    <div className="absolute bottom-1 left-1 z-10 flex flex-col items-start gap-0.5">
                      {item.em_volume && (item.cortes ?? 1) > 1 && (
                        <span className="rounded bg-sky-700/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">{t('volumeSelo', { cortes: item.cortes ?? 1 })}</span>
                      )}
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${CORES[item.situacao]}`}>{t(`situacoes.${item.situacao}`)}</span>
                    </div>

                    {infoAberta && (
                      <div role="tooltip" className="absolute inset-0 z-10 space-y-1 overflow-y-auto bg-base-surface/95 p-2 pb-8 text-[11px] leading-snug text-ink">
                        <p className="font-semibold">{t('imagemN', { id: item.id })} · {t(`situacoes.${item.situacao}`)}</p>
                        {!meus && item.enviado_por && <p>{t('enviadaPor', { nome: item.enviado_por })}{item.nova ? ` · ${t('nova')}` : ''}</p>}
                        {!!item.enviada_para && <p>{t('enviadaParaN', { n: item.enviada_para })}</p>}
                        {item.situacao === 'em_analise' && item.analista && <p>{t('comQuem', { nome: item.analista })}</p>}
                        {item.analise_nota && <p>“{item.analise_nota}”</p>}
                        {item.situacao === 'devolvida' && item.devolucao_nota && <p>{t('motivoDevolucao')}: “{item.devolucao_nota}”</p>}
                      </div>
                    )}

                    <div className="absolute bottom-1 right-1 z-20 flex items-center gap-1">
                      <button type="button" onClick={() => setInfo(infoAberta ? null : item.id)} aria-pressed={infoAberta}
                              aria-label={tGrade('info')} title={tGrade('info')}
                              className="flex items-center rounded-full border border-teal-300/50 bg-black/70 px-1.5 py-0.5 text-teal-100 hover:border-teal-300">
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                          <circle cx="12" cy="12" r="9" />
                          <path d="M12 11v6M12 7.5v.5" strokeLinecap="round" />
                        </svg>
                      </button>
                      {item.viewer_url && (
                        <a href={item.viewer_url} target="_blank" rel="noopener noreferrer" aria-label={t('abrir')} title={t('abrir')}
                           className="flex items-center rounded-full border border-teal-300/50 bg-black/70 px-1.5 py-0.5 text-teal-100 hover:border-teal-300">
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                            <circle cx="11" cy="11" r="6.5" />
                            <path d="M20 20l-4.2-4.2M11 8.5v5M8.5 11h5" />
                          </svg>
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
      {quadroConfirmacao}
    </section>
  )
}
