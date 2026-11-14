// @vitest-environment jsdom
//
// COMPONENTE "Curadoria por voz" (Fase 2, 13/11/2026):
// frontend/src/components/curadoria/PainelVoz.tsx - o microfone da Curadoria.
// Dois jeitos de usar:
// - gravar e parar (painel flutuante, Alt+V): grava um trecho, manda ao
//   servidor de transcricao e preenche a ficha;
// - escuta continua (coluna da ficha, tecla espaco): o microfone fica aberto
//   e cada fala vai para o item aceso.
//
// SIMULADO (o navegador de teste nao tem microfone nem som):
// - o microfone (navigator.mediaDevices.getUserMedia) e o gravador
//   (MediaRecorder): o "audio" e um pedaco de texto qualquer;
// - a escuta continua (lib/escutaContinua.ts), que mede o volume do som
//   para separar as falas: aqui o teste entrega o trecho na mao;
// - o "interpretador" das falas (lib/vozCuradoria.ts, regras proprias):
//   aqui cada frase de teste tem uma resposta fixa. O componente e o que
//   esta sob teste: o que ele faz com cada resposta (preencher, perguntar,
//   comandos, mudar de item).
// FICA DE FORA (so com microfone real, no Playwright ou a mao): a qualidade
// da transcricao, a deteccao de pausa na fala e a permissao do navegador.
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PainelVoz from '../../../../frontend/src/components/curadoria/PainelVoz'
import type { FormularioFicha } from '../../../../frontend/src/components/curadoria/FichaCuradoriaForm'
import type { ResultadoVoz } from '../../../../frontend/src/lib/vozCuradoria'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

// ---------- interpretador simulado: frase de teste -> resposta fixa ----------
const voz = vi.hoisted(() => ({
  respostas: {} as Record<string, Partial<ResultadoVoz>>,
  chamadas: [] as { texto: string; opcoes: unknown }[],
}))
vi.mock('../../../../frontend/src/lib/vozCuradoria', () => ({
  interpretar: (texto: string, _ficha: unknown, _vocab: unknown, opcoes: unknown) => {
    voz.chamadas.push({ texto, opcoes })
    return { ficha: {}, alteracoes: [], naoReconhecidos: [], comandos: [], ...voz.respostas[texto] }
  },
  // escolher uma sugestao falando: a fala igual ao rotulo escolhe
  escolherSugestaoPorVoz: (texto: string, rotulos: string[]) => (rotulos.includes(texto) ? rotulos.indexOf(texto) : null),
  // "o item aceso foi resolvido" quando a fala preencheu algo
  itemResolvidoPelaFala: (_etapa: string, r: ResultadoVoz) => r.alteracoes.length > 0,
}))

// ---------- escuta continua simulada ----------
const escuta = vi.hoisted(() => ({
  falha: null as null | 'semSuporte' | 'semPermissao',
  atual: null as null | {
    onTrecho: (b: Blob) => void
    onFalando?: (f: boolean) => void
    pausas: boolean[]
    parada: boolean
  },
}))
vi.mock('../../../../frontend/src/lib/escutaContinua', () => ({
  EscutaContinua: class {
    pausas: boolean[] = []
    parada = false
    ligada = false
    onTrecho: (b: Blob) => void
    onFalando?: (f: boolean) => void
    constructor(op: { onTrecho: (b: Blob) => void; onFalando?: (f: boolean) => void }) {
      this.onTrecho = op.onTrecho
      this.onFalando = op.onFalando
      escuta.atual = this
    }
    get ativa() {
      return this.ligada
    }
    async iniciar() {
      if (escuta.falha) return escuta.falha
      this.ligada = true
      return null
    }
    pausar(p: boolean) {
      this.pausas.push(p)
    }
    parar() {
      this.parada = true
    }
  },
}))

// ---------- microfone e gravador simulados ----------
const faixa = { stop: vi.fn() }
const microfone = { getUserMedia: vi.fn(async () => ({ getTracks: () => [faixa] })) }
class GravadorFalso {
  static isTypeSupported = (m: string) => m === 'audio/webm'
  static ultimo: GravadorFalso | null = null
  state = 'inactive'
  mimeType: string
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  constructor(_fluxo: unknown, op?: { mimeType?: string }) {
    this.mimeType = op?.mimeType ?? ''
    GravadorFalso.ultimo = this
  }
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['audio de teste'], { type: this.mimeType }) })
    this.onstop?.()
  }
}

