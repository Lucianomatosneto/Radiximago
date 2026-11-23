'use client'

// RECONSTRUCAO PANORAMICA DA TOMOGRAFIA - tracar a curva (pedido do
// Luciano, 23/11/2026; etapa 3). O curador:
// 1. escolhe a altura do corte axial (e a espessura da faixa MIP, que junta
//    alguns milimetros para a arcada inteira aparecer);
// 2. clica pontos ao longo da arcada (de um lado ao outro);
// 3. ajusta a faixa da panoramica, o intervalo e a largura dos cortes
//    transversais e gera (POST /reconstrucao/{ref}).
// O resultado vira series novas no mesmo exame (visualizar e ensinar): no
// visualizador, painel "Tomografia" → Reconstrucao.
// Canal mandibular (23/11/2026): em cada reconstrucao feita, "Marcar canal
// mandibular" abre a panoramica para tracar o canal (MarcarCanal).

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import Topbar from '../../../components/Topbar'
import AvisoSemConexao from '../../../components/AvisoSemConexao'
import { useVerificarSessao } from '../../../lib/useVerificarSessao'
import { fetchOuNulo } from '../../../lib/fetchSeguro'
import MarcarCanal from '../../../components/curadoria/MarcarCanal'

const API = process.env.NEXT_PUBLIC_API_URL
const PERFIS_PERMITIDOS = ['curador', 'administrador']

interface Geometria {
  cortes: number
  linhas: number
  colunas: number
  espacamento_mm: [number, number, number]
  altura_mm: number
  limites: { espessura_mm: [number, number]; intervalo_mm: [number, number]; largura_mm: [number, number] }
}

interface Reconstrucao {
  id: number
  criado_em: string | null
  total_cortes: number
  tamanho_pixel_mm: number
  parametros: { espessura_mm: number; intervalo_mm: number; largura_mm: number }
  canal?: { tracados: [number, number][][] } | null
}

async function lerErro(r: Response, padrao: string): Promise<string> {
  try {
    const corpo = await r.json()
    if (typeof corpo?.detail === 'string') return corpo.detail
  } catch {
    // sem corpo legivel
  }
  return padrao
}

const arred = (n: number) => Math.round(n * 10) / 10

// previa da curva: a mesma spline de Catmull-Rom centripeta do servidor
// (backend/app/modules/reconstrucao/motor.py), so para desenhar
function curvaSuave(p: [number, number][], porTrecho = 16): [number, number][] {
  if (p.length < 3) return p
  const q: [number, number][] = [
    [2 * p[0][0] - p[1][0], 2 * p[0][1] - p[1][1]],
    ...p,
    [2 * p[p.length - 1][0] - p[p.length - 2][0], 2 * p[p.length - 1][1] - p[p.length - 2][1]],
  ]
  const dist = (a: [number, number], b: [number, number]) => Math.max(Math.hypot(a[0] - b[0], a[1] - b[1]) ** 0.5, 1e-6)
  const mistura = (a: [number, number], b: [number, number], ta: number, tb: number, t: number): [number, number] => [
    ((tb - t) / (tb - ta)) * a[0] + ((t - ta) / (tb - ta)) * b[0],
    ((tb - t) / (tb - ta)) * a[1] + ((t - ta) / (tb - ta)) * b[1],
  ]
  const saida: [number, number][] = []
  for (let i = 1; i < q.length - 2; i++) {
    const [p0, p1, p2, p3] = [q[i - 1], q[i], q[i + 1], q[i + 2]]
    const t0 = 0
    const t1 = t0 + dist(p0, p1)
    const t2 = t1 + dist(p1, p2)
    const t3 = t2 + dist(p2, p3)
    for (let k = 0; k < porTrecho; k++) {
      const t = t1 + ((t2 - t1) * k) / porTrecho
      const a1 = mistura(p0, p1, t0, t1, t)
      const a2 = mistura(p1, p2, t1, t2, t)
      const a3 = mistura(p2, p3, t2, t3, t)
      saida.push(mistura(mistura(a1, a2, t0, t2, t), mistura(a2, a3, t1, t3, t), t1, t2, t))
    }
  }
  saida.push(p[p.length - 1])
  return saida
}

