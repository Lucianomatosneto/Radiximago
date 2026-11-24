'use client'

// MARCAR LESAO NA TOMOGRAFIA - NO CORTE (pedido do Luciano, 23/11/2026,
// "opcao 1"): o curador escolhe o PLANO (axial, sagital ou coronal), passa
// os CORTES ate onde a lesao aparece melhor e desenha como nas radiografias
// (o mesmo MarcadorAchado: oval, retangulo, seta).
// - a imagem do corte vem de GET /reconstrucao/{ref}/plano.png (pixels
//   quadrados em mm; no sagital e no coronal o alto da cabeca fica em cima);
// - cada marcacao nova leva o plano e o numero do corte (Marcacao.plano /
//   Marcacao.corte); so aparecem as do corte aberto;
// - a lista "Marcações do exame" mostra todas; "Ir" abre o corte de cada uma.
//
// RECURSOS DOS GRANDES SISTEMAS (24/11/2026, pedido do Luciano: "os
// melhores sistemas mundiais, praticidade, ensino, pesquisa e pronto para
// a IA"):
// - navegacao: roda/setas = 1 corte; PageUp/PageDown = 10; Home/End = primeiro
//   e ultimo; cada plano mostra quantas marcacoes tem;
// - ver melhor: zoom (botoes ou Ctrl + roda, em volta do mouse), deslocar
//   (arrastar com o botao do MEIO), brilho/contraste (arrastar com o botao
//   DIREITO: para cima/baixo = brilho, para os lados = contraste), inverter.
//   O botao esquerdo continua desenhando as marcacoes;
// - medir: regua (mm) e angulo (graus) no corte. Com a ficha ligada
//   (medidas + onMedir, 24/11/2026, recurso 6) as medidas viram DADO DA
//   FICHA (curations.medidas: tipo, plano, corte, pontos; o valor e
//   calculado pela geometria); sem ela, ficam so na tela
//   (nao entram na ficha) e ficam no corte em que foram feitas; Esc sai;
// - exportar: as marcacoes do exame em mm num JSON aberto (lib/tomografia.ts),
//   para pesquisa e para treinar/avaliar IA no futuro. Nao e laudo.

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import MarcadorAchado from './MarcadorAchado'
import LocalizadorTomografia from './LocalizadorTomografia'
import TresPlanosTomografia, { type Cursor3d } from './TresPlanosTomografia'
import MedidasTomografia, { type FerramentaMedida, type Medida } from './MedidasTomografia'
import { fetchOuNulo } from '../../lib/fetchSeguro'
import type { Marcacao } from '../../lib/marcacoes'
import { campoDuvidosoCm, exportarMarcacoesTc, tamanhoDoPlanoMm, valorDaMedida, type GeometriaTomografia, type MedidaFicha } from '../../lib/tomografia'

const API = process.env.NEXT_PUBLIC_API_URL

type Plano = 'axial' | 'sagital' | 'coronal'
const PLANOS: Plano[] = ['axial', 'sagital', 'coronal']

const totalNoPlano = (g: GeometriaTomografia, p: Plano) => (p === 'axial' ? g.cortes : p === 'sagital' ? g.colunas : g.linhas)

