'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  TIPOS_ESTRUTURA,
  TODOS_OS_DENTES,
  alterarSegmentacao,
  apagarSegmentacao,
  criarSegmentacao,
  listarSegmentacoes,
  proximaCor,
  tamanhoDaMascara,
  type Segmentacao,
  type TipoEstrutura,
} from '../../lib/segmentacoes'
import {
  aplicarRegiao,
  contar,
  crescerRegiao,
  curvaSuave,
  ehBorda,
  intensidadeEm,
  ordenarEmVolta,
  preencherPorPontos,
  preencherBuracos,
  preencherPoligono,
  suavizar,
  tracar,
  type Caixa,
  type Mascara,
} from '../../lib/pinturaAlgoritmos'

/**
 * PINTURA DE ESTRUTURAS na Curadoria (22/10/2026) - versao 2, com as
 * ferramentas dos editores de segmentacao mais usados (3D Slicer,
 * ITK-SNAP, ferramentas de anotacao para IA):
 *
 *   - Pincel (B): pinta livre;
 *   - Pincel inteligente (S): so pinta o que tem densidade parecida com o
 *     ponto onde a pincelada comecou - nao "vaza" para o osso ou o fundo;
 *   - Varinha magica (W): um clique pinta a regiao inteira de densidade
 *     parecida; mexer na tolerancia depois do clique ajusta na hora;
 *   - Laco (L): contorna a estrutura e o interior e preenchido;
 *   - Pontos (P): clica pontos nas extremidades da estrutura (qualquer
 *     ordem) e aperta Preencher (Enter): pinta tudo dentro da curva suave
 *     que passa pelos pontos; com "ajustar a densidade", gruda na borda
 *     real. Os pontos podem ser arrastados depois e a pintura se refaz;
 *   - Apagar (E): qualquer ferramenta passa a apagar;
 *   - Preencher buracos / Suavizar bordas; Contorno x Preenchido (C);
 *   - Zoom com a roda do mouse (ou + e -, 0 volta), arrastar a imagem com
 *     o botao direito ou segurando Espaco;
 *   - Ctrl+Z desfaz, Ctrl+Shift+Z (ou Ctrl+Y) refaz; 1-9 escolhem a estrutura.
 *
 * Cada estrutura e guardada como um vetor de 0/1 (um valor por pixel); a
 * tela so desenha esse vetor na cor da estrutura. Cada operacao e salva
 * sozinha (PATCH /segmentacoes/{id}); o servidor confere, redesenha a
 * mascara (1 bit) e registra na auditoria. A radiografia nao e alterada.
 */

type Ferramenta = 'pontos' | 'pincel' | 'inteligente' | 'varinha' | 'laco'
type Estado = 'salvando' | 'salvo' | 'erro'
interface Ponto {
  x: number
  y: number
}

const MAX_HISTORICO = 20
const ZOOM_MAX = 8

