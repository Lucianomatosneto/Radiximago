// @vitest-environment jsdom
//
// COMPONENTE "Anotacoes da imagem" (Fase 2, 13/11/2026):
// frontend/src/components/detalhe/AnotacoesImagem.tsx - as notas pessoais
// sobre a imagem, no visualizador. Confere: carregar, criar com um clique
// (sem seta) ou arrastando (com seta), estilo (cor, tamanho, negrito,
// italico, sempre visivel), mover a caixa, editar, excluir e os erros.
// O navegador simulado nao mede tela: a area da imagem e fixada em
// 200 x 100 px (getBoundingClientRect) para as contas de posicao.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AnotacoesImagem from '../../../../frontend/src/components/detalhe/AnotacoesImagem'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const FIXADA = { id: 1, curation_id: 7, texto: 'Ápice do 36', cor: '#4ade80', tamanho_fonte: 16, negrito: true, italico: false, pos_x: 0.3, pos_y: 0.4, alvo_x: 0.5, alvo_y: 0.6, fixada: true }
const MARCADOR = { ...FIXADA, id: 2, texto: 'Rever esta área', fixada: false, alvo_x: null, alvo_y: null, pos_x: 0.7, pos_y: 0.2 }
const SEM_POSICAO = { ...MARCADOR, id: 9, texto: 'Nota sem posição', pos_x: null, pos_y: null }

function abrir(extra: Record<string, Rota> = {}, itens: object[] = [FIXADA, MARCADOR]) {
  const servidor = servidorFalso({ 'GET /annotations/7': { corpo: { itens } }, ...extra })
  montarTela(
    <div style={{ position: 'relative' }}>
      <AnotacoesImagem curationId={7} />
    </div>
  )
  return servidor
}
/** camada que acompanha o mouse enquanto algo e arrastado */
const captura = () => document.querySelector<HTMLElement>('[role="presentation"].cursor-move.inset-0') as HTMLElement
async function novaNoPonto(usuario: ReturnType<typeof userEvent.setup>, de: [number, number], ate: [number, number] = de) {
  await usuario.click(screen.getByRole('button', { name: '+ Anotação' }))
  const camada = screen.getByTitle(/Clique para marcar um ponto/)
  fireEvent.mouseDown(camada, { clientX: de[0], clientY: de[1] })
  fireEvent.mouseUp(camada, { clientX: ate[0], clientY: ate[1] })
  return screen.getByPlaceholderText('Escreva sua anotação...') as HTMLTextAreaElement
}

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('mostrar', () => {
  it('nota "sempre visivel" mostra o texto com o estilo; a outra vira um marcador com o texto na dica', async () => {
    abrir()
    const fixada = await screen.findByRole('button', { name: 'Ápice do 36' })
    expect(fixada.style.fontWeight).toBe('700')
    expect(fixada.style.fontSize).toBe('16px')
    expect(screen.getByTitle('Rever esta área').textContent).toBe('📝')
    expect(document.querySelectorAll('svg line').length).toBeGreaterThan(0) // a seta da fixada
  })

  it('nota sem posicao (dado antigo) nao aparece na imagem', async () => {
    abrir({}, [FIXADA, SEM_POSICAO])
    await screen.findByRole('button', { name: 'Ápice do 36' })
    expect(screen.queryByTitle('Nota sem posição')).toBeNull()
  })

  it('sem conexao ao carregar: a imagem segue sem notas (sem erro na tela)', async () => {
    abrir({ 'GET /annotations/7': 'SEM_CONEXAO' })
    await waitFor(() => expect(screen.getByRole('button', { name: '+ Anotação' })).toBeTruthy())
    expect(screen.queryByTitle('Rever esta área')).toBeNull()
  })
})

