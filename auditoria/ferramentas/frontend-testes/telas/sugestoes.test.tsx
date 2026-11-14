// @vitest-environment jsdom
//
// TELA "Sugestoes de melhoria" (frontend/src/app/sugestoes/page.tsx) - Fase 3b.
// Qualquer perfil envia sugestao e ve as suas com o andamento; so o
// administrador ve TODAS, filtra e muda o andamento ("Nao sera feita" exige
// motivo). Erros: servidor com motivo, sem conexao. Dados inventados.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SugestoesPage from '../../../../frontend/src/app/sugestoes/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/sugestoes' }))
vi.mock('../../../../frontend/src/components/Sidebar', () => ({ default: () => <nav aria-label="menu lateral" /> }))
vi.mock('../../../../frontend/src/components/Topbar', () => ({ default: () => <header aria-label="barra do topo" /> }))

const sessao = (perfil: string) => ({ id: 1, nome: 'Pessoa Teste', email: 'pessoa@exemplo.test', perfil, foto_perfil_url: null })
const sug = (id: number, extra: object = {}) => ({
  id,
  texto: `Sugestão de teste ${id}`,
  andamento: 'recebida',
  motivo: null,
  criado_em: '2026-11-10T12:00:00Z',
  atualizado_em: null,
  ...extra,
})
const MINHAS = [sug(1, { andamento: 'nao_sera_feita', motivo: 'Fora do escopo.' })]
const TODAS = [
  sug(1, { nome: 'Aluna Teste', perfil: 'estudante', contato: 'aluna@gmial.com' }),
  sug(2, { nome: 'Prof. Teste', perfil: 'professor', andamento: 'feita' }),
  sug(3, { nome: 'Sem perfil', perfil: undefined }),
]
function rotasPadrao(perfil: string, extra: Record<string, Rota> = {}): Record<string, Rota> {
  return {
    'GET /auth/me': { corpo: sessao(perfil) },
    'GET /sugestoes/minhas': { corpo: { sugestoes: MINHAS } },
    'GET /sugestoes': { corpo: { sugestoes: TODAS } },
    ...extra,
  }
}
async function abrir(perfil: string, extra: Record<string, Rota> = {}) {
  const servidor = servidorFalso(rotasPadrao(perfil, extra))
  montarTela(<SugestoesPage />)
  await screen.findByRole('heading', { name: 'Sugestões de melhoria' })
  return servidor
}
const linha = (texto: string) => screen.getByText(texto, { selector: 'td' }).closest('tr') as HTMLElement

beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

describe('qualquer perfil', () => {
  it('sem sessao vai ao login (antes mostra "Carregando...")', async () => {
    servidorFalso({ 'GET /auth/me': { status: 401 } })
    montarTela(<SugestoesPage />)
    expect(screen.getByText('Carregando...')).toBeTruthy()
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
  })

  it('estudante: contato ja vem com o e-mail, ve as suas (com motivo) e nao ve "Todas"', async () => {
    const servidor = await abrir('estudante')
    expect((screen.getByLabelText('Contato preferido (opcional)') as HTMLInputElement).value).toBe('pessoa@exemplo.test')
    expect(screen.getByText('Enviada como Pessoa Teste (Aluno).')).toBeTruthy()
    expect(await screen.findByText('Sugestão de teste 1')).toBeTruthy()
    expect(screen.getByText('Não será feita')).toBeTruthy()
    expect(screen.getByText('Motivo: Fora do escopo.')).toBeTruthy()
    expect(screen.queryByText(/Todas as sugestões/)).toBeNull()
    expect(servidor.pedidos.map((p) => p.caminho)).not.toContain('/sugestoes')
  })

  it('sem sugestoes ainda: explica onde elas aparecem', async () => {
    await abrir('curador', { 'GET /sugestoes/minhas': { corpo: { sugestoes: [] } } })
    expect(await screen.findByText('Você ainda não enviou sugestões.')).toBeTruthy()
  })

  it('sem conexao ao carregar: avisa', async () => {
    await abrir('professor', { 'GET /sugestoes/minhas': 'SEM_CONEXAO' })
    expect((await screen.findByRole('alert')).textContent).toBe('Não foi possível carregar as sugestões.')
  })

  it('enviar: so libera com 5 letras; manda texto e contato; agradece, limpa e recarrega', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir('estudante', { 'POST /sugestoes': { status: 201, corpo: {} } })
    const enviar = screen.getByRole('button', { name: 'Enviar sugestão' }) as HTMLButtonElement
    await usuario.type(screen.getByLabelText('Sua sugestão'), 'abc')
    expect(enviar.disabled).toBe(true)
    await usuario.type(screen.getByLabelText('Sua sugestão'), 'de filtros')
    const contato = screen.getByLabelText('Contato preferido (opcional)')
    await usuario.clear(contato)
    await usuario.type(contato, '48 0000-0000')
    await usuario.click(enviar)
    expect((await screen.findByRole('status')).textContent).toBe('Sugestão enviada. Obrigado!')
    expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: '/sugestoes', corpo: { texto: 'abcde filtros', contato: '48 0000-0000' } }])
    expect((screen.getByLabelText('Sua sugestão') as HTMLTextAreaElement).value).toBe('')
    await waitFor(() => expect(servidor.pedidos.filter((p) => p.caminho === '/sugestoes/minhas')).toHaveLength(2))
  })

  it('e-mail de contato com erro de digitacao: sugere o certo', async () => {
    const usuario = userEvent.setup()
    await abrir('estudante')
    const contato = screen.getByLabelText('Contato preferido (opcional)')
    await usuario.clear(contato)
    await usuario.type(contato, 'pessoa@gmial.com')
    expect(screen.getByRole('note').textContent).toContain('gmail.com')
  })

  it.each([
    ['motivo em texto', { status: 429, corpo: { detail: 'Muitas sugestões seguidas.' } } as Rota, 'Muitas sugestões seguidas.'],
    ['motivo de validacao', { status: 422, corpo: { detail: [{ msg: 'Value error, Texto curto demais' }] } } as Rota, 'Texto curto demais'],
    ['sem motivo', { status: 500 } as Rota, 'Não foi possível enviar a sugestão.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Não foi possível enviar a sugestão.'],
  ])('falha ao enviar (%s): mostra o aviso e mantem o texto', async (_n, rota, mensagem) => {
    const usuario = userEvent.setup()
    await abrir('estudante', { 'POST /sugestoes': rota })
    await usuario.type(screen.getByLabelText('Sua sugestão'), 'Uma sugestão')
    await usuario.click(screen.getByRole('button', { name: 'Enviar sugestão' }))
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
    expect((screen.getByLabelText('Sua sugestão') as HTMLTextAreaElement).value).toBe('Uma sugestão')
  })
})