const ZOOM_MAX = 8
const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export default function MarcadorTomografia({
  orthancReferenceId,
  marcacoes,
  onMarcar,
  onCarregou,
  medidas: medidasDaFicha,
  onMedir,
}: {
  orthancReferenceId: number
  marcacoes: Marcacao[]
  onMarcar: (marcacoes: Marcacao[]) => void
  onCarregou?: () => void
  /** medidas gravadas na ficha (recurso 6); com onMedir, viram dado da ficha */
  medidas?: MedidaFicha[]
  onMedir?: (medidas: MedidaFicha[]) => void
}) {
  const t = useTranslations('Curadoria.marcadorTomografia')
  const formato = useFormatter()
  const [geo, setGeo] = useState<GeometriaTomografia | null>(null)
  const [erro, setErro] = useState('')
  const [plano, setPlano] = useState<Plano>('axial')
  const [corte, setCorte] = useState(0)
  // TRES PLANOS (24/11/2026, recurso 7): cursor 3D comum aos tres quadros;
  // a coordenada do plano principal e sempre o corte aberto
  const [tresPlanos, setTresPlanos] = useState(false)
  const [cursor, setCursor] = useState<Cursor3d>({ coluna: 0, linha: 0, corte: 0 })
  const passarRef = useRef<(sentido: number) => void>(() => {})

  // ver melhor (so na tela; as marcacoes continuam nas mesmas coordenadas)
  const [zoom, setZoom] = useState(1)
  const [desloc, setDesloc] = useState({ x: 0, y: 0 })
  const [brilho, setBrilho] = useState(1)
  const [contraste, setContraste] = useState(1)
  const [invertido, setInvertido] = useState(false)
  const zoomRef = useRef({ zoom: 1, desloc: { x: 0, y: 0 } })
  zoomRef.current = { zoom, desloc }
  const arrastoRef = useRef<{ botao: number; x: number; y: number } | null>(null)

  // medidas da tela, por plano e corte
  const [ferramenta, setFerramenta] = useState<FerramentaMedida | null>(null)
  const [medidas, setMedidas] = useState<Record<string, Medida[]>>({})

  useEffect(() => {
    let vivo = true
    void (async () => {
      const r = await fetchOuNulo(`${API}/reconstrucao/${orthancReferenceId}/geometria`, { credentials: 'include' })
      if (!vivo) return
      if (!r || !r.ok) {
        setErro(t('erroCarregar'))
        return
      }
      const g: GeometriaTomografia = await r.json()
      if (!vivo) return
      setGeo(g)
      setCorte(Math.floor(g.cortes / 2))
      setCursor({ coluna: Math.floor(g.colunas / 2), linha: Math.floor(g.linhas / 2), corte: Math.floor(g.cortes / 2) })
    })()
    return () => {
      vivo = false
    }
  }, [orthancReferenceId, t])

  const total = geo ? totalNoPlano(geo, plano) : 0

  const irAoCorte = useCallback((n: number) => setCorte(limitar(n, 0, Math.max(0, total - 1))), [total])
  const passar = useCallback(
    (sentido: number) => setCorte((c) => limitar(c + sentido, 0, Math.max(0, total - 1))),
    [total],
  )

  passarRef.current = passar

  // zoom em volta de um ponto da area (o ponto embaixo do mouse fica parado)
  const aplicarZoom = useCallback((fator: number, cx = 0, cy = 0) => {
    const { zoom: z, desloc: d } = zoomRef.current
    const novo = limitar(Math.round(z * fator * 100) / 100, 1, ZOOM_MAX)
    if (novo === z) return
    if (novo === 1) {
      setZoom(1)
      setDesloc({ x: 0, y: 0 })
      return
    }
    setZoom(novo)
    setDesloc({ x: cx - ((cx - d.x) * novo) / z, y: cy - ((cy - d.y) * novo) / z })
  }, [])

  // roda do mouse: para cima avanca um corte; com Ctrl, zoom. Nao rola a
  // pagina. O ouvinte entra assim que a area aparece (ref de funcao), sem
  // esperar efeito, e e "passive: false" para poder cancelar a rolagem.
  const areaRef = useCallback(
    (area: HTMLDivElement | null) => {
      if (!area) return
      area.addEventListener(
        'wheel',
        (e: WheelEvent) => {
          e.preventDefault()
          if (e.deltaY === 0) return
          if (e.ctrlKey || e.metaKey) {
            const caixa = area.getBoundingClientRect()
            aplicarZoom(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - caixa.left, e.clientY - caixa.top)
          } else passarRef.current(e.deltaY < 0 ? 1 : -1)
        },
        { passive: false },
      )
    },
    [aplicarZoom],
  )

  function aoApertar(e: MouseEvent<HTMLDivElement>) {
    // clicar na imagem da o foco a area: setas e atalhos passam a valer
    e.currentTarget.focus({ preventScroll: true })
    if (e.button === 0) return // o esquerdo e das marcacoes e das medidas
    e.preventDefault()
    arrastoRef.current = { botao: e.button, x: e.clientX, y: e.clientY }
  }
  function aoMover(e: MouseEvent<HTMLDivElement>) {
    const a = arrastoRef.current
    if (!a) return
    const dx = e.clientX - a.x
    const dy = e.clientY - a.y
    a.x = e.clientX
    a.y = e.clientY
    if (a.botao === 2) {
      setContraste((c) => limitar(c * Math.exp(dx / 200), 0.2, 4))
      setBrilho((b) => limitar(b * Math.exp(-dy / 200), 0.2, 4))
    } else {
      setDesloc((d) => ({ x: d.x + dx, y: d.y + dy }))
    }
  }
  function aoSoltar() {
    arrastoRef.current = null
  }

  // coordenada do cursor que corresponde ao corte de cada plano
  const CAMPO: Record<Plano, keyof Cursor3d> = { axial: 'corte', sagital: 'coluna', coronal: 'linha' }
  const cursorEfetivo: Cursor3d = { ...cursor, [CAMPO[plano]]: corte }

  function moverCursor(c: Cursor3d) {
    setCursor(c)
    setCorte(c[CAMPO[plano]])
  }

  function planoPrincipalNoCursor(p: Plano) {
    setCursor(cursorEfetivo)
    setPlano(p)
    setCorte(cursorEfetivo[CAMPO[p]])
  }

  function trocarPlano(p: Plano) {
    if (!geo || p === plano) return
    setPlano(p)
    setCorte(Math.floor(totalNoPlano(geo, p) / 2))
  }

  function irPara(m: Marcacao) {
    if (!m.plano || typeof m.corte !== 'number') return
    setPlano(m.plano)
    setCorte(m.corte)
  }

  const doCorte = (m: Marcacao) => m.plano === plano && m.corte === corte
  const visiveis = marcacoes.filter(doCorte)

  function aoMarcar(novas: Marcacao[]) {
    // as do corte aberto sao trocadas pelas novas (com plano e corte); as de
    // outros cortes (e as antigas sem corte) continuam como estavam
    onMarcar([...marcacoes.filter((m) => !doCorte(m)), ...novas.map((m) => ({ ...m, plano, corte }))])
  }

  const chaveCorte = `${plano}:${corte}`
  const naFicha = Boolean(onMedir)
  const medidasDoCorte: Medida[] = naFicha
    ? geo
      ? (medidasDaFicha ?? [])
          .filter((m) => m.plano === plano && m.corte === corte)
          .map((m) => ({ id: m.id, tipo: m.tipo, pontos: m.pontos, valor: valorDaMedida(geo, m) }))
      : []
    : (medidas[chaveCorte] ?? [])

  function novaMedida(m: Medida) {
    if (onMedir) {
      onMedir([...(medidasDaFicha ?? []), { id: m.id, tipo: m.tipo, plano, corte, pontos: m.pontos }])
    } else {
      setMedidas((todas) => ({ ...todas, [chaveCorte]: [...(todas[chaveCorte] ?? []), m] }))
    }
  }

  function limparMedidasDoCorte() {
    if (onMedir) {
      onMedir((medidasDaFicha ?? []).filter((m) => !(m.plano === plano && m.corte === corte)))
      return
    }
    setMedidas((todas) => {
      const resto = { ...todas }
      delete resto[chaveCorte]
      return resto
    })
  }

  function alternarFerramenta(f: FerramentaMedida) {
    setFerramenta((atual) => (atual === f ? null : f))
  }

  const umaCasa = (v: number) => formato.number(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const rotuloMedida = (m: Medida) => (m.tipo === 'regua' ? `${umaCasa(m.valor)} mm` : `${umaCasa(m.valor)}°`)

  function exportar() {
    if (!geo) return
    const doc = exportarMarcacoesTc(orthancReferenceId, geo, marcacoes, naFicha ? (medidasDaFicha ?? []) : [])
    const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `radix-marcacoes-tomografia-${orthancReferenceId}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  if (erro) {
    return (
      <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
        {erro}
      </p>
    )
  }
  if (!geo) return <p className="text-sm text-slate-400">{t('carregando')}</p>

  const nomes: Record<Plano, string> = { axial: t('axial'), sagital: t('sagital'), coronal: t('coronal') }
  const doExame = marcacoes.filter((m) => m.plano && typeof m.corte === 'number')
  const porPlano = (p: Plano) => doExame.filter((m) => m.plano === p).length
  const botaoVer = 'rounded-md border border-base-border px-2 py-0.5 text-xs text-ink-2 hover:border-teal-500'
  const botaoLigado = (ligado: boolean) =>
    `rounded-md border px-2 py-0.5 text-xs ${ligado ? 'border-yellow-400 bg-yellow-400/15 text-yellow-800 dark:text-yellow-200' : 'border-base-border text-ink-2 hover:border-teal-500'}`
  const filtro = `brightness(${Number(brilho.toFixed(3))}) contrast(${Number(contraste.toFixed(3))})${invertido ? ' invert(1)' : ''}`

  return (
    <div className="flex h-full min-h-0 gap-3">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div role="group" aria-label={t('plano')} className="flex gap-1">
            {PLANOS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={plano === p}
                onClick={() => trocarPlano(p)}
                className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${
                  plano === p ? 'border-teal-500 bg-teal-500/15 text-teal-800 dark:text-teal-100' : 'border-base-border text-ink-2 hover:border-teal-500'
                }`}
              >
                {nomes[p]}
                {porPlano(p) > 0 && (
                  <span data-testid={`contagem-${p}`} aria-hidden="true" className="rounded-full bg-teal-600 px-1.5 text-[10px] leading-4 text-white">
                    {porPlano(p)}
                  </span>
                )}
              </button>
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(0, total - 1)}
            value={corte}
            onChange={(e) => setCorte(Number(e.target.value))}
            aria-label={t('corte')}
            className="w-48"
          />
          <span className="tabular-nums text-ink-2">{t('corteDe', { n: corte + 1, total })}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <div role="group" aria-label={t('visualizacao')} className="flex items-center gap-1">
            <button type="button" onClick={() => aplicarZoom(0.8)} aria-label={t('afastar')} title={t('afastar')} className={botaoVer}>
              −
            </button>
            <span className="w-10 text-center tabular-nums text-ink-2">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => aplicarZoom(1.25)} aria-label={t('aproximar')} title={t('aproximar')} className={botaoVer}>
              +
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1)
                setDesloc({ x: 0, y: 0 })
              }}
              className={botaoVer}
            >
              {t('ajustar')}
            </button>
            <button type="button" aria-pressed={invertido} onClick={() => setInvertido((v) => !v)} className={botaoLigado(invertido)}>
              {t('inverter')}
            </button>
            <button
              type="button"
              onClick={() => {
                setBrilho(1)
                setContraste(1)
                setInvertido(false)
              }}
              className={botaoVer}
            >
              {t('restaurarBrilho')}
            </button>
          </div>
          <div role="group" aria-label={t('medir')} className="ml-2 flex items-center gap-1">
            <button type="button" aria-pressed={ferramenta === 'regua'} onClick={() => alternarFerramenta('regua')} className={botaoLigado(ferramenta === 'regua')}>
              {t('regua')}
            </button>
            <button type="button" aria-pressed={ferramenta === 'angulo'} onClick={() => alternarFerramenta('angulo')} className={botaoLigado(ferramenta === 'angulo')}>
              {t('angulo')}
            </button>
          </div>
          <button type="button" aria-pressed={tresPlanos} onClick={() => setTresPlanos((v) => !v)} className={`ml-2 ${botaoLigado(tresPlanos)}`}>
            {t('tresPlanos')}
          </button>
        </div>
        {tresPlanos && (
          <TresPlanosTomografia
            geo={geo}
            urlPlano={(p, i) => `${API}/reconstrucao/${orthancReferenceId}/plano.png?plano=${p}&indice=${i}`}
            cursor={cursorEfetivo}
            onCursor={moverCursor}
            planoPrincipal={plano}
            onEscolherPlano={planoPrincipalNoCursor}
          />
        )}
        <p className="text-xs text-slate-400">{ferramenta ? t(ferramenta === 'regua' ? 'dicaRegua' : 'dicaAngulo') : t('dica')}</p>
        {/* 24/11/2026 (decisao do Luciano, opcao A): exame com medida
            duvidosa (ex.: as tomografias da base publica, pixel de 1 mm) */}
        {campoDuvidosoCm(geo) > 0 && (
          <p role="note" aria-label={t('medidaDuvidosaTitulo')} className="rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-xs text-amber-800 dark:text-amber-200">
            <strong>{t('medidaDuvidosaTitulo')}:</strong> {t('medidaDuvidosa', { cm: campoDuvidosoCm(geo) })}
          </p>
        )}
        <div
          ref={areaRef}
          data-testid="area-tomografia"
          tabIndex={0}
          onMouseDown={aoApertar}
          onMouseMove={aoMover}
          onMouseUp={aoSoltar}
          onMouseLeave={aoSoltar}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            const passos: Record<string, number> = { ArrowUp: 1, ArrowDown: -1, PageUp: 10, PageDown: -10 }
            if (e.key in passos) {
              e.preventDefault()
              passar(passos[e.key])
            } else if (e.key === 'Home') {
              e.preventDefault()
              irAoCorte(0)
            } else if (e.key === 'End') {
              e.preventDefault()
              irAoCorte(total - 1)
            } else if (e.key === 'Escape' && ferramenta) {
              e.preventDefault()
              setFerramenta(null)
            } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
              // atalhos (24/11/2026): A/S/C = plano; R = regua; G = angulo
              const tecla = e.key.toLowerCase()
              const planoDaTecla: Record<string, Plano> = { a: 'axial', s: 'sagital', c: 'coronal' }
              if (tecla in planoDaTecla) {
                e.preventDefault()
                trocarPlano(planoDaTecla[tecla])
              } else if (tecla === 'r' || tecla === 'g') {
                e.preventDefault()
                alternarFerramenta(tecla === 'r' ? 'regua' : 'angulo')
              } else if (tecla === 't') {
                e.preventDefault()
                setTresPlanos((v) => !v)
              }
            }
          }}
          className="min-h-0 flex-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
        >
          <MarcadorAchado
            urlImagem={`${API}/reconstrucao/${orthancReferenceId}/plano.png?plano=${plano}&indice=${corte}`}
            semRecorte
            semAchado
            marcacoes={visiveis}
            onMarcar={aoMarcar}
            onCarregou={onCarregou}
            transformacao={`translate(${Number(desloc.x.toFixed(2))}px, ${Number(desloc.y.toFixed(2))}px) scale(${zoom})`}
            filtroImagem={filtro}
            sobreposicao={
              <MedidasTomografia
                key={chaveCorte}
                modo={ferramenta}
                tamanho={tamanhoDoPlanoMm(geo, plano)}
                medidas={medidasDoCorte}
                rotulo={rotuloMedida}
                onNova={novaMedida}
              />
            }
          />
        </div>
      </div>
      <aside className="w-48 shrink-0 space-y-2 overflow-y-auto text-xs">
        {/* localizador (23/11/2026): onde esta o corte nos outros planos; fica
            no alto da coluna para nao cobrir a barra de formas da imagem */}
        <LocalizadorTomografia refId={orthancReferenceId} geo={geo} plano={plano} corte={corte} onIr={setCorte} posicao="coluna" />
        <h3 className="font-semibold text-ink">{t('marcacoesDoExame')}</h3>
        {doExame.length === 0 ? (
          <p className="text-slate-400">{t('nenhuma')}</p>
        ) : (
          <ul aria-label={t('marcacoesDoExame')} className="space-y-1">
            {doExame.map((m, i) => (
              <li key={m.id} className={`flex items-center justify-between gap-2 rounded border px-2 py-1 ${doCorte(m) ? 'border-teal-500' : 'border-base-border'}`}>
                <span className="text-ink-2">
                  {i + 1}. {nomes[m.plano as Plano]} · {t('corteN', { n: (m.corte ?? 0) + 1 })}
                </span>
                <button type="button" onClick={() => irPara(m)} className="text-teal-300 hover:underline">
                  {t('ir')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={exportar}
          disabled={doExame.length === 0}
          title={t('exportarDica')}
          className="w-full rounded-md border border-teal-500/60 px-2 py-1 text-teal-700 hover:bg-teal-500/10 disabled:cursor-not-allowed disabled:opacity-40 dark:text-teal-200"
        >
          {t('exportar')}
        </button>
        {medidasDoCorte.length > 0 && (
          <>
            <h3 className="pt-1 font-semibold text-ink">{t('medidasDoCorte')}</h3>
            <ul aria-label={t('medidasDoCorte')} className="space-y-1">
              {medidasDoCorte.map((m) => (
                <li key={m.id} className="rounded border border-yellow-400/50 px-2 py-1 text-ink-2">
                  {t(m.tipo === 'regua' ? 'medidaRegua' : 'medidaAngulo', { valor: rotuloMedida(m) })}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={limparMedidasDoCorte}
              className="text-red-500 hover:underline"
            >
              {t('limparMedidas')}
            </button>
            <p className="text-[10px] text-slate-400">{t(naFicha ? 'medidasNaFicha' : 'medidasSoNaTela')}</p>
          </>
        )}
      </aside>
    </div>
  )
}
