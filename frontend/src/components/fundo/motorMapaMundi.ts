// Motor do fundo animado "mapa-mundi" (Banco de imagens).
//
// E a versao "aberta" (planificada) do globo da tela de entrada: os mesmos
// continentes em pontos branco-gelo, as mesmas rotas de luz entre cidades e
// o mesmo ceu noite-turquesa, so que ocupando a tela inteira. Tudo e
// desenhado num unico <canvas> 2D (sem Three.js), para pesar pouco numa
// tela de uso diario.
//
// Camadas, de tras para a frente:
//   1. estrelas (so no tema escuro) e uma estrela cadente de vez em quando;
//   2. mapa de pontos, que desliza devagar de oeste para leste (como o
//      globo girando) e da a volta sem emenda;
//   3. faixa de varredura (um "meridiano de luz") que acende os pontos por
//      onde passa;
//   4. rotas de luz entre cidades e "pulsos" nas cidades;
//   5. lanterna suave que acompanha o mouse.
//
// Puramente decorativo: nao representa dados reais nem a origem das
// imagens do acervo. Com "reduzir movimento" ligado no sistema, desenha um
// unico quadro parado.

/**
 * - 'vivo': telas de entrada e de navegacao (Banco de imagens, Inicio):
 *   todos os efeitos.
 * - 'leitura': telas de trabalho com texto, tabelas e formularios: pontos
 *   mais apagados, sem varredura, sem estrela cadente e sem lanterna do
 *   mouse, para o fundo nunca competir com a leitura.
 */
export type IntensidadeFundo = 'vivo' | 'leitura'

export interface ModoMapaMundi {
  intensidade: IntensidadeFundo
  /** Usa sempre a paleta escura (telas publicas, desenhadas so para fundo escuro). */
  forcarEscuro: boolean
}

export interface ControleMapaMundi {
  desligar: () => void
  definirModo: (modo: ModoMapaMundi) => void
}

export interface OpcoesMapaMundi extends ModoMapaMundi {
  canvas: HTMLCanvasElement
  /** Mascara dos continentes (equiretangular, branco = terra). */
  mascaraContinentes: string
  /** Avisado (no maximo ~4x por segundo) quando a longitude central muda. */
  aoMudarLongitude?: (longitude: number) => void
}

type Rgb = [number, number, number]

interface Paleta {
  ponto: Rgb
  pontoForte: Rgb
  rota: Rgb
  pulso: Rgb
  estrelas: boolean
  alfaPonto: number
}

const PALETA_ESCURA: Paleta = {
  ponto: [214, 240, 250],
  pontoForte: [255, 255, 255],
  rota: [94, 234, 212],
  pulso: [45, 212, 191],
  estrelas: true,
  alfaPonto: 0.62,
}

const PALETA_CLARA: Paleta = {
  ponto: [30, 98, 110],
  pontoForte: [13, 148, 136],
  rota: [13, 148, 136],
  pulso: [20, 184, 166],
  estrelas: false,
  alfaPonto: 0.5,
}

// Faixa de latitudes mostrada (corta a Antartida e o extremo norte, que
// ficariam muito esticados na projecao plana).
const LAT_MAX = 80
const LAT_MIN = -58

// Mesmas cidades e rotas do globo da tela de entrada (Florianopolis e a primeira).
const CIDADES: [number, number][] = [[-27.6, -48.5], [-23.5, -46.6], [40.7, -74], [51.5, -0.1], [48.9, 2.3], [52.5, 13.4], [35.7, 139.7], [1.35, 103.8],
  [-33.9, 151.2], [19.4, -99.1], [-1.3, 36.8], [28.6, 77.2], [-33.9, 18.4], [43.7, -79.4], [4.7, -74.1], [37.6, 127]]
const ROTAS: [number, number][] = [[0, 2], [0, 3], [0, 4], [0, 12], [0, 8], [1, 14], [2, 3], [3, 5], [5, 11], [11, 7], [7, 6], [6, 15], [2, 9], [9, 13], [4, 10], [10, 12], [7, 8], [13, 3]]

// Uma volta completa no mundo a cada 6 minutos: movimento perceptivel, mas
// calmo o bastante para nao disputar atencao com os cartoes.
const SEGUNDOS_POR_VOLTA = 360
// Comeca com a Europa/Africa perto do centro da area de conteudo.
const LONGITUDE_INICIAL = 15
// Nas telas de leitura o mapa anda 3x mais devagar (quase parado).
const FATOR_LENTIDAO_LEITURA = 3
const PERIODO_VARREDURA = 11 // segundos entre uma passada e outra do meridiano de luz
const PERIODO_METEORO = 9

