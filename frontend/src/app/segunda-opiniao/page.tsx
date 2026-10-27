'use client'

// SEGUNDA OPINIAO (redesenhada em out/2026, no padrao das telas do Radix)
// Tela inteira, como a Curadoria: fila a esquerda, OHIF (com todas as
// ferramentas) no centro e o painel de trabalho a direita. Duas abas:
//  - "Para revisar": o REVISOR ve quem pediu, por que, e avalia a ficha
//    ITEM POR ITEM (concordo / ajustar / discordo, com anotacao e valor
//    proposto), da a avaliacao geral (escala tipo RADPEER) e envia;
//  - "Devolvidas para mim": QUEM PEDIU ve o parecer e cada anotacao no seu
//    item, e escolhe "Acrescentar a curadoria" ou "Dispensar"; no fim,
//    aprova ou descarta a ficha.
// Regras e registros: backend/app/modules/curation/segunda_opiniao.py.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Logo from '../../components/Logo'
import ThemeToggle from '../../components/ThemeToggle'
import CartaoPedido from '../../components/segundaOpiniao/CartaoPedido'
import FilaSegundaOpiniao from '../../components/segundaOpiniao/FilaSegundaOpiniao'
import PainelDevolvida from '../../components/segundaOpiniao/PainelDevolvida'
import PainelParecer, { rascunhoValido } from '../../components/segundaOpiniao/PainelParecer'
import VisualizadorRevisao from '../../components/segundaOpiniao/VisualizadorRevisao'
import { useItensFicha } from '../../components/segundaOpiniao/useItensFicha'
import {
  API,
  extrairErro,
  lerDentes,
  type AnotacaoRascunho,
  type AnotacaoServidor,
  type Classificacao,
  type DetalheRevisao,
  type Ficha,
  type ItemFila,
  type ViewerInfo,
} from '../../components/segundaOpiniao/tipos'
import { obterSessaoAtual } from '../../lib/sessao'

const PERFIS_PERMITIDOS = ['administrador', 'suporte', 'curador']
type Aba = 'revisar' | 'devolvidas'

