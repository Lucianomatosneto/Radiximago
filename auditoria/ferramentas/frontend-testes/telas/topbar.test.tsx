// @vitest-environment jsdom
//
// BARRA DO TOPO (Fase 3c): frontend/src/components/Topbar.tsx, com a trilha de
// navegacao (TrilhaNavegacao) e a Central de ajuda (CentralAjuda) de verdade.
// Confere: nome e perfil de quem entrou (ou "Visitante"), menu do usuario
// (abre, fecha com Esc e clicando fora), sair (mesmo sem conexao), "Meu
// perfil" com a foto (formato, tamanho, enviar, remover, erros, 401), a
// trilha "Inicio > ..." e a ajuda filtrada pelo perfil. Dados inventados.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Topbar from '../../../../frontend/src/components/Topbar'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const nav = vi.hoisted(() => ({ caminho: '/minhas-imagens', roteador: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() } }))
vi.mock('next/navigation', () => ({ useRouter: () => nav.roteador, usePathname: () => nav.caminho }))

const sessao = (perfil: string, extra: object = {}) => ({ id: 1, nome: 'Ana Maria Teste', email: 'ana@exemplo.test', perfil, foto_perfil_url: null, ...extra })
function abrir(perfil = 'estudante', extra: Record<string, Rota> = {}, dadosSessao: object = {}) {
  const servidor = servidorFalso({ 'GET /auth/me': { corpo: sessao(perfil, dadosSessao) }, ...extra })
  montarTela(<Topbar />)
  return servidor
}
const botaoUsuario = () => screen.getByRole('button', { name: /Ana Maria Teste|Visitante/ })
async function abrirMeuPerfil(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.click(await screen.findByRole('button', { name: /Ana Maria Teste/ }))
  await usuario.click(screen.getByRole('menuitem', { name: 'Meu perfil' }))
  return janelaPerfil() as HTMLElement
}
// a janela "Meu perfil" achada pelo titulo (o papel de janela tem teste proprio abaixo)
const janelaPerfil = () => screen.queryByRole('heading', { name: 'Meu perfil' })?.parentElement ?? null
const campoFoto = () => screen.getByLabelText('Foto (JPEG, PNG ou WEBP, até 5 MB)') as HTMLInputElement
const foto = (tipo = 'image/png', bytes = 10) => new File([new Uint8Array(bytes)], 'eu.png', { type: tipo })

beforeEach(() => {
  nav.caminho = '/minhas-imagens'
  vi.clearAllMocks()
  URL.createObjectURL = vi.fn(() => 'blob:previa')
})
afterEach(() => cleanup())

describe('quem esta logado', () => {
  it.each([
    ['curador', 'Curador', '/banco-imagens'],
    ['administrador', 'Administrador', '/dashboard'],
  ])('%s: mostra nome e perfil; o logo leva a pagina inicial do perfil', async (perfil, rotulo, inicio) => {
    abrir(perfil)
    expect(await screen.findByText('Ana Maria Teste')).toBeTruthy()
    expect(within(botaoUsuario()).getByText(rotulo)).toBeTruthy()
    expect(screen.getByText('AT')).toBeTruthy() // iniciais (no celular, no lugar do icone)
    expect(screen.getByRole('link', { name: 'Rádix Imago — ir para a página inicial' }).getAttribute('href')).toBe(inicio)
  })

  it.each([
    ['sem sessao', { status: 401 } as Rota],
    ['sem conexao', 'SEM_CONEXAO' as Rota],
  ])('%s: "Visitante", sem perfil e sem trilha', async (_n, rota) => {
    const servidor = servidorFalso({ 'GET /auth/me': rota })
    montarTela(<Topbar />)
    await waitFor(() => expect(servidor.pedidos).toHaveLength(1))
    expect(within(botaoUsuario()).getByText('Visitante')).toBeTruthy()
    expect(within(botaoUsuario()).getByText('—')).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: /trilha/i })).toBeNull()
  })

  it('com foto de perfil, mostra a foto (do servidor) no lugar das iniciais', async () => {
    abrir('estudante', {}, { foto_perfil_url: '/static/fotos/1.png' })
    await screen.findByText('Ana Maria Teste')
    expect(botaoUsuario().querySelector('img')?.getAttribute('src')).toBe('http://api.teste/static/fotos/1.png')
    expect(screen.queryByText('AT')).toBeNull()
  })
})