function hexParaRgb(cor: string): [number, number, number] {
  const n = parseInt(cor.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export default function PintorSegmentacao({
  curationId,
  orthancReferenceId,
  dentesFicha,
}: {
  curationId: number
  orthancReferenceId: number
  /** dentes ja marcados na ficha: aparecem primeiro na lista */
  dentesFicha: number[]
}) {
  const t = useTranslations('Segmentacao')
  const [src, setSrc] = useState('')
  const [natural, setNatural] = useState<{ largura: number; altura: number } | null>(null)
  const [erroImagem, setErroImagem] = useState(false)
  const [area, setArea] = useState<{ largura: number; altura: number } | null>(null)
  const [segs, setSegs] = useState<Segmentacao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [ativoId, setAtivoId] = useState<number | null>(null)
  const [ferramenta, setFerramenta] = useState<Ferramenta>('pontos')
  const [apagar, setApagar] = useState(false)
  const [tamanho, setTamanho] = useState(22)
  const [tolerancia, setTolerancia] = useState(28)
  const [opacidade, setOpacidade] = useState(0.45)
  const [contorno, setContorno] = useState(false)
  const [ocultas, setOcultas] = useState<number[]>([])
  const [estado, setEstado] = useState<Record<number, Estado>>({})
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [confirmarApagar, setConfirmarApagar] = useState<number | null>(null)
  const [cursor, setCursor] = useState<Ponto | null>(null)
  const [zoom, setZoom] = useState(1)
  const [desloc, setDesloc] = useState<Ponto>({ x: 0, y: 0 })
  const [laco, setLaco] = useState<Ponto[] | null>(null)
  // modo "pontos nas extremidades"
  const [pontos, setPontos] = useState<Ponto[]>([])
  const [ajustarDensidade, setAjustarDensidade] = useState(true)
  const [preenchido, setPreenchido] = useState(false)
  const [tipoNovo, setTipoNovo] = useState<TipoEstrutura>('dente')
  const [denteNovo, setDenteNovo] = useState<number | ''>(dentesFicha[0] ?? '')
  const [criando, setCriando] = useState(false)

  const areaRef = useRef<HTMLDivElement>(null)
  const caixaRef = useRef<HTMLDivElement>(null)
  const mascaras = useRef(new Map<number, Mascara>())
  const folhasCor = useRef(new Map<number, HTMLCanvasElement>())
  const cinza = useRef<Uint8Array | null>(null)
  const desfazer = useRef(new Map<number, Mascara[]>())
  const refazer = useRef(new Map<number, Mascara[]>())
  const traco = useRef<{ ultimo: Ponto; ref: number } | null>(null)
  const arrasto = useRef<{ x: number; y: number; desloc: Ponto } | null>(null)
  const espaco = useRef(false)
  const dentro = useRef(false)
  const varinha = useRef<{ id: number; ponto: Ponto; base: Mascara; valor: 0 | 1 } | null>(null)
  // preenchimento por pontos: a mascara de ANTES, para refazer ao mover um ponto
  const porPontos = useRef<{ id: number; base: Mascara } | null>(null)
  const pontoArrastado = useRef<number | null>(null)
  const salvando = useRef(new Set<number>())
  const salvarDeNovo = useRef(new Set<number>())
  const relogioVarinha = useRef<ReturnType<typeof setTimeout> | null>(null)
  const segsRef = useRef<Segmentacao[]>([])
  segsRef.current = segs

  const tam = natural ? tamanhoDaMascara(natural.largura, natural.altura) : null
  const w = tam?.largura ?? 0
  const h = tam?.altura ?? 0

  // tamanho da imagem na tela (zoom 1): o maior que cabe, sem deformar
  const tela =
    natural && area
      ? (() => {
          const e = Math.min(area.largura / natural.largura, area.altura / natural.altura)
          return { largura: natural.largura * e, altura: natural.altura * e }
        })()
      : null
  const base = tela && area ? { x: (area.largura - tela.largura) / 2, y: (area.altura - tela.altura) / 2 } : { x: 0, y: 0 }

  // ---------------------------------------------------------------- imagem
  useEffect(() => {
    let url = ''
    let cancelado = false
    ;(async () => {
      try {
        const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/curation/${orthancReferenceId}/preview`, { credentials: 'include' })
        if (!r.ok) throw new Error()
        url = URL.createObjectURL(await r.blob())
        const img = new Image()
        img.onload = () => {
          if (cancelado) return
          const t2 = tamanhoDaMascara(img.naturalWidth, img.naturalHeight)
          // a imagem em tons de cinza, no tamanho da mascara (para os limiares)
          const c = document.createElement('canvas')
          c.width = t2.largura
          c.height = t2.altura
          const ctx = c.getContext('2d', { willReadFrequently: true })!
          ctx.drawImage(img, 0, 0, c.width, c.height)
          const rgba = ctx.getImageData(0, 0, c.width, c.height).data
          const g = new Uint8Array(c.width * c.height)
          for (let i = 0; i < g.length; i++) g[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2])
          cinza.current = g
          setNatural({ largura: img.naturalWidth, altura: img.naturalHeight })
          setSrc(url)
        }
        img.onerror = () => !cancelado && setErroImagem(true)
        img.src = url
      } catch {
        if (!cancelado) setErroImagem(true)
      }
    })()
    return () => {
      cancelado = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [orthancReferenceId])

  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    const medir = () => setArea({ largura: el.clientWidth, altura: el.clientHeight })
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // ---------------------------------------------------------------- desenho
  const desenhar = useCallback(
    (id: number, caixa?: Caixa) => {
      const canvas = folhasCor.current.get(id)
      const m = mascaras.current.get(id)
      const seg = segsRef.current.find((s) => s.id === id)
      if (!canvas || !m || !seg || !w) return
      // em modo contorno, a borda de um pixel depende dos vizinhos: 1 px de folga
      const x0 = Math.max(0, (caixa ? caixa.x0 : 0) - 1)
      const y0 = Math.max(0, (caixa ? caixa.y0 : 0) - 1)
      const x1 = Math.min(w - 1, (caixa ? caixa.x1 : w - 1) + 1)
      const y1 = Math.min(h - 1, (caixa ? caixa.y1 : h - 1) + 1)
      if (x1 < x0 || y1 < y0) return
      const [r, g, b] = hexParaRgb(seg.cor)
      const ctx = canvas.getContext('2d')!
      const img = ctx.createImageData(x1 - x0 + 1, y1 - y0 + 1)
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * w + x
          const visivel = contorno ? ehBorda(m, w, h, i) : m[i] === 1
          if (!visivel) continue
          const o = ((y - y0) * (x1 - x0 + 1) + (x - x0)) * 4
          img.data[o] = r
          img.data[o + 1] = g
          img.data[o + 2] = b
          img.data[o + 3] = 255
        }
      }
      ctx.putImageData(img, x0, y0)
    },
    [w, h, contorno]
  )

  useEffect(() => {
    segs.forEach((s) => desenhar(s.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contorno, segs.map((s) => `${s.id}:${s.cor}`).join(','), desenhar])

  function ligarFolha(id: number, el: HTMLCanvasElement | null) {
    if (!el || folhasCor.current.get(id) === el) return
    folhasCor.current.set(id, el)
    desenhar(id)
  }

  // ---------------------------------------------------------------- carregar
  useEffect(() => {
    if (!w) return
    let cancelado = false
    setCarregando(true)
    listarSegmentacoes(curationId)
      .then(async (itens) => {
        for (const s of itens) {
          const m = new Uint8Array(w * h)
          await new Promise<void>((ok) => {
            const img = new Image()
            img.onload = () => {
              const c = document.createElement('canvas')
              c.width = w
              c.height = h
              const ctx = c.getContext('2d', { willReadFrequently: true })!
              ctx.drawImage(img, 0, 0, w, h)
              const d = ctx.getImageData(0, 0, w, h).data
              for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 127 ? 1 : 0
              ok()
            }
            img.onerror = () => ok()
            img.src = s.mascara
          })
          mascaras.current.set(s.id, m)
        }
        if (cancelado) return
        setSegs(itens)
        setAtivoId((atual) => atual ?? itens[itens.length - 1]?.id ?? null)
      })
      .catch((e: Error) => !cancelado && setErro(e.message))
      .finally(() => !cancelado && setCarregando(false))
    return () => {
      cancelado = true
    }
  }, [curationId, w, h])

  // ---------------------------------------------------------------- salvar
  function pngDaMascara(m: Mascara): string {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(w, h)
    for (let i = 0; i < m.length; i++) {
      if (!m[i]) continue
      img.data[i * 4] = 255
      img.data[i * 4 + 1] = 255
      img.data[i * 4 + 2] = 255
      img.data[i * 4 + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    return c.toDataURL('image/png')
  }

  async function salvar(id: number) {
    if (salvando.current.has(id)) {
      salvarDeNovo.current.add(id)
      return
    }
    const m = mascaras.current.get(id)
    if (!m) return
    salvando.current.add(id)
    setEstado((e) => ({ ...e, [id]: 'salvando' }))
    try {
      await alterarSegmentacao(id, { mascara: pngDaMascara(m) })
      setEstado((e) => ({ ...e, [id]: 'salvo' }))
    } catch (e) {
      setEstado((s) => ({ ...s, [id]: 'erro' }))
      setErro((e as Error).message)
    } finally {
      salvando.current.delete(id)
      if (salvarDeNovo.current.delete(id)) salvar(id)
    }
  }

  // ---------------------------------------------------------------- historico
  function guardarHistorico(id: number) {
    const m = mascaras.current.get(id)
    if (!m) return
    const pilha = desfazer.current.get(id) ?? []
    pilha.push(new Uint8Array(m))
    if (pilha.length > MAX_HISTORICO) pilha.shift()
    desfazer.current.set(id, pilha)
    refazer.current.set(id, [])
  }

  function voltar(id: number | null, de: 'desfazer' | 'refazer') {
    if (id === null) return
    const origem = (de === 'desfazer' ? desfazer : refazer).current.get(id)
    const destino = de === 'desfazer' ? refazer : desfazer
    const m = mascaras.current.get(id)
    const anterior = origem?.pop()
    if (!m || !anterior) return
    destino.current.set(id, [...(destino.current.get(id) ?? []), new Uint8Array(m)])
    mascaras.current.set(id, anterior)
    varinha.current = null
    desenhar(id)
    salvar(id)
  }

  // ---------------------------------------------------------------- coordenadas
  function naMascara(clientX: number, clientY: number): (Ponto & { escala: number }) | null {
    const el = caixaRef.current
    if (!el || !w) return null
    const r = el.getBoundingClientRect()
    return { x: ((clientX - r.left) / r.width) * w, y: ((clientY - r.top) / r.height) * h, escala: w / r.width }
  }

  // ---------------------------------------------------------------- ferramentas
  function aoPressionar(ev: React.PointerEvent<HTMLDivElement>) {
    // arrastar a imagem: botao direito, do meio, ou Espaco
    if (ev.button === 2 || ev.button === 1 || espaco.current) {
      ev.preventDefault()
      ev.currentTarget.setPointerCapture(ev.pointerId)
      arrasto.current = { x: ev.clientX, y: ev.clientY, desloc }
      return
    }
    if (ev.button !== 0 || ativoId === null || !cinza.current) return
    const p = naMascara(ev.clientX, ev.clientY)
    const m = mascaras.current.get(ativoId)
    if (!p || !m) return
    setAviso('')
    const valor: 0 | 1 = apagar ? 0 : 1
    if (ferramenta === 'pontos') {
      // perto de um ponto (10 px na tela): arrasta; senao, cria um ponto novo
      const perto = pontos.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) <= 10 * p.escala)
      ev.currentTarget.setPointerCapture(ev.pointerId)
      if (perto >= 0) {
        pontoArrastado.current = perto
      } else {
        setPontos((lista) => [...lista, { x: p.x, y: p.y }])
        pontoArrastado.current = pontos.length
      }
      return
    }
    if (ferramenta === 'varinha') {
      const antes = new Uint8Array(m)
      const regiao = crescerRegiao(cinza.current, w, h, p.x, p.y, tolerancia)
      if (!regiao) {
        setAviso(t('varinhaGrandeDemais'))
        return
      }
      guardarHistorico(ativoId)
      desenhar(ativoId, aplicarRegiao(m, regiao, w, valor))
      varinha.current = { id: ativoId, ponto: p, base: antes, valor }
      salvar(ativoId)
      return
    }
    varinha.current = null
    ev.currentTarget.setPointerCapture(ev.pointerId)
    guardarHistorico(ativoId)
    if (ferramenta === 'laco') {
      setLaco([{ x: p.x, y: p.y }])
      return
    }
    const ref = intensidadeEm(cinza.current, w, h, p.x, p.y)
    traco.current = { ultimo: p, ref }
    pincelar(p, p, p.escala, ref)
  }

  function pincelar(de: Ponto, ate: Ponto, escala: number, ref: number) {
    if (ativoId === null || !cinza.current) return
    const m = mascaras.current.get(ativoId)
    if (!m) return
    const raio = Math.max(0.5, (tamanho / 2) * escala)
    const limiar = ferramenta === 'inteligente' ? { cinza: cinza.current, ref, tolerancia } : undefined
    desenhar(ativoId, tracar(m, w, h, de, ate, raio, apagar ? 0 : 1, limiar))
  }

  function aoMover(ev: React.PointerEvent<HTMLDivElement>) {
    const a = areaRef.current?.getBoundingClientRect()
    if (a) setCursor({ x: ev.clientX - a.left, y: ev.clientY - a.top })
    if (arrasto.current) {
      const d = arrasto.current
      setDesloc({ x: d.desloc.x + ev.clientX - d.x, y: d.desloc.y + ev.clientY - d.y })
      return
    }
    const p = naMascara(ev.clientX, ev.clientY)
    if (!p) return
    if (pontoArrastado.current !== null) {
      const k = pontoArrastado.current
      setPontos((lista) => lista.map((q, i) => (i === k ? { x: p.x, y: p.y } : q)))
      return
    }
    if (laco) {
      const ultimo = laco[laco.length - 1]
      if (Math.hypot(p.x - ultimo.x, p.y - ultimo.y) >= 1) setLaco([...laco, { x: p.x, y: p.y }])
      return
    }
    if (!traco.current) return
    pincelar(traco.current.ultimo, p, p.escala, traco.current.ref)
    traco.current.ultimo = p
  }

  function aoSoltar() {
    if (arrasto.current) {
      arrasto.current = null
      return
    }
    if (pontoArrastado.current !== null) {
      pontoArrastado.current = null
      // ponto solto depois de preencher: refaz a pintura com a nova posicao
      if (preenchido) preencherPontos()
      return
    }
    if (laco && ativoId !== null) {
      const m = mascaras.current.get(ativoId)
      if (m && laco.length >= 3) {
        desenhar(ativoId, aplicarRegiao(m, preencherPoligono(w, h, laco), w, apagar ? 0 : 1))
        salvar(ativoId)
      }
      setLaco(null)
      return
    }
    if (!traco.current) return
    traco.current = null
    if (ativoId !== null) salvar(ativoId)
  }

  // tolerancia mexida logo depois de um clique da varinha: refaz a regiao na hora
  useEffect(() => {
    const v = varinha.current
    if (!v || v.id !== ativoId || !cinza.current) return
    const regiao = crescerRegiao(cinza.current, w, h, v.ponto.x, v.ponto.y, tolerancia)
    if (!regiao) {
      setAviso(t('varinhaGrandeDemais'))
      return
    }
    setAviso('')
    const m = new Uint8Array(v.base)
    aplicarRegiao(m, regiao, w, v.valor)
    mascaras.current.set(v.id, m)
    desenhar(v.id)
    if (relogioVarinha.current) clearTimeout(relogioVarinha.current)
    relogioVarinha.current = setTimeout(() => salvar(v.id), 400)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tolerancia])

  // ---------------------------------------------------------------- pontos
  function preencherPontos(lista = pontos) {
    if (ativoId === null || !cinza.current) return
    if (lista.length < 3) {
      setAviso(t('pontosPoucos'))
      return
    }
    const m = mascaras.current.get(ativoId)
    if (!m) return
    setAviso('')
    varinha.current = null
    // primeiro preenchimento: guarda o "antes"; os seguintes refazem a partir dele
    if (porPontos.current?.id !== ativoId) {
      guardarHistorico(ativoId)
      porPontos.current = { id: ativoId, base: new Uint8Array(m) }
    }
    const novo = new Uint8Array(porPontos.current.base)
    aplicarRegiao(novo, preencherPorPontos(cinza.current, w, h, lista, ajustarDensidade), w, apagar ? 0 : 1)
    mascaras.current.set(ativoId, novo)
    desenhar(ativoId)
    setPreenchido(true)
    salvar(ativoId)
  }

  function concluirPontos() {
    setPontos([])
    setPreenchido(false)
    porPontos.current = null
  }

  // depois de preencher, mover um ponto ou mudar o ajuste refaz a pintura
  const assinaturaPontos = pontos.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(';')
  useEffect(() => {
    if (preenchido && pontoArrastado.current === null) preencherPontos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinaturaPontos, ajustarDensidade])

  // trocou de estrutura: os pontos comecam de novo
  useEffect(() => {
    concluirPontos()
  }, [ativoId])

  function operacao(tipo: 'buracos' | 'suavizar') {
    if (ativoId === null) return
    const m = mascaras.current.get(ativoId)
    if (!m) return
    guardarHistorico(ativoId)
    varinha.current = null
    mascaras.current.set(ativoId, tipo === 'buracos' ? preencherBuracos(m, w, h) : suavizar(m, w, h))
    desenhar(ativoId)
    salvar(ativoId)
  }

  // ---------------------------------------------------------------- zoom
  function aplicarZoom(novo: number, centro?: Ponto) {
    const z2 = Math.min(ZOOM_MAX, Math.max(1, novo))
    if (z2 === 1) {
      setZoom(1)
      setDesloc({ x: 0, y: 0 })
      return
    }
    const c = centro ?? (area ? { x: area.largura / 2, y: area.altura / 2 } : { x: 0, y: 0 })
    // o ponto sob o mouse fica parado
    setDesloc((d) => ({
      x: c.x - base.x - (z2 / zoom) * (c.x - base.x - d.x),
      y: c.y - base.y - (z2 / zoom) * (c.y - base.y - d.y),
    }))
    setZoom(z2)
  }

  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    function aoRolar(ev: WheelEvent) {
      ev.preventDefault()
      const r = el!.getBoundingClientRect()
      aplicarZoom(zoom * (ev.deltaY < 0 ? 1.2 : 1 / 1.2), { x: ev.clientX - r.left, y: ev.clientY - r.top })
    }
    el.addEventListener('wheel', aoRolar, { passive: false })
    return () => el.removeEventListener('wheel', aoRolar)
  })

  // ---------------------------------------------------------------- atalhos
  useEffect(() => {
    function aoTeclar(ev: KeyboardEvent) {
      if (!dentro.current) return
      const alvo = ev.target as HTMLElement | null
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable)) return
      const tecla = ev.key.toLowerCase()
      const ctrl = ev.ctrlKey || ev.metaKey
      if (ctrl && (tecla === 'y' || (tecla === 'z' && ev.shiftKey))) {
        ev.preventDefault()
        voltar(ativoId, 'refazer')
        return
      }
      if (ctrl && tecla === 'z') {
        ev.preventDefault()
        voltar(ativoId, 'desfazer')
        return
      }
      if (ctrl || ev.altKey) return
      if (ferramenta === 'pontos' && (ev.key === 'Enter' || ev.key === 'Escape' || ev.key === 'Backspace')) {
        ev.preventDefault()
        ev.stopPropagation()
        if (ev.key === 'Enter') preencherPontos()
        else if (ev.key === 'Escape') concluirPontos()
        else setPontos((lista) => lista.slice(0, -1))
        return
      }
      const acoes: Record<string, () => void> = {
        p: () => setFerramenta('pontos'),
        b: () => setFerramenta('pincel'),
        s: () => setFerramenta('inteligente'),
        w: () => setFerramenta('varinha'),
        l: () => setFerramenta('laco'),
        e: () => setApagar((v) => !v),
        c: () => setContorno((v) => !v),
        '[': () => setTamanho((v) => Math.max(2, v - 4)),
        ']': () => setTamanho((v) => Math.min(150, v + 4)),
        '+': () => aplicarZoom(zoom * 1.25),
        '=': () => aplicarZoom(zoom * 1.25),
        '-': () => aplicarZoom(zoom / 1.25),
        '0': () => aplicarZoom(1),
      }
      if (ev.key === ' ') {
        // Espaco = arrastar a imagem (nao liga o microfone da Curadoria)
        espaco.current = true
        ev.preventDefault()
        ev.stopPropagation()
        return
      }
      const n = parseInt(ev.key, 10)
      if (n >= 1 && n <= 9 && segsRef.current[n - 1]) {
        ev.preventDefault()
        ev.stopPropagation()
        setAtivoId(segsRef.current[n - 1].id)
        return
      }
      const acao = acoes[tecla] ?? acoes[ev.key]
      if (acao) {
        ev.preventDefault()
        ev.stopPropagation()
        acao()
      }
    }
    function aoSoltarTecla(ev: KeyboardEvent) {
      if (ev.key === ' ' && espaco.current) {
        espaco.current = false
        ev.stopPropagation()
      }
    }
    window.addEventListener('keydown', aoTeclar, true)
    window.addEventListener('keyup', aoSoltarTecla, true)
    return () => {
      window.removeEventListener('keydown', aoTeclar, true)
      window.removeEventListener('keyup', aoSoltarTecla, true)
    }
  })

  // ---------------------------------------------------------------- estruturas
  function nomeSugerido(tipo: TipoEstrutura, dente: number | ''): string {
    const nome = t(`tipos.${tipo}`)
    return dente ? `${nome} ${dente}` : nome
  }

  async function criar() {
    if (!w) return
    setCriando(true)
    setErro('')
    try {
      const m = new Uint8Array(w * h)
      const nova = await criarSegmentacao(curationId, {
        nome: nomeSugerido(tipoNovo, denteNovo),
        dente: denteNovo === '' ? null : denteNovo,
        cor: proximaCor(segs.map((s) => s.cor)),
        mascara: pngDaMascara(m),
      })
      mascaras.current.set(nova.id, m)
      setSegs((lista) => [...lista, nova])
      setAtivoId(nova.id)
      setApagar(false)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCriando(false)
    }
  }

  async function mudarCor(id: number, cor: string) {
    setErro('')
    try {
      await alterarSegmentacao(id, { cor })
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  async function apagarEstrutura(id: number) {
    setErro('')
    try {
      await apagarSegmentacao(id)
      mascaras.current.delete(id)
      folhasCor.current.delete(id)
      desfazer.current.delete(id)
      refazer.current.delete(id)
      setSegs((lista) => lista.filter((s) => s.id !== id))
      setAtivoId((atual) => (atual === id ? null : atual))
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setConfirmarApagar(null)
    }
  }

  // ---------------------------------------------------------------- tela
  const dentesOrdenados = [...dentesFicha, ...TODOS_OS_DENTES.filter((d) => !dentesFicha.includes(d))]
  const ativo = segs.find((s) => s.id === ativoId) ?? null
  const usaPincel = ferramenta === 'pincel' || ferramenta === 'inteligente'
  const FERRAMENTAS: { id: Ferramenta; icone: string; tecla: string }[] = [
    { id: 'pontos', icone: '⦿', tecla: 'P' },
    { id: 'inteligente', icone: '✦', tecla: 'S' },
    { id: 'pincel', icone: '🖌', tecla: 'B' },
    { id: 'varinha', icone: '🪄', tecla: 'W' },
    { id: 'laco', icone: '➰', tecla: 'L' },
  ]
  const chip = (ligado: boolean) =>
    `rounded-lg border px-2 py-1 text-xs font-semibold transition ${
      ligado
        ? 'border-teal-500 bg-teal-500/15 text-teal-800 dark:border-teal-300 dark:text-teal-100'
        : 'border-base-border text-slate-600 hover:border-teal-500 dark:text-slate-300'
    }`
  const pixels = ativo ? contar(mascaras.current.get(ativo.id) ?? new Uint8Array()) : 0

  return (
    <div className="flex h-full min-h-0 gap-3">
      {/* imagem + pintura */}
      <div
        ref={areaRef}
        className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border border-base-border bg-black"
        onContextMenu={(e) => e.preventDefault()}
      >
        {erroImagem ? (
          <p className="p-4 text-xs text-slate-400">{t('semImagem')}</p>
        ) : !src || !tela || !tam ? (
          <div className="h-full w-full animate-pulse" />
        ) : (
          <div
            ref={caixaRef}
            className="absolute origin-top-left"
            style={{
              left: base.x,
              top: base.y,
              width: tela.largura,
              height: tela.altura,
              transform: `translate(${desloc.x}px, ${desloc.y}px) scale(${zoom})`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={t('altImagem')}
              className="absolute inset-0 h-full w-full select-none"
              style={{ imageRendering: zoom >= 3 ? 'pixelated' : 'auto' }}
              draggable={false}
            />
            {segs.map((s) => (
              <canvas
                key={s.id}
                ref={(el) => ligarFolha(s.id, el)}
                width={w}
                height={h}
                className="pointer-events-none absolute inset-0 h-full w-full"
                style={{
                  opacity: ocultas.includes(s.id) ? 0 : contorno ? 1 : opacidade,
                  imageRendering: zoom >= 3 ? 'pixelated' : 'auto',
                }}
              />
            ))}
            {ferramenta === 'pontos' && pontos.length > 0 && tela && (
              <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
                {pontos.length >= 3 && (
                  <polygon
                    points={curvaSuave(ordenarEmVolta(pontos)).map((q) => `${q.x},${q.y}`).join(' ')}
                    fill={preenchido ? 'none' : `${ativo?.cor ?? '#ffffff'}26`}
                    stroke={ativo?.cor ?? '#ffffff'}
                    strokeWidth={1.25}
                    strokeDasharray="5 4"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                {pontos.map((q, i) => (
                  <circle
                    key={i}
                    cx={q.x}
                    cy={q.y}
                    r={(5 * w) / (tela.largura * zoom)}
                    fill={ativo?.cor ?? '#ffffff'}
                    stroke="#0b1220"
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
            )}
            {laco && (
              <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
                <polyline
                  points={laco.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill={apagar ? 'rgba(255,255,255,0.15)' : `${ativo?.cor ?? '#ffffff'}40`}
                  stroke={apagar ? '#ffffff' : ativo?.cor ?? '#ffffff'}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            )}
          </div>
        )}
        {/* camada que recebe o mouse (fora do zoom: cobre a area toda) */}
        {src && tela && (
          <div
            data-pintura
            className="absolute inset-0 touch-none"
            style={{
              cursor: arrasto.current || espaco.current ? 'grabbing' : !ativo ? 'not-allowed' : usaPincel ? 'none' : 'crosshair',
            }}
            onPointerDown={aoPressionar}
            onPointerMove={aoMover}
            onPointerUp={aoSoltar}
            onPointerCancel={aoSoltar}
            onPointerEnter={() => (dentro.current = true)}
            onPointerLeave={() => {
              dentro.current = false
              setCursor(null)
            }}
          />
        )}
        {/* contorno do pincel (tamanho em pixels da tela) */}
        {ativo && cursor && usaPincel && !arrasto.current && (
          <div
            className="pointer-events-none absolute rounded-full"
            style={{
              left: cursor.x - tamanho / 2,
              top: cursor.y - tamanho / 2,
              width: tamanho,
              height: tamanho,
              border: `1.5px ${apagar ? 'dashed #ffffff' : `solid ${ativo.cor}`}`,
              boxShadow: '0 0 0 1px rgba(0,0,0,0.55)',
            }}
          >
            {ferramenta === 'inteligente' && <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />}
          </div>
        )}
        {/* barra do zoom */}
        {src && tela && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full border border-white/15 bg-black/60 px-1.5 py-0.5 text-[11px] text-slate-100 backdrop-blur">
            <button type="button" onClick={() => aplicarZoom(zoom / 1.25)} className="px-1 hover:text-teal-200" aria-label={t('zoomMenos')}>
              −
            </button>
            <button type="button" onClick={() => aplicarZoom(1)} className="min-w-10 tabular-nums hover:text-teal-200" title={t('zoomAjustar')}>
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" onClick={() => aplicarZoom(zoom * 1.25)} className="px-1 hover:text-teal-200" aria-label={t('zoomMais')}>
              +
            </button>
          </div>
        )}
        {!ativo && !carregando && src && (
          <p className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-black/70 px-3 py-1 text-xs text-slate-200">
            {t('crieParaPintar')}
          </p>
        )}
        {aviso && (
          <p role="status" className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit max-w-[80%] rounded-full bg-amber-500/90 px-3 py-1 text-xs font-semibold text-black">
            {aviso}
          </p>
        )}
      </div>

      {/* controles */}
      <div className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto pr-1 text-xs">
        <section className="space-y-1.5">
          <h3 className="font-semibold text-ink">{t('novaEstrutura')}</h3>
          <div className="flex gap-1.5">
            <select
              aria-label={t('tipo')}
              value={tipoNovo}
              onChange={(e) => setTipoNovo(e.target.value as TipoEstrutura)}
              className="min-w-0 flex-1 rounded-lg border border-base-border bg-base-surface px-2 py-1 text-ink"
            >
              {TIPOS_ESTRUTURA.map((tp) => (
                <option key={tp} value={tp}>
                  {t(`tipos.${tp}`)}
                </option>
              ))}
            </select>
            <select
              aria-label={t('dente')}
              value={denteNovo}
              onChange={(e) => setDenteNovo(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-20 rounded-lg border border-base-border bg-base-surface px-2 py-1 text-ink"
            >
              <option value="">{t('semDente')}</option>
              {dentesOrdenados.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={criar}
            disabled={criando || !tam}
            className="w-full rounded-lg bg-teal-600 px-3 py-1.5 font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
          >
            + {t('criar', { nome: nomeSugerido(tipoNovo, denteNovo) })}
          </button>
        </section>

        <section className="space-y-1.5">
          <h3 className="font-semibold text-ink">{t('ferramentas')}</h3>
          <div className="grid grid-cols-2 gap-1.5">
            {FERRAMENTAS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFerramenta(f.id)}
                className={`${chip(ferramenta === f.id)} flex items-center gap-1.5 text-left`}
                title={t(`dica.${f.id}`)}
                aria-pressed={ferramenta === f.id}
              >
                <span aria-hidden="true">{f.icone}</span>
                <span className="flex-1">{t(`ferramenta.${f.id}`)}</span>
                <kbd className="rounded border border-current/30 px-1 text-[9px] opacity-70">{f.tecla}</kbd>
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setApagar((v) => !v)}
              className={`${chip(apagar)} flex-1 ${apagar ? '!border-red-500 !bg-red-500/15 !text-red-700 dark:!text-red-200' : ''}`}
              aria-pressed={apagar}
              title={t('dica.apagar')}
            >
              ⌫ {apagar ? t('modoApagando') : t('modoPintando')} <kbd className="ml-1 text-[9px] opacity-70">E</kbd>
            </button>
            <button type="button" className={chip(false)} onClick={() => voltar(ativoId, 'desfazer')} title={t('desfazerDica')} aria-label={t('desfazerDica')}>
              ↶
            </button>
            <button type="button" className={chip(false)} onClick={() => voltar(ativoId, 'refazer')} title={t('refazerDica')} aria-label={t('refazerDica')}>
              ↷
            </button>
          </div>
          <p className="text-[11px] leading-snug text-slate-500">{t(`dica.${ferramenta}`)}</p>
          {ferramenta === 'pontos' && (
            <div className="space-y-1.5 rounded-lg border border-teal-500/40 bg-teal-500/5 p-2">
              <p className="text-ink">{t('pontosContagem', { total: pontos.length })}</p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => preencherPontos()}
                  disabled={pontos.length < 3 || !ativo}
                  className="flex-1 rounded-lg bg-teal-600 px-2 py-1.5 font-semibold text-white hover:bg-teal-500 disabled:opacity-40"
                >
                  {preenchido ? t('pontosRefazer') : t('pontosPreencher')} <kbd className="ml-1 text-[9px] opacity-80">Enter</kbd>
                </button>
                <button type="button" onClick={concluirPontos} disabled={!pontos.length} className={`${chip(false)} disabled:opacity-40`} title={t('pontosConcluirDica')}>
                  {preenchido ? t('pontosConcluir') : t('pontosLimpar')}
                </button>
              </div>
              <label className="flex items-start gap-1.5 text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={ajustarDensidade} onChange={(e) => setAjustarDensidade(e.target.checked)} className="mt-0.5 accent-teal-600" />
                <span>{t('pontosAjustar')}</span>
              </label>
            </div>
          )}
          {usaPincel && (
            <label className="block text-slate-500">
              {t('tamanho', { px: tamanho })}
              <input type="range" min={2} max={150} value={tamanho} onChange={(e) => setTamanho(Number(e.target.value))} className="w-full accent-teal-600" />
            </label>
          )}
          {(ferramenta === 'inteligente' || ferramenta === 'varinha') && (
            <label className="block text-slate-500">
              {t('tolerancia', { valor: tolerancia })}
              <input type="range" min={2} max={120} value={tolerancia} onChange={(e) => setTolerancia(Number(e.target.value))} className="w-full accent-teal-600" />
            </label>
          )}
          <div className="flex gap-1.5">
            <button type="button" className={`${chip(false)} flex-1`} onClick={() => operacao('buracos')} disabled={!ativo} title={t('dica.buracos')}>
              {t('preencherBuracos')}
            </button>
            <button type="button" className={`${chip(false)} flex-1`} onClick={() => operacao('suavizar')} disabled={!ativo} title={t('dica.suavizar')}>
              {t('suavizar')}
            </button>
          </div>
        </section>

        <section className="space-y-1.5">
          <h3 className="font-semibold text-ink">{t('visualizacao')}</h3>
          <div className="flex gap-1.5">
            <button type="button" className={`${chip(!contorno)} flex-1`} onClick={() => setContorno(false)}>
              {t('preenchido')}
            </button>
            <button type="button" className={`${chip(contorno)} flex-1`} onClick={() => setContorno(true)}>
              {t('contorno')} <kbd className="ml-1 text-[9px] opacity-70">C</kbd>
            </button>
          </div>
          {!contorno && (
            <label className="block text-slate-500">
              {t('transparencia', { pct: Math.round(opacidade * 100) })}
              <input
                type="range"
                min={10}
                max={90}
                value={Math.round(opacidade * 100)}
                onChange={(e) => setOpacidade(Number(e.target.value) / 100)}
                className="w-full accent-teal-600"
              />
            </label>
          )}
        </section>

        <section className="min-h-0 space-y-1">
          <h3 className="font-semibold text-ink">{t('estruturas', { total: segs.length })}</h3>
          {carregando ? (
            <p className="text-slate-500">{t('carregando')}</p>
          ) : segs.length === 0 ? (
            <p className="text-slate-500">{t('nenhuma')}</p>
          ) : (
            <ul className="space-y-1">
              {segs.map((s, i) => (
                <li
                  key={s.id}
                  className={`flex items-center gap-1.5 rounded-lg border px-1.5 py-1 ${
                    s.id === ativoId ? 'border-teal-500 bg-teal-500/10' : 'border-base-border'
                  }`}
                >
                  <input
                    type="color"
                    value={s.cor}
                    onChange={(e) => setSegs((lista) => lista.map((x) => (x.id === s.id ? { ...x, cor: e.target.value } : x)))}
                    onBlur={(e) => mudarCor(s.id, e.target.value)}
                    aria-label={t('cor')}
                    className="h-5 w-5 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                  <button type="button" onClick={() => setAtivoId(s.id)} className="min-w-0 flex-1 truncate text-left text-ink" title={t('selecionar')}>
                    {i < 9 && <kbd className="mr-1 text-[9px] text-slate-500">{i + 1}</kbd>}
                    {s.nome}
                  </button>
                  <span className="w-3 text-center text-[10px] text-slate-500" aria-live="polite">
                    {estado[s.id] === 'salvando' ? '…' : estado[s.id] === 'erro' ? '!' : estado[s.id] === 'salvo' ? '✓' : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => setOcultas((o) => (o.includes(s.id) ? o.filter((x) => x !== s.id) : [...o, s.id]))}
                    title={ocultas.includes(s.id) ? t('mostrar') : t('esconder')}
                    aria-label={ocultas.includes(s.id) ? t('mostrar') : t('esconder')}
                    className="text-slate-500 hover:text-ink"
                  >
                    {ocultas.includes(s.id) ? '◌' : '◉'}
                  </button>
                  {confirmarApagar === s.id ? (
                    <button type="button" onClick={() => apagarEstrutura(s.id)} className="rounded bg-red-600 px-1.5 text-[10px] font-semibold text-white">
                      {t('confirmarApagar')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmarApagar(s.id)}
                      title={t('apagar')}
                      aria-label={t('apagar')}
                      className="text-red-600 hover:text-red-500 dark:text-red-300"
                    >
                      🗑
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {ativo && <p className="text-[11px] text-slate-500">{t('pixelsPintados', { nome: ativo.nome, total: pixels.toLocaleString('pt-BR') })}</p>}
        </section>

        {erro && (
          <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1 text-red-700 dark:text-red-200">
            {erro}
          </p>
        )}
        <p className="text-[11px] leading-snug text-slate-500">{t('ajuda')}</p>
      </div>
    </div>
  )
}
