// @vitest-environment jsdom
//
// ESCUTA CONTINUA DA CURADORIA POR VOZ (Fase 3c): frontend/src/lib/escutaContinua.ts.
// O microfone abre uma vez; o modulo percebe quando o curador fala e quando
// para, e entrega cada fala como um trecho de audio. Aqui o microfone, o
// gravador e o medidor de volume sao simulados (o "volume" e escolhido pelo
// teste) e o relogio e falso. Confere: sem suporte / sem permissao, fala
// normal vira 1 trecho, estalo curto e silencio sao descartados, fala longa
// e cortada, pausa nao envia nada, parar fecha o microfone, e que o modulo
// nunca manda nada pela rede (o envio e de quem recebe o trecho). Nenhum
// audio real.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EscutaContinua } from '../../../../frontend/src/lib/escutaContinua'

const sala = vi.hoisted(() => ({ volume: 0, estadoContexto: 'running', gravadores: [] as GravadorFalso[], trilhaParada: 0, contextoFechado: 0, retomadas: 0 }))

class GravadorFalso {
  static isTypeSupported = (tipo: string) => tipo === 'audio/webm'
  state: 'inactive' | 'recording' = 'inactive'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  constructor(_fluxo: unknown, public opcoes?: { mimeType?: string }) {
    sala.gravadores.push(this)
  }
  get mimeType() {
    return this.opcoes?.mimeType ?? ''
  }
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['som'], { type: 'audio/webm' }) })
    this.onstop?.()
  }
}
class ContextoFalso {
  get state() {
    return sala.estadoContexto
  }
  resume() {
    sala.retomadas += 1
    return Promise.resolve()
  }
  close() {
    sala.contextoFechado += 1
    return Promise.resolve()
  }
  createAnalyser() {
    return {
      fftSize: 0,
      // "onda" quadrada com a amplitude escolhida pelo teste: o volume (RMS) e igual a ela
      getFloatTimeDomainData: (amostras: Float32Array) => amostras.fill(sala.volume),
    }
  }
  createMediaStreamSource() {
    return { connect: () => {} }
  }
}