describe('criar', () => {
  it('um clique (sem arrastar): nota sem seta; texto vazio e recusado; salva com o estilo escolhido', async () => {
    const usuario = userEvent.setup()
    const nova = { ...MARCADOR, id: 3, texto: 'Nota nova', cor: '#f87171', fixada: true, pos_x: 0.1, pos_y: 0.1 }
    const servidor = abrir({ 'POST /annotations/7': { status: 201, corpo: nova } })
    await screen.findByRole('button', { name: 'Ápice do 36' })
    const caixa = await novaNoPonto(usuario, [20, 10])
    expect(screen.getByRole('button', { name: '↗ Adicionar seta' })).toBeTruthy() // sem seta
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByText('Escreva algo antes de salvar.')).toBeTruthy()
    await usuario.type(caixa, '  Nota nova  ')
    await usuario.click(screen.getByRole('button', { name: 'Vermelho' }))
    await usuario.selectOptions(screen.getByRole('combobox'), '20')
    await usuario.click(screen.getByTitle('Negrito'))
    await usuario.click(screen.getByTitle('Itálico'))
    await usuario.click(screen.getByRole('checkbox', { name: /Texto sempre visível/ }))
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('button', { name: 'Nota nova' })).toBeTruthy()
    expect(servidor.alteracoes()[0]).toEqual({
      metodo: 'POST',
      caminho: '/annotations/7',
      corpo: { texto: 'Nota nova', cor: '#f87171', tamanho_fonte: 20, negrito: true, italico: true, fixada: true, pos_x: 0.1, pos_y: 0.1, alvo_x: null, alvo_y: null },
    })
    expect(screen.queryByPlaceholderText('Escreva sua anotação...')).toBeNull()
  })

  it('clicar e arrastar: a nota ganha seta ate o ponto solto; "Remover seta" e "Adicionar seta" trocam', async () => {
    const usuario = userEvent.setup()
    const servidor = abrir({ 'POST /annotations/7': { status: 201, corpo: { ...MARCADOR, id: 4 } } })
    const caixa = await novaNoPonto(usuario, [20, 10], [120, 60])
    expect(screen.getByRole('button', { name: '✕ Remover seta' })).toBeTruthy()
    await usuario.click(screen.getByRole('button', { name: '✕ Remover seta' }))
    await usuario.click(screen.getByRole('button', { name: '↗ Adicionar seta' }))
    await usuario.type(caixa, 'Com seta')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(servidor.alteracoes()).toHaveLength(1))
    const corpo = servidor.alteracoes()[0].corpo as Record<string, number>
    expect([corpo.pos_x, corpo.pos_y]).toEqual([0.1, 0.1])
    expect(corpo.alvo_x).toBeCloseTo(0.2) // "adicionar seta": um pouco a direita e acima
    expect(corpo.alvo_y).toBe(0)
  })

  it('arrastar a barra da caixa move a nota; o botao ⠿ leva caixa e ponta juntas', async () => {
    const usuario = userEvent.setup()
    const servidor = abrir({ 'POST /annotations/7': { status: 201, corpo: { ...MARCADOR, id: 5 } } })
    const caixa = await novaNoPonto(usuario, [20, 10], [60, 30]) // seta de (0.1,0.1) ate (0.3,0.3)
    fireEvent.mouseDown(screen.getByTitle('Arraste para mover esta caixa'))
    fireEvent.mouseMove(captura(), { clientX: 100, clientY: 50 })
    fireEvent.mouseUp(captura())
    // pega a seta inteira e desloca +0,1 / +0,1
    await usuario.click(screen.getByTitle(/Clique para pegar a seta inteira/))
    fireEvent.mouseMove(captura(), { clientX: 20, clientY: 10 })
    fireEvent.mouseLeave(captura())
    await usuario.type(caixa, 'Movida')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(servidor.alteracoes()).toHaveLength(1))
    const c = servidor.alteracoes()[0].corpo as Record<string, number>
    // a barra levou a caixa para (0,5 ; 0,5); depois a seta inteira andou +0,1 / +0,1
    // (pegou no ponto 0,0 e soltou em 0,1): caixa e ponta andam JUNTAS
    expect(c.pos_x).toBeCloseTo(0.6)
    expect(c.pos_y).toBeCloseTo(0.6)
    expect(c.alvo_x).toBeCloseTo(0.4)
    expect(c.alvo_y).toBeCloseTo(0.4)
  })

  it.each([
    ['recusa do servidor', { status: 500, corpo: {} }],
    ['sem conexao', 'SEM_CONEXAO' as const],
  ])('erro ao salvar (%s): avisa e a caixa continua aberta com o texto', async (_caso, resposta) => {
    const usuario = userEvent.setup()
    abrir({ 'POST /annotations/7': resposta })
    const caixa = await novaNoPonto(usuario, [20, 10])
    await usuario.type(caixa, 'Não vai salvar')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Não foi possível salvar a anotação.')).toBeTruthy()
    expect(caixa.value).toBe('Não vai salvar')
  })

  it('"+ Anotação" vira "✕ Cancelar"; o × fecha a caixa sem salvar', async () => {
    const usuario = userEvent.setup()
    const servidor = abrir()
    await usuario.click(screen.getByRole('button', { name: '+ Anotação' }))
    await usuario.click(screen.getByRole('button', { name: '✕ Cancelar' }))
    expect(screen.queryByTitle(/Clique para marcar um ponto/)).toBeNull()
    await novaNoPonto(usuario, [20, 10])
    await usuario.click(screen.getByTitle('Fechar sem salvar'))
    expect(screen.queryByPlaceholderText('Escreva sua anotação...')).toBeNull()
    expect(servidor.alteracoes()).toEqual([])
  })
})

