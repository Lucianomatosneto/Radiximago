'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import MiniaturaImagem from '../../components/MiniaturaImagem'
import CamadaMarcacoes from '../../components/detalhe/CamadaMarcacoes'
import BotaoHolofote from '../../components/detalhe/BotaoHolofote'
import CamadaSegmentacoes from '../../components/segmentacao/CamadaSegmentacoes'
import { BotaoPintura, usePinturaNaGrade } from '../../components/segmentacao/PinturaNaGrade'
import VisualizadorSequencial, { type ItemSequencia } from '../../components/VisualizadorSequencial'
import ResponderCompartilhamento from '../../components/compartilhar/ResponderCompartilhamento'
import MenuImpressao from '../../components/impressao/MenuImpressao'
import { MenuSalvarComo, MenuSalvarMinhasImagens } from '../../components/impressao/MenuSalvar'
import { useDescricaoCuradoria } from '../../lib/descricaoCuradoria'
import { calcularAmpliacao, type Ampliacao } from '../../lib/ampliacaoGrade'
import type { Marcacao } from '../../lib/marcacoes'
import { obterSessaoAtual } from '../../lib/sessao'

// "COMPARTILHADAS COMIGO" no MESMO PADRAO da Pesquisa avancada (pedido de
// 21/10/2026): grade de quadrados (5 por linha, 2 linhas inteiras na tela),
// barra de ferramentas fixa e enxuta ao rolar, selecao em lote e as mesmas
// acoes (Salvar em Minhas imagens, Salvar como, Imprimir, Prancha, Ver).
// Em cada quadrado, os mesmos icones (marcacoes do curador, "i" e lupa) e
// mais os do compartilhamento: responder a quem enviou e tirar da lista.
// Quem compartilhou e o recado aparecem no proprio quadrado e no "i"; as
// anotacoes de quem compartilhou aparecem ao abrir a imagem (▶ Ver).
// Dados: backend/app/modules/compartilhamentos_router.py (GET /shares/recebidas).

interface Recebida {
  id: number
  curation_id: number
  remetente_nome: string
  mensagem: string | null
  compartilhado_em: string | null
  novo: boolean
  quantidade_anotacoes: number
  tipo_radiografia: string | null
  achado_principal: string | null
  achados_detalhe?: string | null
  alteracoes_observadas?: string[] | null
  marcacoes?: Marcacao[]
  /** estruturas pintadas pelo curador (segmentacao) */
  total_segmentacoes?: number
  qualidade_tecnica?: string | null
  dentes?: number[] | null
  descricao_didatica: string | null
  erros_tecnicos?: string[]
  viewer_url: string | null
}

const API = process.env.NEXT_PUBLIC_API_URL
const TAG_LOCALE: Record<string, string> = { pt: 'pt-BR', en: 'en-US' }

