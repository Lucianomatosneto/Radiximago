'use client'

// TOMOGRAFIA CURADA PARA QUEM ESTUDA (pedido do Luciano, 24/11/2026:
// "Lesões marcadas" e "Régua e ângulo"). Fica na tela da imagem aprovada
// (/visualizar/[id]), abaixo do visualizador:
// - so aparece se a imagem for tomografia: GET /search/{id}/tomografia/geometria
//   responde (422 = nao e tomografia -> nada aparece);
// - "Lesões deste exame": as marcacoes do curador que tem plano + corte;
//   abre na primeira; clicar numa leva ao corte dela;
// - o corte vem de GET /search/{id}/tomografia/plano.png (ficha aprovada),
//   com as marcacoes DAQUELE corte desenhadas por cima (CamadaMarcacoes);
// - planos (botoes ou A/S/C), barra, roda do mouse, setas, PageUp/PageDown
//   (10) e Home/End; miniatura localizadora com linha de referencia;
// - regua (mm) e angulo (graus) - os mesmos da curadoria (MedidasTomografia);
//   so na tela; aviso quando a medida do exame e duvidosa.
// - MODO DESAFIO (24/11/2026): as marcacoes e a lista somem; o estudante
//   passa os cortes e clica onde acha que esta cada lesao (no maximo
//   lesoes + 2 palpites); "Revelar resposta" mostra as marcacoes e quantas
//   ele encontrou (lib/tomografia.ts: avaliarDesafio, em 3D e em mm, vale
//   em qualquer plano). Fica so na tela, nada e gravado.

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import CamadaMarcacoes from './CamadaMarcacoes'
import LocalizadorTomografia, { type PlanoTomografia } from '../curadoria/LocalizadorTomografia'
import MedidasTomografia, { type FerramentaMedida, type Medida } from '../curadoria/MedidasTomografia'
import { CHAVE_ACHADO } from '../segundaOpiniao/tipos'
import { fetchOuNulo } from '../../lib/fetchSeguro'
import type { Marcacao } from '../../lib/marcacoes'
import { avaliarDesafio, campoDuvidosoCm, tamanhoDoPlanoMm, type GeometriaTomografia, type Palpite } from '../../lib/tomografia'