describe('menu do usuario', () => {
  it('abre e fecha (Esc e clique fora)', async () => {
    const usuario = userEvent.setup()
    abrir()
    await usuario.click(await screen.findByRole('button', { name: /Ana Maria Teste/ }))
    expect(botaoUsuario().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('menu').textContent).toContain('Sair')
    await usuario.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    await usuario.click(botaoUsuario())
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it.each([
    ['servidor responde', { status: 204 } as Rota],
    ['sem conexao', 'SEM_CONEXAO' as Rota],
  ])('"Sair" (%s): avisa o servidor e recarrega a pagina no login', async (_n, rota) => {
    const usuario = userEvent.setup()
    const recarregar = vi.fn()
    const original = window.location
    // jsdom nao navega: troca so o "replace" para conferir o destino
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, replace: recarregar } })
    try {
      const servidor = abrir('estudante', { 'POST /auth/logout': rota })
      await usuario.click(await screen.findByRole('button', { name: /Ana Maria Teste/ }))
      await usuario.click(screen.getByRole('menuitem', { name: 'Sair' }))
      await waitFor(() => expect(recarregar).toHaveBeenCalledWith('/login'))
      expect(servidor.pedidos.map((p) => `${p.metodo} ${p.caminho}`)).toContain('POST /auth/logout')
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original })
    }
  })
})