export default function SegundaOpiniaoPage() {
  const router = useRouter()
  const t = useTranslations('SegundaOpiniao')
  const tComum = useTranslations('Comum')
  const itensDaFicha = useItensFicha()

  const [pronto, setPronto] = useState(false)
  const [aba, setAba] = useState<Aba>('revisar')
  const [filaRevisar, setFilaRevisar] = useState<ItemFila[]>([])
  const [filaDevolvidas, setFilaDevolvidas] = useState<ItemFila[]>([])
  const [carregandoFilas, setCarregandoFilas] = useState(true)
  const [filaAberta, setFilaAberta] = useState(true)

  const [ativo, setAtivo] = useState<ItemFila | null>(null)
  const [detalhe, setDetalhe] = useState<DetalheRevisao | null>(null)
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const [viewer, setViewer] = useState<ViewerInfo | null>(null)
  const [carregandoViewer, setCarregandoViewer] = useState(false)
  const [mostrarMarcacoes, setMostrarMarcacoes] = useState(true)

  const [rascunho, setRascunho] = useState<Record<string, AnotacaoRascunho>>({})
  const [classificacao, setClassificacao] = useState<Classificacao | null>(null)
  const [parecer, setParecer] = useState('')
  // holofote do revisor: item aceso (ver PainelParecer)
  const [etapa, setEtapa] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const [ocupado, setOcupado] = useState<number | null>(null)
  const [decidindo, setDecidindo] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [telaCheia, setTelaCheia] = useState(false)
  const pedidoInicial = useRef<{ review: number | null; aba: Aba | null }>({ review: null, aba: null })

  const fila = aba === 'revisar' ? filaRevisar : filaDevolvidas
  const itens = useMemo(() => (ficha ? itensDaFicha(ficha) : []), [ficha, itensDaFicha])

  const carregarFilas = useCallback(async () => {
    setCarregandoFilas(true)
    try {
      const [r1, r2] = await Promise.all([
        fetch(`${API}/curation/reviews/pending`, { credentials: 'include' }),
        fetch(`${API}/curation/reviews/answered`, { credentials: 'include' }),
      ])
      if (r1.status === 401 || r2.status === 401) {
        router.push('/login')
        return { revisar: [], devolvidas: [] }
      }
      const revisar: ItemFila[] = r1.ok ? (await r1.json()).itens ?? [] : []
      const devolvidas: ItemFila[] = r2.ok ? (await r2.json()).itens ?? [] : []
      setFilaRevisar(revisar)
      setFilaDevolvidas(devolvidas)
      return { revisar, devolvidas }
    } catch {
      setErro(t('erros.fila'))
      return { revisar: [], devolvidas: [] }
    } finally {
      setCarregandoFilas(false)
    }
  }, [router, t])

  const carregarDetalhe = useCallback(async (reviewId: number) => {
    const r = await fetch(`${API}/curation/reviews/${reviewId}/detalhe`, { credentials: 'include' })
    if (!r.ok) throw new Error(await extrairErro(r, t('erros.detalhe')))
    const d: DetalheRevisao = await r.json()
    setDetalhe(d)
    return d
  }, [t])

  const carregarFicha = useCallback(async (curationId: number) => {
    const r = await fetch(`${API}/curation/${curationId}`, { credentials: 'include' })
    if (r.ok) setFicha(await r.json())
  }, [])

  const escolher = useCallback(
    async (item: ItemFila) => {
      setAtivo(item)
      setDetalhe(null)
      setFicha(null)
      setViewer(null)
      setRascunho({})
      setClassificacao(null)
      setParecer('')
      setEtapa(0)
      setErro('')
      setCarregandoViewer(true)
      fetch(`${API}/curation/${item.orthanc_reference.id}/viewer-url`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((v) => setViewer(v))
        .catch(() => setViewer(null))
        .finally(() => setCarregandoViewer(false))
      try {
        await Promise.all([carregarDetalhe(item.id), carregarFicha(item.curation.id)])
      } catch (e) {
        setErro(e instanceof Error ? e.message : t('erros.detalhe'))
      }
    },
    [carregarDetalhe, carregarFicha, t]
  )

  // entrada: sessao, filas e (se veio da Curadoria) o pedido indicado no endereco
  useEffect(() => {
    const busca = new URLSearchParams(window.location.search)
    const review = Number(busca.get('review'))
    pedidoInicial.current = {
      review: Number.isInteger(review) && review > 0 ? review : null,
      aba: busca.get('aba') === 'devolvidas' ? 'devolvidas' : busca.get('aba') === 'revisar' ? 'revisar' : null,
    }
    obterSessaoAtual().then(async (sessao) => {
      if (!sessao) return router.push('/login')
      if (!PERFIS_PERMITIDOS.includes(sessao.perfil)) return router.push('/acesso-negado')
      setPronto(true)
      const { revisar, devolvidas } = await carregarFilas()
      const { review: alvo, aba: abaPedida } = pedidoInicial.current
      const naDevolvida = devolvidas.find((i) => i.id === alvo)
      const naRevisar = revisar.find((i) => i.id === alvo)
      const abaInicial: Aba = abaPedida ?? (naDevolvida ? 'devolvidas' : revisar.some((i) => i.pode_responder !== false) || !devolvidas.length ? 'revisar' : 'devolvidas')
      setAba(abaInicial)
      const primeiro =
        naDevolvida ?? naRevisar ??
        (abaInicial === 'revisar' ? revisar.find((i) => i.pode_responder !== false) ?? revisar[0] : devolvidas[0])
      if (primeiro) escolher(primeiro)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const aoMudar = () => setTelaCheia(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', aoMudar)
    return () => document.removeEventListener('fullscreenchange', aoMudar)
  }, [])

  // "Sair": o mesmo da Topbar (esta tela ocupa a tela inteira, sem a Topbar)
  async function sair() {
    try {
      await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' })
    } catch {
      // mesmo sem resposta, volta ao login
    }
    // recarrega a pagina inteira: descarta da memoria o que foi carregado com o login (ASVS 14.3.1)
    window.location.replace('/login')
  }

  async function alternarTelaCheia() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      // navegador recusou: segue normal
    }
  }

  function trocarAba(nova: Aba) {
    if (nova === aba) return
    setAba(nova)
    const lista = nova === 'revisar' ? filaRevisar : filaDevolvidas
    const primeiro = nova === 'revisar' ? lista.find((i) => i.pode_responder !== false) ?? lista[0] : lista[0]
    if (primeiro) escolher(primeiro)
    else {
      setAtivo(null)
      setDetalhe(null)
      setFicha(null)
      setViewer(null)
    }
  }

  // ---- revisor: enviar o parecer ----
  const anotacoesValidas = itens.every((i) => rascunhoValido(i, rascunho[i.chave]))
  const podeEnviar = !!detalhe?.pode_responder && !!classificacao && anotacoesValidas && !enviando

  async function enviarParecer() {
    if (!detalhe || !classificacao) return
    setEnviando(true)
    setErro('')
    const anotacoes = itens
      .map((item) => ({ item, r: rascunho[item.chave] }))
      .filter(({ r }) => r && r.avaliacao !== 'concordo')
      .map(({ item, r }) => {
        let valor: string | number[] | null = null
        if (item.tipo === 'dentes' && r.valor.trim()) valor = lerDentes(r.valor)
        else if (item.tipo === 'valor' && r.valor) valor = r.valor
        return { item: item.chave, avaliacao: r.avaliacao, nota: r.nota.trim() || null, valor_sugerido: valor }
      })
    try {
      const resposta = await fetch(`${API}/curation/reviews/${detalhe.id}/respond`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classificacao, parecer_revisor: parecer.trim() || null, anotacoes }),
      })
      if (!resposta.ok) {
        setErro(await extrairErro(resposta, t('erros.enviar')))
        return
      }
      setAviso(t('avisos.parecerEnviado', { nome: detalhe.solicitante?.nome ?? '—' }))
      const { revisar } = await carregarFilas()
      const proximo = revisar.find((i) => i.pode_responder !== false)
      if (proximo) escolher(proximo)
      else {
        setAtivo(null)
        setDetalhe(null)
        setFicha(null)
        setViewer(null)
      }
    } catch {
      setErro(t('erros.enviar'))
    } finally {
      setEnviando(false)
    }
  }

  // ---- quem pediu: acrescentar / dispensar / decidir ----
  async function resolverAnotacao(nota: AnotacaoServidor, acao: 'incorporar' | 'dispensar') {
    if (!detalhe) return
    setOcupado(nota.id)
    setErro('')
    try {
      const r = await fetch(`${API}/curation/reviews/${detalhe.id}/anotacoes/${nota.id}/${acao}`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!r.ok) {
        setErro(await extrairErro(r, t('erros.anotacao')))
        return
      }
      setAviso(acao === 'incorporar' ? t('avisos.incorporada', { item: nota.rotulo }) : t('avisos.dispensada', { item: nota.rotulo }))
      await Promise.all([carregarDetalhe(detalhe.id), carregarFicha(detalhe.curation_id)])
      setFilaDevolvidas((lista) =>
        lista.map((i) =>
          i.id === detalhe.id && nota.situacao === 'pendente'
            ? { ...i, anotacoes_pendentes: Math.max(0, (i.anotacoes_pendentes ?? 1) - 1) }
            : i
        )
      )
    } catch {
      setErro(t('erros.anotacao'))
    } finally {
      setOcupado(null)
    }
  }

  async function decidir(corpo: Record<string, unknown>, mensagem: string) {
    if (!detalhe) return
    setDecidindo(true)
    setErro('')
    try {
      const r = await fetch(`${API}/curation/${detalhe.curation_id}/apply-review-decision`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      })
      if (!r.ok) {
        setErro(await extrairErro(r, t('erros.decisao')))
        return
      }
      setAviso(mensagem)
      const { devolvidas } = await carregarFilas()
      if (devolvidas[0]) escolher(devolvidas[0])
      else {
        setAtivo(null)
        setDetalhe(null)
        setFicha(null)
        setViewer(null)
      }
    } catch {
      setErro(t('erros.decisao'))
    } finally {
      setDecidindo(false)
    }
  }

  // holofote no botao "Enviar parecer": Enter envia
  const enviarRef = useRef<() => void>(() => {})
  enviarRef.current = () => {
    if (podeEnviar) enviarParecer()
  }
  useEffect(() => {
    function aoTeclar(ev: KeyboardEvent) {
      if (ev.key !== 'Enter' || ev.ctrlKey || ev.altKey || ev.metaKey) return
      const alvo = ev.target as HTMLElement | null
      if (alvo && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(alvo.tagName)) return
      if (aba === 'revisar' && itens.length > 0 && etapa === itens.length + 1) {
        ev.preventDefault()
        enviarRef.current()
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aba, etapa, itens.length])

  useEffect(() => {
    if (!aviso) return
    const id = setTimeout(() => setAviso(''), 5000)
    return () => clearTimeout(id)
  }, [aviso])

  if (!pronto) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-base">
        <p className="text-slate-300">{tComum('carregando')}</p>
      </main>
    )
  }

  const modoRevisar = aba === 'revisar'
  const propria = modoRevisar && !!detalhe && !detalhe.pode_responder
  const etapaEnviar = modoRevisar && !propria && itens.length > 0 && etapa === itens.length + 1

  return (
    <div className="flex h-screen flex-col bg-base">
      <main className="flex h-full min-h-0 flex-1 flex-col gap-3 p-4">
        {/* cabecalho compacto (mesmo padrao da Curadoria) */}
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <Logo variante="icone" />
          <h1 className="titulo-pagina text-xl!">{t('titulo')}</h1>
          <Link
            href="/dashboard"
            className="rounded-full border border-base-border bg-base-surface px-3 py-1 text-xs text-slate-300 hover:border-brand hover:text-brand-300"
          >
            ← {t('inicio')}
          </Link>
          <div role="tablist" aria-label={t('titulo')} className="ml-2 flex rounded-full border border-base-border bg-base-surface p-0.5">
            {(['revisar', 'devolvidas'] as Aba[]).map((a) => {
              const total = a === 'revisar' ? filaRevisar.filter((i) => i.pode_responder !== false).length : filaDevolvidas.length
              return (
                <button
                  key={a}
                  type="button"
                  role="tab"
                  aria-selected={aba === a}
                  onClick={() => trocarAba(a)}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-medium transition ${
                    aba === a ? 'bg-teal-400/15 text-teal-800 dark:text-teal-100 ring-1 ring-teal-400/50' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {a === 'revisar' ? t('abas.revisar') : t('abas.devolvidas')}
                  <span
                    className={`min-w-5 rounded-full px-1.5 text-[10px] font-bold ${
                      total ? (a === 'devolvidas' ? 'bg-amber-400 text-black' : 'bg-teal-400 text-black') : 'bg-white/10 text-slate-400'
                    }`}
                  >
                    {total}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {aviso && (
              <span role="status" className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs text-emerald-700 dark:text-emerald-200">
                {aviso}
              </span>
            )}
            <ThemeToggle />
            <button
              type="button"
              onClick={sair}
              className="rounded-full border border-base-border bg-base-surface px-3 py-1.5 text-xs text-slate-300 hover:border-rose-400 hover:text-rose-600 dark:hover:text-rose-300"
            >
              {t('sair')}
            </button>
            <button
              type="button"
              onClick={alternarTelaCheia}
              className="flex items-center gap-2 rounded-full border border-teal-400/40 bg-teal-400/10 px-3.5 py-1.5 text-xs font-medium text-teal-700 dark:text-teal-200 hover:bg-teal-400/20"
            >
              <span aria-hidden="true">⛶</span> {telaCheia ? t('sairTelaCheia') : t('telaCheia')}
            </button>
          </div>
        </div>

        {/* area de trabalho: fila | OHIF | painel */}
        <div
          className={`grid min-h-0 flex-1 gap-3 ${
            filaAberta ? 'lg:grid-cols-[280px_minmax(0,1fr)_minmax(380px,460px)]' : 'lg:grid-cols-[44px_minmax(0,1fr)_minmax(380px,460px)]'
          }`}
        >
          <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-base-border bg-base-surface">
            <div className="flex items-center justify-between gap-2 border-b border-base-border px-3 py-2">
              {filaAberta && (
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {modoRevisar ? t('fila.tituloRevisar') : t('fila.tituloDevolvidas')}
                </p>
              )}
              <button
                type="button"
                onClick={() => setFilaAberta((v) => !v)}
                aria-label={filaAberta ? t('fila.recolher') : t('fila.abrir')}
                title={filaAberta ? t('fila.recolher') : t('fila.abrir')}
                className="rounded-md px-1.5 text-slate-400 hover:text-white"
              >
                {filaAberta ? '«' : '»'}
              </button>
            </div>
            {filaAberta && (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <FilaSegundaOpiniao itens={fila} ativo={ativo?.id ?? null} carregando={carregandoFilas} modo={aba} onEscolher={escolher} />
              </div>
            )}
          </aside>

          <section className="min-h-[50vh] lg:min-h-0">
            {ativo ? (
              <VisualizadorRevisao
                carregando={carregandoViewer}
                viewerInfo={viewer}
                marcacoes={ficha?.marcacoes ?? []}
                mostrarMarcacoes={mostrarMarcacoes}
                onAlternarMarcacoes={() => setMostrarMarcacoes((v) => !v)}
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-base-border p-8 text-center text-sm text-slate-400">
                {modoRevisar ? t('vazio.revisar') : t('vazio.devolvidas')}
              </div>
            )}
          </section>

          <aside className="flex min-h-0 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              {erro && (
                <p role="alert" className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-200">
                  {erro}
                </p>
              )}
              {ativo && detalhe && (
                <CartaoPedido
                  solicitante={detalhe.solicitante}
                  curadorDaFicha={detalhe.curador_da_ficha}
                  criadoEm={detalhe.criado_em}
                  motivo={detalhe.motivo}
                  primeiroParecer={detalhe.primeiro_parecer}
                  fichaId={detalhe.curation_id}
                />
              )}
              {ativo && (!detalhe || !ficha) && !erro && <p className="text-sm text-slate-400">{t('carregandoFicha')}</p>}
              {ativo && detalhe && ficha && modoRevisar && (
                <PainelParecer
                  itens={itens}
                  rascunho={rascunho}
                  onRascunho={(chave, v) => setRascunho((r) => ({ ...r, [chave]: v }))}
                  classificacao={classificacao}
                  onClassificacao={setClassificacao}
                  parecer={parecer}
                  onParecer={setParecer}
                  somenteLeitura={propria}
                  etapa={etapa}
                  onEtapa={setEtapa}
                />
              )}
              {ativo && detalhe && ficha && !modoRevisar && (
                <PainelDevolvida
                  detalhe={detalhe}
                  itens={itens}
                  ocupado={ocupado}
                  onIncorporar={(n) => resolverAnotacao(n, 'incorporar')}
                  onDispensar={(n) => resolverAnotacao(n, 'dispensar')}
                  onAprovar={() => decidir({ decisao: 'aprovar', anonimizacao_validada: true }, t('avisos.aprovada'))}
                  onDescartar={(motivo) => decidir({ decisao: 'descartar', motivo }, t('avisos.descartada'))}
                  decidindo={decidindo}
                />
              )}
            </div>

            {/* rodape fixo do revisor: resumo + enviar */}
            {ativo && detalhe && ficha && modoRevisar && !propria && (
              <div className="mt-3 shrink-0 rounded-xl border border-base-border bg-base-surface p-3">
                <div className="flex items-center gap-3">
                  <p className="min-w-0 flex-1 text-xs text-slate-400">
                    {!classificacao
                      ? t('rodape.falta')
                      : !anotacoesValidas
                        ? t('rodape.faltaAnotacao')
                        : t('rodape.pronto', {
                            anotacoes: itens.filter((i) => (rascunho[i.chave]?.avaliacao ?? 'concordo') !== 'concordo').length,
                            nome: detalhe.solicitante?.nome ?? '—',
                          })}
                  </p>
                  <button
                    type="button"
                    onClick={enviarParecer}
                    disabled={!podeEnviar}
                    className={`shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-glow transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40 ${
                      etapaEnviar ? 'scale-110 shadow-[0_0_0_2px_rgba(45,212,191,.9),0_0_28px_-2px_rgba(45,212,191,.7)]' : ''
                    }`}
                  >
                    {enviando ? t('rodape.enviando') : t('rodape.enviar')}
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  )
}
