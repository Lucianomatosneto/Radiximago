// @vitest-environment jsdom
//
// TELA "Grupos" (frontend/src/app/grupos/page.tsx) - Fase 3b.
// Listas de pessoas (ex.: uma turma) para enviar imagens de uma vez.
// Quem pode (professor, curador, administrador), lista vazia e com grupos,
// criar e editar (o que vai ao servidor), apagar com confirmacao e os
// erros (motivo do servidor, mensagem padrao, sem conexao).
// Simulado: o seletor de pessoas (teste proprio). Dados inventados.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GruposPage from '../../../../frontend/src/app/grupos/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/grupos' }))
vi.mock('../../../../frontend/src/components/Sidebar', () => ({ default: () => <nav aria-label="menu lateral" /> }))
vi.mock('../../../../frontend/src/components/Topbar', () => ({ default: () => <header aria-label="barra do topo" /> }))
vi.mock('../../../../frontend/src/components/envios/SeletorPessoasGrupos', () => ({
  default: ({ pessoas, aoMudar }: { pessoas: { id: number; nome: string }[]; aoMudar: (p: { id: number; nome: string }[], g: number[]) => void }) => (
    <div>
      <p>escolhidas: {pessoas.map((p) => p.nome).join(', ')}</p>
      <button type="button" onClick={() => aoMudar([...pessoas, { id: 50, nome: 'Aluno Novo' }], [])}>
        acrescentar Aluno Novo
      </button>
    </div>
  ),
}))

const sessao = (perfil: string) => ({ id: 1, nome: 'Pessoa Teste', email: 'pessoa@exemplo.test', perfil, foto_perfil_url: null })
const GRUPOS = [
  { id: 3, nome: 'Turma A', membros: [{ id: 10, nome: 'Ana' }, { id: 11, nome: 'Bia' }] },
  { id: 4, nome: 'Monitores', membros: [] },
]
function rotasPadrao(perfil = 'professor', extra: Record<string, Rota> = {}): Record<string, Rota> {
  return { 'GET /auth/me': { corpo: sessao(perfil) }, 'GET /grupos': { corpo: { grupos: GRUPOS } }, ...extra }
}
async function abrir(extra: Record<string, Rota> = {}, perfil = 'professor') {
  const servidor = servidorFalso(rotasPadrao(perfil, extra))
  montarTela(<GruposPage />)
  await screen.findByRole('heading', { name: 'Grupos' })
  return servidor
}
const cartao = (nome: string) => screen.getByRole('heading', { name: nome }).closest('li') as HTMLElement
async function apagar(usuario: ReturnType<typeof userEvent.setup>, nome: string) {
  await usuario.click(within(await waitFor(() => cartao(nome))).getByRole('button', { name: 'Apagar' }))
  await usuario.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Sim, apagar' }))
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

describe('quem pode', () => {
  it('sem sessao vai ao login (antes mostra "Carregando...")', async () => {
    servidorFalso({ 'GET /auth/me': { status: 401 } })
    montarTela(<GruposPage />)
    expect(screen.getByText('Carregando...')).toBeTruthy()
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
  })

  it.each(['estudante', 'suporte', 'pesquisador'])('%s vai ao "acesso negado"', async (perfil) => {
    servidorFalso(rotasPadrao(perfil))
    montarTela(<GruposPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/acesso-negado?de=/grupos'))
  })

  it.each(['professor', 'curador', 'administrador'])('%s ve os grupos com quantas pessoas e quem', async (perfil) => {
    await abrir({}, perfil)
    expect(within(cartao('Turma A')).getByText('2 pessoas')).toBeTruthy()
    expect(within(cartao('Turma A')).getByText('Ana, Bia')).toBeTruthy()
    expect(within(cartao('Monitores')).getByText('Sem pessoas ainda.')).toBeTruthy()
  })

  it.each([
    ['nenhum grupo', { corpo: { grupos: [] } } as Rota],
    ['erro do servidor', { status: 500 } as Rota],
    ['sem conexao', 'SEM_CONEXAO' as Rota],
  ])('%s: "Você ainda não tem grupos."', async (_n, rota) => {
    await abrir({ 'GET /grupos': rota })
    expect(await screen.findByText('Você ainda não tem grupos.')).toBeTruthy()
  })
})

describe('criar e editar', () => {
  it('novo grupo: manda nome e pessoas; avisa, fecha o formulario e recarrega', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir({ 'POST /grupos': { status: 201, corpo: {} } })
    await usuario.click(screen.getByRole('button', { name: 'Novo grupo' }))
    await usuario.type(screen.getByLabelText('Nome do grupo'), 'Turma B')
    await usuario.click(screen.getByRole('button', { name: 'acrescentar Aluno Novo' }))
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect((await screen.findByRole('status')).textContent).toBe('Grupo salvo.')
    expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: '/grupos', corpo: { nome: 'Turma B', membros_ids: [50] } }])
    expect(screen.queryByLabelText('Nome do grupo')).toBeNull()
    await waitFor(() => expect(servidor.pedidos.filter((p) => p.caminho === '/grupos' && p.metodo === 'GET')).toHaveLength(2))
  })

  it('editar: o formulario vem preenchido e salva com PUT no grupo certo', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir({ 'PUT /grupos/3': { corpo: {} } })
    await usuario.click(within(await waitFor(() => cartao('Turma A'))).getByRole('button', { name: 'Editar' }))
    expect((screen.getByLabelText('Nome do grupo') as HTMLInputElement).value).toBe('Turma A')
    expect(screen.getByText('escolhidas: Ana, Bia')).toBeTruthy()
    await usuario.click(screen.getByRole('button', { name: 'acrescentar Aluno Novo' }))
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(servidor.alteracoes()).toEqual([{ metodo: 'PUT', caminho: '/grupos/3', corpo: { nome: 'Turma A', membros_ids: [10, 11, 50] } }]))
  })

  it('"Cancelar" fecha sem salvar', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir()
    await usuario.click(screen.getByRole('button', { name: 'Novo grupo' }))
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByLabelText('Nome do grupo')).toBeNull()
    expect(servidor.alteracoes()).toEqual([])
  })

  it.each([
    ['motivo do servidor', { status: 409, corpo: { detail: 'Já existe um grupo com esse nome.' } } as Rota, 'Já existe um grupo com esse nome.'],
    ['sem motivo', { status: 500 } as Rota, 'Não foi possível salvar o grupo.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Sem conexão com o servidor. Tente de novo.'],
  ])('falha ao salvar (%s): avisa e mantem o formulario', async (_n, rota, mensagem) => {
    const usuario = userEvent.setup()
    await abrir({ 'POST /grupos': rota })
    await usuario.click(screen.getByRole('button', { name: 'Novo grupo' }))
    await usuario.type(screen.getByLabelText('Nome do grupo'), 'Turma B')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
    expect((screen.getByLabelText('Nome do grupo') as HTMLInputElement).value).toBe('Turma B')
  })
})