const API = process.env.NEXT_PUBLIC_API_URL
const PLANOS: PlanoTomografia[] = ['axial', 'sagital', 'coronal']
const totalNoPlano = (g: GeometriaTomografia, p: PlanoTomografia) => (p === 'axial' ? g.cortes : p === 'sagital' ? g.colunas : g.linhas)
const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export default function LeituraTomografia({ curationId, marcacoes }: { curationId: number; marcacoes: Marcacao[] }) {
  const t = useTranslations('VisualizarImagem.tomografia')
  const tCorte = useTranslations('Curadoria.marcadorTomografia')
  const tAchado = useTranslations('Pesquisa.opcoes.achadoPrincipal')
  const formato = useFormatter()
  const [geo, setGeo] = useState<GeometriaTomografia | null>(null)
  const [plano, setPlano] = useState<PlanoTomografia>('axial')
  const [corte, setCorte] = useState(0)
  const [ferramenta, setFerramenta] = useState<FerramentaMedida | null>(null)
  const [medidas, setMedidas] = useState<Record<string, Medida[]>>({})
  const passarRef = useRef<(sentido: number) => void>(() => {})
  const [desafio, setDesafio] = useState(false)
  const [revelado, setRevelado] = useState(false)
  const [palpites, setPalpites] = useState<Palpite[]>([])

  const lesoes = marcacoes.filter((m) => m.plano && typeof m.corte === 'number')
  const primeira = lesoes[0]

  useEffect(() => {
    let vivo = true
    void (async () => {
      const r = await fetchOuNulo(`${API}/search/${curationId}/tomografia/geometria`, { credentials: 'include' })
      if (!vivo || !r || !r.ok) return // nao e tomografia (ou sem conexao): nada aparece
      const g = (await r.json().catch(() => null)) as GeometriaTomografia | null
      // so segue com uma geometria completa (resposta inesperada: nada aparece)
      const valida =
        g && [g.cortes, g.linhas, g.colunas].every((n) => Number.isInteger(n) && n > 0) &&
        Array.isArray(g.espacamento_mm) && g.espacamento_mm.length === 3
      if (!vivo || !valida) return
      setGeo(g)
      if (primeira?.plano && typeof primeira.corte === 'number') {
        setPlano(primeira.plano)
        setCorte(primeira.corte)
      } else {
        setPlano('axial')
        setCorte(Math.floor(g.cortes / 2))
      }
    })()
    return () => {
      vivo = false
    }
    // abre na primeira lesao so ao carregar o exame
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curationId])

  const total = geo ? totalNoPlano(geo, plano) : 0
  const passar = useCallback((sentido: number) => setCorte((c) => limitar(c + sentido, 0, Math.max(0, total - 1))), [total])
  passarRef.current = passar

  // roda do mouse passa os cortes sem rolar a pagina (ref de funcao: o
  // ouvinte entra assim que a area aparece; passive false para cancelar)
  const areaRef = useCallback((area: HTMLDivElement | null) => {
    if (!area) return
    area.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        e.preventDefault()
        if (e.deltaY !== 0) passarRef.current(e.deltaY < 0 ? 1 : -1)
      },
      { passive: false },
    )
  }, [])

  if (!geo) return null

  function trocarPlano(p: PlanoTomografia) {
    if (!geo || p === plano) return
    setPlano(p)
    setCorte(Math.floor(totalNoPlano(geo, p) / 2))
  }

  function irPara(m: Marcacao) {
    if (!m.plano || typeof m.corte !== 'number') return
    setPlano(m.plano)
    setCorte(m.corte)
  }

  // modo desafio: abre no axial do meio (nao entrega a primeira lesao)
  function alternarDesafio() {
    if (!geo) return
    const ligar = !desafio
    setDesafio(ligar)
    setRevelado(false)
    setPalpites([])
    setFerramenta(null)
    if (ligar) {
      setPlano('axial')
      setCorte(Math.floor(geo.cortes / 2))
    }
  }
  const escondido = desafio && !revelado
  const maxPalpites = lesoes.length + 2
  const resultado = desafio && revelado ? avaliarDesafio(geo, lesoes, palpites) : null
  const encontrada = (id: string) => resultado?.porLesao.find((l) => l.id === id)?.encontrada

  function palpitar(e: MouseEvent<HTMLDivElement>) {
    if (!escondido || palpites.length >= maxPalpites) return
    const caixa = e.currentTarget.getBoundingClientRect()
    if (!caixa.width || !caixa.height) return
    const ponto = {
      x: limitar((e.clientX - caixa.left) / caixa.width, 0, 1),
      y: limitar((e.clientY - caixa.top) / caixa.height, 0, 1),
    }
    setPalpites((ps) => [...ps, { plano, corte, ponto }])
  }

  const urlPlano = (p: PlanoTomografia, i: number) => `${API}/search/${curationId}/tomografia/plano.png?plano=${p}&indice=${i}`
  const doCorte = lesoes.filter((m) => m.plano === plano && m.corte === corte)
  const chaveCorte = `${plano}:${corte}`
  const umaCasa = (v: number) => formato.number(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const rotuloMedida = (m: Medida) => (m.tipo === 'regua' ? `${umaCasa(m.valor)} mm` : `${umaCasa(m.valor)}°`)
  const nomes: Record<PlanoTomografia, string> = { axial: tCorte('axial'), sagital: tCorte('sagital'), coronal: tCorte('coronal') }
  const duvidoso = campoDuvidosoCm(geo)

  function rotuloAchado(m: Marcacao): string {
    if (!m.achado) return ''
    if (m.achado === 'outro' && m.achado_descricao) return m.achado_descricao
    const chave = CHAVE_ACHADO[m.achado]
    return chave ? tAchado(chave) : m.achado
  }

  const botao = (ligado: boolean) =>
    `rounded-md border px-2 py-0.5 text-xs ${ligado ? 'border-yellow-400 bg-yellow-400/15 text-yellow-800 dark:text-yellow-200' : 'border-base-border text-ink-2 hover:border-teal-500'}`

  return (
    <section aria-labelledby="titulo-lesoes-tc" className="mt-4 rounded-2xl border border-base-border bg-base-surface p-4">
      <h2 id="titulo-lesoes-tc" className="mb-3 text-base font-semibold text-ink">
        {t('titulo')}
      </h2>
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <div role="group" aria-label={tCorte('plano')} className="flex gap-1">
              {PLANOS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={plano === p}
                  onClick={() => trocarPlano(p)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    plano === p ? 'border-teal-500 bg-teal-500/15 text-teal-800 dark:text-teal-100' : 'border-base-border text-ink-2 hover:border-teal-500'
                  }`}
                >
                  {nomes[p]}
                </button>
              ))}
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(0, total - 1)}
              value={corte}
              onChange={(e) => setCorte(Number(e.target.value))}
              aria-label={tCorte('corte')}
              className="w-48"
            />
            <span className="tabular-nums text-ink-2">{tCorte('corteDe', { n: corte + 1, total })}</span>
            <div role="group" aria-label={tCorte('medir')} className="flex items-center gap-1">
              <button type="button" disabled={escondido} aria-pressed={ferramenta === 'regua'} onClick={() => setFerramenta((f) => (f === 'regua' ? null : 'regua'))} className={botao(ferramenta === 'regua')}>
                {tCorte('regua')}
              </button>
              <button type="button" disabled={escondido} aria-pressed={ferramenta === 'angulo'} onClick={() => setFerramenta((f) => (f === 'angulo' ? null : 'angulo'))} className={botao(ferramenta === 'angulo')}>
                {tCorte('angulo')}
              </button>
            </div>
            {lesoes.length > 0 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-pressed={desafio}
                  onClick={alternarDesafio}
                  className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${desafio ? 'border-violet-500 bg-violet-500/15 text-violet-800 dark:text-violet-200' : 'border-violet-400/60 text-violet-700 hover:bg-violet-500/10 dark:text-violet-200'}`}
                >
                  {t('desafio')}
                </button>
                {escondido && (
                  <button type="button" onClick={() => setRevelado(true)} className="rounded-md border border-violet-500 bg-violet-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-violet-700">
                    {t('revelar')}
                  </button>
                )}
                {desafio && revelado && (
                  <button type="button" onClick={() => { setRevelado(false); setPalpites([]) }} className="rounded-md border border-violet-500 px-2 py-0.5 text-xs text-violet-700 hover:bg-violet-500/10 dark:text-violet-200">
                    {t('tentarDeNovo')}
                  </button>
                )}
              </div>
            )}
          </div>
          {escondido && <p className="rounded-md bg-violet-500/10 px-2 py-1 text-xs text-violet-800 dark:text-violet-200">{t('desafioInstrucao', { n: lesoes.length })}</p>}
          {resultado && (
            <p role="status" className="rounded-md bg-violet-500/10 px-2 py-1 text-sm font-semibold text-violet-800 dark:text-violet-100">
              {t('desafioResultado', { encontradas: resultado.encontradas, total: resultado.total })}
            </p>
          )}
          <p className="text-xs text-slate-400">{ferramenta ? tCorte(ferramenta === 'regua' ? 'dicaRegua' : 'dicaAngulo') : t('dica')}</p>
          {duvidoso > 0 && (
            <p role="note" aria-label={tCorte('medidaDuvidosaTitulo')} className="rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-xs text-amber-800 dark:text-amber-200">
              <strong>{tCorte('medidaDuvidosaTitulo')}:</strong> {tCorte('medidaDuvidosa', { cm: duvidoso })}
            </p>
          )}
          <div
            ref={areaRef}
            data-testid="area-leitura-tomografia"
            tabIndex={0}
            onMouseDown={(e) => e.currentTarget.focus({ preventScroll: true })}
            onKeyDown={(e) => {
              const passos: Record<string, number> = { ArrowUp: 1, ArrowDown: -1, PageUp: 10, PageDown: -10 }
              const tecla = e.key.toLowerCase()
              const planoDaTecla: Record<string, PlanoTomografia> = { a: 'axial', s: 'sagital', c: 'coronal' }
              if (e.key in passos) {
                e.preventDefault()
                passar(passos[e.key])
              } else if (e.key === 'Home' || e.key === 'End') {
                e.preventDefault()
                setCorte(e.key === 'Home' ? 0 : Math.max(0, total - 1))
              } else if (e.key === 'Escape' && ferramenta) {
                e.preventDefault()
                setFerramenta(null)
              } else if (!e.ctrlKey && !e.metaKey && !e.altKey && tecla in planoDaTecla) {
                e.preventDefault()
                trocarPlano(planoDaTecla[tecla])
              }
            }}
            className="flex min-h-[50vh] items-center justify-center overflow-auto rounded-lg bg-black outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            {/* o quadro tem o tamanho da imagem: marcacoes e medidas (em
                fracao da imagem) caem no lugar certo */}
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element -- PNG gerado pela API com login */}
              <img
                src={urlPlano(plano, corte)}
                alt={t('altCorte', { plano: nomes[plano], n: corte + 1 })}
                draggable={false}
                className="block h-[65vh] w-auto max-w-none select-none"
              />
              {!escondido && <CamadaMarcacoes corteAberto marcacoes={doCorte} />}
              <MedidasTomografia
                key={chaveCorte}
                modo={ferramenta}
                tamanho={tamanhoDoPlanoMm(geo, plano)}
                medidas={medidas[chaveCorte] ?? []}
                rotulo={rotuloMedida}
                onNova={(m) => setMedidas((todas) => ({ ...todas, [chaveCorte]: [...(todas[chaveCorte] ?? []), m] }))}
              />
              {desafio && (
                <div
                  data-testid="camada-desafio"
                  onClick={palpitar}
                  className={`absolute inset-0 ${escondido ? 'cursor-crosshair' : 'pointer-events-none'}`}
                >
                  {palpites.map((p, i) =>
                    p.plano === plano && p.corte === corte ? (
                      <span
                        key={i}
                        aria-hidden="true"
                        className={`absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-[10px] font-bold text-white ${
                          resultado ? (resultado.palpitesCertos[i] ? 'border-emerald-300 bg-emerald-600' : 'border-red-300 bg-red-600') : 'border-white bg-violet-600'
                        }`}
                        style={{ left: `${p.ponto.x * 100}%`, top: `${p.ponto.y * 100}%` }}
                      >
                        {i + 1}
                      </span>
                    ) : null,
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <aside className="w-full shrink-0 space-y-2 text-xs lg:w-56">
          <LocalizadorTomografia refId={curationId} geo={geo} plano={plano} corte={corte} onIr={setCorte} posicao="coluna" urlPlano={urlPlano} />
          {desafio && palpites.length > 0 && (
            <>
              <ul aria-label={t('seusPalpites')} className="space-y-1">
                {palpites.map((p, i) => (
                  <li key={i} className="rounded border border-violet-400/50 px-2 py-1 text-ink-2">
                    {resultado ? (resultado.palpitesCertos[i] ? '✓ ' : '✗ ') : ''}
                    {t('palpiteN', { n: i + 1 })}: {nomes[p.plano]} · {tCorte('corteN', { n: p.corte + 1 })}
                  </li>
                ))}
              </ul>
              {escondido && palpites.length >= maxPalpites && <p className="text-violet-700 dark:text-violet-200">{t('semPalpites', { n: maxPalpites })}</p>}
            </>
          )}
          {escondido ? null : lesoes.length === 0 ? (
            <p className="text-slate-400">{t('semLesoes')}</p>
          ) : (
            <ul aria-label={t('titulo')} className="space-y-1">
              {lesoes.map((m, i) => {
                const aberta = m.plano === plano && m.corte === corte
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      aria-current={aberta ? 'true' : undefined}
                      onClick={() => irPara(m)}
                      className={`w-full rounded border px-2 py-1 text-left hover:border-teal-500 ${aberta ? 'border-teal-500 bg-teal-500/10' : 'border-base-border'}`}
                    >
                      <span className="font-semibold text-ink">
                        {resultado ? (encontrada(m.id) ? '✓ ' : '✗ ') : ''}
                        {t('lesaoN', { n: i + 1 })}
                      </span>
                      <span className="block text-ink-2">
                        {nomes[m.plano as PlanoTomografia]} · {tCorte('corteN', { n: (m.corte ?? 0) + 1 })}
                        {rotuloAchado(m) ? ` · ${rotuloAchado(m)}` : ''}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>
      </div>
    </section>
  )
}