export default function ReconstrucaoPage() {
  const router = useRouter()
  const t = useTranslations('Reconstrucao')
  const tComum = useTranslations('Comum')
  const [ref, setRef] = useState<number | null>(null)
  const [geo, setGeo] = useState<Geometria | null>(null)
  const [lista, setLista] = useState<Reconstrucao[]>([])
  const [altura, setAltura] = useState(0)
  const [faixaAxial, setFaixaAxial] = useState(10)
  const [pontos, setPontos] = useState<[number, number][]>([])
  const [espessura, setEspessura] = useState(10)
  const [intervalo, setIntervalo] = useState(1)
  const [largura, setLargura] = useState(40)
  const [gerando, setGerando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [erro, setErro] = useState('')
  const [canalDe, setCanalDe] = useState<number | null>(null)
  // visualizacao da imagem (23/11/2026, pedido do Luciano): zoom,
  // deslocamento e brilho/contraste - so na tela; os pontos continuam em
  // pixels do corte
  const [zoom, setZoom] = useState(1)
  const [desloc, setDesloc] = useState({ x: 0, y: 0 })
  const [brilho, setBrilho] = useState(1)
  const [contraste, setContraste] = useState(1)
  const arrastoRef = useRef<{ botao: number; x: number; y: number; moveu: boolean } | null>(null)
  const arrastouRef = useRef(false)
  const zoomRef = useRef({ zoom: 1, desloc: { x: 0, y: 0 } })
  zoomRef.current = { zoom, desloc }

  // passar os cortes axiais (23/11/2026, pedido do Luciano): um corte
  // (espacamento entre cortes) por vez, entre o primeiro e o ultimo
  const passarCortes = useCallback(
    (sentido: number) => {
      if (!geo) return
      const passo = Math.max(geo.espacamento_mm[0], 0.1)
      setAltura((a) => arred(Math.min(geo.altura_mm, Math.max(0, a + sentido * passo))))
    },
    [geo],
  )

  const passarRef = useRef(passarCortes)
  passarRef.current = passarCortes

  // zoom em volta de um ponto da janela (o ponto embaixo do mouse fica parado)
  const aplicarZoom = useCallback((fator: number, cx = 0, cy = 0) => {
    const { zoom: z, desloc: d } = zoomRef.current
    const novo = Math.min(8, Math.max(1, Math.round(z * fator * 100) / 100))
    if (novo === z) return
    if (novo === 1) {
      setZoom(1)
      setDesloc({ x: 0, y: 0 })
      return
    }
    setZoom(novo)
    setDesloc({ x: cx - ((cx - d.x) * novo) / z, y: cy - ((cy - d.y) * novo) / z })
  }, [])

  // roda do mouse sobre a imagem: passa os cortes; com Ctrl, zoom. O ouvinte
  // entra assim que a janela aparece (ref de funcao) e e "passive: false"
  // para poder cancelar a rolagem da pagina.
  const janelaRef = useCallback(
    (janela: HTMLDivElement | null) => {
      if (!janela) return
      janela.addEventListener(
        'wheel',
        (e: WheelEvent) => {
          e.preventDefault()
          if (e.deltaY === 0) return
          if (e.ctrlKey || e.metaKey) {
            const caixa = janela.getBoundingClientRect()
            aplicarZoom(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - caixa.left, e.clientY - caixa.top)
          } else passarRef.current(e.deltaY < 0 ? 1 : -1)
        },
        { passive: false },
      )
    },
    [aplicarZoom],
  )

  // arrastar: botao esquerdo ou do meio desloca; botao direito muda brilho
  // (para cima/baixo) e contraste (para os lados). Um clique sem arrastar
  // continua marcando ponto.
  function aoApertar(e: MouseEvent<HTMLDivElement>) {
    arrastoRef.current = { botao: e.button, x: e.clientX, y: e.clientY, moveu: false }
    arrastouRef.current = false
  }
  function aoMover(e: MouseEvent<HTMLDivElement>) {
    const a = arrastoRef.current
    if (!a) return
    const dx = e.clientX - a.x
    const dy = e.clientY - a.y
    if (!a.moveu && Math.abs(dx) + Math.abs(dy) < 4) return
    a.moveu = true
    arrastouRef.current = true
    a.x = e.clientX
    a.y = e.clientY
    if (a.botao === 2) {
      setContraste((c) => Math.min(4, Math.max(0.2, c * Math.exp(dx / 200))))
      setBrilho((b) => Math.min(4, Math.max(0.2, b * Math.exp(-dy / 200))))
    } else {
      setDesloc((d) => ({ x: d.x + dx, y: d.y + dy }))
    }
  }
  function aoSoltar() {
    arrastoRef.current = null
  }

  const { semConexao, verificando, tentarDeNovo } = useVerificarSessao((sessao) => {
    if (!PERFIS_PERMITIDOS.includes(sessao.perfil)) {
      router.push('/acesso-negado?de=/curadoria/reconstrucao')
      return
    }
    const id = Number(new URLSearchParams(window.location.search).get('ref'))
    if (!Number.isInteger(id) || id <= 0) {
      setErro(t('semImagem'))
      return
    }
    setRef(id)
    void carregar(id)
  })

  async function carregar(id: number) {
    const r = await fetchOuNulo(`${API}/reconstrucao/${id}/geometria`, { credentials: 'include' })
    if (!r) {
      setErro(tComum('semConexao'))
      return
    }
    if (!r.ok) {
      setErro(await lerErro(r, t('erroCarregar')))
      return
    }
    const g: Geometria = await r.json()
    setGeo(g)
    // comeca perto do meio da altura (regiao das coroas, na maioria das TCFC)
    setAltura(arred(g.altura_mm * 0.45))
    void carregarLista(id)
  }

  async function carregarLista(id: number) {
    const r = await fetchOuNulo(`${API}/reconstrucao/${id}/lista`, { credentials: 'include' })
    if (r?.ok) setLista(await r.json())
  }

  function clicar(e: MouseEvent<HTMLDivElement>) {
    if (!geo) return
    if (arrastouRef.current) {
      arrastouRef.current = false
      return
    }
    const caixa = e.currentTarget.getBoundingClientRect()
    if (!caixa.width || !caixa.height) return
    const coluna = ((e.clientX - caixa.left) / caixa.width) * geo.colunas
    const linha = ((e.clientY - caixa.top) / caixa.height) * geo.linhas
    if (coluna < 0 || linha < 0 || coluna > geo.colunas - 1 || linha > geo.linhas - 1) return
    setPontos((atuais) => [...atuais, [arred(coluna), arred(linha)]])
    setAviso('')
  }

  async function gerar() {
    if (!ref || pontos.length < 3) return
    setGerando(true)
    setErro('')
    setAviso('')
    const r = await fetchOuNulo(`${API}/reconstrucao/${ref}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pontos_px: pontos, espessura_mm: espessura, intervalo_mm: intervalo, largura_mm: largura }),
    })
    setGerando(false)
    if (!r) {
      setErro(tComum('semConexao'))
      return
    }
    if (!r.ok) {
      setErro(await lerErro(r, t('erroGerar')))
      return
    }
    const d = await r.json()
    setAviso(t('pronto', { n: d.total_cortes }))
    void carregarLista(ref)
  }

  if (semConexao) return <AvisoSemConexao aoTentar={tentarDeNovo} ocupado={verificando} />
  if (verificando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-base">
        <p className="text-slate-300">{tComum('carregando')}</p>
      </main>
    )
  }

  const srcAxial = ref && geo ? `${API}/reconstrucao/${ref}/axial.png?altura_mm=${altura}&espessura_mm=${faixaAxial}` : ''
  const textoPontos = pontos.length === 0 ? t('nenhumPonto') : t('pontos', { n: pontos.length })
  const campo = 'w-20 rounded-lg border border-base-border bg-base-surface2 px-2 py-1 text-sm text-ink'
  const botaoVer = 'rounded-md border border-base-border px-2 py-0.5 text-xs text-ink hover:bg-white/5'

  return (
    // sem a coluna de navegacao (23/11/2026, pedido do Luciano): a imagem
    // ganha espaco; "Voltar" leva de volta
    <div className="flex min-h-screen bg-base">
      <div className="flex flex-1 flex-col">
        {/* titulo e explicacao na barra do topo, depois de RADIX IMAGO
            (23/11/2026, pedido do Luciano): a imagem ganha a altura da tela */}
        <Topbar
          acao={
            <div className="flex min-w-0 items-center gap-4">
              <div className="min-w-0">
                <h1 className="text-lg font-semibold leading-tight text-ink">
                  {t('tituloPrefixo')} <span className="text-teal-600 dark:text-teal-300">{t('tituloDestaque')}</span>
                </h1>
                <p className="line-clamp-2 max-w-2xl text-xs text-slate-400">{t('explica')}</p>
              </div>
              <button type="button" onClick={() => router.back()} className="shrink-0 rounded-lg border border-base-border px-3 py-1 text-sm text-ink hover:bg-white/5">
                {t('voltar')}
              </button>
            </div>
          }
        />
        <main className="flex-1 space-y-2 overflow-y-auto px-4 py-2">
          {aviso && (
            <p role="status" className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-700 dark:text-emerald-300">
              {aviso}
            </p>
          )}
          {erro && (
            <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-1.5 text-sm text-red-700 dark:text-red-300">
              {erro}
            </p>
          )}

          {geo && (
            <div className="grid gap-4 lg:grid-cols-[1fr_19rem]">
              <section className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
                  <label className="flex items-center gap-2">
                    {t('altura')}
                    <input
                      type="range"
                      min={0}
                      max={geo.altura_mm}
                      step={0.5}
                      value={altura}
                      onChange={(e) => setAltura(Number(e.target.value))}
                      aria-label={t('altura')}
                      className="w-48"
                    />
                    <span className="tabular-nums">{altura} mm</span>
                  </label>
                  <label className="flex items-center gap-2">
                    {t('faixaAxial')}
                    <input type="number" min={0} max={40} step={1} value={faixaAxial} onChange={(e) => setFaixaAxial(Number(e.target.value))} aria-label={t('faixaAxial')} className={campo} />
                  </label>
                  <div role="group" aria-label={t('visualizacao')} className="flex items-center gap-1">
                    <button type="button" onClick={() => aplicarZoom(0.8)} aria-label={t('afastar')} title={t('afastar')} className={botaoVer}>−</button>
                    <span className="w-12 text-center tabular-nums text-xs">{Math.round(zoom * 100)}%</span>
                    <button type="button" onClick={() => aplicarZoom(1.25)} aria-label={t('aproximar')} title={t('aproximar')} className={botaoVer}>+</button>
                    <button type="button" onClick={() => { setZoom(1); setDesloc({ x: 0, y: 0 }) }} className={botaoVer}>{t('ajustar')}</button>
                    <button type="button" onClick={() => { setBrilho(1); setContraste(1) }} className={botaoVer}>{t('restaurarBrilho')}</button>
                  </div>
                </div>
                <p className="text-xs text-slate-400">{t('dicaCortes')} {t('dicaVer')}</p>
                {/* a janela recorta; dentro dela o quadro (imagem + pontos)
                    recebe zoom e deslocamento. Os pontos usam as MESMAS
                    medidas do corte (viewBox em pixels): o clique vira
                    coluna/linha mesmo com zoom. */}
                <div
                  ref={janelaRef}
                  data-testid="janela-imagem"
                  tabIndex={0}
                  onMouseDown={aoApertar}
                  onMouseMove={aoMover}
                  onMouseUp={aoSoltar}
                  onMouseLeave={aoSoltar}
                  onContextMenu={(e) => e.preventDefault()}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowUp' || e.key === 'PageUp') {
                      e.preventDefault()
                      passarCortes(1)
                    } else if (e.key === 'ArrowDown' || e.key === 'PageDown') {
                      e.preventDefault()
                      passarCortes(-1)
                    }
                  }}
                  className="relative mx-auto w-full overflow-hidden rounded-xl border border-base-border bg-black outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                  style={{ aspectRatio: `${geo.colunas} / ${geo.linhas}`, maxWidth: `calc((100vh - 9.5rem) * ${geo.colunas / geo.linhas})` }}
                >
                <div
                  data-testid="area-curva"
                  onClick={clicar}
                  className="absolute inset-0 cursor-crosshair"
                  style={{ transform: `translate(${desloc.x}px, ${desloc.y}px) scale(${zoom})`, transformOrigin: '0 0' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- PNG gerado pela API com login */}
                  <img
                    src={srcAxial}
                    alt={t('altImagem')}
                    draggable={false}
                    className="absolute inset-0 h-full w-full select-none object-fill"
                    style={{ filter: `brightness(${brilho}) contrast(${contraste})` }}
                  />
                  <svg viewBox={`0 0 ${geo.colunas} ${geo.linhas}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
                    {pontos.length > 1 && (
                      <polyline
                        points={curvaSuave(pontos).map(([x, y]) => `${x},${y}`).join(' ')}
                        fill="none"
                        stroke="#facc15"
                        strokeWidth={Math.max(geo.colunas, geo.linhas) / 300}
                        strokeDasharray={`${Math.max(geo.colunas, geo.linhas) / 100}`}
                      />
                    )}
                    {pontos.map(([x, y], i) => (
                      <circle key={`${x}-${y}-${i}`} cx={x} cy={y} r={Math.max(geo.colunas, geo.linhas) / 120} fill={i === 0 ? '#22c55e' : '#2dd4bf'} stroke="#000" strokeWidth={1} />
                    ))}
                  </svg>
                </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-ink-2">{textoPontos}</span>
                  <button type="button" disabled={!pontos.length} onClick={() => setPontos((p) => p.slice(0, -1))} className="text-teal-300 hover:underline disabled:opacity-40">
                    {t('desfazer')}
                  </button>
                  <button type="button" disabled={!pontos.length} onClick={() => setPontos([])} className="text-slate-400 hover:underline disabled:opacity-40">
                    {t('limpar')}
                  </button>
                </div>
              </section>

              <aside className="space-y-4">
                <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-400">
                  <li>{t('passo1')}</li>
                  <li>{t('passo2')}</li>
                  <li>{t('passo3')}</li>
                </ol>
                <div className="space-y-2 rounded-xl border border-base-border bg-base-surface p-3 text-sm text-ink-2">
                  <label className="flex items-center justify-between gap-2">
                    {t('espessura')}
                    <input type="number" min={geo.limites.espessura_mm[0]} max={geo.limites.espessura_mm[1]} step={0.5} value={espessura} onChange={(e) => setEspessura(Number(e.target.value))} aria-label={t('espessura')} className={campo} />
                  </label>
                  <label className="flex items-center justify-between gap-2">
                    {t('intervalo')}
                    <input type="number" min={geo.limites.intervalo_mm[0]} max={geo.limites.intervalo_mm[1]} step={0.5} value={intervalo} onChange={(e) => setIntervalo(Number(e.target.value))} aria-label={t('intervalo')} className={campo} />
                  </label>
                  <label className="flex items-center justify-between gap-2">
                    {t('largura')}
                    <input type="number" min={geo.limites.largura_mm[0]} max={geo.limites.largura_mm[1]} step={1} value={largura} onChange={(e) => setLargura(Number(e.target.value))} aria-label={t('largura')} className={campo} />
                  </label>
                  <button
                    type="button"
                    disabled={pontos.length < 3 || gerando}
                    onClick={() => void gerar()}
                    className="mt-2 w-full rounded-lg bg-brand px-3 py-2 font-semibold text-white disabled:opacity-40"
                  >
                    {gerando ? t('gerando') : t('gerar')}
                  </button>
                </div>
                {lista.length > 0 && (
                  <div>
                    <h2 className="mb-1 text-sm font-semibold text-ink">{t('feitas')}</h2>
                    <ul aria-label={t('feitas')} className="space-y-3 text-xs text-slate-400">
                      {lista.map((r) => (
                        <li key={r.id}>
                          {t('itemLista', {
                            data: r.criado_em ? new Date(r.criado_em).toLocaleString() : '-',
                            n: r.total_cortes,
                            faixa: r.parametros.espessura_mm,
                            intervalo: r.parametros.intervalo_mm,
                          })}
                          {r.canal && <span className="ml-1 text-amber-500">· {t('canalMarcado')}</span>}
                          <button
                            type="button"
                            onClick={() => setCanalDe(r.id)}
                            className="mt-1 w-full rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
                          >
                            {t('canalMarcar')}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </aside>
            </div>
          )}
          {ref && canalDe !== null && (
            <MarcarCanal key={canalDe} refId={ref} recId={canalDe} aoGravar={() => void carregarLista(ref)} aoFechar={() => setCanalDe(null)} />
          )}
        </main>
      </div>
    </div>
  )
}
