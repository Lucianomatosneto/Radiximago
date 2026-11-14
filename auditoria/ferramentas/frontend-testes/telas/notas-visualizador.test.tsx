// @vitest-environment jsdom
//
// COMPONENTE "Minhas anotacoes" no "i" do visualizador (Fase 3b):
// frontend/src/components/visualizador/NotasVisualizador.tsx.
// Anotacoes PESSOAIS de texto sobre a imagem (so a pessoa ve): listar (as
// presas a um ponto da imagem ficam de fora), criar, editar, apagar com
// confirmacao em 2 cliques (que expira em 4 s), apagar todas, atalhos
// Ctrl+Enter e Esc, e os erros (vazio, servidor, sem conexao).
// Dados inventados.
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NotasVisualizador from '../../../../frontend/src/components/visualizador/NotasVisualizador'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const nota = (id: number, texto: string, pos: number | null = null) => ({ id, texto, pos_x: pos, pos_y: pos })
const NOTAS = [nota(1, 'Ápice do 36'), nota(2, 'Rever com o professor'), nota(3, 'Presa a um ponto', 0.5)]
function abrir(extra: Record<string, Rota> = {}, onAbrir = vi.fn()) {
  const servidor = servidorFalso({ 'GET /annotations/7': { corpo: { itens: NOTAS } }, ...extra })
  const tela = montarTela(<NotasVisualizador curationId={7} onAbrir={onAbrir} />)
  return { servidor, onAbrir, tela }
}
const campo = () => screen.getByRole('textbox', { name: 'Escreva sua anotação sobre esta imagem...' }) as HTMLTextAreaElement
const notasNaTela = () => screen.queryAllByTitle('Clique para editar').map((b) => b.textContent)

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('listar', () => {
  it('mostra so as anotacoes de texto (as presas a um ponto ficam na imagem)', async () => {
    abrir()
    expect(screen.getByRole('group', { name: 'Minhas anotações' })).toBeTruthy()
    await waitFor(() => expect(notasNaTela()).toEqual(['Ápice do 36', 'Rever com o professor']))
  })

  it.each([
    ['sem anotacoes', { corpo: { itens: [] } } as Rota],
    ['erro do servidor', { status: 500 } as Rota],
    ['sem conexao', 'SEM_CONEXAO' as Rota],
  ])('%s: "Nenhuma anotação sua nesta imagem."', async (_n, rota) => {
    const { servidor } = abrir({ 'GET /annotations/7': rota })
    await waitFor(() => expect(servidor.pedidos).toHaveLength(1))
    expect(screen.getByText('Nenhuma anotação sua nesta imagem.')).toBeTruthy()
  })
})

describe('criar e editar', () => {
  it('lapis abre a caixa (avisa quem usa) ; salvar manda o texto sem espacos e fecha', async () => {
    const usuario = userEvent.setup()
    const { servidor, onAbrir } = abrir({ 'POST /annotations/7': { status: 201, corpo: nota(9, 'Nova nota') } })
    await usuario.click(screen.getByRole('button', { name: 'Fazer uma anotação' }))
    expect(onAbrir).toHaveBeenCalled()
    expect(document.activeElement).toBe(campo())
    expect(screen.getByText('Só você vê suas anotações')).toBeTruthy()
    await usuario.type(campo(), '  Nova nota  ')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(notasNaTela()).toContain('Nova nota'))
    expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: '/annotations/7', corpo: { texto: 'Nova nota' } }])
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('vazio: pede para escrever, sem chamar o servidor', async () => {
    const usuario = userEvent.setup()
    const { servidor } = abrir()
    await usuario.click(screen.getByRole('button', { name: 'Fazer uma anotação' }))
    await usuario.type(campo(), '   ')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByText('Escreva algo antes de salvar.')).toBeTruthy()
    expect(servidor.alteracoes()).toEqual([])
  })

  it.each([
    ['erro do servidor', { status: 500 } as Rota],
    ['sem conexao', 'SEM_CONEXAO' as Rota],
  ])('%s ao salvar: avisa e mantem o texto', async (_n, rota) => {
    const usuario = userEvent.setup()
    abrir({ 'POST /annotations/7': rota })
    await usuario.click(screen.getByRole('button', { name: 'Fazer uma anotação' }))
    await usuario.type(campo(), 'Texto')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Não foi possível salvar a anotação.')).toBeTruthy()
    expect(campo().value).toBe('Texto')
  })

  it('clicar numa anotacao edita (PUT); Ctrl+Enter salva', async () => {
    const usuario = userEvent.setup()
    const { servidor } = abrir({ 'PUT /annotations/2': { corpo: nota(2, 'Revisto') } })
    await usuario.click(await screen.findByRole('button', { name: 'Rever com o professor' }))
    expect(campo().value).toBe('Rever com o professor')
    await usuario.clear(campo())
    await usuario.type(campo(), 'Revisto')
    fireEvent.keyDown(campo(), { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(notasNaTela()).toEqual(['Ápice do 36', 'Revisto']))
    expect(servidor.alteracoes()).toEqual([{ metodo: 'PUT', caminho: '/annotations/2', corpo: { texto: 'Revisto' } }])
  })

  it('Esc e "Cancelar" fecham sem salvar', async () => {
    const usuario = userEvent.setup()
    const { servidor } = abrir()
    await usuario.click(screen.getByRole('button', { name: 'Fazer uma anotação' }))
    await usuario.type(campo(), 'rascunho')
    fireEvent.keyDown(campo(), { key: 'Escape' })
    expect(screen.queryByRole('textbox')).toBeNull()
    await usuario.click(screen.getByRole('button', { name: 'Fazer uma anotação' }))
    expect(campo().value).toBe('') // o rascunho foi descartado
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(servidor.alteracoes()).toEqual([])
  })

  it('outra imagem: a caixa fecha e a lista e recarregada', async () => {
    const usuario = userEvent.setup()
    const { servidor, tela } = abrir({ 'GET /annotations/8': { corpo: { itens: [nota(5, 'Da imagem 8')] } } })
    await usuario.click(screen.getByRole('button', { name: 'Fazer uma anotação' }))
    const { NextIntlClientProvider } = await import('next-intl')
    const mensagens = (await import('../../../../frontend/messages/pt.json')).default
    tela.rerender(
      <NextIntlClientProvider locale="pt" messages={mensagens} timeZone="America/Sao_Paulo">
        <NotasVisualizador curationId={8} />
      </NextIntlClientProvider>
    )
    await waitFor(() => expect(notasNaTela()).toEqual(['Da imagem 8']))
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(servidor.pedidos.map((p) => p.caminho)).toEqual(['/annotations/7', '/annotations/8'])
  })
})

