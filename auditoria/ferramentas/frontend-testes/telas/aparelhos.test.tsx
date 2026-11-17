// @vitest-environment jsdom
//
// TELA "Aparelhos da rede" (frontend/src/app/aparelhos/page.tsx).
// PR 3a (14/11/2026): o botao "Testar conexao" nao avisava nada quando o
// servidor estava fora do ar. Os demais testes da tela entram no PR 3b.
// Dados inventados.
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AparelhosPage from '../../../../frontend/src/app/aparelhos/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/aparelhos' }))
vi.mock('../../../../frontend/src/components/Sidebar', () => ({ default: () => <nav aria-label="menu lateral" /> }))
vi.mock('../../../../frontend/src/components/Topbar', () => ({ default: () => <header aria-label="barra do topo" /> }))

const SUPORTE = { id: 4, nome: 'Suporte Teste', email: 'suporte@exemplo.test', perfil: 'suporte', foto_perfil_url: null }
const APARELHO = { id: 5, nome: 'Raio-X Sala 2', unidade: 'Clínica escola', aet: 'RXSALA2', ip: '10.0.0.20', porta: 104, liberado: true, total_recebidas: 3, ultimo_recebimento_em: null }

function rotasPadrao(extra: Record<string, Rota> = {}): Record<string, Rota> {
  return {
    'GET /auth/me': { corpo: SUPORTE },
    'GET /aparelhos': { corpo: { aparelhos: [APARELHO], configuracao: { aet: 'RADIX', porta: 4242, endereco: '10.0.0.1' }, pode_gerir: true } },
    ...extra,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})
afterEach(() => cleanup())

