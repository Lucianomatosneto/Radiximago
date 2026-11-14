// @vitest-environment jsdom
//
// TELA "Usuarios" (frontend/src/app/usuarios/page.tsx) - Fase 1. So o
// ADMINISTRADOR entra. Lista com filtros, cartoes por perfil, pedidos de
// acesso (aprovar/rejeitar), criar, editar, bloquear, encerrar acessos,
// redefinir as 2 etapas (regra dos DOIS meios, ASVS 6.4.4) e excluir.
// Pessoas e e-mails abaixo sao inventados (dominio exemplo.test).
//
// Correcoes de 13/11/2026 (defeitos achados na Fase 1): os campos das janelas
// sao achados pelo ROTULO (getByLabelText) e as janelas pelo NOME
// (getByRole('dialog', { name })) - como um leitor de tela faz.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UsuariosPage from '../../../../frontend/src/app/usuarios/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/usuarios' }))
vi.mock('../../../../frontend/src/components/Sidebar', () => ({ default: () => <nav aria-label="menu lateral" /> }))
vi.mock('../../../../frontend/src/components/Topbar', () => ({ default: () => <header aria-label="barra do topo" /> }))

// ---- dados inventados ----
const EU = { id: 1, nome: 'Admin Teste', email: 'admin@exemplo.test', perfil: 'administrador', instituicao: 'Instituição X', ativo: true, bloqueado: false, criado_em: '2026-01-10T12:00:00Z' }
const CURADORA = { id: 2, nome: 'Curadora Alfa', email: 'alfa@exemplo.test', perfil: 'curador', instituicao: null, ativo: true, bloqueado: false, criado_em: '2026-02-01T12:00:00Z' }
const ESTUDANTE = { id: 3, nome: 'Estudante Beta', email: 'beta@exemplo.test', perfil: 'estudante', instituicao: 'Instituição Y', ativo: true, bloqueado: true, criado_em: '2026-03-01T12:00:00Z' }
const PROFESSOR = { id: 4, nome: 'Professor Gama', email: 'gama@exemplo.test', perfil: 'professor', instituicao: null, ativo: false, bloqueado: false }
const USUARIOS = [EU, CURADORA, ESTUDANTE, PROFESSOR]
const PEDIDO = { id: 50, nome: 'Pessoa Delta', email: 'delta@exemplo.test', instituicao: 'Instituição Z', perfil_solicitado: 'professor', motivo: 'Uso em aula.', status: 'pendente', motivo_rejeicao: null, criado_em: '2026-11-01T12:00:00Z' }
const PEDIDO_DUPLICADO = { ...PEDIDO, id: 51, nome: 'Curadora Alfa', email: 'alfa@exemplo.test', perfil_solicitado: 'pesquisador', motivo: null, conta_existente_perfil: 'curador' }

const LISTA = 'GET /users/'
const PEDIDOS = 'GET /users/access-requests?status_filtro=pendente'

function rotasPadrao(extra: Record<string, Rota> = {}): Record<string, Rota> {
  return {
    'GET /auth/me': { corpo: { id: 1, nome: EU.nome, email: EU.email, perfil: 'administrador', foto_perfil_url: null } },
    [LISTA]: { corpo: USUARIOS },
    [PEDIDOS]: { corpo: [PEDIDO, PEDIDO_DUPLICADO] },
    ...extra,
  }
}
async function abrir(rotas: Record<string, Rota>) {
  const servidor = servidorFalso(rotas)
  montarTela(<UsuariosPage />)
  await screen.findByRole('heading', { level: 1, name: 'Usuários' })
  return servidor
}
/** a tabela principal (a ultima da tela) */
function tabelaUsuarios() {
  const tabelas = screen.getAllByRole('table')
  return tabelas[tabelas.length - 1]
}
function linha(nome: string) {
  return within(tabelaUsuarios()).getByText(nome).closest('tr') as HTMLElement
}
function nomesNaTabela() {
  return within(tabelaUsuarios()).queryAllByRole('row').slice(1).map((r) => r.querySelector('td')?.textContent)
}
/** a janela aberta, pelo nome (titulo) */
const janela = (nome: string) => screen.getByRole('dialog', { name: nome })
const campo = (j: HTMLElement, rotulo: string) => within(j).getByLabelText(rotulo) as HTMLInputElement

