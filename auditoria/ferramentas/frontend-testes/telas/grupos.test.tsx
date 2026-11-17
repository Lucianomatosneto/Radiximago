// @vitest-environment jsdom
//
// TELA "Grupos" (frontend/src/app/grupos/page.tsx) - Fase 3b; entrada
// consentida em 17/11/2026 (Etapa 2 dos grupos ampliados).
// Grupos de pessoas (ex.: uma turma) para enviar imagens de uma vez.
// Quem pode (professor, pesquisador, curador, administrador), lista vazia e
// com grupos, criar e editar (o que vai ao servidor: as pessoas escolhidas
// viram CONVITE), autorizar/recusar pedidos, cancelar convite, tirar
// participante, apagar com confirmacao e os erros (motivo do servidor,
// mensagem padrao, sem conexao).
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
vi.mock('../../../../frontend/src/components/envios/ImagensGrupoDono', () => ({
  default: ({ grupoId }: { grupoId: number }) => <p>imagens enviadas ao grupo {grupoId}</p>,
}))
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
  {
    id: 3, nome: 'Turma A', aceita_pedidos: true,
    membros: [{ id: 10, nome: 'Ana', origem: 'convite' }, { id: 11, nome: 'Bia', origem: 'pedido' }],
    convites: [{ id: 70, pessoa: { id: 12, nome: 'Caio' } }],
    pedidos: [{ id: 80, pessoa: { id: 13, nome: 'Duda' } }],
  },
  { id: 4, nome: 'Monitores', aceita_pedidos: false, membros: [{ id: 14, nome: 'Eva', origem: 'anterior' }], convites: [], pedidos: [] },
  { id: 5, nome: 'Vazio', membros: [] },
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

  it.each(['estudante', 'suporte'])('%s vai ao "acesso negado"', async (perfil) => {
    servidorFalso(rotasPadrao(perfil))
    montarTela(<GruposPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/acesso-negado?de=/grupos'))
  })

  it.each(['professor', 'pesquisador', 'curador', 'administrador'])('%s ve os grupos: participantes (com como entraram), pedidos e convites', async (perfil) => {
    await abrir({}, perfil)
    const turma = cartao('Turma A')
    expect(within(turma).getByText('2 pessoas')).toBeTruthy()
    expect(within(turma).getByText('Aparece na busca')).toBeTruthy()
    const participantes = within(turma).getByRole('region', { name: 'Participantes' })
    expect(participantes.textContent).toContain('Ana(aceitou convite)')
    expect(participantes.textContent).toContain('Bia(pedido autorizado)')
    expect(within(within(turma).getByRole('region', { name: 'Pedidos para entrar' })).getByText('Duda')).toBeTruthy()
    expect(within(within(turma).getByRole('region', { name: 'Convites sem resposta' })).getByText('Caio')).toBeTruthy()
    const monitores = cartao('Monitores')
    expect(within(monitores).getByText('Fora da busca')).toBeTruthy()
    expect(within(monitores).getByText(/já estava no grupo/)).toBeTruthy()
    expect(within(monitores).queryByRole('region', { name: 'Pedidos para entrar' })).toBeNull()
    // grupo sem as listas novas (resposta antiga): nao quebra
    expect(within(cartao('Vazio')).getByText('Sem pessoas ainda.')).toBeTruthy()
    expect(within(cartao('Vazio')).getByText('Fora da busca')).toBeTruthy()
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
  it('novo grupo: manda nome, "aceitar pedidos" e as pessoas a CONVIDAR; avisa, fecha o formulario e recarrega', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir({ 'POST /grupos': { status: 201, corpo: {} } })
    await usuario.click(screen.getByRole('button', { name: 'Novo grupo' }))
    expect(screen.getByText('Quem você escolher recebe um convite e só entra no grupo depois de aceitar.')).toBeTruthy()
    await usuario.type(screen.getByLabelText('Nome do grupo'), 'Turma B')
    await usuario.click(screen.getByRole('button', { name: 'acrescentar Aluno Novo' }))
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect((await screen.findByRole('status')).textContent).toBe('Grupo salvo.')
    expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: '/grupos', corpo: { nome: 'Turma B', aceita_pedidos: true, membros_ids: [50] } }])
    expect(screen.queryByLabelText('Nome do grupo')).toBeNull()
    await waitFor(() => expect(servidor.pedidos.filter((p) => p.caminho === '/grupos' && p.metodo === 'GET')).toHaveLength(2))
  })

  it('editar: nome e "aceitar pedidos" preenchidos; quem participa continua e o novo vai como convite (PUT)', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir({ 'PUT /grupos/4': { corpo: {} } })
    await usuario.click(within(await waitFor(() => cartao('Monitores'))).getByRole('button', { name: 'Editar' }))
    expect((screen.getByLabelText('Nome do grupo') as HTMLInputElement).value).toBe('Monitores')
    const chave = screen.getByLabelText(/Aceitar pedidos de estudantes/) as HTMLInputElement
    expect(chave.checked).toBe(false)
    expect(screen.getByText('escolhidas:')).toBeTruthy() // so quem for convidado agora
    await usuario.click(chave)
    await usuario.click(screen.getByRole('button', { name: 'acrescentar Aluno Novo' }))
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(servidor.alteracoes()).toEqual([
      { metodo: 'PUT', caminho: '/grupos/4', corpo: { nome: 'Monitores', aceita_pedidos: true, membros_ids: [14, 50] } },
    ]))
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