describe('"Meu perfil": foto', () => {
  // DEFEITO achado na Fase 3c (14/11/2026): a janela "Meu perfil" era so uma
  // caixa desenhada (div). Leitor de tela nao sabia que abriu uma janela nem
  // o nome dela, e o resto da pagina continuava "navegavel" por tras.
  it('e uma janela de verdade para o leitor de tela (dialog, modal, com nome)', async () => {
    const usuario = userEvent.setup()
    abrir()
    await abrirMeuPerfil(usuario)
    const janela = screen.getByRole('dialog', { name: 'Meu perfil' })
    expect(janela.getAttribute('aria-modal')).toBe('true')
  })

  it('janela com os atalhos (meus acessos, termos); "Salvar foto" so com arquivo escolhido', async () => {
    const usuario = userEvent.setup()
    abrir()
    const janela = await abrirMeuPerfil(usuario)
    expect(within(janela).getByRole('link', { name: 'Meus acessos (aparelhos conectados)' }).getAttribute('href')).toBe('/meus-acessos')
    expect(within(janela).getByRole('link', { name: 'Termos de uso e privacidade' }).getAttribute('href')).toBe('/termos')
    expect((within(janela).getByRole('button', { name: 'Salvar foto' }) as HTMLButtonElement).disabled).toBe(true)
    expect(within(janela).queryByRole('button', { name: 'Remover foto atual' })).toBeNull()
    await usuario.click(within(janela).getByRole('button', { name: 'Fechar' }))
    expect(janelaPerfil()).toBeNull()
  })

  it.each([
    ['formato errado', foto('image/gif'), 'Formato não suportado. Envie um JPEG, PNG ou WEBP.'],
    ['maior que 5 MB', foto('image/png', 5 * 1024 * 1024 + 1), 'A imagem deve ter no máximo 5 MB.'],
  ])('%s: avisa e nao deixa enviar', async (_n, arquivo, mensagem) => {
    const usuario = userEvent.setup()
    const servidor = abrir()
    await abrirMeuPerfil(usuario)
    fireEvent.change(campoFoto(), { target: { files: [arquivo] } })
    expect(screen.getByRole('alert').textContent).toBe(mensagem)
    expect((screen.getByRole('button', { name: 'Salvar foto' }) as HTMLButtonElement).disabled).toBe(true)
    expect(servidor.alteracoes()).toEqual([])
  })

  it('envia a foto: mostra a previa, manda o arquivo, fecha e troca a foto do topo', async () => {
    const usuario = userEvent.setup()
    const servidor = abrir('estudante', { 'POST /users/me/avatar': { corpo: { foto_perfil_url: '/static/fotos/novo.png' } } })
    const janela = await abrirMeuPerfil(usuario)
    fireEvent.change(campoFoto(), { target: { files: [foto()] } })
    expect(janela.querySelector('img')?.getAttribute('src')).toBe('blob:previa')
    await usuario.click(screen.getByRole('button', { name: 'Salvar foto' }))
    await waitFor(() => expect(janelaPerfil()).toBeNull())
    expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: '/users/me/avatar', corpo: { arquivo: 'arquivo:eu.png:image/png' } }])
    expect(botaoUsuario().querySelector('img')?.getAttribute('src')).toBe('http://api.teste/static/fotos/novo.png')
  })

  it('durante o envio: "Enviando...", botoes travados (sem clique duplo) e a janela nao fecha', async () => {
    const usuario = userEvent.setup()
    let liberar: () => void = () => {}
    const espera = new Promise<void>((r) => (liberar = r))
    const servidor = servidorFalso({ 'GET /auth/me': { corpo: sessao('estudante') } })
    const fetchBase = globalThis.fetch
    vi.stubGlobal('fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).endsWith('/users/me/avatar')) await espera
      return fetchBase(url, init)
    })
    montarTela(<Topbar />)
    await abrirMeuPerfil(usuario)
    fireEvent.change(campoFoto(), { target: { files: [foto()] } })
    await usuario.click(screen.getByRole('button', { name: 'Salvar foto' }))
    const enviando = screen.getByRole('button', { name: 'Enviando...' }) as HTMLButtonElement
    expect(enviando.disabled).toBe(true)
    expect((screen.getAllByRole('button', { name: 'Fechar' }).find((b) => b.textContent === 'Fechar') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getAllByRole('button', { name: 'Fechar' })[1]) // o fundo escuro
    expect(janelaPerfil()).toBeTruthy()
    liberar()
    await waitFor(() => expect(servidor.pedidos.filter((p) => p.caminho === '/users/me/avatar')).toHaveLength(1))
  })

  it.each([
    ['motivo do servidor', { status: 413, corpo: { detail: 'Arquivo grande demais.' } } as Rota, 'Arquivo grande demais.'],
    ['sem motivo', { status: 500, corpo: 'x' } as Rota, 'Não foi possível enviar a foto.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Não foi possível enviar a foto. Tente novamente.'],
  ])('falha ao enviar (%s): avisa e a janela continua', async (_n, rota, mensagem) => {
    const usuario = userEvent.setup()
    abrir('estudante', { 'POST /users/me/avatar': rota })
    await abrirMeuPerfil(usuario)
    fireEvent.change(campoFoto(), { target: { files: [foto()] } })
    await usuario.click(screen.getByRole('button', { name: 'Salvar foto' }))
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
    expect(janelaPerfil()).toBeTruthy()
  })

  it.each([
    ['enviar', 'POST'],
    ['remover', 'DELETE'],
  ])('sessao vencida ao %s a foto: vai ao login', async (_n, metodo) => {
    const usuario = userEvent.setup()
    abrir('estudante', { [`${metodo} /users/me/avatar`]: { status: 401 } }, { foto_perfil_url: '/static/fotos/1.png' })
    await abrirMeuPerfil(usuario)
    if (metodo === 'POST') {
      fireEvent.change(campoFoto(), { target: { files: [foto()] } })
      await usuario.click(screen.getByRole('button', { name: 'Salvar foto' }))
    } else {
      await usuario.click(screen.getByRole('button', { name: 'Remover foto atual' }))
    }
    await waitFor(() => expect(nav.roteador.push).toHaveBeenCalledWith('/login'))
  })

  it('remover a foto atual: pede ao servidor e volta as iniciais', async () => {
    const usuario = userEvent.setup()
    const servidor = abrir('estudante', { 'DELETE /users/me/avatar': { status: 204 } }, { foto_perfil_url: '/static/fotos/1.png' })
    const janela = await abrirMeuPerfil(usuario)
    expect(janela.querySelector('img')?.getAttribute('src')).toBe('http://api.teste/static/fotos/1.png')
    await usuario.click(screen.getByRole('button', { name: 'Remover foto atual' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remover foto atual' })).toBeNull())
    expect(servidor.alteracoes()).toEqual([{ metodo: 'DELETE', caminho: '/users/me/avatar', corpo: undefined }])
    expect(screen.getByText('AT')).toBeTruthy()
  })

  it.each([
    ['motivo do servidor', { status: 409, corpo: { detail: 'Foto em uso.' } } as Rota, 'Foto em uso.'],
    ['sem motivo', { status: 500 } as Rota, 'Não foi possível remover a foto.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Não foi possível remover a foto. Tente novamente.'],
  ])('falha ao remover (%s): avisa e a foto continua', async (_n, rota, mensagem) => {
    const usuario = userEvent.setup()
    abrir('estudante', { 'DELETE /users/me/avatar': rota }, { foto_perfil_url: '/static/fotos/1.png' })
    await abrirMeuPerfil(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Remover foto atual' }))
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
    expect(screen.getByRole('button', { name: 'Remover foto atual' })).toBeTruthy()
  })
})

describe('trilha de navegacao', () => {
  it.each([
    ['/minhas-imagens', 'estudante', ['Início', 'Minhas imagens']],
    ['/visualizar/12', 'estudante', ['Início', 'Banco de imagens', 'Nº 12']], // "visualizar" volta ao banco
  ])('%s: mostra o caminho e marca a tela atual', async (caminho, perfil, esperado) => {
    nav.caminho = caminho
    abrir(perfil)
    const trilha = await screen.findByRole('navigation')
    expect(within(trilha).getAllByRole('listitem').map((l) => l.textContent?.trim())).toEqual(esperado)
    expect(within(trilha).getByText(esperado.at(-1) as string).getAttribute('aria-current')).toBe('page')
  })

  it.each([
    ['/curadoria', 'curador'], // tela sem trilha (a curadoria tem a propria navegacao)
    ['/banco-imagens', 'curador'], // ja e a pagina inicial
    ['/rota-desconhecida', 'curador'],
  ])('%s: sem trilha', async (caminho, perfil) => {
    nav.caminho = caminho
    abrir(perfil)
    await screen.findByText('Ana Maria Teste')
    expect(screen.queryByRole('navigation')).toBeNull()
  })
})

describe('central de ajuda', () => {
  async function abrirAjuda(usuario: ReturnType<typeof userEvent.setup>, perfil: string) {
    abrir(perfil)
    await screen.findByText('Ana Maria Teste')
    await usuario.click(screen.getByRole('button', { name: 'Ajuda' }))
    return screen.getByRole('dialog', { name: 'Central de ajuda' })
  }

  it('abre com "Nesta tela" primeiro; o estudante nao ve ajuda de curadoria; o curador ve', async () => {
    const usuario = userEvent.setup()
    let ajuda = await abrirAjuda(usuario, 'estudante')
    expect(screen.getByRole('button', { name: 'Ajuda' }).getAttribute('aria-expanded')).toBe('true')
    expect(within(ajuda).getAllByRole('heading', { level: 3 })[0].textContent).toBe('Nesta tela')
    expect(within(ajuda).queryByText('Fazer a curadoria de uma imagem')).toBeNull()
    cleanup()
    ajuda = await abrirAjuda(usuario, 'curador')
    expect(within(ajuda).getByText('Fazer a curadoria de uma imagem')).toBeTruthy()
  })

  it('busca: abre o melhor resultado com os passos; sem resultado avisa; Esc limpa e depois fecha', async () => {
    const usuario = userEvent.setup()
    const ajuda = await abrirAjuda(usuario, 'estudante')
    const busca = within(ajuda).getByRole('searchbox', { name: 'O que você quer fazer? Ex.: apagar anotação' })
    await waitFor(() => expect(document.activeElement).toBe(busca))
    await usuario.type(busca, 'sair do sistema')
    expect(within(ajuda).getByText(/resultado/).textContent).toMatch(/^\d+ resultados?$/)
    const primeiro = within(ajuda).getAllByRole('button', { expanded: true })[0]
    expect(primeiro.textContent).toContain('Sair do sistema')
    expect(within(ajuda).getAllByRole('list').some((l) => l.tagName === 'OL')).toBe(true)
    await usuario.click(primeiro)
    expect(within(ajuda).queryAllByRole('button', { expanded: true })).toHaveLength(0)
    await usuario.clear(busca)
    await usuario.type(busca, 'xyzwq')
    expect(within(ajuda).getByText('Não encontramos ajuda para isso.')).toBeTruthy()
    await usuario.keyboard('{Escape}')
    expect((busca as HTMLInputElement).value).toBe('')
    await usuario.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Central de ajuda' })).toBeNull()
  })

  it('"Ir para a tela" leva a tela do topico e fecha a ajuda', async () => {
    const usuario = userEvent.setup()
    const ajuda = await abrirAjuda(usuario, 'estudante')
    await usuario.type(within(ajuda).getByRole('searchbox'), 'banco de imagens')
    const link = within(ajuda).getAllByRole('link', { name: 'Ir para a tela →' })[0]
    expect(link.getAttribute('href')).toMatch(/^\//)
    await usuario.click(link)
    expect(screen.queryByRole('dialog', { name: 'Central de ajuda' })).toBeNull()
  })

  it('clicar no fundo escuro fecha', async () => {
    const usuario = userEvent.setup()
    await abrirAjuda(usuario, 'estudante')
    await usuario.click(screen.getAllByRole('button', { name: 'Fechar a ajuda' })[0])
    expect(screen.queryByRole('dialog', { name: 'Central de ajuda' })).toBeNull()
  })
})