beforeEach(() => vi.clearAllMocks())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('permissao por perfil', () => {
  it('sem login: vai para o login sem pedir a lista', async () => {
    const servidor = servidorFalso({ 'GET /auth/me': { status: 401 } })
    montarTela(<UsuariosPage />)
    expect(screen.getByText('Carregando...')).toBeTruthy()
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
    expect(servidor.pedidos.map((p) => p.caminho)).toEqual(['/auth/me'])
  })

  it.each(['curador', 'estudante', 'professor'])('%s: vai para "acesso negado" sem pedir a lista', async (perfil) => {
    const servidor = servidorFalso({ 'GET /auth/me': { corpo: { id: 9, nome: 'X', email: 'x@exemplo.test', perfil, foto_perfil_url: null } } })
    montarTela(<UsuariosPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/acesso-negado?de=/usuarios'))
    expect(servidor.pedidos.map((p) => p.caminho)).toEqual(['/auth/me'])
  })

  it('administrador: ve a lista; na propria linha nao ha Bloquear, Encerrar nem Excluir', async () => {
    await abrir(rotasPadrao())
    expect(nomesNaTabela()).toEqual(['Admin Teste', 'Curadora Alfa', 'Estudante Beta', 'Professor Gama'])
    const minha = linha('Admin Teste')
    expect(within(minha).getByText('(você)')).toBeTruthy()
    expect(within(minha).queryByRole('button', { name: 'Bloquear' })).toBeNull()
    expect(within(minha).queryByRole('button', { name: 'Excluir' })).toBeNull()
    expect(within(minha).getByRole('button', { name: 'Redefinir 2 etapas' })).toBeTruthy()
    expect(within(linha('Curadora Alfa')).getByRole('button', { name: 'Excluir' })).toBeTruthy()
  })

  it('o servidor recusa a lista (403): vai para "acesso negado"', async () => {
    servidorFalso(rotasPadrao({ [LISTA]: { status: 403 } }))
    montarTela(<UsuariosPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/acesso-negado?de=/usuarios'))
  })

  it.each([
    ['sessao expirada (401)', { status: 401 }],
    ['servidor fora do ar', 'SEM_CONEXAO' as const],
  ])('%s ao pedir a lista: vai para o login', async (_caso, resposta) => {
    servidorFalso(rotasPadrao({ [LISTA]: resposta }))
    montarTela(<UsuariosPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
  })
})

describe('lista, cartoes e filtros', () => {
  it('status de cada pessoa e contagem por perfil nos cartoes', async () => {
    await abrir(rotasPadrao())
    expect(within(linha('Curadora Alfa')).getByText('Ativo')).toBeTruthy()
    expect(within(linha('Estudante Beta')).getByText('Bloqueado')).toBeTruthy()
    expect(within(linha('Professor Gama')).getByText('Inativo')).toBeTruthy()
    expect(within(linha('Curadora Alfa')).getAllByText('—').length).toBeGreaterThan(0) // sem instituicao
    expect(screen.getByRole('button', { name: /Total de usuários\s*4/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Curadores\s*1/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Solicitações pendentes\s*2/ })).toBeTruthy()
  })

  it('cartao filtra por perfil; clicar de novo mostra todos', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao())
    await usuario.click(screen.getByRole('button', { name: /Curadores/ }))
    expect(nomesNaTabela()).toEqual(['Curadora Alfa'])
    await usuario.click(screen.getByRole('button', { name: /Curadores/ }))
    expect(nomesNaTabela()).toHaveLength(4)
  })

  it('busca por nome/e-mail, filtro de perfil e de status; sem resultado mostra o aviso', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao())
    const busca = screen.getByPlaceholderText('Buscar por nome ou e-mail...')
    await usuario.type(busca, 'BETA@')
    expect(nomesNaTabela()).toEqual(['Estudante Beta'])
    await usuario.clear(busca)
    const [perfil, status] = screen.getAllByRole('combobox')
    await usuario.selectOptions(status, 'Bloqueado')
    expect(nomesNaTabela()).toEqual(['Estudante Beta'])
    await usuario.selectOptions(status, 'Ativo')
    expect(nomesNaTabela()).toEqual(['Admin Teste', 'Curadora Alfa'])
    await usuario.selectOptions(perfil, 'Pesquisador')
    expect(screen.getByText('Nenhum usuário encontrado.')).toBeTruthy()
  })

  it('usuarios excluidos: abre a lista do servidor e fecha', async () => {
    const usuario = userEvent.setup()
    const excluido = { id: 8, nome: 'Ex Usuário', email: 'ex@exemplo.test', perfil: 'estudante', instituicao: null, excluido_em: '2026-10-01T12:00:00Z', excluido_por: 'Admin Teste' }
    await abrir(rotasPadrao({ 'GET /users/deleted': { corpo: [excluido] } }))
    await usuario.click(screen.getByRole('button', { name: 'Ver usuários excluídos' }))
    expect(await screen.findByText('Ex Usuário')).toBeTruthy()
    expect(screen.getByText('Usuários excluídos (1)')).toBeTruthy()
    expect(screen.getAllByText('Admin Teste').length).toBeGreaterThan(1) // "excluido por"
    await usuario.click(screen.getByRole('button', { name: 'Ocultar excluídos' }))
    expect(screen.queryByText('Ex Usuário')).toBeNull()
  })

  it('usuarios excluidos: lista vazia e erro do servidor', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao({ 'GET /users/deleted': { corpo: [] } }))
    await usuario.click(screen.getByRole('button', { name: 'Ver usuários excluídos' }))
    expect(await screen.findByText('Nenhum usuário excluído.')).toBeTruthy()
    cleanup()
    vi.unstubAllGlobals()
    await abrir(rotasPadrao({ 'GET /users/deleted': { status: 500 } }))
    await usuario.click(screen.getByRole('button', { name: 'Ver usuários excluídos' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Não foi possível carregar os usuários excluídos.')
  })
})