const FORM = {
  tipo_radiografia: 'periapical',
  dentes: [],
  marcacoes: [],
  achados: [],
  descricao_didatica: '',
  achados_detalhe: '',
  observacoes_internas: 'Primeira nota',
} as unknown as FormularioFicha

let pedidosAtuais: { caminho: string }[] = []
function servidor(transcrever: Rota = { corpo: { texto: 'dente 36' } }, extras: Record<string, Rota> = {}) {
  const s = servidorFalso({
    'GET /voz/saude': { corpo: { disponivel: true } },
    'GET /vocabulario': { corpo: { termos: [{ id: 1, termo: 'cárie' }] } },
    'POST /voz/transcrever': transcrever,
    'POST /voz/aquecer': { corpo: {} },
    'POST /voz/frases': { corpo: {} },
    ...extras,
  })
  pedidosAtuais = s.pedidos
  return s
}
const altV = () => fireEvent.keyDown(window, { key: 'v', altKey: true })

beforeEach(() => {
  voz.respostas = {}
  voz.chamadas = []
  escuta.falha = null
  escuta.atual = null
  faixa.stop.mockClear()
  microfone.getUserMedia.mockClear()
  Object.defineProperty(navigator, 'mediaDevices', { value: microfone, configurable: true })
  vi.stubGlobal('MediaRecorder', GravadorFalso)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('painel flutuante: gravar e parar', () => {
  it('fechado mostra so o botao; aberto mostra privacidade e a ajuda "Como falar"', async () => {
    const usuario = userEvent.setup()
    servidor()
    montarTela(<PainelVoz fichaId={1} form={FORM} onAplicar={vi.fn()} onSalvar={vi.fn()} />)
    await usuario.click(screen.getByRole('button', { name: 'Curadoria por voz' }))
    expect(screen.getByText(/O áudio é transcrito no próprio Rádix Imago e não é guardado/)).toBeTruthy()
    const ajuda = screen.getByRole('button', { name: /Como falar/ })
    await usuario.click(ajuda)
    expect(ajuda.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(/Comandos: “desfazer”/)).toBeTruthy()
    await usuario.click(screen.getByRole('button', { name: '▾' }))
    expect(screen.getByRole('button', { name: 'Curadoria por voz' })).toBeTruthy()
  })

  it('servico de voz desligado: avisa e o microfone fica desativado', async () => {
    const usuario = userEvent.setup()
    servidorFalso({ 'GET /voz/saude': { corpo: { disponivel: false } }, 'GET /vocabulario': { status: 500 } })
    montarTela(<PainelVoz fichaId={1} form={FORM} onAplicar={vi.fn()} onSalvar={vi.fn()} />)
    await usuario.click(screen.getByRole('button', { name: 'Curadoria por voz' }))
    expect(await screen.findByText(/Serviço de voz indisponível/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Falar (Alt+V)' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('Alt+V grava, Alt+V para: manda o audio, preenche a ficha, lista o preenchido e desfaz', async () => {
    const usuario = userEvent.setup()
    const s = servidor()
    const aplicar = vi.fn()
    const destacar = vi.fn()
    voz.respostas['dente 36'] = { ficha: { dentes: [36] }, alteracoes: [{ campo: 'dentes', descricao: 'Dentes: 36' }] }
    montarTela(<PainelVoz fichaId={1} form={FORM} onAplicar={aplicar} onSalvar={vi.fn()} onDestacar={destacar} etapaAtiva="dentes" />)
    await screen.findByRole('button', { name: 'Curadoria por voz' })
    altV()
    expect(await screen.findByText('Gravando… 0:00')).toBeTruthy()
    expect(microfone.getUserMedia).toHaveBeenCalledWith({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
    expect(GravadorFalso.ultimo?.mimeType).toBe('audio/webm')
    altV()
    expect(await screen.findByText('“dente 36” → Dentes: 36')).toBeTruthy()
    expect(faixa.stop).toHaveBeenCalled() // desliga o microfone ao parar
    expect(s.alteracoes()).toContainEqual({ metodo: 'POST', caminho: '/voz/transcrever', corpo: { arquivo: 'arquivo:trecho.webm:audio/webm' } })
    expect(aplicar).toHaveBeenLastCalledWith({ ...FORM, dentes: [36] })
    expect(destacar).toHaveBeenCalledWith(['dentes'])
    expect(voz.chamadas[0].opcoes).toMatchObject({ secaoAtiva: 'dados', etapa: 'dentes' })
    expect(screen.getByText('A fala vai para:').textContent).toContain('Dentes')
    expect(screen.getByText('Preenchido pela voz')).toBeTruthy()
    expect(screen.getByText('Dentes: 36')).toBeTruthy()

    await usuario.click(screen.getByRole('button', { name: 'Desfazer' }))
    expect(aplicar).toHaveBeenLastCalledWith(FORM)
    expect(screen.getByText('Última alteração desfeita.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull() // nada mais a desfazer
  })

  it('o relogio conta os segundos e a gravacao para sozinha em 60 s', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'setTimeout', 'clearInterval', 'clearTimeout'] })
    servidor({ corpo: { texto: 'frase longa' } })
    voz.respostas['frase longa'] = { alteracoes: [{ campo: 'descricao_didatica', descricao: 'Descrição' }] }
    montarTela(<PainelVoz fichaId={1} form={FORM} onAplicar={vi.fn()} onSalvar={vi.fn()} />)
    altV()
    await vi.waitFor(() => expect(screen.getByText('Gravando… 0:00')).toBeTruthy())
    await vi.advanceTimersByTimeAsync(65_000 - 59_000) // 6 s
    expect(screen.getByText('Gravando… 0:06')).toBeTruthy()
    await vi.advanceTimersByTimeAsync(54_000) // completa 60 s
    vi.useRealTimers()
    expect(await screen.findByText('“frase longa” → Descrição')).toBeTruthy()
    expect(GravadorFalso.ultimo?.state).toBe('inactive')
  })

  it('navegador sem gravador ou microfone negado: explica o motivo', async () => {
    servidor()
    montarTela(<PainelVoz fichaId={1} form={FORM} onAplicar={vi.fn()} onSalvar={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Curadoria por voz' })) // abre o painel para ver o aviso
    microfone.getUserMedia.mockRejectedValueOnce(new Error('negado'))
    altV()
    expect(await screen.findByText('Sem acesso ao microfone. Permita o uso do microfone para este site.')).toBeTruthy()
    vi.stubGlobal('MediaRecorder', undefined)
    altV()
    expect(await screen.findByText('Este navegador não permite gravar áudio.')).toBeTruthy()
  })

  // cada resposta do servidor de transcricao e o que aparece para o curador
  const casos: [string, Rota, string][] = [
    ['sessao expirada (401)', { status: 401 }, 'Sua sessão expirou e o microfone foi pausado.'],
    ['muitos trechos (429)', { status: 429, corpo: { detail: 'limite' } }, 'Muitos trechos seguidos. Aguarde um minuto.'],
    ['erro com explicacao do servidor', { status: 503, corpo: { detail: 'Whisper desligado' } }, 'Whisper desligado'],
    ['erro sem explicacao', { status: 500, corpo: { outro: 1 } }, 'Não foi possível transcrever o áudio.'],
    ['servidor fora do ar', 'SEM_CONEXAO', 'Não foi possível transcrever o áudio.'],
    ['nenhuma fala no audio', { corpo: { texto: '  ' } }, 'Nenhuma fala foi detectada. Tente de novo, mais perto do microfone.'],
    ['fala sem nada reconhecido', { corpo: { texto: 'blá blá' } }, 'Não entendi: “blá blá”. Fale de novo a opção.'],
  ]
  it.each(casos)('%s', async (_nome, rota, mensagem) => {
    servidor(rota)
    montarTela(<PainelVoz fichaId={1} form={FORM} onAplicar={vi.fn()} onSalvar={vi.fn()} />)
    await screen.findByRole('button', { name: 'Curadoria por voz' })
    altV()
    await screen.findByText(/Gravando/)
    altV()
    expect(await screen.findByText((_c, el) => el?.tagName === 'P' && (el.textContent ?? '').startsWith(mensagem))).toBeTruthy()
  })

  it('erro que nao e JSON: mensagem padrao', async () => {
    servidorFalso({ 'GET /voz/saude': { corpo: { disponivel: true } }, 'GET /vocabulario': 'SEM_CONEXAO' })
    const fetchOriginal = globalThis.fetch
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) =>
      String(url).endsWith('/voz/transcrever') ? new Response('pane', { status: 502 }) : fetchOriginal(url, init)
    )
    montarTela(<PainelVoz fichaId={1} form={FORM} onAplicar={vi.fn()} onSalvar={vi.fn()} />)
    altV()
    await screen.findByText(/Gravando/)
    altV()
    expect(await screen.findByText('Não foi possível transcrever o áudio.')).toBeTruthy()
  })

  it('comandos falados: salvar, desfazer, nada a registrar e trocar de secao', async () => {
    const usuario = userEvent.setup()
    let fala = 'salvar'
    servidor(() => ({ corpo: { texto: fala } }))
    voz.respostas = {
      salvar: { comandos: ['salvar'] },
      'nada a registrar': { comandos: ['nada_a_registrar'] },
      'próxima seção': { comandos: ['proxima_secao'] },
      'seção anterior': { comandos: ['secao_anterior'] },
      desfazer: { comandos: ['desfazer'] },
    }
    const salvar = vi.fn()
    const nada = vi.fn()
    const etapa = vi.fn()
    const aplicar = vi.fn()
    montarTela(<PainelVoz fichaId={1} form={FORM} onAplicar={aplicar} onSalvar={salvar} onNadaRegistrar={nada} onEtapa={etapa} etapaAtiva="descricao" />)
    await screen.findByRole('button', { name: 'Curadoria por voz' })
    async function falar(texto: string) {
      fala = texto
      altV()
      await screen.findByText(/Gravando/)
      altV()
      await screen.findByText(`“${texto}”`)
    }
    await falar('salvar')
    expect(salvar).toHaveBeenCalledTimes(1)
    await falar('nada a registrar')
    expect(nada).toHaveBeenCalledWith('descricao')
    await falar('próxima seção')
    expect(etapa).toHaveBeenLastCalledWith('observacoes')
    await falar('seção anterior') // o destaque ja foi para "observacoes": volta para "descricao"
    expect(etapa).toHaveBeenLastCalledWith('descricao')
    await falar('desfazer') // sem nada a desfazer: nao mexe na ficha
    expect(aplicar).not.toHaveBeenCalled()
    await usuario.click(screen.getByRole('button', { name: '▾' }))
  })

  it('na etapa "aprovar" a fala nao preenche nada', async () => {
    servidor({ corpo: { texto: 'dente 36' } })
    voz.respostas['dente 36'] = { alteracoes: [{ campo: 'dentes', descricao: 'Dentes: 36' }] }
    const aplicar = vi.fn()
    montarTela(<PainelVoz fichaId={1} form={FORM} onAplicar={aplicar} onSalvar={vi.fn()} etapaAtiva="aprovar" />)
    altV()
    await screen.findByText(/Gravando/)
    altV()
    expect(await screen.findByText('“dente 36”')).toBeTruthy()
    expect(voz.chamadas).toHaveLength(0)
    expect(aplicar).not.toHaveBeenCalled()
  })
})

describe('duvidas: fala nao reconhecida espera a confirmacao do curador', () => {
  function sugestoes() {
    return [
      { rotulo: 'Cárie', aplicar: () => ({ termos: [1] }), destino: { tipo: 'termo' as const, valor: '1' }, campo: 'termos' as const },
      { rotulo: 'Tipo panorâmica', aplicar: () => ({ tipo_radiografia: 'panoramica' }), destino: { tipo: 'tipo' as const, valor: 'panoramica' } },
    ]
  }
  async function falarDuvida(props: Partial<Parameters<typeof PainelVoz>[0]> = {}, texto = 'carry') {
    const s = servidor({ corpo: { texto } })
    voz.respostas[texto] = { naoReconhecidos: [{ texto, sugestoes: sugestoes(), parecido: true }] }
    const aplicar = vi.fn()
    const duvidas = vi.fn()
    const aprendeu = vi.fn()
    montarTela(<PainelVoz fichaId={1} form={FORM} onAplicar={aplicar} onSalvar={vi.fn()} onDuvidas={duvidas} onAprendeu={aprendeu} {...props} />)
    await screen.findByRole('button', { name: 'Curadoria por voz' })
    altV()
    await screen.findByText(/Gravando/)
    altV()
    await screen.findByText('Dúvidas (1) — confirme antes de entrar na ficha')
    return { s, aplicar, duvidas, aprendeu }
  }

  it('"Você quis dizer Cárie?": aceita, preenche e ensina a frase ao sistema', async () => {
    const usuario = userEvent.setup()
    const { s, aplicar, duvidas, aprendeu } = await falarDuvida()
    expect(duvidas).toHaveBeenLastCalledWith(1)
    expect((screen.getByRole('checkbox', { name: /Lembrar esta correção/ }) as HTMLInputElement).checked).toBe(true)
    await usuario.click(screen.getByRole('button', { name: 'Você quis dizer Cárie?' }))
    expect(aplicar).toHaveBeenLastCalledWith({ ...FORM, termos: [1] })
    expect(duvidas).toHaveBeenLastCalledWith(0)
    // o aviso so aparece depois que o servidor guardou a frase
    expect(await screen.findByText('Aprendido: “carry” será reconhecido da próxima vez.')).toBeTruthy()
    expect(aprendeu).toHaveBeenCalled()
    expect(s.alteracoes()).toContainEqual({ metodo: 'POST', caminho: '/voz/frases', corpo: { frase: 'carry', tipo: 'termo', valor: '1' } })
    expect(s.pedidos.filter((p) => p.caminho === '/vocabulario')).toHaveLength(2) // recarrega o vocabulario
    expect(screen.getByText('Cárie')).toBeTruthy() // entra em "Preenchido pela voz"
  })

  it('desmarcar "Lembrar" aceita sem ensinar; sugestao que nao ensina tambem nao manda nada', async () => {
    const usuario = userEvent.setup()
    const { s, aplicar } = await falarDuvida()
    await usuario.click(screen.getByRole('checkbox', { name: /Lembrar esta correção/ }))
    await usuario.click(screen.getByRole('button', { name: 'Você quis dizer Cárie?' }))
    expect(aplicar).toHaveBeenLastCalledWith({ ...FORM, termos: [1] })
    cleanup()
    const segunda = await falarDuvida()
    await usuario.click(screen.getByRole('button', { name: 'Tipo panorâmica' })) // "tipo" nao se ensina
    expect(segunda.aplicar).toHaveBeenLastCalledWith({ ...FORM, tipo_radiografia: 'panoramica' })
    await new Promise((r) => setTimeout(r, 20))
    expect([...s.alteracoes(), ...segunda.s.alteracoes()].filter((p) => p.caminho === '/voz/frases')).toHaveLength(0)
  })

  it('falha ao ensinar: a sugestao entra na ficha mesmo assim, sem aviso de aprendido', async () => {
    const usuario = userEvent.setup()
    const { aplicar, aprendeu } = await falarDuvida()
    const s = servidorFalso({ 'POST /voz/frases': 'SEM_CONEXAO' })
    await usuario.click(screen.getByRole('button', { name: 'Você quis dizer Cárie?' }))
    expect(aplicar).toHaveBeenCalled()
    expect(aprendeu).not.toHaveBeenCalled()
    await waitFor(() => expect(s.pedidos.map((p) => p.caminho)).toContain('/voz/frases'))
    expect(screen.queryByText(/Aprendido/)).toBeNull()
  })

  it('servidor recusa a frase: nao avisa que aprendeu', async () => {
    const usuario = userEvent.setup()
    const { aprendeu } = await falarDuvida()
    const s = servidorFalso({ 'POST /voz/frases': { status: 422 } })
    await usuario.click(screen.getByRole('button', { name: 'Você quis dizer Cárie?' }))
    await waitFor(() => expect(s.pedidos.map((p) => p.caminho)).toContain('/voz/frases'))
    expect(screen.queryByText(/Aprendido/)).toBeNull()
    expect(aprendeu).not.toHaveBeenCalled()
  })

  it('mandar o texto para Descrição ou Observações (emenda com ";") e descartar', async () => {
    const usuario = userEvent.setup()
    const { aplicar } = await falarDuvida()
    await usuario.click(screen.getByRole('button', { name: '→ Observações' }))
    expect(aplicar).toHaveBeenLastCalledWith({ ...FORM, observacoes_internas: 'Primeira nota; Carry' })
    expect(screen.getByText('Observações: Carry')).toBeTruthy()
    expect(screen.queryByText(/Dúvidas/)).toBeNull()

    cleanup()
    const segunda = await falarDuvida({}, 'lesão grande')
    await usuario.click(screen.getByRole('button', { name: '→ Descrição' }))
    expect(segunda.aplicar).toHaveBeenLastCalledWith({ ...FORM, descricao_didatica: 'Lesão grande' })

    cleanup()
    const terceira = await falarDuvida({}, 'ruído')
    await usuario.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(screen.queryByText(/Dúvidas/)).toBeNull()
    expect(terceira.aplicar).not.toHaveBeenCalled()
  })

  it('texto ja terminado em ponto nao ganha ";"', async () => {
    const usuario = userEvent.setup()
    const { aplicar } = await falarDuvida({ form: { ...FORM, observacoes_internas: 'Nota.' } })
    await usuario.click(screen.getByRole('button', { name: '→ Observações' }))
    expect(aplicar).toHaveBeenLastCalledWith({ ...FORM, observacoes_internas: 'Nota. Carry' })
  })

  it('trocar de imagem limpa as duvidas e o que foi preenchido', async () => {
    const { duvidas } = await falarDuvida()
    cleanup()
    // remonta com outra ficha: o painel comeca vazio
    servidor()
    montarTela(<PainelVoz fichaId={2} form={FORM} onAplicar={vi.fn()} onSalvar={vi.fn()} onDuvidas={duvidas} />)
    expect(screen.queryByText(/Dúvidas/)).toBeNull()
    expect(duvidas).toHaveBeenLastCalledWith(0)
  })
})

describe('escuta continua (coluna da ficha)', () => {
  function montar(props: Partial<Parameters<typeof PainelVoz>[0]> = {}, transcrever: Rota = { corpo: { texto: 'dois cárie' } }) {
    const s = servidor(transcrever)
    const fns = { aplicar: vi.fn(), etapa: vi.fn(), salvar: vi.fn() }
    const tela = montarTela(
      <div>
        <input aria-label="campo de texto" />
        <PainelVoz
          embutido
          continuo
          fichaId={1}
          form={FORM}
          onAplicar={fns.aplicar}
          onSalvar={fns.salvar}
          onEtapa={fns.etapa}
          etapaAtiva="achados"
          aoLado={<button type="button">Macros</button>}
          {...props}
        />
      </div>
    )
    return { s, tela, ...fns }
  }
  // o espaco so funciona depois que o painel sabe que o servico de voz esta ligado
  async function espacoQuandoPronto() {
    await waitFor(() => expect(pedidosAtuais.some((p) => p.caminho === '/voz/saude')).toBe(true))
    await act(async () => {})
    fireEvent.keyDown(document, { key: ' ' })
  }
  const microfoneBotao = () => screen.getByRole('button', { name: /microfone \(Alt\+V\)/ })

  it('espaco abre o microfone; cada trecho vai ao servidor com a dica do item aceso e passa ao proximo', async () => {
    voz.respostas['dois cárie'] = { alteracoes: [{ campo: 'achados', descricao: '2 × Cárie' }] }
    const { s, aplicar, etapa } = montar()
    expect(screen.getByText('Pressione espaço para áudio')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Macros' })).toBeTruthy()
    await espacoQuandoPronto()
    await waitFor(() => expect(microfoneBotao().getAttribute('aria-pressed')).toBe('true'))
    expect(microfoneBotao().getAttribute('title')).toBe('Pausar microfone (Alt+V)')
    expect(s.alteracoes()).toContainEqual({ metodo: 'POST', caminho: '/voz/aquecer', corpo: undefined })

    escuta.atual!.onTrecho(new Blob(['a'], { type: 'audio/mp4' }))
    expect(await screen.findByText('✓ “dois cárie” → 2 × Cárie')).toBeTruthy()
    expect(s.alteracoes()).toContainEqual({ metodo: 'POST', caminho: '/voz/transcrever', corpo: { arquivo: 'arquivo:trecho.mp4:audio/mp4', rapido: '1', etapa: 'achados' } })
    expect(aplicar).toHaveBeenCalled()
    expect(etapa).toHaveBeenLastCalledWith('erro_tecnico') // item resolvido: passa ao proximo
  })

  it('dois trechos seguidos: o segundo vai com a dica "curto"', async () => {
    voz.respostas['dois cárie'] = { alteracoes: [{ campo: 'achados', descricao: '2 × Cárie' }] }
    const { s } = montar()
    await espacoQuandoPronto()
    await waitFor(() => expect(escuta.atual).not.toBeNull())
    await waitFor(() => expect(microfoneBotao().getAttribute('aria-pressed')).toBe('true'))
    escuta.atual!.onTrecho(new Blob(['a'], { type: 'audio/webm' }))
    escuta.atual!.onTrecho(new Blob(['b'], { type: 'audio/webm' }))
    await waitFor(() => expect(s.alteracoes().filter((p) => p.caminho === '/voz/transcrever')).toHaveLength(2))
    const etapas = s.alteracoes().filter((p) => p.caminho === '/voz/transcrever').map((p) => (p.corpo as { etapa: string }).etapa)
    expect(etapas).toEqual(['achados', 'curto'])
  })

  it('espaco de novo pausa; clique no microfone retoma; desmontar desliga a escuta', async () => {
    const usuario = userEvent.setup()
    const { tela } = montar()
    await espacoQuandoPronto()
    await waitFor(() => expect(microfoneBotao().getAttribute('aria-pressed')).toBe('true'))
    const atual = escuta.atual!
    fireEvent.keyDown(document, { key: ' ' })
    await waitFor(() => expect(microfoneBotao().getAttribute('aria-pressed')).toBe('false'))
    expect(atual.pausas.at(-1)).toBe(true)
    await usuario.click(microfoneBotao())
    await waitFor(() => expect(microfoneBotao().getAttribute('aria-pressed')).toBe('true'))
    expect(atual.pausas.at(-1)).toBe(false)
    // tecla repetida, com Ctrl ou dentro de um campo de texto: nao mexe no microfone
    fireEvent.keyDown(document, { key: ' ', repeat: true })
    fireEvent.keyDown(document, { key: ' ', ctrlKey: true })
    screen.getByRole('textbox', { name: 'campo de texto' }).focus()
    fireEvent.keyDown(document, { key: ' ' })
    expect(microfoneBotao().getAttribute('aria-pressed')).toBe('true')
    tela.unmount()
    expect(atual.parada).toBe(true)
  })

  it('espaco com foco num botao: tira o foco do botao e abre o microfone', async () => {
    montar()
    const macros = screen.getByRole('button', { name: 'Macros' })
    macros.focus()
    await espacoQuandoPronto()
    await waitFor(() => expect(microfoneBotao().getAttribute('aria-pressed')).toBe('true'))
    expect(document.activeElement).not.toBe(macros)
  })

  it('na etapa "aprovar" o microfone fica fechado e o espaco nao abre', async () => {
    montar({ etapaAtiva: 'aprovar' })
    await screen.findByText('Pressione espaço para áudio')
    await espacoQuandoPronto()
    expect(escuta.atual).toBeNull()
  })

  it('sem permissao no microfone: avisa e nao abre', async () => {
    escuta.falha = 'semPermissao'
    montar()
    await espacoQuandoPronto()
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Sem acesso ao microfone. Permita o uso do microfone para este site.')
    expect(microfoneBotao().getAttribute('aria-pressed')).toBe('false')
  })

  it('trecho sem fala: avisa "Nenhuma fala"; sessao expirada pausa o microfone e oferece entrar de novo', async () => {
    let resposta: Rota = { corpo: { texto: '' } }
    montar({}, () => resposta as never)
    await espacoQuandoPronto()
    await waitFor(() => expect(microfoneBotao().getAttribute('aria-pressed')).toBe('true'))
    escuta.atual!.onTrecho(new Blob(['a']))
    expect(await screen.findByText('Nenhuma fala foi detectada. Tente de novo, mais perto do microfone.')).toBeTruthy()
    resposta = { status: 401 }
    escuta.atual!.onTrecho(new Blob(['a']))
    const alerta = await screen.findByRole('alert')
    expect(alerta.textContent).toContain('Sua sessão expirou')
    expect(within(alerta).getByRole('link', { name: /Entrar de novo/ }).getAttribute('href')).toBe('/login')
    await waitFor(() => expect(microfoneBotao().getAttribute('aria-pressed')).toBe('false'))
  })

  it('trecho que chega depois de trocar de imagem e descartado', async () => {
    voz.respostas['dois cárie'] = { alteracoes: [{ campo: 'achados', descricao: '2 × Cárie' }] }
    let liberar: () => void = () => {}
    const espera = new Promise<void>((r) => (liberar = r))
    const s = servidor({ corpo: { texto: 'dois cárie' } })
    const fetchFalso = globalThis.fetch
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/voz/transcrever')) await espera
      return fetchFalso(url, init)
    })
    const aplicar = vi.fn()
    const props = { embutido: true, continuo: true, form: FORM, onAplicar: aplicar, onSalvar: vi.fn(), etapaAtiva: 'achados' as const }
    const tela = montarTela(<PainelVoz fichaId={1} {...props} />)
    await espacoQuandoPronto()
    await waitFor(() => expect(escuta.atual).not.toBeNull())
    await waitFor(() => expect(screen.getByRole('button', { name: /microfone/ }).getAttribute('aria-pressed')).toBe('true'))
    escuta.atual!.onTrecho(new Blob(['a']))
    const { NextIntlClientProvider } = await import('next-intl')
    const mensagens = (await import('../../../../frontend/messages/pt.json')).default
    tela.rerender(
      <NextIntlClientProvider locale="pt" messages={mensagens} timeZone="America/Sao_Paulo">
        <PainelVoz fichaId={2} {...props} />
      </NextIntlClientProvider>
    )
    liberar()
    await waitFor(() => expect(s.pedidos.some((p) => p.caminho === '/voz/transcrever')).toBe(true))
    await new Promise((r) => setTimeout(r, 20))
    expect(aplicar).not.toHaveBeenCalled()
  })

  it('duvida pendente: falar o nome da sugestao escolhe e, com todas as marcacoes ligadas, passa de item', async () => {
    let fala = 'carry'
    const form = { ...FORM, marcacoes: [{ id: 'm1' }], achados: [{ marcacoes: ['m1'] }] } as unknown as FormularioFicha
    voz.respostas.carry = {
      naoReconhecidos: [{ texto: 'carry', sugestoes: [{ rotulo: 'Cárie', aplicar: () => ({ termos: [1] }), campo: 'termos' }] }],
    }
    const { aplicar, etapa } = montar({ form }, () => ({ corpo: { texto: fala } }))
    await espacoQuandoPronto()
    await waitFor(() => expect(microfoneBotao().getAttribute('aria-pressed')).toBe('true'))
    escuta.atual!.onTrecho(new Blob(['a']))
    expect(await screen.findByText('Dúvidas (1) — confirme antes de entrar na ficha')).toBeTruthy()
    expect(etapa).not.toHaveBeenCalled() // nao resolveu: fica no item
    fala = 'Cárie'
    escuta.atual!.onTrecho(new Blob(['a']))
    await waitFor(() => expect(screen.queryByText(/Dúvidas/)).toBeNull())
    expect(aplicar).toHaveBeenLastCalledWith({ ...form, termos: [1] })
    expect(etapa).toHaveBeenLastCalledWith('erro_tecnico')
  })

  it('professor (semVoz): nao consulta o servico e o microfone fica desativado', async () => {
    const { s } = montar({ semVoz: true })
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Serviço de voz indisponível. Verifique se o container radix-whisper está ligado.')
    expect((microfoneBotao() as HTMLButtonElement).disabled).toBe(true)
    expect(s.pedidos.some((p) => p.caminho === '/voz/saude')).toBe(false)
  })
})

describe('escuta continua no painel flutuante: o que a barra diz', () => {
  it('Enter para iniciar, aberto, ouvindo, transcrevendo, pausado e fechado para aprovar', async () => {
    let liberar: () => void = () => {}
    const s = servidor({ corpo: { texto: 'x' } })
    const fetchFalso = globalThis.fetch
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/voz/transcrever')) await new Promise<void>((r) => (liberar = r))
      return fetchFalso(url, init)
    })
    const props = { continuo: true, fichaId: 1, form: FORM, onAplicar: vi.fn(), onSalvar: vi.fn(), onEtapa: vi.fn() }
    const tela = montarTela(<PainelVoz {...props} etapaAtiva="descricao" />)
    fireEvent.click(screen.getByRole('button', { name: 'Curadoria por voz' }))
    expect(screen.getByText('⏎ Pressione Enter para iniciar a curadoria (abre o microfone)')).toBeTruthy()
    await waitFor(() => expect(s.pedidos.some((p) => p.caminho === '/voz/saude')).toBe(true))
    altV()
    expect(await screen.findByText('🎙️ Microfone aberto — fale o item aceso')).toBeTruthy()
    await import('react').then(({ act }) => act(() => escuta.atual!.onFalando?.(true)))
    expect(screen.getByText('🎙️ Ouvindo…')).toBeTruthy()
    await import('react').then(({ act }) => act(() => escuta.atual!.onTrecho(new Blob(['a']))))
    expect(screen.getByText(/· Transcrevendo no servidor local…/)).toBeTruthy()
    liberar()
    altV()
    expect(await screen.findByText('Microfone pausado (Alt+V reabre)')).toBeTruthy()
    const { NextIntlClientProvider } = await import('next-intl')
    const mensagens = (await import('../../../../frontend/messages/pt.json')).default
    tela.rerender(
      <NextIntlClientProvider locale="pt" messages={mensagens} timeZone="America/Sao_Paulo">
        <PainelVoz {...props} etapaAtiva="aprovar" />
      </NextIntlClientProvider>
    )
    expect(await screen.findByText('Microfone fechado — aperte Enter para aprovar')).toBeTruthy()
  })
})