export default function CompartilhadasComigoPage() {
  const router = useRouter()
  const t = useTranslations('CompartilhadasComigo')
  const tPesquisa = useTranslations('Pesquisa')
  const tMarcacoes = useTranslations('Visualizador.marcacoes')
  const tComum = useTranslations('Comum')
  const descrever = useDescricaoCuradoria()
  const tagLocale = TAG_LOCALE[useLocale()] ?? 'pt-BR'

  const [carregando, setCarregando] = useState(true)
  const [itens, setItens] = useState<Recebida[]>([])
  const [erro, setErro] = useState('')
  const [selecionados, setSelecionados] = useState<number[]>([])
  const [quantidadeLote, setQuantidadeLote] = useState(10)
  const [indiceVisualizador, setIndiceVisualizador] = useState<number | null>(null)

  // mesmos estados da grade da Pesquisa
  const [ampliacao, setAmpliacao] = useState<Ampliacao | null>(null)
  const cartaoAmpliado = ampliacao?.id ?? null
  const [ampliadasCarregadas, setAmpliadasCarregadas] = useState<number[]>([])
  const [infoPassando, setInfoPassando] = useState<number | null>(null)
  const [infoFixadas, setInfoFixadas] = useState<number[]>([])
  const [marcacoesVisiveis, setMarcacoesVisiveis] = useState<number[]>([])
  const [holofotesLigados, setHolofotesLigados] = useState<number[]>([])
  const pintura = usePinturaNaGrade()
  const [proporcoes, setProporcoes] = useState<Record<number, number>>({})
  const areaPrincipalRef = useRef<HTMLElement | null>(null)
  const topoFixoRef = useRef<HTMLDivElement | null>(null)
  const [barraRolada, setBarraRolada] = useState(false)
  const gradeRef = useRef<HTMLDivElement | null>(null)
  const [ladoCartao, setLadoCartao] = useState<number | null>(null)

  useEffect(() => {
    obterSessaoAtual().then((sessao) => {
      if (!sessao) {
        router.push('/login')
        return
      }
      carregar()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  // anotacoes recebidas "apagadas" (ou mostradas de novo) no visualizador:
  // atualiza o contador do quadrado
  useEffect(() => {
    function aoMudar(e: Event) {
      const id = (e as CustomEvent<{ id: number }>).detail?.id
      if (id === undefined) return
      fetch(`${API}/shares/recebidas/${id}/anotacoes`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((dados) => {
          if (!dados) return
          setItens((atual) =>
            atual.map((i) =>
              i.id === id
                ? { ...i, quantidade_anotacoes: dados.itens.length, mensagem: dados.mensagem === undefined ? i.mensagem : dados.mensagem }
                : i
            )
          )
        })
        .catch(() => {})
    }
    window.addEventListener('radix-anotacoes-compartilhadas', aoMudar)
    return () => window.removeEventListener('radix-anotacoes-compartilhadas', aoMudar)
  }, [])

  async function carregar() {
    setCarregando(true)
    setErro('')
    try {
      const r = await fetch(`${API}/shares/recebidas`, { credentials: 'include' })
      if (r.status === 401) {
        router.push('/login')
        return
      }
      if (!r.ok) {
        setErro(t('erroCarregar'))
        return
      }
      const dados = await r.json()
      setItens(dados.itens ?? [])
      // abriu a pagina: as novas passam a contar como vistas (o selo
      // "Nova" continua aparecendo nesta visita)
      if ((dados.itens ?? []).some((i: Recebida) => i.novo)) {
        fetch(`${API}/shares/recebidas/vistas`, { method: 'POST', credentials: 'include' })
          .then(() => window.dispatchEvent(new Event('radix-compartilhadas-vistas')))
          .catch(() => {})
      }
    } catch {
      setErro(t('erroCarregar'))
    } finally {
      setCarregando(false)
    }
  }

  // 5 quadrados por linha e 2 linhas inteiras na tela (mesma conta da Pesquisa)
  const temSelecao = selecionados.length > 0
  useEffect(() => {
    const area = areaPrincipalRef.current
    const grade = gradeRef.current
    if (!area || !grade || !grade.parentElement) return
    const caixa = grade.parentElement
    function ajustarGrade() {
      if (!area || !grade) return
      if (window.innerWidth < 768) {
        setLadoCartao(null)
        return
      }
      const VAO = 12
      const FOLGA_EMBAIXO = 24
      const topo = grade.getBoundingClientRect().top + window.scrollY
      const porLargura = Math.floor((caixa.clientWidth - 4 * VAO) / 5)
      const porAltura = Math.floor((window.innerHeight - topo - FOLGA_EMBAIXO - VAO) / 2)
      setLadoCartao(Math.max(120, Math.min(porLargura, porAltura)))
    }
    ajustarGrade()
    const observador = new ResizeObserver(ajustarGrade)
    observador.observe(area)
    observador.observe(caixa)
    window.addEventListener('resize', ajustarGrade)
    return () => {
      observador.disconnect()
      window.removeEventListener('resize', ajustarGrade)
    }
  }, [itens.length, temSelecao])
  useEffect(() => {
    const topo = topoFixoRef.current
    if (!topo) return
    const observador = new IntersectionObserver(([entrada]) => setBarraRolada(!entrada.isIntersecting))
    observador.observe(topo)
    return () => observador.disconnect()
  }, [carregando])

  function alternarSelecao(id: number) {
    setSelecionados((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]))
  }
  function selecionarTodas() {
    setSelecionados(itens.map((i) => i.id))
  }
  function selecionarMais(n: number) {
    if (!Number.isFinite(n) || n < 1) return
    setSelecionados((atual) => {
      const novos = itens.filter((i) => !atual.includes(i.id)).slice(0, n).map((i) => i.id)
      return [...atual, ...novos]
    })
  }
  function dataCurta(iso: string | null) {
    if (!iso) return ''
    try {
      return new Date(iso).toLocaleDateString(tagLocale)
    } catch {
      return ''
    }
  }

  const paraVisualizador = (i: Recebida, numero: number): ItemSequencia => ({
    curation_id: i.curation_id,
    numero,
    descricao_didatica: i.descricao_didatica,
    tipo_radiografia: i.tipo_radiografia,
    viewer_url: i.viewer_url,
    achados_detalhe: i.achados_detalhe,
    alteracoes_observadas: i.alteracoes_observadas,
    marcacoes: i.marcacoes,
    qualidade_tecnica: i.qualidade_tecnica,
    dentes: i.dentes,
    achado_principal: i.achado_principal,
    erros_tecnicos: i.erros_tecnicos,
    compartilhamento: { id: i.id, remetente_nome: i.remetente_nome, mensagem: i.mensagem },
  })
  const todosNumerados = itens.map((i, n) => paraVisualizador(i, n + 1))
  const itensSelecionados = itens
    .map((i, n) => ({ i, n }))
    .filter(({ i }) => selecionados.includes(i.id))
    .map(({ i, n }) => paraVisualizador(i, n + 1))

  if (carregando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-base">
        <p className="text-slate-300">{tComum('carregando')}</p>
      </main>
    )
  }

  const gruposAcoes = [
    { chave: 'todas', rotulo: t('todasCompartilhadas'), itens: todosNumerados },
    { chave: 'selecionadas', rotulo: tPesquisa('imprimirSelecionadas'), itens: itensSelecionados },
  ]

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Topbar />
        <main ref={areaPrincipalRef} className="flex-1 overflow-x-clip px-6 pb-3">
          {/* cabecalho: rola e some; a barra de ferramentas fica presa no topo */}
          <div ref={topoFixoRef} className="pt-6">
            <h1 className="titulo-pagina tela-entra">
              {t('tituloPrefixo')} <span className="text-teal-600 dark:text-teal-300">{t('tituloDestaque')}</span>
            </h1>
            <p className="mt-1 text-sm text-slate-400">{t('subtitulo')}</p>
          </div>

          {erro && (
            <p className="mt-3 text-sm text-red-400" role="alert">
              {erro}
            </p>
          )}

          {itens.length === 0 ? (
            <p className="py-12 text-center text-slate-500">{t('vazio')}</p>
          ) : (
            <>
              <div
                data-barra-grade
                className={`sticky top-0 z-40 -mx-6 mb-2 mt-3 px-6 py-2 transition-[background-color,box-shadow,border-color] duration-200 ${
                  barraRolada
                    ? 'border-b border-base-border/70 bg-base/85 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)] backdrop-blur-md'
                    : 'border-b border-transparent bg-base'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-8 items-center rounded-full bg-brand/10 px-3 text-xs font-medium text-brand-300">
                    {t('quantidade', { quantidade: itens.length })}
                  </span>

                  <div className="flex h-8 items-center gap-1 rounded-lg border border-base-border bg-base-surface/50 px-1.5">
                    {!barraRolada && <span className="px-1 text-[11px] font-medium text-slate-400">{tPesquisa('selecaoLabel')}</span>}
                    <button type="button" onClick={selecionarTodas} className="rounded-md px-2 py-0.5 text-xs text-slate-300 hover:bg-white/5 hover:text-brand-300">
                      {tPesquisa('selecionarTodas', { quantidade: itens.length })}
                    </button>
                    {[10, 15, 20, 25].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => selecionarMais(n)}
                        className="rounded-md px-1.5 py-0.5 text-xs text-slate-300 hover:bg-white/5 hover:text-brand-300"
                      >
                        +{n}
                      </button>
                    ))}
                    <span className="mx-0.5 h-4 w-px bg-base-border" aria-hidden="true" />
                    <input
                      type="number"
                      min={1}
                      max={itens.length}
                      value={quantidadeLote}
                      onChange={(e) => setQuantidadeLote(Number(e.target.value))}
                      aria-label={tPesquisa('selecionarMaisBotao')}
                      className="w-12 rounded-md border border-base-border bg-base-surface2 px-1.5 py-0.5 text-xs text-slate-100 outline-hidden focus:border-brand"
                    />
                    <button
                      type="button"
                      onClick={() => selecionarMais(quantidadeLote)}
                      className="rounded-md px-2 py-0.5 text-xs text-slate-300 hover:bg-white/5 hover:text-brand-300"
                    >
                      {tPesquisa('selecionarMaisBotao')}
                    </button>
                    {temSelecao && (
                      <>
                        <span className="mx-0.5 h-4 w-px bg-base-border" aria-hidden="true" />
                        <button
                          type="button"
                          onClick={() => setSelecionados([])}
                          className="rounded-md px-2 py-0.5 text-xs text-slate-400 hover:bg-white/5 hover:text-status-danger"
                        >
                          {tPesquisa('limparSelecao')}
                        </button>
                      </>
                    )}
                  </div>

                  <div className="ml-auto flex flex-wrap items-center gap-1.5">
                    <MenuSalvarMinhasImagens grupos={gruposAcoes} enxuto soIcone={barraRolada} />
                    <MenuSalvarComo grupos={gruposAcoes} enxuto soIcone={barraRolada} />
                    <MenuImpressao grupos={gruposAcoes} enxuto soIcone={barraRolada} />
                    {temSelecao && (
                      <button
                        type="button"
                        onClick={() => setIndiceVisualizador(0)}
                        className="flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-semibold text-white shadow-glow transition hover:bg-brand-hover"
                      >
                        ▶{' '}
                        {barraRolada
                          ? tPesquisa('verSelecionadasCurto', { quantidade: selecionados.length })
                          : selecionados.length > 1
                            ? tPesquisa('verSelecionadasPlural', { quantidade: selecionados.length })
                            : tPesquisa('verSelecionadasSingular', { quantidade: selecionados.length })}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* caixa propria da grade: a largura dela (sem o espaco das margens) decide o tamanho dos quadrados */}
              <div>
              <div
                ref={gradeRef}
                className="grid grid-cols-2 justify-center gap-3 pb-2 sm:grid-cols-3 md:grid-cols-5"
                style={ladoCartao ? { gridTemplateColumns: `repeat(5, ${ladoCartao}px)` } : undefined}
              >
                {itens.map((item, indice) => {
                  const marcada = selecionados.includes(item.id)
                  const ampliado = cartaoAmpliado === item.id
                  const infoFixada = infoFixadas.includes(item.id)
                  const infoAberta = infoFixada || infoPassando === item.id
                  const formas = item.marcacoes ?? []
                  const mostrandoMarcacoes = marcacoesVisiveis.includes(item.id) && formas.length > 0
                  const proporcao = proporcoes[item.curation_id]
                  const linhasInfo = infoAberta ? descrever({ ...item, numero: indice + 1 }) : []
                  const icone =
                    'flex items-center rounded-full border bg-white/90 px-1.5 py-0.5 backdrop-blur-sm dark:bg-black/70'
                  return (
                    <div key={item.id} className="relative aspect-square">
                      <div
                        data-cartao-imagem
                        onMouseLeave={() => {
                          if (ampliado) setAmpliacao(null)
                        }}
                        style={
                          ampliado && ampliacao
                            ? { transformOrigin: ampliacao.origemQuadro, transform: `translate(${ampliacao.dx}px, ${ampliacao.dy}px) scale(2)` }
                            : undefined
                        }
                        className={`absolute inset-0 rounded-lg border bg-black transition-transform duration-200 motion-reduce:transition-none ${
                          ampliado ? 'z-30 shadow-2xl' : 'z-0'
                        } ${marcada ? 'border-brand ring-2 ring-brand/60' : ampliado ? 'border-brand/60' : 'border-base-border'}`}
                      >
                        <div role="img" aria-label={t('imagem', { numero: indice + 1 })} className="relative block h-full w-full overflow-hidden rounded-lg">
                          <MiniaturaImagem
                            curationId={item.curation_id}
                            tamanho="miniatura"
                            alt={item.descricao_didatica ?? t('imagem', { numero: indice + 1 })}
                            className="h-full w-full bg-black object-contain"
                            onProporcao={(r) =>
                              setProporcoes((atual) => (atual[item.curation_id] === r ? atual : { ...atual, [item.curation_id]: r }))
                            }
                          />
                          {ampliadasCarregadas.includes(item.id) && (
                            <MiniaturaImagem
                              curationId={item.curation_id}
                              tamanho="ampliada"
                              transparenteAoCarregar
                              alt=""
                              className={`absolute inset-0 h-full w-full object-contain transition-opacity ${ampliado ? 'opacity-100' : 'opacity-0'}`}
                            />
                          )}
                        </div>

                        {/* pintura das estruturas (por baixo das marcacoes) */}
                        {pintura.visivel(item.curation_id) && proporcao && (
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden rounded-lg">
                            <div
                              className="relative max-h-full max-w-full"
                              style={{ aspectRatio: String(proporcao), width: proporcao >= 1 ? '100%' : 'auto', height: proporcao >= 1 ? 'auto' : '100%' }}
                            >
                              <CamadaSegmentacoes segmentacoes={pintura.dados(item.curation_id)} />
                            </div>
                          </div>
                        )}

                        {mostrandoMarcacoes && proporcao && (
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden rounded-lg">
                            <div
                              className="relative max-h-full max-w-full"
                              style={{ aspectRatio: String(proporcao), width: proporcao >= 1 ? '100%' : 'auto', height: proporcao >= 1 ? 'auto' : '100%' }}
                            >
                              <CamadaMarcacoes marcacoes={formas} estilo="discreto" holofoteLigado={holofotesLigados.includes(item.id)} />
                            </div>
                          </div>
                        )}

                        {/* quem compartilhou (e "Nova"), no canto de cima */}
                        <div className={`absolute left-1 top-1 z-10 flex max-w-[78%] items-center gap-1 transition-opacity ${infoAberta || ampliado ? 'opacity-0' : ''}`}>
                          {item.novo && <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-black">{t('nova')}</span>}
                          <span className="truncate rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-slate-100" title={`${t('de')} ${item.remetente_nome}`}>
                            {t('de')} <span className="font-semibold">{item.remetente_nome}</span>
                          </span>
                        </div>

                        {/* informacoes: cobrem o quadrado inteiro */}
                        {infoAberta && (
                          <div
                            role="tooltip"
                            className="absolute inset-0 z-10 overflow-y-auto rounded-lg border border-teal-300/50 bg-base-surface/95 p-2 pb-8 text-left text-[11px] leading-snug shadow-xl backdrop-blur-sm"
                          >
                            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-200">
                              {tMarcacoes('tituloImagem', { numero: indice + 1 })}
                            </p>
                            <p className="mb-1 text-slate-400">
                              {t('de')} <span className="font-semibold text-ink">{item.remetente_nome}</span>
                              {item.compartilhado_em && <> · {dataCurta(item.compartilhado_em)}</>}
                            </p>
                            {item.mensagem && <p className="mb-1 border-l-2 border-sky-400/60 pl-1.5 italic text-ink">“{item.mensagem}”</p>}
                            <p className="mb-1.5 text-slate-500">
                              {t('anotacoes', { quantidade: item.quantidade_anotacoes })}
                              {item.quantidade_anotacoes > 0 && <> · {t('anotacoesNoVisualizador')}</>}
                            </p>
                            {linhasInfo.length === 0 ? (
                              <p className="italic text-slate-400">{tMarcacoes('semDescricao')}</p>
                            ) : (
                              <dl className="space-y-0.5">
                                {linhasInfo.map((l) => (
                                  <div key={l.rotulo}>
                                    <dt className="inline font-semibold text-slate-400">{l.rotulo}: </dt>
                                    <dd className="inline whitespace-pre-line text-ink">{l.valor}</dd>
                                  </div>
                                ))}
                              </dl>
                            )}
                          </div>
                        )}

                        <label
                          className={`absolute right-1 top-1 z-20 flex h-5 w-5 origin-top-right cursor-pointer items-center justify-center rounded-md bg-black/70 transition-transform duration-200 ${
                            ampliado ? 'scale-50' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={marcada}
                            onChange={() => alternarSelecao(item.id)}
                            aria-label={tPesquisa('selecionarImagem', { numero: indice + 1 })}
                            className="h-3.5 w-3.5 accent-brand"
                          />
                        </label>

                        <div
                          style={
                            ampliado && ampliacao
                              ? {
                                  // icones SEMPRE no canto de baixo a direita, no mesmo tamanho
                                  transformOrigin: 'bottom right',
                                  transform: 'scale(0.5)',
                                }
                              : undefined
                          }
                          className="absolute bottom-1 right-1 z-20 flex items-center gap-1 transition-transform duration-200"
                        >
                          {/* marcacoes do curador */}
                          <button
                            type="button"
                            disabled={formas.length === 0}
                            onClick={() =>
                              setMarcacoesVisiveis((lista) => (lista.includes(item.id) ? lista.filter((x) => x !== item.id) : [...lista, item.id]))
                            }
                            aria-pressed={mostrandoMarcacoes}
                            title={
                              formas.length === 0
                                ? tPesquisa('marcacoesNaImagem', { total: 0 })
                                : mostrandoMarcacoes
                                  ? tPesquisa('esconderMarcacoes', { total: formas.length })
                                  : tPesquisa('mostrarMarcacoes', { total: formas.length })
                            }
                            className={`flex items-center gap-0.5 rounded-full border bg-white/90 px-1.5 py-0.5 text-[11px] font-semibold backdrop-blur-sm disabled:cursor-default dark:bg-black/70 ${
                              mostrandoMarcacoes
                                ? 'border-amber-500 text-amber-800 ring-2 ring-amber-300/70 dark:border-amber-300 dark:text-amber-100'
                                : formas.length > 0
                                  ? 'border-amber-500/70 text-amber-800 hover:border-amber-500 dark:border-amber-300/60 dark:text-amber-200 dark:hover:border-amber-300'
                                  : 'border-slate-400/50 text-slate-500 dark:border-slate-500/50 dark:text-slate-400'
                            }`}
                          >
                            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z" />
                              <circle cx="12" cy="11" r="2" />
                            </svg>
                            {formas.length}
                          </button>
                          {/* pintura das estruturas */}
                          {(item.total_segmentacoes ?? 0) > 0 && (
                            <BotaoPintura
                              total={item.total_segmentacoes ?? 0}
                              ligado={pintura.visivel(item.curation_id)}
                              onAlternar={() => pintura.alternar(item.curation_id)}
                            />
                          )}
                          {/* holofote: escurece fora das marcacoes */}
                          {mostrandoMarcacoes && (
                            <BotaoHolofote
                              ligado={holofotesLigados.includes(item.id)}
                              onAlternar={() =>
                                setHolofotesLigados((lista) => (lista.includes(item.id) ? lista.filter((x) => x !== item.id) : [...lista, item.id]))
                              }
                            />
                          )}
                          {/* "i": informacoes (mouse em cima mostra; clique fixa) */}
                          <button
                            type="button"
                            onMouseEnter={() => setInfoPassando(item.id)}
                            onMouseLeave={() => setInfoPassando((v) => (v === item.id ? null : v))}
                            onClick={() => {
                              setInfoFixadas((lista) => (lista.includes(item.id) ? lista.filter((x) => x !== item.id) : [...lista, item.id]))
                              if (infoFixada) setInfoPassando(null)
                            }}
                            aria-pressed={infoFixada}
                            aria-expanded={infoAberta}
                            title={infoFixada ? tMarcacoes('fecharDescricao') : tMarcacoes('abrirDescricao')}
                            aria-label={infoFixada ? tMarcacoes('fecharDescricao') : tMarcacoes('abrirDescricao')}
                            className={`${icone} ${
                              infoFixada
                                ? 'border-teal-500 text-teal-700 ring-2 ring-teal-300/70 dark:border-teal-300 dark:text-teal-100'
                                : 'border-teal-600/50 text-teal-800 hover:border-teal-600 dark:border-teal-300/50 dark:text-teal-100 dark:hover:border-teal-300'
                            }`}
                          >
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                              <circle cx="12" cy="12" r="9" />
                              <path d="M12 11v6M12 7.5v.5" strokeLinecap="round" />
                            </svg>
                          </button>
                          {/* lupa: mouse em cima dobra o quadrado */}
                          <button
                            type="button"
                            onMouseEnter={(e) => {
                              if (!ampliado) setAmpliacao(calcularAmpliacao(item.id, e.currentTarget))
                              setAmpliadasCarregadas((lista) => (lista.includes(item.id) ? lista : [...lista, item.id]))
                            }}
                            onClick={(e) => {
                              e.preventDefault()
                              setAmpliadasCarregadas((lista) => (lista.includes(item.id) ? lista : [...lista, item.id]))
                              setAmpliacao(ampliado ? null : calcularAmpliacao(item.id, e.currentTarget))
                            }}
                            title={tPesquisa('ampliarImagem')}
                            aria-label={tPesquisa('ampliarImagem')}
                            aria-pressed={ampliado}
                            className={`${icone} border-teal-600/50 text-teal-800 hover:border-teal-600 dark:border-teal-300/50 dark:text-teal-100 dark:hover:border-teal-300`}
                          >
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                              <circle cx="11" cy="11" r="6.5" />
                              <path d="M20 20l-4.2-4.2M11 8.5v5M8.5 11h5" />
                            </svg>
                          </button>
                          {/* responder a quem compartilhou */}
                          <ResponderCompartilhamento compartilhamentoId={item.id} remetenteNome={item.remetente_nome} compacto />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              </div>
            </>
          )}
        </main>
      </div>

      {indiceVisualizador !== null && itensSelecionados.length > 0 && (
        <VisualizadorSequencial itens={itensSelecionados} indiceInicial={indiceVisualizador} onFechar={() => setIndiceVisualizador(null)} />
      )}
    </div>
  )
}