describe('pedidos de acesso', () => {
  it('lista os pedidos; quem ja tem conta nao pode ser aprovado (so rejeitado)', async () => {
    await abrir(rotasPadrao())
    expect(screen.getByText('Solicitações de acesso pendentes (2)')).toBeTruthy()
    const tabela = screen.getAllByRole('table')[0]
    const delta = within(tabela).getByText('Pessoa Delta').closest('tr') as HTMLElement
    expect(within(delta).getByText('Professor')).toBeTruthy()
    expect(within(delta).getByText('Uso em aula.')).toBeTruthy()
    const duplicado = within(tabela).getByText('alfa@exemplo.test').closest('tr') as HTMLElement
    expect(within(duplicado).getByRole('note').textContent).toBe('Este e-mail já tem conta (Curador). Rejeite o pedido se for duplicado.')
    expect((within(duplicado).getByRole('button', { name: 'Aprovar' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(duplicado).getByRole('button', { name: 'Rejeitar' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('sem pedidos: a secao nao aparece e nao ha aviso de erro', async () => {
    await abrir(rotasPadrao({ [PEDIDOS]: { corpo: [] } }))
    expect(screen.queryByText(/Solicitações de acesso pendentes/)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    // sem pedidos o cartao mostra 0 e deixa de ser botao (nao ha para onde levar)
    expect(screen.queryByRole('button', { name: /Solicitações pendentes/ })).toBeNull()
    expect(screen.getByText('Solicitações pendentes').parentElement?.textContent).toContain('0')
  })

  it('aprovar: sugere o perfil pedido, permite trocar e envia o perfil escolhido', async () => {
    const usuario = userEvent.setup()
    const novo = { id: 60, nome: 'Pessoa Delta', email: 'delta@exemplo.test', perfil: 'estudante', instituicao: 'Instituição Z', ativo: true, bloqueado: false }
    const servidor = await abrir(rotasPadrao({ 'POST /users/access-requests/50/approve': { corpo: novo } }))
    const tabela = screen.getAllByRole('table')[0]
    await usuario.click(within(within(tabela).getByText('Pessoa Delta').closest('tr') as HTMLElement).getByRole('button', { name: 'Aprovar' }))
    const janela = screen.getByRole('dialog')
    expect(within(janela).getByText('Aprovando o pedido de Pessoa Delta (delta@exemplo.test). Intenção declarada: Professor.')).toBeTruthy()
    expect(within(janela).getByRole('button', { name: 'Professor' }).className).toContain('bg-brand') // sugerido
    await usuario.click(within(janela).getByRole('button', { name: 'Estudante' }))
    await usuario.click(within(janela).getByRole('button', { name: 'Aprovar solicitação' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: '/users/access-requests/50/approve', corpo: { perfil_concedido: 'estudante' } }])
    expect(screen.getByText('Solicitações de acesso pendentes (1)')).toBeTruthy()
    expect(nomesNaTabela()).toContain('Pessoa Delta')
  })

  it('aprovar: recusa do servidor aparece na janela', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao({ 'POST /users/access-requests/50/approve': { status: 409, corpo: { detail: 'Pedido já processado.' } } }))
    await usuario.click(screen.getAllByRole('button', { name: 'Aprovar' })[0])
    await usuario.click(screen.getByRole('button', { name: 'Aprovar solicitação' }))
    expect((await within(screen.getByRole('dialog')).findByRole('alert')).textContent).toBe('Pedido já processado.')
  })

  it('rejeitar: exige o motivo; envia e o pedido sai da lista', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir(rotasPadrao({ 'POST /users/access-requests/51/reject': { corpo: { ok: true } } }))
    const tabela = screen.getAllByRole('table')[0]
    await usuario.click(within(within(tabela).getByText('alfa@exemplo.test').closest('tr') as HTMLElement).getByRole('button', { name: 'Rejeitar' }))
    const janela = screen.getByRole('dialog')
    const motivo = within(janela).getByPlaceholderText('Explique por que o pedido está sendo rejeitado')
    await usuario.type(motivo, '   ')
    // o navegador nao bloqueia "so espacos" (required aceita): quem recusa e a tela
    await usuario.click(within(janela).getByRole('button', { name: 'Rejeitar solicitação' }))
    expect(within(janela).getByRole('alert').textContent).toBe('Informe o motivo da rejeição.')
    expect(servidor.alteracoes()).toEqual([])
    await usuario.clear(motivo)
    await usuario.type(motivo, 'Conta duplicada.')
    await usuario.click(within(janela).getByRole('button', { name: 'Rejeitar solicitação' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: '/users/access-requests/51/reject', corpo: { motivo: 'Conta duplicada.' } }])
    expect(screen.getByText('Solicitações de acesso pendentes (1)')).toBeTruthy()
  })

  it('rejeitar: recusa do servidor aparece na janela; Esc fecha sem enviar de novo', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir(rotasPadrao({ 'POST /users/access-requests/50/reject': { status: 400, corpo: {} } }))
    await usuario.click(screen.getAllByRole('button', { name: 'Rejeitar' })[0])
    await usuario.type(screen.getByPlaceholderText('Explique por que o pedido está sendo rejeitado'), 'Fora do escopo.')
    await usuario.click(screen.getByRole('button', { name: 'Rejeitar solicitação' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Não foi possível rejeitar a solicitação.')
    await usuario.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(servidor.alteracoes()).toHaveLength(1)
  })
})

describe('criar e editar', () => {
  it('novo usuario: senha curta e recusada pela tela; depois cria e aparece na lista', async () => {
    const usuario = userEvent.setup()
    const novo = { id: 70, nome: 'Pessoa Nova', email: 'nova@exemplo.test', perfil: 'suporte', instituicao: null, ativo: true, bloqueado: false }
    const servidor = await abrir(rotasPadrao({ 'POST /users/': { status: 201, corpo: novo } }))
    await usuario.click(screen.getByRole('button', { name: 'Novo usuário' }))
    const j = janela('Novo usuário')
    await usuario.type(campo(j, 'Nome'), 'Pessoa Nova')
    await usuario.type(campo(j, 'E-mail'), 'nova@exemplo.test')
    await usuario.type(campo(j, 'Senha'), 'curta')
    await usuario.selectOptions(campo(j, 'Perfil'), 'Suporte')
    await usuario.type(campo(j, 'Instituição (opcional)'), '   ')
    await usuario.click(within(j).getByRole('button', { name: 'Criar usuário' }))
    expect(within(j).getByRole('alert').textContent).toBe('A senha deve ter ao menos 8 caracteres.')
    expect(servidor.alteracoes()).toEqual([])
    await usuario.type(campo(j, 'Senha'), '-mais-longa')
    await usuario.click(within(j).getByRole('button', { name: 'Criar usuário' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(servidor.alteracoes()[0].corpo).toEqual({ nome: 'Pessoa Nova', email: 'nova@exemplo.test', senha: 'curta-mais-longa', perfil: 'suporte', instituicao: null })
    expect(nomesNaTabela()).toContain('Pessoa Nova')
  })

  it('novo usuario: avisa erro de digitacao no e-mail (sem bloquear)', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao())
    await usuario.click(screen.getByRole('button', { name: 'Novo usuário' }))
    await usuario.type(campo(janela('Novo usuário'), 'E-mail'), 'pessoa@hotmai.com')
    expect(within(janela('Novo usuário')).getByRole('note').textContent).toMatch(/hotmail\.com/)
  })

  it.each([
    ['recusa com motivo', { status: 409, corpo: { detail: 'E-mail já cadastrado.' } }, 'E-mail já cadastrado.'],
    ['sem conexao', 'SEM_CONEXAO' as const, 'Não foi possível criar o usuário.'],
  ])('novo usuario: erro do servidor (%s) aparece na janela', async (_caso, resposta, mensagem) => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao({ 'POST /users/': resposta }))
    await usuario.click(screen.getByRole('button', { name: 'Novo usuário' }))
    const j = janela('Novo usuário')
    await usuario.type(campo(j, 'Nome'), 'Pessoa')
    await usuario.type(campo(j, 'E-mail'), 'p@exemplo.test')
    await usuario.type(campo(j, 'Senha'), 'senha-longa-1')
    await usuario.click(within(j).getByRole('button', { name: 'Criar usuário' }))
    expect((await within(j).findByRole('alert')).textContent).toBe(mensagem)
    await usuario.click(within(j).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('editar: vem preenchido, envia nome e instituicao (vazia vira null) e a linha muda', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir(rotasPadrao({ 'PATCH /users/3': (p) => ({ corpo: { ...ESTUDANTE, ...(p.corpo as object) } }) }))
    await usuario.click(within(linha('Estudante Beta')).getByRole('button', { name: 'Editar' }))
    const j = janela('Editar usuário')
    expect([campo(j, 'Nome').value, campo(j, 'Instituição').value]).toEqual(['Estudante Beta', 'Instituição Y'])
    await usuario.clear(campo(j, 'Nome'))
    await usuario.type(campo(j, 'Nome'), 'Estudante Beta Silva')
    await usuario.clear(campo(j, 'Instituição'))
    await usuario.click(within(j).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(servidor.alteracoes()[0]).toEqual({ metodo: 'PATCH', caminho: '/users/3', corpo: { nome: 'Estudante Beta Silva', instituicao: null } })
    expect(nomesNaTabela()).toContain('Estudante Beta Silva')
  })

  it.each([
    ['recusa com motivo', { status: 422, corpo: { detail: 'Nome muito longo.' } }, 'Nome muito longo.'],
    ['sem conexao', 'SEM_CONEXAO' as const, 'Não foi possível salvar as alterações.'],
  ])('editar: erro do servidor (%s) aparece na janela', async (_caso, resposta, mensagem) => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao({ 'PATCH /users/2': resposta }))
    await usuario.click(within(linha('Curadora Alfa')).getByRole('button', { name: 'Editar' }))
    await usuario.click(within(janela('Editar usuário')).getByRole('button', { name: 'Salvar' }))
    expect((await within(janela('Editar usuário')).findByRole('alert')).textContent).toBe(mensagem)
  })
})

describe('bloquear, encerrar acessos e excluir', () => {
  it('bloquear pede confirmacao com nome e e-mail; "Cancelar" nao envia', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir(rotasPadrao())
    await usuario.click(within(linha('Curadora Alfa')).getByRole('button', { name: 'Bloquear' }))
    const janela = screen.getByRole('dialog')
    expect(within(janela).getByText(/Bloquear Curadora Alfa \(alfa@exemplo\.test\)\?/)).toBeTruthy()
    await usuario.click(within(janela).getByRole('button', { name: 'Cancelar' }))
    expect(servidor.alteracoes()).toEqual([])
    expect(within(linha('Curadora Alfa')).getByText('Ativo')).toBeTruthy()
  })

  it('"Sim, bloquear" envia e a linha passa a "Bloqueado"; desbloquear ("Ativar") nao pede confirmacao', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir(rotasPadrao({ 'PATCH /users/2/block': { corpo: {} }, 'PATCH /users/3/block': { corpo: {} } }))
    await usuario.click(within(linha('Curadora Alfa')).getByRole('button', { name: 'Bloquear' }))
    await usuario.click(screen.getByRole('button', { name: 'Sim, bloquear' }))
    await waitFor(() => expect(within(linha('Curadora Alfa')).getByText('Bloqueado')).toBeTruthy())
    await usuario.click(within(linha('Estudante Beta')).getByRole('button', { name: 'Ativar' }))
    await waitFor(() => expect(within(linha('Estudante Beta')).getByText('Ativo')).toBeTruthy())
    expect(servidor.alteracoes().map((p) => `${p.metodo} ${p.caminho}`)).toEqual(['PATCH /users/2/block', 'PATCH /users/3/block'])
  })

  it.each([
    ['recusa com motivo', { status: 400, corpo: { detail: 'Último administrador não pode ser bloqueado.' } }, 'Último administrador não pode ser bloqueado.'],
    ['sem conexao', 'SEM_CONEXAO' as const, 'Sem conexão com o servidor. Tente de novo.'],
  ])('bloquear com erro (%s): mostra o aviso e a linha nao muda', async (_caso, resposta, mensagem) => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao({ 'PATCH /users/3/block': resposta }))
    await usuario.click(within(linha('Estudante Beta')).getByRole('button', { name: 'Ativar' }))
    expect((await screen.findByRole('status')).textContent).toBe(mensagem)
    expect(within(linha('Estudante Beta')).getByText('Bloqueado')).toBeTruthy()
  })

  it('encerrar acessos de uma pessoa: confirma e mostra quantos foram encerrados', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir(rotasPadrao({ 'POST /users/2/encerrar-sessoes': { corpo: { encerradas: 3 } } }))
    await usuario.click(within(linha('Curadora Alfa')).getByRole('button', { name: 'Encerrar acessos' }))
    expect(within(screen.getByRole('dialog')).getByText(/Encerrar os acessos abertos de Curadora Alfa\?/)).toBeTruthy()
    await usuario.click(screen.getByRole('button', { name: 'Sim, encerrar acessos' }))
    expect((await screen.findByRole('status')).textContent).toBe('3 acessos de Curadora Alfa encerrados.')
    expect(servidor.alteracoes()[0].caminho).toBe('/users/2/encerrar-sessoes')
  })

  it('encerrar acessos de TODOS: confirma, chama a rota geral e informa', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir(rotasPadrao({ 'POST /admin/sessoes/encerrar-todas': { corpo: { encerradas: 0 } } }))
    await usuario.click(screen.getByRole('button', { name: 'Encerrar acessos de todos' }))
    expect(within(screen.getByRole('dialog')).getByText(/Desconectar TODOS os usuários/)).toBeTruthy()
    await usuario.click(screen.getByRole('button', { name: 'Sim, encerrar acessos' }))
    expect((await screen.findByRole('status')).textContent).toBe('Nenhum outro acesso estava aberto.')
    expect(servidor.alteracoes()[0].caminho).toBe('/admin/sessoes/encerrar-todas')
  })

  it.each([
    ['recusa do servidor', { status: 500 }],
    ['sem conexao', 'SEM_CONEXAO' as const],
  ])('encerrar acessos com erro (%s): pede para tentar de novo', async (_caso, resposta) => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao({ 'POST /admin/sessoes/encerrar-todas': resposta }))
    await usuario.click(screen.getByRole('button', { name: 'Encerrar acessos de todos' }))
    await usuario.click(screen.getByRole('button', { name: 'Sim, encerrar acessos' }))
    expect((await screen.findByRole('status')).textContent).toBe('Não foi possível encerrar os acessos. Tente de novo.')
  })

  it('excluir: confirma com nome e e-mail, envia e a pessoa sai da lista', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir(rotasPadrao({ 'DELETE /users/4': { status: 204 } }))
    await usuario.click(within(linha('Professor Gama')).getByRole('button', { name: 'Excluir' }))
    expect(within(screen.getByRole('dialog')).getByText(/excluir Professor Gama \(gama@exemplo\.test\)\?/)).toBeTruthy()
    await usuario.click(screen.getByRole('button', { name: 'Excluir usuário' }))
    await waitFor(() => expect(nomesNaTabela()).not.toContain('Professor Gama'))
    expect(servidor.alteracoes()).toEqual([{ metodo: 'DELETE', caminho: '/users/4', corpo: undefined }])
  })

  it('excluir: recusa do servidor aparece na janela e a pessoa continua na lista', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao({ 'DELETE /users/4': { status: 409, corpo: { detail: 'Usuário com fichas em curadoria.' } } }))
    await usuario.click(within(linha('Professor Gama')).getByRole('button', { name: 'Excluir' }))
    await usuario.click(screen.getByRole('button', { name: 'Excluir usuário' }))
    expect((await within(screen.getByRole('dialog')).findByRole('alert')).textContent).toBe('Usuário com fichas em curadoria.')
    expect(nomesNaTabela()).toContain('Professor Gama')
  })
})