const rgba = (c: Rgb, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`
const fract = (x: number) => x - Math.floor(x)

// Numeros pseudoaleatorios com semente: o mapa fica igual a cada visita
// (e entre o modo claro e o escuro), sem "sortear" pontos diferentes.
function gerador(semente: number) {
  let s = semente >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

interface Ponto { x: number; y: number; brilho: number; fase: number }

export function iniciarMapaMundi(op: OpcoesMapaMundi): ControleMapaMundi {
  const canvas = op.canvas
  const ctx = canvas.getContext('2d')
  if (!ctx) return { desligar: () => {}, definirModo: () => {} }

  const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let ativo = true
  let modo: ModoMapaMundi = { intensidade: op.intensidade, forcarEscuro: op.forcarEscuro }
  const leitura = () => modo.intensidade === 'leitura'
  let quadro = 0
  let terra: Uint8ClampedArray | null = null
  let larguraMascara = 0
  let alturaMascara = 0

  // Medidas da tela (em pixels CSS) e do mapa
  let w = 0, h = 0, dpr = 1
  let mapaL = 0, mapaA = 0, topo = 0, passo = 6
  let pontos: Ponto[] = []
  let cintilantes: Ponto[] = []
  let camadaBase: HTMLCanvasElement | null = null
  let camadaForte: HTMLCanvasElement | null = null
  let estrelas: { x: number; y: number; r: number; f: number }[] = []
  let paleta: Paleta = temaClaro() ? PALETA_CLARA : PALETA_ESCURA

  const mouse = { x: -9999, y: -9999, alvo: 0, forca: 0 }
  let ultimaLon = 999
  let ultimoAviso = 0

  function temaClaro() {
    return !modo.forcarEscuro && document.documentElement.classList.contains('light')
  }

  function ehTerra(lat: number, lon: number) {
    if (!terra) return false
    const u = Math.floor(((lon + 180) / 360) * larguraMascara) % larguraMascara
    const v = Math.min(alturaMascara - 1, Math.max(0, Math.floor(((90 - lat) / 180) * alturaMascara)))
    return terra[(v * larguraMascara + u) * 4] > 127
  }

  // Converte latitude/longitude em posicao dentro do mapa (sem deslizamento)
  function projetar(lat: number, lon: number): [number, number] {
    return [((lon + 180) / 360) * mapaL, ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * mapaA]
  }

  function montar() {
    const r = canvas.getBoundingClientRect()
    w = Math.max(1, r.width)
    h = Math.max(1, r.height)
    dpr = Math.min(window.devicePixelRatio || 1, 1.75)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)

    // Mapa um pouco mais largo que a tela (o mundo inteiro cabe e ainda
    // sobra para deslizar); em telas em pe, o mapa cresce pela altura.
    mapaL = Math.max(w * 1.1, h * 1.8)
    mapaA = (mapaL * (LAT_MAX - LAT_MIN)) / 360
    topo = (h - mapaA) / 2 + h * 0.03
    passo = Math.min(9, Math.max(5, mapaL / 290))

    pontos = []
    cintilantes = []
    const rnd = gerador(7)
    for (let y = passo / 2; y < mapaA; y += passo) {
      const lat = LAT_MAX - (y / mapaA) * (LAT_MAX - LAT_MIN)
      for (let x = passo / 2; x < mapaL; x += passo) {
        const lon = (x / mapaL) * 360 - 180
        const b = rnd()
        if (!ehTerra(lat, lon)) continue
        const p = { x, y, brilho: 0.45 + 0.55 * b, fase: rnd() * Math.PI * 2 }
        pontos.push(p)
        if (rnd() < 0.035) cintilantes.push(p)
      }
    }

    const rs = gerador(99)
    estrelas = Array.from({ length: Math.round((w * h) / 9000) }, () => ({ x: rs() * w, y: rs() * h, r: 0.4 + rs() * 0.9, f: rs() * 6.28 }))

    pintarCamadas()
  }

  // O mapa de pontos e desenhado uma unica vez numa imagem fora da tela;
  // a cada quadro so copiamos essa imagem (bem mais leve que redesenhar
  // milhares de pontos 60 vezes por segundo).
  function pintarCamadas() {
    paleta = temaClaro() ? PALETA_CLARA : PALETA_ESCURA
    const criar = (raio: number, cor: Rgb, alfa: number) => {
      const c = document.createElement('canvas')
      c.width = Math.ceil(mapaL * dpr)
      c.height = Math.ceil(mapaA * dpr)
      const g = c.getContext('2d')!
      g.scale(dpr, dpr)
      for (const p of pontos) {
        g.fillStyle = rgba(cor, alfa * p.brilho)
        g.beginPath()
        g.arc(p.x, p.y, raio, 0, Math.PI * 2)
        g.fill()
      }
      return c
    }
    // no modo leitura os continentes ficam bem mais discretos
    camadaBase = criar(passo * 0.24, paleta.ponto, paleta.alfaPonto * (leitura() ? 0.55 : 1))
    camadaForte = criar(passo * 0.34, paleta.pontoForte, 1)
  }

  // "voltas" = quanto o mapa ja girou (fracao de uma volta). Acumula quadro
  // a quadro, para a troca de velocidade entre telas nao dar "pulo".
  let voltas = 0
  let ultimoT = 0
  function deslocamento(t: number) {
    const dt = Math.min(0.1, Math.max(0, t - ultimoT))
    ultimoT = t
    if (!reduzir) voltas += dt / (SEGUNDOS_POR_VOLTA * (leitura() ? FATOR_LENTIDAO_LEITURA : 1))
    const inicial = ((LONGITUDE_INICIAL + 180) / 360) * mapaL - w / 2
    return fract((inicial - voltas * mapaL) / mapaL) * mapaL
  }

  // Desenha uma imagem do tamanho do mapa repetida lado a lado (para dar a
  // volta no mundo sem emenda), dentro de um recorte opcional.
  function copiarMapa(img: HTMLCanvasElement, off: number, alfa: number) {
    ctx!.globalAlpha = alfa
    for (let x = -off; x < w; x += mapaL) ctx!.drawImage(img, x, topo, mapaL, mapaA)
    ctx!.globalAlpha = 1
  }

  function desenharEstrelas(t: number) {
    if (!paleta.estrelas) return
    for (const e of estrelas) {
      const a = (0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.3 + e.f))) * (leitura() ? 0.55 : 1)
      ctx!.fillStyle = `rgba(235,248,255,${a})`
      ctx!.fillRect(e.x, e.y, e.r, e.r)
    }
    // estrela cadente ocasional, cruzando o alto da tela
    const fase = t / PERIODO_METEORO
    const k = fract(fase)
    if (k < 0.12 && !reduzir && !leitura()) {
      const rs = gerador(Math.floor(fase) + 3)
      const x0 = w * (0.2 + rs() * 0.7), y0 = h * (0.02 + rs() * 0.18)
      const p = k / 0.12
      const x = x0 - p * w * 0.22, y = y0 + p * h * 0.12
      const g = ctx!.createLinearGradient(x + 90, y - 50, x, y)
      const a = Math.sin(p * Math.PI)
      g.addColorStop(0, 'rgba(160,240,230,0)')
      g.addColorStop(1, `rgba(255,255,255,${0.9 * a})`)
      ctx!.strokeStyle = g
      ctx!.lineWidth = 1.6
      ctx!.beginPath(); ctx!.moveTo(x + 90, y - 50); ctx!.lineTo(x, y); ctx!.stroke()
    }
  }

  function desenharVarredura(t: number, off: number) {
    if (reduzir || leitura() || !camadaForte) return
    const k = fract(t / PERIODO_VARREDURA)
    if (k > 0.55) return // passa e depois descansa um pouco
    const x = -120 + (k / 0.55) * (w + 240)
    // tres faixas sobrepostas = brilho mais forte no centro e borda suave
    const faixas: [number, number][] = [[110, 0.22], [46, 0.35], [12, 0.55]]
    for (const [larg, a] of faixas) {
      ctx!.save()
      ctx!.beginPath(); ctx!.rect(x - larg / 2, topo, larg, mapaA); ctx!.clip()
      copiarMapa(camadaForte, off, a)
      ctx!.restore()
    }
    const g = ctx!.createLinearGradient(0, topo, 0, topo + mapaA)
    g.addColorStop(0, rgba(paleta.rota, 0))
    g.addColorStop(0.5, rgba(paleta.rota, 0.35))
    g.addColorStop(1, rgba(paleta.rota, 0))
    ctx!.fillStyle = g
    ctx!.fillRect(x - 0.75, topo, 1.5, mapaA)
  }

  function desenharCintilantes(t: number, off: number) {
    for (const p of cintilantes) {
      const a = (reduzir ? 0.6 : Math.max(0, Math.sin(t * 1.6 + p.fase))) * (leitura() ? 0.45 : 1)
      if (a < 0.05) continue
      ctx!.fillStyle = rgba(paleta.pontoForte, a * 0.9)
      for (let base = -off; base < w; base += mapaL) {
        const x = base + p.x
        if (x < -4 || x > w + 4) continue
        ctx!.beginPath(); ctx!.arc(x, topo + p.y, passo * 0.36, 0, Math.PI * 2); ctx!.fill()
      }
    }
  }

  // Rota em arco (curva de Bezier) com um pulso de luz percorrendo o caminho
  function desenharRotas(t: number, off: number) {
    const f = leitura() ? 0.5 : 1
    ROTAS.forEach(([a, b], i) => {
      let [x1, y1] = projetar(...CIDADES[a])
      let [x2, y2] = projetar(...CIDADES[b])
      // escolhe o caminho mais curto (pode atravessar a "emenda" do mapa)
      if (x2 - x1 > mapaL / 2) x2 -= mapaL
      else if (x1 - x2 > mapaL / 2) x2 += mapaL
      const d = Math.hypot(x2 - x1, y2 - y1)
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2 - d * 0.28
      const ponto = (u: number): [number, number] => [
        (1 - u) * (1 - u) * x1 + 2 * (1 - u) * u * cx + u * u * x2,
        (1 - u) * (1 - u) * y1 + 2 * (1 - u) * u * cy + u * u * y2,
      ]
      const cabeca = reduzir ? 0.6 : fract(t * 0.11 + i * 0.137)

      for (let base = -off - mapaL; base < w + mapaL; base += mapaL) {
        const minX = Math.min(x1, x2) + base, maxX = Math.max(x1, x2) + base
        if (maxX < -20 || minX > w + 20) continue
        ctx!.save()
        ctx!.translate(base, topo)
        // trilho fraco
        ctx!.strokeStyle = rgba(paleta.rota, 0.13 * f)
        ctx!.lineWidth = 1
        ctx!.beginPath(); ctx!.moveTo(x1, y1); ctx!.quadraticCurveTo(cx, cy, x2, y2); ctx!.stroke()
        // cauda do pulso
        const N = 14
        for (let s = 0; s < N; s++) {
          const u0 = cabeca - 0.16 * (1 - s / N), u1 = cabeca - 0.16 * (1 - (s + 1) / N)
          if (u1 <= 0) continue
          const [ax, ay] = ponto(Math.max(0, u0)), [bx, by] = ponto(u1)
          ctx!.strokeStyle = rgba(paleta.rota, 0.75 * f * ((s + 1) / N) ** 2)
          ctx!.lineWidth = 1.6
          ctx!.beginPath(); ctx!.moveTo(ax, ay); ctx!.lineTo(bx, by); ctx!.stroke()
        }
        const [hx, hy] = ponto(cabeca)
        ctx!.fillStyle = rgba(paleta.pontoForte, 0.95 * f)
        ctx!.shadowColor = rgba(paleta.rota, 0.9)
        ctx!.shadowBlur = 10
        ctx!.beginPath(); ctx!.arc(hx, hy, 1.9, 0, Math.PI * 2); ctx!.fill()
        ctx!.restore()
      }
    })
  }

  function desenharCidades(t: number, off: number) {
    const f = leitura() ? 0.5 : 1
    CIDADES.forEach(([lat, lon], i) => {
      const [px, py] = projetar(lat, lon)
      const principal = i === 0 // Florianopolis
      const k = reduzir ? 0.4 : fract(t * 0.35 + i * 0.29)
      for (let base = -off; base < w; base += mapaL) {
        const x = base + px, y = topo + py
        if (x < -30 || x > w + 30) continue
        ctx!.strokeStyle = rgba(paleta.pulso, f * (1 - k) * (principal ? 0.9 : 0.55))
        ctx!.lineWidth = principal ? 1.4 : 1
        ctx!.beginPath(); ctx!.arc(x, y, 2 + k * (principal ? 22 : 14), 0, Math.PI * 2); ctx!.stroke()
        ctx!.fillStyle = rgba(paleta.pontoForte, f * (principal ? 1 : 0.85))
        ctx!.beginPath(); ctx!.arc(x, y, principal ? 2.6 : 1.8, 0, Math.PI * 2); ctx!.fill()
      }
    })
  }

  function desenharLanterna(off: number) {
    if (leitura() || mouse.forca < 0.02 || !camadaForte) return
    ctx!.save()
    ctx!.beginPath(); ctx!.arc(mouse.x, mouse.y, 120, 0, Math.PI * 2); ctx!.clip()
    copiarMapa(camadaForte, off, 0.22 * mouse.forca)
    ctx!.beginPath(); ctx!.arc(mouse.x, mouse.y, 60, 0, Math.PI * 2); ctx!.clip()
    copiarMapa(camadaForte, off, 0.3 * mouse.forca)
    ctx!.restore()
  }

  function avisarLongitude(off: number, agora: number) {
    if (!op.aoMudarLongitude || agora - ultimoAviso < 250) return
    const lon = Math.round(fract((off + w / 2) / mapaL) * 360 - 180)
    if (lon === ultimaLon) return
    ultimaLon = lon
    ultimoAviso = agora
    op.aoMudarLongitude(lon)
  }

  const inicio = performance.now()
  function desenhar(agora: number) {
    const t = (agora - inicio) / 1000
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx!.clearRect(0, 0, w, h)
    if (!camadaBase) return
    mouse.forca += (mouse.alvo - mouse.forca) * 0.08
    const off = deslocamento(t)
    desenharEstrelas(t)
    copiarMapa(camadaBase, off, 1)
    desenharVarredura(t, off)
    desenharCintilantes(t, off)
    desenharRotas(t, off)
    desenharCidades(t, off)
    desenharLanterna(off)
    avisarLongitude(off, agora)
  }

  function laco(agora: number) {
    if (!ativo) return
    desenhar(agora)
    quadro = requestAnimationFrame(laco)
  }

  function iniciarDesenho() {
    if (reduzir) desenhar(performance.now())
    else quadro = requestAnimationFrame(laco)
  }

  // Carrega a mascara dos continentes e le os pixels uma vez so
  const img = new Image()
  img.onload = () => {
    if (!ativo) return
    const c = document.createElement('canvas')
    larguraMascara = 720
    alturaMascara = 360
    c.width = larguraMascara
    c.height = alturaMascara
    const g = c.getContext('2d', { willReadFrequently: true })!
    g.drawImage(img, 0, 0, larguraMascara, alturaMascara)
    terra = g.getImageData(0, 0, larguraMascara, alturaMascara).data
    montar()
    iniciarDesenho()
  }
  img.src = op.mascaraContinentes

  // Redimensionamento (com pequena espera para nao recalcular a cada pixel)
  let esperaResize = 0
  const aoRedimensionar = () => {
    window.clearTimeout(esperaResize)
    esperaResize = window.setTimeout(() => {
      if (!terra) return
      montar()
      if (reduzir) desenhar(performance.now())
    }, 150)
  }
  window.addEventListener('resize', aoRedimensionar)

  // Lanterna do mouse (o canvas nao recebe cliques: escutamos a janela)
  const aoMover = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    mouse.x = e.clientX
    mouse.y = e.clientY
    mouse.alvo = 1
  }
  const aoSair = () => { mouse.alvo = 0 }
  if (!reduzir) {
    window.addEventListener('pointermove', aoMover, { passive: true })
    document.documentElement.addEventListener('pointerleave', aoSair)
  }

  // Troca de tema claro/escuro: repinta os pontos com a outra paleta
  const observador = new MutationObserver(() => {
    const claro = temaClaro()
    if ((paleta === PALETA_CLARA) === claro || !terra) return
    pintarCamadas()
    if (reduzir) desenhar(performance.now())
  })
  observador.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

  return {
    definirModo(novo: ModoMapaMundi) {
      if (novo.intensidade === modo.intensidade && novo.forcarEscuro === modo.forcarEscuro) return
      modo = { ...novo }
      if (!terra) return
      pintarCamadas()
      if (reduzir) desenhar(performance.now())
    },
    desligar() {
      ativo = false
      cancelAnimationFrame(quadro)
      window.clearTimeout(esperaResize)
      window.removeEventListener('resize', aoRedimensionar)
      window.removeEventListener('pointermove', aoMover)
      document.documentElement.removeEventListener('pointerleave', aoSair)
      observador.disconnect()
      img.onload = null
    },
  }
}