describe('administrador', () => {
  it('ve todas em ordem de chegada, com quem enviou, perfil e contato; filtra por andamento', async () => {
    const usuario = userEvent.setup()
    await abrir('administrador')
    expect(await screen.findByText('Todas as sugestões (3)')).toBeTruthy()
    expect(within(linha('Sugestão de teste 1')).getByText('Aluna Teste')).toBeTruthy()
    expect(within(linha('Sugestão de teste 1')).getByText('Aluno')).toBeTruthy()
    expect(within(linha('Sugestão de teste 1')).getByRole('note')).toBeTruthy() // aviso de e-mail digitado errado
    expect(within(linha('Sugestão de teste 3')).getByText('Aluno')).toBeTruthy() // sem perfil: trata como aluno
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por andamento' }), 'Feita')
    expect(screen.queryByText('Sugestão de teste 1', { selector: 'td' })).toBeNull()
    expect(screen.getByText('Sugestão de teste 2', { selector: 'td' })).toBeTruthy()
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por andamento' }), 'Não será feita')
    expect(screen.getByText('Nenhuma sugestão.')).toBeTruthy()
  })

  it('mudar o andamento manda o novo andamento e o motivo, e recarrega', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir('administrador', { 'PATCH /sugestoes/2': { corpo: {} } })
    const l2 = await waitFor(() => linha('Sugestão de teste 2'))
    await usuario.type(within(l2).getByPlaceholderText('Motivo / resposta (opcional)'), '  Já está no ar.  ')
    await usuario.selectOptions(within(l2).getByRole('combobox', { name: 'Andamento' }), 'Em análise')
    await waitFor(() => expect(servidor.alteracoes()).toEqual([{ metodo: 'PATCH', caminho: '/sugestoes/2', corpo: { andamento: 'em_analise', motivo: 'Já está no ar.' } }]))
    await waitFor(() => expect(servidor.pedidos.filter((p) => p.caminho === '/sugestoes')).toHaveLength(2))
  })

  it('"Não será feita" sem motivo: pede o motivo e nao manda nada', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir('administrador')
    const l3 = await waitFor(() => linha('Sugestão de teste 3'))
    await usuario.selectOptions(within(l3).getByRole('combobox', { name: 'Andamento' }), 'Não será feita')
    expect(screen.getByRole('alert').textContent).toBe('Escreva o motivo antes de marcar como "Não será feita".')
    expect(servidor.alteracoes()).toEqual([])
  })

  it.each([
    ['recusa com motivo', { status: 403, corpo: { detail: 'Só o administrador.' } } as Rota, 'Só o administrador.'],
    ['recusa sem motivo', { status: 500 } as Rota, 'Não foi possível mudar o andamento.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Sem conexão com o servidor. Tente de novo.'],
  ])('falha ao mudar o andamento (%s): avisa', async (_n, rota, mensagem) => {
    const usuario = userEvent.setup()
    await abrir('administrador', { 'PATCH /sugestoes/1': rota })
    const l1 = await waitFor(() => linha('Sugestão de teste 1'))
    await usuario.selectOptions(within(l1).getByRole('combobox', { name: 'Andamento' }), 'Feita')
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
  })
})