describe('redefinir as 2 etapas (dois meios de conferencia, ASVS 6.4.4)', () => {
  it('so libera com DOIS meios marcados E a confirmacao do procedimento; envia os meios', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir(rotasPadrao({ 'POST /users/2/redefinir-segundo-fator': { corpo: { ok: true } } }))
    await usuario.click(within(linha('Curadora Alfa')).getByRole('button', { name: 'Redefinir 2 etapas' }))
    const janela = screen.getByRole('dialog')
    expect(within(janela).getByRole('heading', { name: 'Redefinir as 2 etapas de Curadora Alfa' })).toBeTruthy()
    const confirmar = within(janela).getByRole('button', { name: 'Sim, redefinir' }) as HTMLButtonElement
    expect(confirmar.disabled).toBe(true)
    await usuario.click(within(janela).getByRole('checkbox', { name: 'Conversa presencial com documento com foto' }))
    await usuario.click(within(janela).getByRole('checkbox', { name: /Confirmo que segui o procedimento/ }))
    expect(confirmar.disabled).toBe(true) // um meio so nao basta
    await usuario.click(within(janela).getByRole('checkbox', { name: 'Resposta vinda do e-mail cadastrado na conta' }))
    expect(confirmar.disabled).toBe(false)
    await usuario.click(confirmar)
    expect((await screen.findByRole('status')).textContent).toBe('Login em duas etapas de Curadora Alfa redefinido.')
    expect(servidor.alteracoes()[0]).toEqual({
      metodo: 'POST',
      caminho: '/users/2/redefinir-segundo-fator',
      corpo: { meios: ['presencial', 'email_cadastrado'], procedimento_seguido: true },
    })
  })

  it('desmarcar um meio trava de novo; "Cancelar" fecha sem enviar', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir(rotasPadrao())
    await usuario.click(within(linha('Curadora Alfa')).getByRole('button', { name: 'Redefinir 2 etapas' }))
    const janela = screen.getByRole('dialog')
    await usuario.click(within(janela).getByRole('checkbox', { name: 'Videochamada com documento com foto' }))
    await usuario.click(within(janela).getByRole('checkbox', { name: /responsável acadêmico/ }))
    await usuario.click(within(janela).getByRole('checkbox', { name: /Confirmo que segui o procedimento/ }))
    await usuario.click(within(janela).getByRole('checkbox', { name: 'Videochamada com documento com foto' }))
    expect((within(janela).getByRole('button', { name: 'Sim, redefinir' }) as HTMLButtonElement).disabled).toBe(true)
    await usuario.click(within(janela).getByRole('button', { name: 'Cancelar' }))
    expect(servidor.alteracoes()).toEqual([])
  })

  it.each([
    ['recusa com motivo', { status: 400, corpo: { detail: 'Meios insuficientes.' } }, 'Meios insuficientes.'],
    ['recusa sem motivo', { status: 500, corpo: {} }, 'Não foi possível concluir agora. Tente de novo em instantes.'],
    ['sem conexao', 'SEM_CONEXAO' as const, 'Não foi possível concluir agora. Tente de novo em instantes.'],
  ])('erro do servidor (%s): mostra na janela, que continua aberta', async (_caso, resposta, mensagem) => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao({ 'POST /users/2/redefinir-segundo-fator': resposta }))
    await usuario.click(within(linha('Curadora Alfa')).getByRole('button', { name: 'Redefinir 2 etapas' }))
    const janela = screen.getByRole('dialog')
    await usuario.click(within(janela).getByRole('checkbox', { name: 'Conversa presencial com documento com foto' }))
    await usuario.click(within(janela).getByRole('checkbox', { name: 'Videochamada com documento com foto' }))
    await usuario.click(within(janela).getByRole('checkbox', { name: /Confirmo que segui o procedimento/ }))
    await usuario.click(within(janela).getByRole('button', { name: 'Sim, redefinir' }))
    expect((await within(janela).findByRole('alert')).textContent).toBe(mensagem)
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('correcoes de 13/11/2026: servidor fora do ar (defeito 1)', () => {
  it.each([
    ['recusa do servidor', { status: 500, corpo: {} }],
    ['sem conexao', 'SEM_CONEXAO' as const],
  ])('pedidos de acesso nao carregam (%s): avisa, sem esconder o problema', async (_caso, resposta) => {
    await abrir(rotasPadrao({ [PEDIDOS]: resposta }))
    expect((await screen.findByRole('alert')).textContent).toBe('Não foi possível carregar as solicitações de acesso.')
    expect(screen.queryByText(/Solicitações de acesso pendentes \(/)).toBeNull()
    expect(nomesNaTabela()).toHaveLength(4) // o resto da tela funciona
  })

  it('excluir sem conexao: avisa na janela, o botao volta e a pessoa continua na lista', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao({ 'DELETE /users/4': 'SEM_CONEXAO' }))
    await usuario.click(within(linha('Professor Gama')).getByRole('button', { name: 'Excluir' }))
    const j = janela('Excluir usuário')
    await usuario.click(within(j).getByRole('button', { name: 'Excluir usuário' }))
    expect((await within(j).findByRole('alert')).textContent).toBe('Não foi possível excluir o usuário.')
    expect((within(j).getByRole('button', { name: 'Excluir usuário' }) as HTMLButtonElement).disabled).toBe(false)
    expect(nomesNaTabela()).toContain('Professor Gama')
  })

  it('aprovar pedido sem conexao: avisa na janela, o botao volta e o pedido continua', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao({ 'POST /users/access-requests/50/approve': 'SEM_CONEXAO' }))
    await usuario.click(screen.getAllByRole('button', { name: 'Aprovar' })[0])
    const j = janela('Aprovar solicitação')
    await usuario.click(within(j).getByRole('button', { name: 'Aprovar solicitação' }))
    expect((await within(j).findByRole('alert')).textContent).toBe('Não foi possível aprovar a solicitação.')
    expect((within(j).getByRole('button', { name: 'Aprovar solicitação' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText('Solicitações de acesso pendentes (2)')).toBeTruthy()
  })

  it('rejeitar pedido sem conexao: avisa na janela, o botao volta e o pedido continua', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao({ 'POST /users/access-requests/50/reject': 'SEM_CONEXAO' }))
    await usuario.click(screen.getAllByRole('button', { name: 'Rejeitar' })[0])
    const j = janela('Rejeitar solicitação')
    await usuario.type(campo(j, 'Motivo da rejeição'), 'Fora do escopo.')
    await usuario.click(within(j).getByRole('button', { name: 'Rejeitar solicitação' }))
    expect((await within(j).findByRole('alert')).textContent).toBe('Não foi possível rejeitar a solicitação.')
    expect((within(j).getByRole('button', { name: 'Rejeitar solicitação' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText('Solicitações de acesso pendentes (2)')).toBeTruthy()
  })

  it('"Ver usuarios excluidos" sem conexao: avisa e nao fica em "Carregando..."; abrir de novo tenta outra vez', async () => {
    const usuario = userEvent.setup()
    let vezes = 0
    const excluido = { id: 8, nome: 'Ex Usuário', email: 'ex@exemplo.test', perfil: 'estudante', instituicao: null }
    await abrir(rotasPadrao({ 'GET /users/deleted': () => (++vezes === 1 ? 'SEM_CONEXAO' : { corpo: [excluido] }) }))
    await usuario.click(screen.getByRole('button', { name: 'Ver usuários excluídos' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Não foi possível carregar os usuários excluídos.')
    expect(screen.queryByText('Carregando...')).toBeNull()
    await usuario.click(screen.getByRole('button', { name: 'Ocultar excluídos' }))
    await usuario.click(screen.getByRole('button', { name: 'Ver usuários excluídos' }))
    expect(await screen.findByText('Ex Usuário')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('correcoes de 13/11/2026: acessibilidade (defeito 2)', () => {
  it('cada janela tem nome (o titulo) para o leitor de tela', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao())
    const abrirEFechar = async (botao: HTMLElement, nome: string) => {
      await usuario.click(botao)
      expect(screen.getByRole('dialog', { name: nome })).toBeTruthy()
      await usuario.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).toBeNull()
    }
    await abrirEFechar(screen.getByRole('button', { name: 'Novo usuário' }), 'Novo usuário')
    await abrirEFechar(within(linha('Curadora Alfa')).getByRole('button', { name: 'Editar' }), 'Editar usuário')
    await abrirEFechar(within(linha('Curadora Alfa')).getByRole('button', { name: 'Excluir' }), 'Excluir usuário')
    await abrirEFechar(within(linha('Curadora Alfa')).getByRole('button', { name: 'Bloquear' }), 'Confirmar ação')
    await abrirEFechar(within(linha('Curadora Alfa')).getByRole('button', { name: 'Redefinir 2 etapas' }), 'Redefinir as 2 etapas de Curadora Alfa')
    await abrirEFechar(screen.getAllByRole('button', { name: 'Aprovar' })[0], 'Aprovar solicitação')
    await abrirEFechar(screen.getAllByRole('button', { name: 'Rejeitar' })[0], 'Rejeitar solicitação')
  })

  it('os campos de editar e criar sao encontrados pelo rotulo', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao())
    await usuario.click(within(linha('Estudante Beta')).getByRole('button', { name: 'Editar' }))
    expect(campo(janela('Editar usuário'), 'Nome').value).toBe('Estudante Beta')
    expect(campo(janela('Editar usuário'), 'Instituição').value).toBe('Instituição Y')
    await usuario.keyboard('{Escape}')
    await usuario.click(screen.getByRole('button', { name: 'Novo usuário' }))
    const j = janela('Novo usuário')
    for (const rotulo of ['Nome', 'E-mail', 'Senha', 'Perfil', 'Instituição (opcional)']) expect(campo(j, rotulo)).toBeTruthy()
    expect(campo(j, 'Perfil').value).toBe('estudante')
  })

  it('aprovar: os botoes de perfil formam um grupo com o nome "Perfil a conceder"', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao())
    await usuario.click(screen.getAllByRole('button', { name: 'Aprovar' })[0])
    const grupo = within(janela('Aprovar solicitação')).getByRole('group', { name: /Perfil a conceder/ })
    expect(within(grupo).getAllByRole('button').map((b) => b.textContent)).toEqual(['Curador', 'Professor', 'Estudante', 'Pesquisador'])
  })
})