describe('apagar', () => {
  it('lixeira pede confirmacao ("Apagar?") e o 2o clique apaga', async () => {
    const usuario = userEvent.setup()
    const { servidor } = abrir({ 'DELETE /annotations/1': { status: 204 } })
    await screen.findByRole('button', { name: 'Ápice do 36' })
    const [lixeira] = screen.getAllByRole('button', { name: 'Excluir esta anotação' })
    await usuario.click(lixeira)
    expect(servidor.alteracoes()).toEqual([])
    const confirmar = screen.getByRole('button', { name: 'Clique de novo para apagar' })
    expect(confirmar.textContent).toBe('Apagar?')
    await usuario.click(confirmar)
    await waitFor(() => expect(notasNaTela()).toEqual(['Rever com o professor']))
    expect(servidor.alteracoes()).toEqual([{ metodo: 'DELETE', caminho: '/annotations/1', corpo: undefined }])
  })

  it('a confirmacao expira em 4 segundos', async () => {
    abrir()
    await screen.findByRole('button', { name: 'Ápice do 36' })
    vi.useFakeTimers()
    fireEvent.click(screen.getAllByRole('button', { name: 'Excluir esta anotação' })[0])
    expect(screen.getByRole('button', { name: 'Clique de novo para apagar' })).toBeTruthy()
    act(() => vi.advanceTimersByTime(4000))
    expect(screen.queryByRole('button', { name: 'Clique de novo para apagar' })).toBeNull()
  })

  it('"Apagar todas" (com mais de uma) confirma e apaga cada uma', async () => {
    const usuario = userEvent.setup()
    const { servidor } = abrir({ 'DELETE /annotations/*': { status: 204 } })
    await usuario.click(await screen.findByRole('button', { name: 'Apagar todas' }))
    await usuario.click(screen.getByRole('button', { name: 'Clique de novo para apagar todas' }))
    await waitFor(() => expect(screen.getByText('Nenhuma anotação sua nesta imagem.')).toBeTruthy())
    expect(servidor.alteracoes().map((p) => p.caminho)).toEqual(['/annotations/1', '/annotations/2'])
  })

  it('apagar a que esta sendo editada fecha a caixa', async () => {
    const usuario = userEvent.setup()
    abrir({ 'DELETE /annotations/2': { status: 204 } })
    await usuario.click(await screen.findByRole('button', { name: 'Rever com o professor' }))
    await usuario.click(screen.getByRole('button', { name: 'Apagar' }))
    await usuario.click(screen.getByRole('button', { name: 'Apagar?' }))
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
    expect(notasNaTela()).toEqual(['Ápice do 36'])
  })

  it.each([
    ['erro do servidor', { status: 500 } as Rota],
    ['sem conexao', 'SEM_CONEXAO' as Rota],
  ])('%s ao apagar: avisa e a anotacao fica', async (_n, rota) => {
    const usuario = userEvent.setup()
    abrir({ 'DELETE /annotations/1': rota })
    await screen.findByRole('button', { name: 'Ápice do 36' })
    await usuario.click(screen.getAllByRole('button', { name: 'Excluir esta anotação' })[0])
    await usuario.click(screen.getByRole('button', { name: 'Clique de novo para apagar' }))
    expect(await screen.findByText('Não foi possível excluir a anotação.')).toBeTruthy()
    expect(notasNaTela()).toContain('Ápice do 36')
  })
})
