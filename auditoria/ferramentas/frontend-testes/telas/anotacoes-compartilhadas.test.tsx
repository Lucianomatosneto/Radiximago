// @vitest-environment jsdom
//
// ANOTACOES DE QUEM COMPARTILHOU (Fase 3c):
// frontend/src/components/compartilhar/AnotacoesCompartilhadas.tsx.
// Para quem RECEBEU a imagem: o recado e as anotacoes atuais de quem enviou.
// Nada e editavel; "apagar" tira so da visao de quem recebeu (quem escreveu
// continua com o texto). Confere: carregando, lista, sem anotacoes,
// indisponivel, recado atualizado pelo servidor, apagar com segundo clique
// (que expira em 4 s), apagar todas (anotacoes e recado), mostrar as
// apagadas, aviso para a tela recontar e o erro anunciado. Simulado: o
// "Responder" (teste proprio). Dados inventados.
import { act, cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AnotacoesCompartilhadas from '../../../../frontend/src/components/compartilhar/AnotacoesCompartilhadas'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

vi.mock('../../../../frontend/src/components/compartilhar/ResponderCompartilhamento', () => ({
  default: ({ remetenteNome }: { remetenteNome: string }) => <button type="button">responder a {remetenteNome}</button>,
}))

const BASE = '/shares/recebidas/5/anotacoes'
const NOTAS = [
  { id: 1, texto: 'Observe a raiz mesial.' },
  { id: 2, texto: 'Comparar com\na de 2025.' },
]
function abrir(extra: Record<string, Rota> = {}, mensagem: string | null = 'Favor avaliar.') {
  const servidor = servidorFalso({ [`GET ${BASE}`]: { corpo: { itens: NOTAS, ocultas: 0 } }, ...extra })
  montarTela(<AnotacoesCompartilhadas compartilhamento={{ id: 5, remetente_nome: 'Prof. Teste', mensagem }} />)
  return servidor
}
const lixeira = (nome: string) => screen.getAllByRole('button', { name: nome })

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('mostrar', () => {
  it('carregando ("…"), depois o recado e as anotacoes de quem enviou; responder fica disponivel', async () => {
    abrir()
    expect(screen.getByText('Anotações de Prof. Teste')).toBeTruthy()
    expect(screen.getByText('…')).toBeTruthy()
    expect(await screen.findByText('• Observe a raiz mesial.')).toBeTruthy()
    expect(screen.getByText('“Favor avaliar.”')).toBeTruthy()
    expect(screen.getByText(/Comparar com/).textContent).toBe('• Comparar com\na de 2025.')
    expect(screen.queryByRole('textbox')).toBeNull() // nada editavel
    expect(screen.getByRole('button', { name: 'responder a Prof. Teste' })).toBeTruthy()
    expect(screen.getByText(/quem escreveu continua com o texto/)).toBeTruthy()
  })

  it('o servidor manda o recado atual (null = quem recebeu ja apagou)', async () => {
    abrir({ [`GET ${BASE}`]: { corpo: { itens: [], mensagem: null } } })
    expect(await screen.findByText('Nenhuma anotação nesta imagem.')).toBeTruthy()
    expect(screen.queryByText('“Favor avaliar.”')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Apagar todas' })).toBeNull() // nada para apagar
  })

  it.each([
    ['erro do servidor (ex.: compartilhamento desfeito)', { status: 404 } as Rota],
    ['sem conexao', 'SEM_CONEXAO' as Rota],
  ])('%s: "As anotações não estão mais disponíveis."', async (_n, rota) => {
    abrir({ [`GET ${BASE}`]: rota })
    expect(await screen.findByText('As anotações não estão mais disponíveis.')).toBeTruthy()
  })
})

describe('apagar so para mim', () => {
  it('uma anotacao: o primeiro clique pede confirmacao; o segundo apaga e avisa a tela', async () => {
    const usuario = userEvent.setup()
    let itens = NOTAS
    const servidor = abrir({
      [`GET ${BASE}`]: () => ({ corpo: { itens, ocultas: 2 - itens.length } }),
      [`POST ${BASE}/ocultar`]: () => {
        itens = [NOTAS[1]]
        return { corpo: {} }
      },
    })
    const avisos: unknown[] = []
    const ouvir = (e: Event) => avisos.push((e as CustomEvent).detail)
    window.addEventListener('radix-anotacoes-compartilhadas', ouvir)
    try {
      await screen.findByText('• Observe a raiz mesial.')
      await usuario.click(lixeira('Apagar esta anotação só para você')[0])
      expect(screen.getByRole('button', { name: 'Clique de novo para apagar' }).textContent).toBe('Apagar?')
      expect(servidor.alteracoes()).toEqual([])
      await usuario.click(screen.getByRole('button', { name: 'Clique de novo para apagar' }))
      await waitFor(() => expect(screen.queryByText('• Observe a raiz mesial.')).toBeNull())
      expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: `${BASE}/ocultar`, corpo: { ids: [1] } }])
      expect(avisos).toEqual([{ id: 5 }])
      expect(screen.getByRole('button', { name: 'Mostrar a apagada' })).toBeTruthy()
    } finally {
      window.removeEventListener('radix-anotacoes-compartilhadas', ouvir)
    }
  })

  it('sem o segundo clique em 4 s, o botao volta ao normal', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    abrir()
    await screen.findByText('• Observe a raiz mesial.')
    await usuario.click(lixeira('Apagar esta anotação só para você')[0])
    expect(screen.getByRole('button', { name: 'Clique de novo para apagar' })).toBeTruthy()
    await act(async () => void vi.advanceTimersByTime(4100))
    expect(screen.queryByRole('button', { name: 'Clique de novo para apagar' })).toBeNull()
  })

  it('o recado: pede confirmacao e manda "mensagem: true"', async () => {
    const usuario = userEvent.setup()
    const servidor = abrir({ [`POST ${BASE}/ocultar`]: { corpo: {} } })
    await screen.findByText('“Favor avaliar.”')
    await usuario.click(screen.getByRole('button', { name: 'Apagar este recado só para você' }))
    await usuario.click(screen.getByRole('button', { name: 'Clique de novo para apagar' }))
    await waitFor(() => expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: `${BASE}/ocultar`, corpo: { mensagem: true } }]))
  })

  it('"Apagar todas": confirma e apaga as anotacoes e tambem o recado', async () => {
    const usuario = userEvent.setup()
    const servidor = abrir({ [`POST ${BASE}/ocultar`]: { corpo: {} } })
    await screen.findByText('• Observe a raiz mesial.')
    await usuario.click(screen.getByRole('button', { name: 'Apagar todas' }))
    expect(servidor.alteracoes()).toEqual([])
    await usuario.click(screen.getByRole('button', { name: 'Clique de novo para apagar todas' }))
    await waitFor(() =>
      expect(servidor.alteracoes()).toEqual([
        { metodo: 'POST', caminho: `${BASE}/ocultar`, corpo: {} },
        { metodo: 'POST', caminho: `${BASE}/ocultar`, corpo: { mensagem: true } },
      ])
    )
  })

  it('"Apagar todas" sem recado: um pedido so', async () => {
    const usuario = userEvent.setup()
    const servidor = abrir({ [`POST ${BASE}/ocultar`]: { corpo: {} } }, null)
    await screen.findByText('• Observe a raiz mesial.')
    await usuario.click(screen.getByRole('button', { name: 'Apagar todas' }))
    await usuario.click(screen.getByRole('button', { name: 'Clique de novo para apagar todas' }))
    await waitFor(() => expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: `${BASE}/ocultar`, corpo: {} }]))
  })

  it('"Mostrar as apagadas" traz de volta', async () => {
    const usuario = userEvent.setup()
    const servidor = abrir({ [`GET ${BASE}`]: { corpo: { itens: [], ocultas: 3 } }, [`POST ${BASE}/reexibir`]: { corpo: {} } })
    await usuario.click(await screen.findByRole('button', { name: 'Mostrar as 3 apagadas' }))
    await waitFor(() => expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: `${BASE}/reexibir`, corpo: {} }]))
  })

  // DEFEITO achado na Fase 3c (14/11/2026), o mesmo do "Responder": o erro
  // aparecia so como texto vermelho, sem ser anunciado (faltava role="alert").
  it.each([
    ['erro do servidor', { status: 500 } as Rota],
    ['sem conexao', 'SEM_CONEXAO' as Rota],
  ])('falha ao apagar (%s): o erro e anunciado e a anotacao continua', async (_n, rota) => {
    const usuario = userEvent.setup()
    abrir({ [`POST ${BASE}/ocultar`]: rota })
    await screen.findByText('• Observe a raiz mesial.')
    await usuario.click(lixeira('Apagar esta anotação só para você')[0])
    await usuario.click(screen.getByRole('button', { name: 'Clique de novo para apagar' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Não foi possível atualizar as anotações.')
    expect(screen.getByText('• Observe a raiz mesial.')).toBeTruthy()
  })
})