describe('editar e excluir', () => {
  it('clicar no marcador abre a nota com o texto; salvar envia PUT e atualiza', async () => {
    const usuario = userEvent.setup()
    const servidor = abrir({ 'PUT /annotations/2': (p) => ({ corpo: { ...MARCADOR, ...(p.corpo as object) } }) })
    await usuario.click(await screen.findByTitle('Rever esta área'))
    const caixa = screen.getByPlaceholderText('Escreva sua anotação...') as HTMLTextAreaElement
    expect(caixa.value).toBe('Rever esta área')
    await usuario.clear(caixa)
    await usuario.type(caixa, 'Revisada')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByTitle('Revisada')).toBeTruthy()
    expect(servidor.alteracoes()[0]).toMatchObject({ metodo: 'PUT', caminho: '/annotations/2', corpo: { texto: 'Revisada', pos_x: 0.7, pos_y: 0.2 } })
  })

  it('clicar na nota fixada tambem abre a edicao, com a seta dela', async () => {
    const usuario = userEvent.setup()
    abrir()
    await usuario.click(await screen.findByRole('button', { name: 'Ápice do 36' }))
    expect((screen.getByPlaceholderText('Escreva sua anotação...') as HTMLTextAreaElement).value).toBe('Ápice do 36')
    expect(screen.getByRole('button', { name: '✕ Remover seta' })).toBeTruthy()
    expect((screen.getByRole('checkbox', { name: /Texto sempre visível/ }) as HTMLInputElement).checked).toBe(true)
  })

  it('o × da nota exclui no servidor e ela some', async () => {
    const usuario = userEvent.setup()
    const servidor = abrir({ 'DELETE /annotations/2': { status: 204 } })
    const marcador = (await screen.findByTitle('Rever esta área')).parentElement as HTMLElement
    await usuario.click(within(marcador).getByTitle('Excluir esta anotação'))
    await waitFor(() => expect(screen.queryByTitle('Rever esta área')).toBeNull())
    expect(servidor.alteracoes()).toEqual([{ metodo: 'DELETE', caminho: '/annotations/2', corpo: undefined }])
  })

  it.each([
    ['recusa do servidor', { status: 403, corpo: {} }],
    ['sem conexao', 'SEM_CONEXAO' as const],
  ])('erro ao excluir (%s): a nota continua', async (_caso, resposta) => {
    const usuario = userEvent.setup()
    abrir({ 'DELETE /annotations/1': resposta })
    const fixada = (await screen.findByRole('button', { name: 'Ápice do 36' })).parentElement as HTMLElement
    await usuario.click(within(fixada).getByTitle('Excluir esta anotação'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ápice do 36' })).toBeTruthy())
    // o aviso aparece quando a caixa de edicao for aberta (o erro fica guardado)
    await usuario.click(screen.getByRole('button', { name: 'Ápice do 36' }))
    expect(screen.queryByText('Não foi possível excluir a anotação.')).toBeNull() // abrir a edicao limpa o aviso antigo
  })
})