describe('apagar', () => {
  it('pede confirmacao com o nome; "Cancelar" nao apaga; "Sim, apagar" apaga e avisa', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir({ 'DELETE /grupos/3': { status: 204 } })
    await usuario.click(within(await waitFor(() => cartao('Turma A'))).getByRole('button', { name: 'Apagar' }))
    const pergunta = screen.getByRole('alertdialog')
    expect(pergunta.textContent).toContain('Apagar o grupo Turma A?')
    await usuario.click(within(pergunta).getByText('Cancelar', { selector: 'button[data-acao="cancelar"]' }))
    expect(servidor.alteracoes()).toEqual([])
    await apagar(usuario, 'Turma A')
    expect((await screen.findByRole('status')).textContent).toBe('Grupo apagado.')
    expect(servidor.alteracoes()).toEqual([{ metodo: 'DELETE', caminho: '/grupos/3', corpo: undefined }])
  })

  // DEFEITO achado na Fase 3b (14/11/2026): a mensagem de erro so aparecia
  // DENTRO do formulario de criar/editar. Ao apagar com o formulario fechado,
  // a falha era silenciosa; e o texto padrao falava em "salvar".
  it.each([
    ['motivo do servidor', { status: 403, corpo: { detail: 'Só quem criou pode apagar.' } } as Rota, 'Só quem criou pode apagar.'],
    ['sem motivo', { status: 500 } as Rota, 'Não foi possível apagar o grupo.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Sem conexão com o servidor. Tente de novo.'],
  ])('falha ao apagar (%s): o aviso aparece mesmo com o formulario fechado', async (_n, rota, mensagem) => {
    const usuario = userEvent.setup()
    await abrir({ 'DELETE /grupos/3': rota })
    await apagar(usuario, 'Turma A')
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
    expect(cartao('Turma A')).toBeTruthy()
  })
})
