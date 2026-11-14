// @vitest-environment jsdom
//
// "RESPONDER a quem compartilhou" (Fase 3c):
// frontend/src/components/compartilhar/ResponderCompartilhamento.tsx.
// A mesma imagem volta para quem enviou, com a resposta como recado.
// Tres jeitos de aparecer: botao com texto (janela), icone redondo (cartao)
// e icone pequeno (grade). Confere: abrir com o foco no campo, resposta
// vazia, o que vai ao servidor (sem espacos nas pontas), Ctrl+Enter envia,
// Esc e "Cancelar" fecham, botao travado durante o envio, aviso de enviado
// (que some sozinho) e os erros (429, outro erro, sem conexao) anunciados
// ao leitor de tela. Dados inventados.
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ResponderCompartilhamento from '../../../../frontend/src/components/compartilhar/ResponderCompartilhamento'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

type Jeito = 'texto' | 'icone' | 'compacto'
function abrirComponente(jeito: Jeito = 'texto', rota: Rota = { corpo: {} }) {
  const servidor = servidorFalso({ 'POST /shares/recebidas/42/responder': rota })
  montarTela(<ResponderCompartilhamento compartilhamentoId={42} remetenteNome="Prof. Teste" icone={jeito === 'icone'} compacto={jeito === 'compacto'} />)
  return servidor
}
const botaoAbrir = () => screen.getByRole('button', { name: 'Responder a Prof. Teste' })
const campo = () => screen.getByRole('textbox', { name: 'Escreva sua resposta...' })

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('abrir e fechar', () => {
  it.each<Jeito>(['texto', 'icone', 'compacto'])('%s: abre o formulario com o foco no campo', async (jeito) => {
    const usuario = userEvent.setup()
    abrirComponente(jeito)
    await usuario.click(botaoAbrir())
    expect(screen.getByRole('group', { name: 'Responder a Prof. Teste' })).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(campo()))
    expect(screen.getByText('Vai com a imagem e as suas anotações.')).toBeTruthy()
    expect((campo() as HTMLTextAreaElement).maxLength).toBe(500)
  })

  it.each<Jeito>(['icone', 'compacto'])('%s: o mesmo botao abre e fecha; aria-expanded acompanha', async (jeito) => {
    const usuario = userEvent.setup()
    abrirComponente(jeito)
    await usuario.click(botaoAbrir())
    expect(botaoAbrir().getAttribute('aria-expanded')).toBe('true')
    await usuario.click(botaoAbrir())
    expect(botaoAbrir().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('group')).toBeNull()
  })

  it('"Cancelar" e Esc fecham sem enviar; teclas digitadas nao vazam para os atalhos da tela', async () => {
    const usuario = userEvent.setup()
    const servidor = abrirComponente('texto')
    const atalhoDaTela = vi.fn()
    document.addEventListener('keydown', atalhoDaTela)
    try {
      await usuario.click(botaoAbrir())
      await usuario.type(campo(), 'abc')
      expect(atalhoDaTela).not.toHaveBeenCalled()
      await usuario.click(screen.getByRole('button', { name: 'Cancelar' }))
      expect(screen.queryByRole('group')).toBeNull()
      await usuario.click(botaoAbrir())
      await usuario.keyboard('{Escape}')
      expect(screen.queryByRole('group')).toBeNull()
      expect(servidor.pedidos).toEqual([])
    } finally {
      document.removeEventListener('keydown', atalhoDaTela)
    }
  })
})

describe('enviar', () => {
  it('resposta vazia (so espacos): avisa e nao envia', async () => {
    const usuario = userEvent.setup()
    const servidor = abrirComponente()
    await usuario.click(botaoAbrir())
    await usuario.type(campo(), '   ')
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(screen.getByText('Escreva a resposta antes de enviar.')).toBeTruthy()
    expect(servidor.pedidos).toEqual([])
  })

  it('envia a resposta sem espacos nas pontas; fecha e avisa "Resposta enviada" (que some depois)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const servidor = abrirComponente()
    await usuario.click(botaoAbrir())
    await usuario.type(campo(), '  Obrigado, vi a lesão.  ')
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(await screen.findByText('✓ Resposta enviada para Prof. Teste.')).toBeTruthy()
    expect(servidor.pedidos).toEqual([{ metodo: 'POST', caminho: '/shares/recebidas/42/responder', corpo: { mensagem: 'Obrigado, vi a lesão.' } }])
    expect(screen.queryByRole('group')).toBeNull()
    await act(async () => void vi.advanceTimersByTime(4100))
    expect(screen.queryByText(/Resposta enviada/)).toBeNull()
  })

  it.each<Jeito>(['icone', 'compacto'])('%s: depois de enviar, o botao mostra o "✓"', async (jeito) => {
    const usuario = userEvent.setup()
    abrirComponente(jeito)
    await usuario.click(botaoAbrir())
    await usuario.type(campo(), 'Ok')
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }))
    await waitFor(() => expect(botaoAbrir().textContent).toBe('✓'))
  })

  it('Ctrl+Enter envia', async () => {
    const usuario = userEvent.setup()
    const servidor = abrirComponente()
    await usuario.click(botaoAbrir())
    await usuario.type(campo(), 'Ok')
    fireEvent.keyDown(campo(), { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(servidor.pedidos).toHaveLength(1))
  })

  it('durante o envio: "Compartilhando..." e botao travado', async () => {
    const usuario = userEvent.setup()
    let liberar: () => void = () => {}
    const espera = new Promise<void>((r) => (liberar = r))
    const servidor = abrirComponente()
    const fetchBase = globalThis.fetch
    vi.stubGlobal('fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
      await espera
      return fetchBase(url, init)
    })
    await usuario.click(botaoAbrir())
    await usuario.type(campo(), 'Ok')
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }))
    const botao = screen.getByRole('button', { name: 'Compartilhando...' }) as HTMLButtonElement
    expect(botao.disabled).toBe(true)
    await usuario.click(botao)
    await act(async () => liberar())
    await waitFor(() => expect(screen.queryByRole('group')).toBeNull())
    expect(servidor.pedidos).toHaveLength(1)
  })

  // DEFEITO achado na Fase 3c (14/11/2026): o erro aparecia so como texto
  // vermelho; o leitor de tela nao anunciava (faltava role="alert").
  it.each([
    ['muitos seguidos (429)', { status: 429 } as Rota, 'Muitos compartilhamentos seguidos. Aguarde um minuto e tente de novo.'],
    ['outro erro', { status: 500 } as Rota, 'Não foi possível enviar a resposta.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Não foi possível enviar a resposta.'],
  ])('falha (%s): o erro e anunciado e o texto continua no campo', async (_n, rota, mensagem) => {
    const usuario = userEvent.setup()
    abrirComponente('texto', rota)
    await usuario.click(botaoAbrir())
    await usuario.type(campo(), 'Ok')
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }))
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
    expect((campo() as HTMLTextAreaElement).value).toBe('Ok')
  })

  it('reabrir limpa o erro anterior', async () => {
    const usuario = userEvent.setup()
    abrirComponente('icone', { status: 500 })
    await usuario.click(botaoAbrir())
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(screen.getByText('Escreva a resposta antes de enviar.')).toBeTruthy()
    await usuario.click(botaoAbrir())
    await usuario.click(botaoAbrir())
    expect(screen.queryByText('Escreva a resposta antes de enviar.')).toBeNull()
  })
})