let pedirMicrofone: ReturnType<typeof vi.fn>
function preparar() {
  pedirMicrofone = vi.fn(async () => ({ getTracks: () => [{ stop: () => (sala.trilhaParada += 1) }] }))
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: pedirMicrofone } })
  vi.stubGlobal('MediaRecorder', GravadorFalso)
  vi.stubGlobal('AudioContext', ContextoFalso)
}
function nova() {
  const trechos: Blob[] = []
  const falando: boolean[] = []
  const niveis: number[] = []
  const escuta = new EscutaContinua({ onTrecho: (a) => trechos.push(a), onFalando: (f) => falando.push(f), onNivel: (n) => niveis.push(n) })
  return { escuta, trechos, falando, niveis }
}
/** fala (volume alto) por `ms` e depois fica em silencio por `silencio` ms */
function falar(ms: number, silencio = 700, volume = 0.2) {
  sala.volume = volume
  vi.advanceTimersByTime(ms)
  sala.volume = 0
  vi.advanceTimersByTime(silencio)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance', 'Date'] })
  Object.assign(sala, { volume: 0, estadoContexto: 'running', gravadores: [], trilhaParada: 0, contextoFechado: 0, retomadas: 0 })
  preparar()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('abrir o microfone', () => {
  it('navegador sem microfone/gravador: "semSuporte", sem pedir permissao', async () => {
    vi.stubGlobal('MediaRecorder', undefined)
    const { escuta } = nova()
    expect(await escuta.iniciar()).toBe('semSuporte')
    expect(pedirMicrofone).not.toHaveBeenCalled()
    expect(escuta.ativa).toBe(false)
  })

  it('pessoa nega o microfone: "semPermissao"', async () => {
    pedirMicrofone.mockRejectedValueOnce(new Error('NotAllowedError'))
    const { escuta } = nova()
    expect(await escuta.iniciar()).toBe('semPermissao')
    expect(escuta.ativa).toBe(false)
  })

  it('abre uma vez so, com reducao de eco e ruido; grava no formato aceito', async () => {
    const { escuta } = nova()
    expect(await escuta.iniciar()).toBeNull()
    expect(await escuta.iniciar()).toBeNull()
    expect(pedirMicrofone).toHaveBeenCalledTimes(1)
    expect(pedirMicrofone.mock.calls[0][0]).toEqual({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })
    expect(escuta.ativa).toBe(true)
    expect(sala.gravadores[0].opcoes).toEqual({ mimeType: 'audio/webm' })
    escuta.parar()
  })

  it('audio "suspenso" pelo navegador: retoma no primeiro clique ou tecla', async () => {
    sala.estadoContexto = 'suspended'
    const { escuta } = nova()
    await escuta.iniciar()
    const antes = sala.retomadas
    document.dispatchEvent(new Event('pointerdown'))
    document.dispatchEvent(new Event('keydown'))
    expect(sala.retomadas).toBe(antes + 2)
    escuta.parar()
    document.dispatchEvent(new Event('pointerdown'))
    expect(sala.retomadas).toBe(antes + 2) // depois de parar, nao escuta mais cliques
  })
})

describe('perceber as falas', () => {
  it('fala normal + pausa: avisa "falando" e entrega 1 trecho de audio; o volume vai para o medidor', async () => {
    const { escuta, trechos, falando, niveis } = nova()
    await escuta.iniciar()
    falar(400)
    expect(falando).toEqual([true, false])
    expect(trechos).toHaveLength(1)
    expect(trechos[0].type).toBe('audio/webm')
    expect(Math.max(...niveis)).toBeCloseTo(0.2)
    escuta.parar()
  })

  it('duas falas separadas por pausa viram dois trechos', async () => {
    const { escuta, trechos } = nova()
    await escuta.iniciar()
    falar(300)
    falar(300)
    expect(trechos).toHaveLength(2)
    escuta.parar()
  })

  it('estalo curto (menos de 150 ms) nao vira trecho', async () => {
    const { escuta, trechos, falando } = nova()
    await escuta.iniciar()
    falar(80)
    expect(falando).toEqual([true, false])
    expect(trechos).toHaveLength(0)
    escuta.parar()
  })

  it('so silencio por muito tempo: recomeca a gravacao e nao entrega nada', async () => {
    const { escuta, trechos } = nova()
    await escuta.iniciar()
    vi.advanceTimersByTime(13000)
    expect(sala.gravadores.length).toBeGreaterThanOrEqual(3)
    expect(trechos).toHaveLength(0)
    escuta.parar()
  })

  it('ruido de fundo constante e baixo nao conta como fala', async () => {
    const { escuta, trechos, falando } = nova()
    await escuta.iniciar()
    sala.volume = 0.01 // abaixo do minimo
    vi.advanceTimersByTime(3000)
    expect(falando).toEqual([])
    expect(trechos).toHaveLength(0)
    escuta.parar()
  })

  it('fala sem pausa por mais de 25 s: corta e entrega mesmo assim', async () => {
    const { escuta, trechos } = nova()
    await escuta.iniciar()
    sala.volume = 0.2
    vi.advanceTimersByTime(25200)
    expect(trechos).toHaveLength(1)
    escuta.parar()
  })

  it('pausada: mede o volume, mas nao envia; ao retomar, volta a entregar', async () => {
    const { escuta, trechos, niveis } = nova()
    await escuta.iniciar()
    escuta.pausar(true)
    expect(escuta.estaPausada).toBe(true)
    falar(400)
    expect(trechos).toHaveLength(0)
    expect(niveis.length).toBeGreaterThan(0)
    escuta.pausar(false)
    falar(400)
    expect(trechos).toHaveLength(1)
    escuta.parar()
  })
})

describe('parar e privacidade', () => {
  it('parar fecha o microfone e o audio, descarta a fala em andamento e apaga o "falando"', async () => {
    const { escuta, trechos, falando } = nova()
    await escuta.iniciar()
    sala.volume = 0.2
    vi.advanceTimersByTime(300)
    escuta.parar()
    expect(sala.trilhaParada).toBe(1)
    expect(sala.contextoFechado).toBe(1)
    expect(escuta.ativa).toBe(false)
    expect(falando.at(-1)).toBe(false)
    expect(trechos).toHaveLength(0)
    vi.advanceTimersByTime(2000)
    expect(trechos).toHaveLength(0) // o relogio parou
  })

  it('o modulo nao manda audio pela rede (so entrega o trecho a tela)', async () => {
    const rede = vi.fn()
    vi.stubGlobal('fetch', rede)
    const { escuta, trechos } = nova()
    await escuta.iniciar()
    falar(400)
    escuta.parar()
    expect(trechos).toHaveLength(1)
    expect(rede).not.toHaveBeenCalled()
  })
})