describe('PR 3a: "Testar conexão" com o servidor fora do ar', () => {
  it('avisa "Sem conexão" e o botao volta a ficar disponivel', async () => {
    const usuario = userEvent.setup()
    servidorFalso(rotasPadrao({ 'POST /aparelhos/5/testar': 'SEM_CONEXAO' }))
    montarTela(<AparelhosPage />)
    const testar = await screen.findByRole('button', { name: 'Testar conexão' })
    await usuario.click(testar)
    expect((await screen.findByRole('alert')).textContent).toBe('Sem conexão com o servidor. Tente de novo.')
    expect((screen.getByRole('button', { name: 'Testar conexão' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('com o servidor no ar, o resultado do teste continua aparecendo', async () => {
    const usuario = userEvent.setup()
    servidorFalso(rotasPadrao({ 'POST /aparelhos/5/testar': { corpo: { orthanc_no_ar: true, respondeu: true } } }))
    montarTela(<AparelhosPage />)
    await usuario.click(await screen.findByRole('button', { name: 'Testar conexão' }))
    expect(await screen.findByText('Raio-X Sala 2 respondeu: a conexão está funcionando.')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

// Fase 3c (14/11/2026): o resto da tela. Quem pode, dados de configuracao,
// lista, cadastrar/alterar (o que vai ao servidor e os erros), bloquear com
// confirmacao, liberar e o resultado do teste de conexao. Dados inventados.
describe('Fase 3c: quem pode e o que aparece', () => {
  const ADMIN = { ...SUPORTE, id: 1, perfil: 'administrador' }
  const cartao = (nome: string) => screen.getByRole('heading', { name: nome }).closest('li') as HTMLElement

  it('sem sessao vai ao login', async () => {
    servidorFalso({ 'GET /auth/me': { status: 401 } })
    montarTela(<AparelhosPage />)
    expect(screen.getByText('Carregando...')).toBeTruthy()
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
  })

  it.each(['curador', 'professor', 'estudante', 'pesquisador'])('%s vai ao "acesso negado" sem pedir a lista', async (perfil) => {
    const servidor = servidorFalso(rotasPadrao({ 'GET /auth/me': { corpo: { ...SUPORTE, perfil } } }))
    montarTela(<AparelhosPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/acesso-negado?de=/aparelhos'))
    expect(servidor.pedidos.map((p) => p.caminho)).toEqual(['/auth/me'])
  })

  it('mostra como configurar o aparelho e o cartao de cada um', async () => {
    const outro = { ...APARELHO, id: 6, nome: 'Panorâmico', unidade: '', liberado: false, total_recebidas: 0, ultimo_recebimento_em: '2026-11-13T10:00:00Z' }
    servidorFalso(rotasPadrao({
      'GET /aparelhos': { corpo: { aparelhos: [APARELHO, outro], configuracao: { aet: 'RADIX', porta: 4242, endereco: '' }, pode_gerir: true } },
    }))
    montarTela(<AparelhosPage />)
    const config = (await screen.findByRole('heading', { name: 'Como configurar o aparelho' })).closest('section') as HTMLElement
    expect(within(config).getByText('RADIX')).toBeTruthy()
    expect(within(config).getByText('4242')).toBeTruthy()
    expect(within(config).getByText('IP deste computador (no Windows: ipconfig)')).toBeTruthy() // endereco nao informado
    const sala2 = cartao('Raio-X Sala 2')
    expect(within(sala2).getByText('Liberado')).toBeTruthy()
    expect(within(sala2).getByText('Clínica escola')).toBeTruthy()
    expect(within(sala2).getByText('10.0.0.20:104')).toBeTruthy()
    expect(within(sala2).getByText('nenhuma ainda')).toBeTruthy()
    const pano = cartao('Panorâmico')
    expect(within(pano).getByText('Bloqueado')).toBeTruthy()
    expect(within(pano).queryByRole('button', { name: 'Testar conexão' })).toBeNull() // bloqueado nao testa
    expect(within(pano).getByText(new Date('2026-11-13T10:00:00Z').toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }))).toBeTruthy()
  })

  it('suporte (sem permissao de gerir): ve e testa, mas nao cadastra, altera nem bloqueia', async () => {
    servidorFalso(rotasPadrao({ 'GET /aparelhos': { corpo: { aparelhos: [APARELHO], configuracao: { aet: 'RADIX', porta: 4242, endereco: '10.0.0.1' }, pode_gerir: false } } }))
    montarTela(<AparelhosPage />)
    expect(await screen.findByRole('button', { name: 'Testar conexão' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Cadastrar aparelho' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Alterar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Bloquear' })).toBeNull()
  })

  it.each([
    [true, 'Nenhum aparelho cadastrado ainda. Enquanto a lista estiver vazia, o Radix não recebe imagens pela rede.'],
    [false, 'Nenhum aparelho cadastrado ainda. Só o administrador cadastra aparelhos.'],
  ])('lista vazia (pode gerir: %s): mensagem certa', async (pode, mensagem) => {
    servidorFalso(rotasPadrao({ 'GET /auth/me': { corpo: ADMIN }, 'GET /aparelhos': { corpo: { aparelhos: [], configuracao: null, pode_gerir: pode } } }))
    montarTela(<AparelhosPage />)
    expect(await screen.findByText(mensagem)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Como configurar o aparelho' })).toBeNull()
  })

  it.each([
    ['erro do servidor', { status: 500 } as Rota],
    ['sem conexao', 'SEM_CONEXAO' as Rota],
  ])('%s ao carregar: avisa', async (_n, rota) => {
    servidorFalso(rotasPadrao({ 'GET /aparelhos': rota }))
    montarTela(<AparelhosPage />)
    expect((await screen.findByRole('alert')).textContent).toBe('Não foi possível carregar a lista de aparelhos.')
  })
})

describe('Fase 3c: cadastrar e alterar', () => {
  type Usuario = ReturnType<typeof userEvent.setup>
  async function abrirNovo(usuario: Usuario, extra: Record<string, Rota> = {}) {
    const servidor = servidorFalso(rotasPadrao(extra))
    montarTela(<AparelhosPage />)
    await usuario.click(await screen.findByRole('button', { name: 'Cadastrar aparelho' }))
    return servidor
  }
  async function preencher(usuario: Usuario) {
    await usuario.type(screen.getByLabelText('Nome do aparelho'), 'Periapical sala 1')
    await usuario.type(screen.getByLabelText('Local ou unidade (opcional)'), 'Clínica Teste')
    await usuario.type(screen.getByLabelText('Nome DICOM do aparelho (AE Title)'), 'rx-sala1')
    await usuario.type(screen.getByLabelText('Endereço IP do aparelho'), ' 10.0.0.30 ')
    const porta = screen.getByLabelText('Porta DICOM do aparelho')
    await usuario.clear(porta)
    await usuario.type(porta, '1a04x')
  }

  it('novo: AE Title em maiusculas, IP sem espacos, porta so numeros; avisa, mostra o alerta do servidor e recarrega', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrirNovo(usuario, { 'POST /aparelhos': { status: 201, corpo: { aviso: 'Este IP já é usado por outro aparelho.' } } })
    expect(screen.getByRole('heading', { name: 'Cadastrar aparelho' })).toBeTruthy()
    expect((screen.getByLabelText('Porta DICOM do aparelho') as HTMLInputElement).value).toBe('104') // padrao
    await preencher(usuario)
    expect((screen.getByLabelText('Nome DICOM do aparelho (AE Title)') as HTMLInputElement).value).toBe('RX-SALA1')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect((await screen.findByRole('status')).textContent).toBe('Aparelho salvo.')
    expect(screen.getByRole('alert').textContent).toBe('Este IP já é usado por outro aparelho.')
    expect(servidor.alteracoes()).toEqual([
      { metodo: 'POST', caminho: '/aparelhos', corpo: { nome: 'Periapical sala 1', unidade: 'Clínica Teste', aet: 'RX-SALA1', ip: '10.0.0.30', porta: 104 } },
    ])
    expect(screen.queryByLabelText('Nome do aparelho')).toBeNull()
    await waitFor(() => expect(servidor.pedidos.filter((p) => p.caminho === '/aparelhos' && p.metodo === 'GET')).toHaveLength(2))
  })

  it('alterar: o formulario vem preenchido e salva com PUT no aparelho certo', async () => {
    const usuario = userEvent.setup()
    const servidor = servidorFalso(rotasPadrao({ 'PUT /aparelhos/5': { corpo: {} } }))
    montarTela(<AparelhosPage />)
    await usuario.click(await screen.findByRole('button', { name: 'Alterar' }))
    expect(screen.getByRole('heading', { name: 'Alterar aparelho' })).toBeTruthy()
    expect((screen.getByLabelText('Endereço IP do aparelho') as HTMLInputElement).value).toBe('10.0.0.20')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(servidor.alteracoes()).toEqual([
        { metodo: 'PUT', caminho: '/aparelhos/5', corpo: { nome: 'Raio-X Sala 2', unidade: 'Clínica escola', aet: 'RXSALA2', ip: '10.0.0.20', porta: 104 } },
      ])
    )
  })

  it('"Cancelar" fecha sem salvar', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrirNovo(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByLabelText('Nome do aparelho')).toBeNull()
    expect(servidor.alteracoes()).toEqual([])
  })

  it.each([
    ['motivo do servidor', { status: 409, corpo: { detail: 'Já existe um aparelho com esse nome DICOM.' } } as Rota, 'Já existe um aparelho com esse nome DICOM.'],
    ['validacao (422), sem o prefixo tecnico', { status: 422, corpo: { detail: [{ msg: 'Value error, IP inválido.' }] } } as Rota, 'IP inválido.'],
    ['sem motivo', { status: 500, corpo: 'x' } as Rota, 'Não foi possível salvar o aparelho.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Sem conexão com o servidor. Tente de novo.'],
  ])('falha ao salvar (%s): avisa dentro do formulario, que continua aberto', async (_n, rota, mensagem) => {
    const usuario = userEvent.setup()
    await abrirNovo(usuario, { 'POST /aparelhos': rota })
    await preencher(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    const formulario = screen.getByLabelText('Nome do aparelho').closest('form') as HTMLElement
    expect((await within(formulario).findByRole('alert')).textContent).toBe(mensagem)
  })

  // DEFEITO achado na Fase 3c (14/11/2026): "Salvar" nao travava durante o
  // envio. Dois cliques rapidos mandavam dois cadastros iguais.
  it('durante o envio, "Salvar" fica travado (sem cadastro duplicado)', async () => {
    const usuario = userEvent.setup()
    let liberar: () => void = () => {}
    const espera = new Promise<void>((r) => (liberar = r))
    const servidor = await abrirNovo(usuario, { 'POST /aparelhos': { status: 201, corpo: {} } })
    await preencher(usuario)
    const fetchBase = globalThis.fetch
    vi.stubGlobal('fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') await espera
      return fetchBase(url, init)
    })
    const salvar = screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement
    await usuario.click(salvar)
    await usuario.click(salvar)
    expect(salvar.disabled).toBe(true)
    await act(async () => liberar())
    await screen.findByRole('status')
    expect(servidor.alteracoes()).toHaveLength(1)
  })
})

describe('Fase 3c: bloquear, liberar e testar', () => {
  it('bloquear pede confirmacao; "Cancelar" nao bloqueia; "Sim, bloquear" bloqueia e avisa', async () => {
    const usuario = userEvent.setup()
    const servidor = servidorFalso(rotasPadrao({ 'POST /aparelhos/5/bloquear': { corpo: {} } }))
    montarTela(<AparelhosPage />)
    await usuario.click(await screen.findByRole('button', { name: 'Bloquear' }))
    const pergunta = screen.getByRole('alertdialog')
    expect(pergunta.textContent).toContain('Bloquear Raio-X Sala 2?')
    await usuario.click(within(pergunta).getByText('Cancelar', { selector: 'button[data-acao="cancelar"]' }))
    expect(servidor.alteracoes()).toEqual([])
    await usuario.click(screen.getByRole('button', { name: 'Bloquear' }))
    await usuario.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Sim, bloquear' }))
    expect((await screen.findByRole('status')).textContent).toBe('Raio-X Sala 2 foi bloqueado.')
    expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: '/aparelhos/5/bloquear', corpo: undefined }])
  })

  it('liberar um bloqueado: sem confirmacao', async () => {
    const usuario = userEvent.setup()
    const servidor = servidorFalso(rotasPadrao({
      'GET /aparelhos': { corpo: { aparelhos: [{ ...APARELHO, liberado: false }], configuracao: null, pode_gerir: true } },
      'POST /aparelhos/5/liberar': { corpo: {} },
    }))
    montarTela(<AparelhosPage />)
    await usuario.click(await screen.findByRole('button', { name: 'Liberar' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect((await screen.findByRole('status')).textContent).toBe('Raio-X Sala 2 foi liberado.')
    expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: '/aparelhos/5/liberar', corpo: undefined }])
  })

  it.each([
    ['motivo do servidor', { status: 403, corpo: { detail: 'Só o administrador libera aparelhos.' } } as Rota, 'Só o administrador libera aparelhos.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Sem conexão com o servidor. Tente de novo.'],
  ])('falha ao liberar (%s): avisa', async (_n, rota, mensagem) => {
    const usuario = userEvent.setup()
    servidorFalso(rotasPadrao({
      'GET /aparelhos': { corpo: { aparelhos: [{ ...APARELHO, liberado: false }], configuracao: null, pode_gerir: true } },
      'POST /aparelhos/5/liberar': rota,
    }))
    montarTela(<AparelhosPage />)
    await usuario.click(await screen.findByRole('button', { name: 'Liberar' }))
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
  })

  it.each([
    ['aparelho nao respondeu', { corpo: { orthanc_no_ar: true, respondeu: false } } as Rota, 'Raio-X Sala 2 não respondeu. Confira se o aparelho está ligado, o IP e a porta.'],
    ['servidor de imagens fora', { corpo: { orthanc_no_ar: false, respondeu: false } } as Rota, 'O servidor de imagens (Orthanc) não respondeu. Tente de novo em instantes.'],
    ['erro do servidor', { status: 500 } as Rota, 'Não foi possível testar a conexão.'],
  ])('testar conexao (%s): avisa', async (_n, rota, mensagem) => {
    const usuario = userEvent.setup()
    servidorFalso(rotasPadrao({ 'POST /aparelhos/5/testar': rota }))
    montarTela(<AparelhosPage />)
    await usuario.click(await screen.findByRole('button', { name: 'Testar conexão' }))
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
  })
})
