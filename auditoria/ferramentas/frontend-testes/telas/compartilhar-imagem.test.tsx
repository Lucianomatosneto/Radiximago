// @vitest-environment jsdom
//
// COMPONENTE "Compartilhar" no "i" do visualizador (Fase 3b):
// frontend/src/components/compartilhar/CompartilharImagem.tsx.
// Compartilhar a imagem com outro usuario pelo e-mail (com recado
// opcional), convite de cadastro com link copiavel, lista de com quem ja
// foi compartilhada e "desfazer". Erros: e-mail invalido, recusa com
// motivo, muitos seguidos (429), sem conexao. E-mails inventados.
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CompartilharImagem from '../../../../frontend/src/components/compartilhar/CompartilharImagem'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const ENVIADAS = 'GET /shares/enviadas?curation_id=7'
const JA = [{ id: 31, destinatario_nome: 'Colega Teste', destinatario_email: 'colega@exemplo.test' }]
function abrir(extra: Record<string, Rota> = {}, onAbrir = vi.fn()) {
  const servidor = servidorFalso({ [ENVIADAS]: { corpo: { itens: JA } }, ...extra })
  const tela = montarTela(<CompartilharImagem curationId={7} onAbrir={onAbrir} />)
  return { servidor, onAbrir, tela }
}
const emailCampo = () => screen.getByRole('textbox', { name: 'E-mail do cadastro da pessoa' })
async function abrirCaixa(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.click(screen.getByRole('button', { name: 'Compartilhar esta imagem e suas anotações com outro usuário' }))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('com quem ja foi compartilhada', () => {
  it('lista quem recebeu; "desfazer" tira da lista', async () => {
    const usuario = userEvent.setup()
    const { servidor } = abrir({ 'DELETE /shares/enviadas/31': { status: 204 } })
    expect(await screen.findByText('Compartilhada com:')).toBeTruthy()
    expect(screen.getByText('Colega Teste')).toBeTruthy()
    await usuario.click(screen.getByRole('button', { name: 'Desfazer este compartilhamento' }))
    await waitFor(() => expect(screen.queryByText('Colega Teste')).toBeNull())
    expect(servidor.alteracoes()).toEqual([{ metodo: 'DELETE', caminho: '/shares/enviadas/31', corpo: undefined }])
  })

  it.each([
    ['erro do servidor', { status: 500 } as Rota],
    ['sem conexao', 'SEM_CONEXAO' as Rota],
  ])('desfazer com %s: avisa e mantem', async (_n, rota) => {
    const usuario = userEvent.setup()
    abrir({ 'DELETE /shares/enviadas/31': rota })
    await usuario.click(await screen.findByRole('button', { name: 'Desfazer este compartilhamento' }))
    expect(await screen.findByText('Não foi possível desfazer o compartilhamento.')).toBeTruthy()
    expect(screen.getByText('Colega Teste')).toBeTruthy()
  })

  it.each([
    ['erro do servidor', { status: 500 } as Rota],
    ['sem conexao', 'SEM_CONEXAO' as Rota],
  ])('lista que falha (%s) fica vazia', async (_n, rota) => {
    const { servidor } = abrir({ [ENVIADAS]: rota })
    await waitFor(() => expect(servidor.pedidos).toHaveLength(1))
    expect(screen.queryByText('Compartilhada com:')).toBeNull()
  })
})

describe('compartilhar', () => {
  it('abrir avisa quem usa; e-mail invalido nao vai ao servidor', async () => {
    const usuario = userEvent.setup()
    const { servidor, onAbrir } = abrir()
    await abrirCaixa(usuario)
    expect(onAbrir).toHaveBeenCalled()
    for (const errado of ['sem-arroba', 'a@b', 'a b@c.d', `${'x'.repeat(250)}@a.br`]) {
      fireEvent.change(emailCampo(), { target: { value: errado } })
      await usuario.click(screen.getByRole('button', { name: 'Compartilhar' }))
      expect(screen.getByText('Digite um e-mail válido.')).toBeTruthy()
    }
    expect(servidor.alteracoes()).toEqual([])
  })

  it('manda e-mail e recado; mostra a resposta, o convite de cadastro e atualiza a lista', async () => {
    const usuario = userEvent.setup()
    const { servidor } = abrir({
      'POST /shares/7': { status: 201, corpo: { mensagem: 'Compartilhado com Nova Pessoa.', aviso_cadastro: 'Convide pelo link:', link_cadastro: 'https://radix.teste/solicitar-acesso?c=1' } },
    })
    await abrirCaixa(usuario)
    await usuario.type(emailCampo(), '  nova@exemplo.test ')
    await usuario.type(screen.getByRole('textbox', { name: 'Anotação para quem vai receber (opcional)' }), '  veja o 36  ')
    await usuario.click(screen.getByRole('button', { name: 'Compartilhar' }))
    expect(await screen.findByText('Compartilhado com Nova Pessoa.')).toBeTruthy()
    expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: '/shares/7', corpo: { email: 'nova@exemplo.test', mensagem: 'veja o 36' } }])
    expect(screen.getByText('Convide pelo link:')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'https://radix.teste/solicitar-acesso?c=1' })).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull() // caixa fecha
    expect(servidor.pedidos.filter((p) => p.caminho.startsWith('/shares/enviadas'))).toHaveLength(2)
  })

  it('sem recado vai null; sem dados do servidor usa os textos padrao e o link desta pagina; "Copiar link"', async () => {
    const usuario = userEvent.setup()
    const escrever = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: escrever }, configurable: true })
    const { servidor } = abrir({ 'POST /shares/7': { status: 201, corpo: {} } })
    await abrirCaixa(usuario)
    await usuario.type(emailCampo(), 'nova@exemplo.test{Enter}') // Enter tambem envia
    expect(await screen.findByText('Compartilhado.')).toBeTruthy()
    expect(servidor.alteracoes()[0].corpo).toEqual({ email: 'nova@exemplo.test', mensagem: null })
    const link = `${window.location.origin}/solicitar-acesso`
    expect(screen.getByRole('link', { name: link })).toBeTruthy()
    expect(screen.getByText(/Se a pessoa ainda não tem cadastro/)).toBeTruthy()
    await usuario.click(screen.getByRole('button', { name: 'Copiar link' }))
    expect(escrever).toHaveBeenCalledWith(link)
    expect(screen.getByRole('button', { name: 'Copiado ✓' })).toBeTruthy()
  })

  it('copiar sem permissao da area de transferencia: nada quebra', async () => {
    const usuario = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => Promise.reject(new Error('negado'))) }, configurable: true })
    abrir({ 'POST /shares/7': { status: 201, corpo: {} } })
    await abrirCaixa(usuario)
    await usuario.type(emailCampo(), 'nova@exemplo.test{Enter}')
    await usuario.click(await screen.findByRole('button', { name: 'Copiar link' }))
    expect(screen.getByRole('button', { name: 'Copiar link' })).toBeTruthy()
  })

  it.each([
    ['recusa com motivo', { status: 404, corpo: { detail: 'Nenhum usuário com esse e-mail.' } } as Rota, 'Nenhum usuário com esse e-mail.'],
    ['recusa sem motivo', { status: 500, corpo: { x: 1 } } as Rota, 'Não foi possível compartilhar a imagem.'],
    ['muitos seguidos', { status: 429, corpo: { detail: 'limite' } } as Rota, 'Muitos compartilhamentos seguidos. Aguarde um minuto e tente de novo.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Não foi possível compartilhar a imagem.'],
  ])('%s: avisa e mantem o e-mail digitado', async (_n, rota, mensagem) => {
    const usuario = userEvent.setup()
    abrir({ 'POST /shares/7': rota })
    await abrirCaixa(usuario)
    await usuario.type(emailCampo(), 'nova@exemplo.test')
    await usuario.click(screen.getByRole('button', { name: 'Compartilhar' }))
    expect(await screen.findByText(mensagem)).toBeTruthy()
    expect((emailCampo() as HTMLInputElement).value).toBe('nova@exemplo.test')
  })

  it('erro que nao e JSON: mensagem padrao', async () => {
    const usuario = userEvent.setup()
    abrir()
    const original = globalThis.fetch
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) =>
      init?.method === 'POST' ? new Response('pane', { status: 502 }) : original(url, init)
    )
    await abrirCaixa(usuario)
    await usuario.type(emailCampo(), 'nova@exemplo.test')
    await usuario.click(screen.getByRole('button', { name: 'Compartilhar' }))
    expect(await screen.findByText('Não foi possível compartilhar a imagem.')).toBeTruthy()
  })

  it('"Cancelar" e Esc fecham sem enviar', async () => {
    const usuario = userEvent.setup()
    const { servidor } = abrir()
    await abrirCaixa(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('textbox')).toBeNull()
    await abrirCaixa(usuario)
    fireEvent.keyDown(emailCampo(), { key: 'Escape' })
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(servidor.alteracoes()).toEqual([])
  })
})
