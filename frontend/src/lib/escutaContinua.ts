// ESCUTA CONTINUA DA CURADORIA POR VOZ.
//
// O microfone abre UMA vez (no inicio da curadoria) e fica aberto. Este
// modulo percebe sozinho quando o curador FALA e quando ele PARA de falar
// (deteccao de atividade de voz, em ingles "VAD" - Voice Activity
// Detection): mede o volume do microfone ~25 vezes por segundo e compara
// com o ruido de fundo da sala.
//
// Cada fala (ex.: "ok", pausa, "pan", pausa, "35") vira um TRECHO de audio
// separado, entregue a `onTrecho` assim que o curador faz uma pausa curta.
// O trecho e transcrito pelo Whisper local (radix-whisper) e interpretado
// para o item no holofote; o holofote entao passa sozinho ao proximo item.
//
// Privacidade (LGPD): o audio so sai do navegador para o servidor do
// proprio Radix (nunca para servicos externos) e nao e gravado em disco;
// trechos so com ruido (sem fala) sao descartados aqui mesmo.

/** pausa (ms) que encerra uma fala - curta para ser rapido */
const SILENCIO_FIM_MS = 550
/** fala minima (ms) para valer como trecho (descarta estalos e tosse curta) */
const FALA_MINIMA_MS = 150
/** fala maxima (ms) num trecho - textos longos sao cortados nas pausas */
const FALA_MAXIMA_MS = 25000
/** sem fala por este tempo: recomeca a gravacao (descarta o silencio) */
const RECICLAR_SILENCIO_MS = 6000
const INTERVALO_MS = 40
/** volume minimo considerado fala (0 a 1), mesmo em sala muito silenciosa */
const LIMIAR_MINIMO = 0.012
/** a fala precisa ser X vezes mais alta que o ruido de fundo */
const FATOR_RUIDO = 2.6

export type ErroEscuta = 'semSuporte' | 'semPermissao'

export interface OpcoesEscuta {
  /** trecho com fala pronto para transcrever */
  onTrecho: (audio: Blob) => void
  /** comecou/parou de falar (para o indicador na tela) */
  onFalando?: (falando: boolean) => void
  /** volume atual 0..1 (para o medidor na tela) */
  onNivel?: (nivel: number) => void
}

export class EscutaContinua {
  private fluxo: MediaStream | null = null
  private contexto: AudioContext | null = null
  private analisador: AnalyserNode | null = null
  private gravador: MediaRecorder | null = null
  private pedacos: Blob[] = []
  private relogio: ReturnType<typeof setInterval> | null = null
  private tipo = ''
  private falando = false
  private inicioFala = 0
  private ultimaVoz = 0
  private inicioGravacao = 0
  private ruido = 0.008
  private pausada = false
  private retomar = () => {
    this.contexto?.resume().catch(() => {})
  }

  constructor(private opcoes: OpcoesEscuta) {}

  get ativa(): boolean {
    return this.fluxo !== null
  }

  async iniciar(): Promise<ErroEscuta | null> {
    if (this.fluxo) return null
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined' || typeof AudioContext === 'undefined') {
      return 'semSuporte'
    }
    try {
      this.fluxo = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      })
    } catch {
      return 'semPermissao'
    }
    this.tipo = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
    this.contexto = new AudioContext()
    // o navegador so libera o audio depois de um clique/tecla do usuario:
    // se ainda estiver "suspenso", retoma no primeiro clique ou tecla
    if (this.contexto.state === 'suspended') {
      this.contexto.resume().catch(() => {})
      document.addEventListener('pointerdown', this.retomar)
      document.addEventListener('keydown', this.retomar)
    }
    this.analisador = this.contexto.createAnalyser()
    this.analisador.fftSize = 1024
    this.contexto.createMediaStreamSource(this.fluxo).connect(this.analisador)
    this.pausada = false
    this.novaGravacao()
    this.relogio = setInterval(() => this.medir(), INTERVALO_MS)
    return null
  }

  /** pausa (o microfone continua aberto, mas nada e enviado) */
  pausar(pausar: boolean) {
    this.pausada = pausar
    if (pausar) this.cortar(false)
  }

  get estaPausada(): boolean {
    return this.pausada
  }

  parar() {
    if (this.relogio) clearInterval(this.relogio)
    this.relogio = null
    this.cortar(false, false)
    this.fluxo?.getTracks().forEach((f) => f.stop())
    this.fluxo = null
    document.removeEventListener('pointerdown', this.retomar)
    document.removeEventListener('keydown', this.retomar)
    this.contexto?.close().catch(() => {})
    this.contexto = null
    this.analisador = null
    this.definirFalando(false)
  }

  private novaGravacao() {
    if (!this.fluxo) return
    const gravador = new MediaRecorder(this.fluxo, this.tipo ? { mimeType: this.tipo } : undefined)
    const pedacos: Blob[] = []
    gravador.ondataavailable = (e) => e.data.size && pedacos.push(e.data)
    this.pedacos = pedacos
    gravador.start()
    this.gravador = gravador
    this.inicioGravacao = performance.now()
  }

  /** encerra a gravacao atual; `enviar` = tinha fala; recomeca em seguida */
  private cortar(enviar: boolean, recomecar = true) {
    const gravador = this.gravador
    const pedacos = this.pedacos
    this.gravador = null
    if (gravador && gravador.state !== 'inactive') {
      gravador.onstop = () => {
        if (!enviar) return
        const audio = new Blob(pedacos, { type: gravador.mimeType || 'audio/webm' })
        if (audio.size > 0) this.opcoes.onTrecho(audio)
      }
      gravador.stop()
    }
    // a proxima gravacao ja comeca agora: o inicio da proxima fala nao se perde
    if (recomecar && this.fluxo) this.novaGravacao()
  }

  private definirFalando(falando: boolean) {
    if (this.falando === falando) return
    this.falando = falando
    this.opcoes.onFalando?.(falando)
  }

  private medir() {
    const analisador = this.analisador
    if (!analisador) return
    const amostras = new Float32Array(analisador.fftSize)
    analisador.getFloatTimeDomainData(amostras)
    let soma = 0
    for (let i = 0; i < amostras.length; i++) soma += amostras[i] * amostras[i]
    const nivel = Math.sqrt(soma / amostras.length)
    this.opcoes.onNivel?.(nivel)
    if (this.pausada) return

    const agora = performance.now()
    const limiar = Math.max(LIMIAR_MINIMO, this.ruido * FATOR_RUIDO)
    if (nivel > limiar) {
      if (!this.falando) {
        this.inicioFala = agora
        this.definirFalando(true)
      }
      this.ultimaVoz = agora
    } else if (!this.falando) {
      // aprende o ruido de fundo da sala so nos momentos sem fala
      this.ruido = this.ruido * 0.95 + nivel * 0.05
    }

    if (this.falando) {
      const duracao = this.ultimaVoz - this.inicioFala
      if (agora - this.ultimaVoz > SILENCIO_FIM_MS) {
        this.definirFalando(false)
        this.cortar(duracao >= FALA_MINIMA_MS)
      } else if (agora - this.inicioFala > FALA_MAXIMA_MS) {
        this.definirFalando(false)
        this.cortar(true)
      }
    } else if (agora - this.inicioGravacao > RECICLAR_SILENCIO_MS) {
      this.cortar(false)
    }
  }
}
