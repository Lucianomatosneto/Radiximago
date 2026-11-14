// @vitest-environment jsdom
//
// COMPONENTES da FOTO PELO CELULAR (Fase 2, 13/11/2026):
// frontend/src/components/envios/EnvioFotoCelular.tsx (o passo a passo com
// prazo de 5 minutos) e EditorFoto.tsx (tarja, recorte, girar, desfazer).
//
// SIMULADO (o navegador simulado nao tem): a camera, a leitura da imagem e o
// desenho em <canvas>. A foto "carregada" tem 4000 x 3000 px; o "pincel" do
// canvas e um gravador que anota cada comando (ex.: fillRect = tarja preta).
// Assim conferimos as REGRAS (tamanho final, tarja aplicada, giro troca
// largura/altura, recorte vira o tamanho escolhido) - nao a aparencia dos
// pixels, que fica para o teste no navegador de verdade.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EnvioFotoCelular from '../../../../frontend/src/components/envios/EnvioFotoCelular'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

// ---- simulacao do canvas e da imagem ----
const comandos: { nome: string; args: unknown[] }[] = []
function pincelFalso() {
  const anotar = (nome: string) => (...args: unknown[]) => void comandos.push({ nome, args })
  return {
    drawImage: anotar('drawImage'),
    fillRect: anotar('fillRect'),
    strokeRect: anotar('strokeRect'),
    setLineDash: anotar('setLineDash'),
    translate: anotar('translate'),
    rotate: anotar('rotate'),
    lineWidth: 1,
    strokeStyle: '',
    fillStyle: '',
  }
}
let toBlobFalha = false
beforeEach(() => {
  comandos.length = 0
  toBlobFalha = false
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(pincelFalso as never)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback, tipo?: string) {
    cb(toBlobFalha ? null : new Blob([`${this.width}x${this.height}`], { type: tipo }))
  })
  Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get: () => 4000 })
  Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', { configurable: true, get: () => 3000 })
  ;(HTMLImageElement.prototype as unknown as { decode: () => Promise<void> }).decode = function (this: HTMLImageElement) {
    return this.src.includes('quebrada') ? Promise.reject(new Error('nao e imagem')) : Promise.resolve()
  }
  let n = 0
  URL.createObjectURL = vi.fn((o: Blob | MediaSource) => `blob:${(o as File).name === 'quebrada.jpg' ? 'quebrada' : 'ok'}-${++n}`)
  URL.revokeObjectURL = vi.fn()
  HTMLElement.prototype.setPointerCapture = vi.fn()
  // a foto aparece na tela do mesmo tamanho (1 px na tela = 1 px da foto)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const c = this as HTMLCanvasElement
    return { left: 0, top: 0, width: c.width || 100, height: c.height || 100, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ---- servidor ----
const agora = () => new Date().toISOString()
const daqui = (s: number) => new Date(Date.now() + s * 1000).toISOString()
const JANELA = 'GET /envios/foto/janela'
const INICIAR = 'POST /envios/foto/iniciar'
function abrir(extra: Record<string, Rota> = {}, opcoes: ('pessoal' | 'analise' | 'fila')[] = ['pessoal', 'analise', 'fila']) {
  const servidor = servidorFalso({
    [JANELA]: { corpo: { aberta: false } },
    [INICIAR]: () => ({ corpo: { comprovante: 'cmp-teste', expira_em: daqui(300), agora_servidor: agora() } }),
    ...extra,
  })
  const sair = vi.fn()
  montarTela(<EnvioFotoCelular opcoes={opcoes} analistas={[{ id: 4, nome: 'Professora Teste', perfil: 'professor' }]} onSair={sair} />)
  return { servidor, sair }
}
const foto = (nome = 'filme.jpg') => new File(['conteudo'], nome, { type: 'image/jpeg' })
const tela = () => screen.getByLabelText('Foto da radiografia para ajustar') as HTMLCanvasElement
async function escolherFoto(usuario: ReturnType<typeof userEvent.setup>, arquivo = foto()) {
  await usuario.upload(await screen.findByLabelText('Escolher da galeria'), arquivo)
}
function arrastar(de: [number, number], ate: [number, number]) {
  fireEvent.pointerDown(tela(), { clientX: de[0], clientY: de[1], pointerId: 1 })
  fireEvent.pointerMove(tela(), { clientX: ate[0], clientY: ate[1], pointerId: 1 })
  fireEvent.pointerUp(tela(), { pointerId: 1 })
}

describe('prazo do envio (janela de 5 minutos)', () => {
  it('abre uma janela nova e mostra a contagem regressiva', async () => {
    const { servidor } = abrir()
    await waitFor(() => expect(screen.getByRole('timer').textContent).toMatch(/[45]:\d\d/))
    expect(servidor.alteracoes().map((p) => p.caminho)).toEqual(['/envios/foto/iniciar'])
    expect(screen.getByText('Desligue o flash e evite reflexos.')).toBeTruthy()
  })

  it('se ja havia janela aberta, continua nela (nao abre outra) e avisa', async () => {
    const { servidor } = abrir({ [JANELA]: { corpo: { aberta: true, comprovante: 'cmp-antigo', expira_em: daqui(200), agora_servidor: agora() } } })
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Seu envio continua aberto. Tire ou escolha a foto de novo.')
    expect(servidor.alteracoes()).toEqual([])
  })

  it('faltando 1 minuto, avisa; quando o tempo acaba, descarta e oferece recomecar', async () => {
    const usuario = userEvent.setup()
    let vez = 0
    abrir({ [INICIAR]: () => ({ corpo: { comprovante: 'c', expira_em: daqui(++vez === 1 ? 30 : 300), agora_servidor: agora() } }) })
    expect(await screen.findByText('Falta 1 minuto para o tempo do envio acabar.')).toBeTruthy()
    cleanup()
    const { servidor } = abrir({ [INICIAR]: { corpo: { comprovante: 'c', expira_em: daqui(-1), agora_servidor: agora() } } })
    expect(await screen.findByText('O tempo para enviar acabou. Comece de novo.')).toBeTruthy()
    expect(screen.queryByRole('timer')).toBeNull()
    await usuario.click(screen.getByRole('button', { name: /Começar de novo/ }))
    // pediu outra janela; o servidor mandou de novo uma vencida: continua expirada
    await waitFor(() => expect(servidor.pedidos.filter((p) => p.caminho === INICIAR.split(' ')[1])).toHaveLength(2))
    expect(await screen.findByRole('button', { name: /Começar de novo/ })).toBeTruthy()
  })

  it.each([
    ['recusa com motivo', { status: 429, corpo: { detail: 'Muitos envios hoje.' } }, 'Muitos envios hoje.'],
    ['sem conexao', 'SEM_CONEXAO' as const, 'Sem conexão com o servidor. Tente de novo.'],
  ])('nao consegue abrir a janela (%s): avisa', async (_caso, resposta, mensagem) => {
    abrir({ [INICIAR]: resposta })
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
    expect(screen.queryByRole('timer')).toBeNull()
  })

  it('"Cancelar este envio" sai', async () => {
    const usuario = userEvent.setup()
    const { sair } = abrir()
    await usuario.click(await screen.findByRole('button', { name: 'Cancelar este envio' }))
    expect(sair).toHaveBeenCalled()
  })
})

describe('ajustar a foto (EditorFoto)', () => {
  it('a foto grande e reduzida para no maximo 2048 px; "Concluir" gera um JPEG desse tamanho', async () => {
    const usuario = userEvent.setup()
    abrir()
    await escolherFoto(usuario)
    await waitFor(() => expect(tela().width).toBe(2048))
    expect(tela().height).toBe(1536)
    await usuario.click(screen.getByRole('button', { name: /Concluir ajuste/ }))
    expect(await screen.findByRole('img', { name: 'Foto pronta para envio' })).toBeTruthy()
  })

  it('tarja: arrastar cobre de preto a area; contador; desfazer volta', async () => {
    const usuario = userEvent.setup()
    abrir()
    await escolherFoto(usuario)
    await waitFor(() => expect(tela().width).toBe(2048))
    arrastar([100, 100], [400, 200])
    expect(screen.getByText('1 tarja aplicada')).toBeTruthy()
    expect(comandos.some((c) => c.nome === 'fillRect' && c.args.join() === '100,100,301,101')).toBe(true)
    arrastar([10, 10], [12, 12]) // muito pequena (menos de 8 px): ignorada
    expect(screen.getByText('1 tarja aplicada')).toBeTruthy()
    const desfazer = screen.getByRole('button', { name: /Desfazer/ }) as HTMLButtonElement
    expect(desfazer.disabled).toBe(false)
    await usuario.click(desfazer)
    expect(desfazer.disabled).toBe(true)
  })

  it('desfazer guarda so as 5 ultimas mudancas', async () => {
    const usuario = userEvent.setup()
    abrir()
    await escolherFoto(usuario)
    await waitFor(() => expect(tela().width).toBe(2048))
    for (let i = 0; i < 7; i++) arrastar([100 + i * 20, 100], [400, 200])
    const desfazer = screen.getByRole('button', { name: /Desfazer/ }) as HTMLButtonElement
    for (let i = 0; i < 4; i++) await usuario.click(desfazer)
    expect(desfazer.disabled).toBe(false) // ainda ha 1
    await usuario.click(desfazer)
    expect(desfazer.disabled).toBe(true) // 7 mudancas, so 5 voltam
  })

  it('girar troca largura e altura; recortar deixa so a area escolhida', async () => {
    const usuario = userEvent.setup()
    abrir()
    await escolherFoto(usuario)
    await waitFor(() => expect(tela().width).toBe(2048))
    await usuario.click(screen.getByRole('button', { name: /Girar/ }))
    expect([tela().width, tela().height]).toEqual([1536, 2048])
    await usuario.click(screen.getByRole('button', { name: /Recortar/ }))
    expect(screen.getByRole('button', { name: /Recortar/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(/Arraste o dedo para marcar a área que fica/)).toBeTruthy()
    arrastar([500, 400], [100, 100]) // arrastar ao contrario tambem vale
    // OBSERVACAO (relatorio da Fase 2): o botao so aparece no proximo redesenho
    // da tela - hoje vindo do relogio da contagem (ate ~1 s depois de soltar)
    await usuario.click(await screen.findByRole('button', { name: /Aplicar recorte/ }, { timeout: 2500 }))
    expect([tela().width, tela().height]).toEqual([400, 300])
    await usuario.click(screen.getByRole('button', { name: /Desfazer/ }))
    expect([tela().width, tela().height]).toEqual([1536, 2048])
  })

  it('arquivo que nao e imagem: avisa; "Trocar foto" volta para escolher outra', async () => {
    const usuario = userEvent.setup()
    abrir()
    await escolherFoto(usuario, foto('quebrada.jpg'))
    expect((await screen.findByRole('alert')).textContent).toBe('Não foi possível abrir esta foto. Tente outra.')
    await usuario.click(screen.getByRole('button', { name: /Trocar foto/ }))
    expect(screen.getByLabelText('Escolher da galeria')).toBeTruthy()
  })

  it('o navegador nao consegue gerar o JPEG: avisa e fica no ajuste', async () => {
    const usuario = userEvent.setup()
    abrir()
    await escolherFoto(usuario)
    await waitFor(() => expect(tela().width).toBe(2048))
    toBlobFalha = true
    await usuario.click(screen.getByRole('button', { name: /Concluir ajuste/ }))
    expect((await screen.findByRole('alert')).textContent).toBe('Não foi possível preparar a foto. Tente de novo.')
  })
})

describe('enviar', () => {
  async function ateOsDados(usuario: ReturnType<typeof userEvent.setup>) {
    await escolherFoto(usuario)
    await waitFor(() => expect(tela().width).toBe(2048))
    await usuario.click(screen.getByRole('button', { name: /Concluir ajuste/ }))
    await screen.findByRole('img', { name: 'Foto pronta para envio' })
  }

  it('so libera com a confirmacao de que nao ha dados do paciente; envia a foto, o comprovante e o destino', async () => {
    const usuario = userEvent.setup()
    const { servidor } = abrir({ 'POST /envios/foto': { status: 201, corpo: {} } })
    await ateOsDados(usuario)
    const enviar = screen.getByRole('button', { name: /Enviar foto/ }) as HTMLButtonElement
    expect(enviar.disabled).toBe(true)
    await usuario.click(screen.getByRole('checkbox', { name: /Confirmo que a imagem não mostra dados/ }))
    await usuario.click(screen.getByRole('radio', { name: /Fila de curadoria/ }))
    await usuario.click(enviar)
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Foto recebida e em processamento: enviada para a fila de curadoria.')
    expect(servidor.alteracoes().at(-1)?.corpo).toEqual({
      arquivo: 'arquivo:foto.jpg:image/jpeg',
      comprovante: 'cmp-teste',
      destino: 'fila',
      confirmacao_sem_identificacao: 'true',
    })
    expect(screen.queryByRole('timer')).toBeNull()
    expect(screen.getByRole('button', { name: /Enviar outra foto/ })).toBeTruthy()
  })

  it('para analise: exige escolher quem analisa; leva o recado', async () => {
    const usuario = userEvent.setup()
    const { servidor } = abrir({ 'POST /envios/foto': { status: 201, corpo: {} } })
    await ateOsDados(usuario)
    await usuario.click(screen.getByRole('checkbox', { name: /Confirmo que a imagem não mostra dados/ }))
    await usuario.click(screen.getByRole('radio', { name: /Enviar para análise/ }))
    await usuario.click(screen.getByRole('button', { name: /Enviar foto/ }))
    expect(screen.getByRole('alert').textContent).toBe('Escolha quem vai analisar.')
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Quem vai analisar' }), '4')
    await usuario.type(screen.getByRole('textbox', { name: 'Recado (opcional)' }), '  Pode olhar?  ')
    await usuario.click(screen.getByRole('button', { name: /Enviar foto/ }))
    await screen.findByRole('status')
    expect(servidor.alteracoes().at(-1)?.corpo).toMatchObject({ destino: 'analise', analista_id: '4', nota: 'Pode olhar?' })
  })

  it('prazo vencido no servidor (410): descarta a foto e pede para recomecar', async () => {
    const usuario = userEvent.setup()
    abrir({ 'POST /envios/foto': { status: 410, corpo: { detail: 'Prazo encerrado.' } } })
    await ateOsDados(usuario)
    await usuario.click(screen.getByRole('checkbox', { name: /Confirmo que a imagem não mostra dados/ }))
    await usuario.click(screen.getByRole('button', { name: /Enviar foto/ }))
    expect((await screen.findByRole('alert')).textContent).toBe('Prazo encerrado.')
    expect(screen.queryByRole('img', { name: 'Foto pronta para envio' })).toBeNull()
    expect(screen.getByRole('button', { name: /Começar de novo/ })).toBeTruthy()
  })

  it.each([
    ['recusa com motivo', { status: 415, corpo: { detail: 'Formato não aceito.' } }, 'Formato não aceito.'],
    ['sem conexao', 'SEM_CONEXAO' as const, 'Sem conexão com o servidor. Tente de novo.'],
  ])('erro ao enviar (%s): avisa e a foto continua pronta', async (_caso, resposta, mensagem) => {
    const usuario = userEvent.setup()
    abrir({ 'POST /envios/foto': resposta })
    await ateOsDados(usuario)
    await usuario.click(screen.getByRole('checkbox', { name: /Confirmo que a imagem não mostra dados/ }))
    await usuario.click(screen.getByRole('button', { name: /Enviar foto/ }))
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
    expect(screen.getByRole('img', { name: 'Foto pronta para envio' })).toBeTruthy()
  })

  it('"Voltar ao ajuste" reabre o editor', async () => {
    const usuario = userEvent.setup()
    abrir()
    await ateOsDados(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Voltar ao ajuste' }))
    expect(within(screen.getByRole('toolbar', { name: 'Ferramentas de ajuste' })).getByRole('button', { name: /Tarja/ })).toBeTruthy()
  })
})