describe('pedidos, convites e participantes', () => {
  it.each([
    ['Autorizar o pedido de Duda', 'POST', '/grupos/3/pedidos/80/autorizar', 'Pedido autorizado: a pessoa agora participa do grupo.'],
    ['Recusar o pedido de Duda', 'POST', '/grupos/3/pedidos/80/recusar', 'Pedido recusado.'],
    ['Cancelar o convite de Caio', 'DELETE', '/grupos/3/convites/70', 'Convite cancelado.'],
  ])('"%s": chama o servidor, avisa, recarrega e pede ao menu para recontar', async (botao, metodo, caminho, mensagem) => {
    const usuario = userEvent.setup()
    const servidor = await abrir({ [`${metodo} ${caminho}`]: { corpo: {} } })
    const recontar = vi.fn()
    window.addEventListener('radix-grupos-mudou', recontar)
    await usuario.click(within(await waitFor(() => cartao('Turma A'))).getByRole('button', { name: botao }))
    expect((await screen.findByRole('status')).textContent).toBe(mensagem)
    expect(servidor.alteracoes()).toEqual([{ metodo, caminho, corpo: undefined }])
    expect(recontar).toHaveBeenCalled()
    window.removeEventListener('radix-grupos-mudou', recontar)
    await waitFor(() => expect(servidor.pedidos.filter((p) => p.caminho === '/grupos' && p.metodo === 'GET')).toHaveLength(2))
  })

  it('tirar participante pede confirmacao com o nome; "Cancelar" nao tira', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir({ 'DELETE /grupos/3/membros/10': { corpo: {} } })
    await usuario.click(within(await waitFor(() => cartao('Turma A'))).getByRole('button', { name: 'Tirar Ana do grupo' }))
    const pergunta = screen.getByRole('alertdialog')
    expect(pergunta.textContent).toContain('Tirar Ana do grupo?')
    await usuario.click(within(pergunta).getByText('Cancelar', { selector: 'button[data-acao="cancelar"]' }))
    expect(servidor.alteracoes()).toEqual([])
    await usuario.click(within(cartao('Turma A')).getByRole('button', { name: 'Tirar Ana do grupo' }))
    await usuario.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Sim, tirar' }))
    expect((await screen.findByRole('status')).textContent).toBe('Pessoa retirada do grupo.')
    expect(servidor.alteracoes()).toEqual([{ metodo: 'DELETE', caminho: '/grupos/3/membros/10', corpo: undefined }])
  })

  it.each([
    ['motivo do servidor', { status: 404, corpo: { detail: 'Convite ou pedido não encontrado.' } } as Rota, 'Convite ou pedido não encontrado.'],
    ['sem motivo', { status: 500 } as Rota, 'Não foi possível concluir. Tente de novo.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Sem conexão com o servidor. Tente de novo.'],
  ])('falha ao autorizar (%s): avisa', async (_n, rota, mensagem) => {
    const usuario = userEvent.setup()
    await abrir({ 'POST /grupos/3/pedidos/80/autorizar': rota })
    await usuario.click(within(await waitFor(() => cartao('Turma A'))).getByRole('button', { name: 'Autorizar o pedido de Duda' }))
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
  })
})

describe('imagens enviadas ao grupo (Etapa 3)', () => {
  it('abre e fecha a lista de imagens de cada grupo', async () => {
    const usuario = userEvent.setup()
    await abrir()
    const botao = within(await waitFor(() => cartao('Turma A'))).getByRole('button', { name: 'Imagens enviadas ao grupo' })
    expect(botao.getAttribute('aria-expanded')).toBe('false')
    await usuario.click(botao)
    expect(screen.getByText('imagens enviadas ao grupo 3')).toBeTruthy()
    expect(botao.getAttribute('aria-expanded')).toBe('true')
    await usuario.click(botao)
    expect(screen.queryByText('imagens enviadas ao grupo 3')).toBeNull()
  })
})
