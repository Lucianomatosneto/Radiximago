// @vitest-environment jsdom
//
// TELA "Macros da curadoria" (frontend/src/app/macros/page.tsx).
// PR 3a (14/11/2026): os campos do editor de macro precisam ser achados pelo
// rotulo (leitor de tela e clique no rotulo). Os demais testes da tela entram
// no PR 3b. Dados inventados.
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MacrosPage from '../../../../frontend/src/app/macros/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/macros' }))
vi.mock('../../../../frontend/src/components/Sidebar', () => ({ default: () => <nav aria-label="menu lateral" /> }))
vi.mock('../../../../frontend/src/components/Topbar', () => ({ default: () => <header aria-label="barra do topo" /> }))

const CURADOR = { id: 7, nome: 'Curador Teste', email: 'curador@exemplo.test', perfil: 'curador', foto_perfil_url: null }

function rotasPadrao(extra: Record<string, Rota> = {}): Record<string, Rota> {
  return {
    'GET /auth/me': { corpo: CURADOR },
    'GET /macros?incluir_inativas=true': { corpo: { macros: [] } },
    'GET /voz/frases': { corpo: { frases: [] } },
    'GET /vocabulario': { corpo: { termos: [] } },
    ...extra,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})
afterEach(() => cleanup())

describe('PR 3a: rotulos ligados aos campos do editor de macro', () => {
  it('cada campo e encontrado pelo seu rotulo e aceita o que se digita/escolhe', async () => {
    const usuario = userEvent.setup()
    servidorFalso(rotasPadrao())
    montarTela(<MacrosPage />)
    await usuario.click(await screen.findByRole('button', { name: /Nova macro/ }))

    const nome = screen.getByLabelText('Nome (é o que se fala depois de “macro”)')
    await usuario.type(nome, 'periapical normal')
    expect((nome as HTMLInputElement).value).toBe('periapical normal')

    const tipo = screen.getByLabelText('Tipo de radiografia') as HTMLSelectElement
    await usuario.selectOptions(tipo, 'periapical')
    expect(tipo.value).toBe('periapical')
    const qualidade = screen.getByLabelText('Qualidade técnica') as HTMLSelectElement
    await usuario.selectOptions(qualidade, 'boa')
    expect(qualidade.value).toBe('boa')
    const origem = screen.getByLabelText('Origem da imagem') as HTMLSelectElement
    await usuario.selectOptions(origem, 'externa')
    expect(origem.value).toBe('externa')

    for (const rotulo of ['Descrição didática', 'Achados detalhados', 'Observações internas']) {
      const campo = screen.getByLabelText(rotulo)
      expect(campo.tagName).toBe('TEXTAREA')
      await usuario.type(campo, 'Texto de teste')
      expect((campo as HTMLTextAreaElement).value).toBe('Texto de teste')
    }
  })
})

// Fase 3c (14/11/2026): o resto da tela. Quem pode, lista com resumo,
// nova/editar (o que vai ao servidor: "nao alterar" vira null), desativar e
// reativar, as frases que a voz aprendeu e os erros. Dados inventados.
describe('Fase 3c: macros e frases', () => {
  const MACRO = {
    id: 3,
    nome: 'periapical normal',
    ativo: true,
    conteudo: {
      descricao_didatica: 'Sem alterações.', achados_detalhe: '', observacoes_internas: '',
      alteracoes_observadas: ['carie_esmalte'], tipo_radiografia: 'periapical', qualidade_tecnica: 'boa', origem: 'externa',
      erros_tecnicos: ['corte'], termos: [9], dentes: [11, 21],
    },
  }
  const INATIVA = { id: 4, nome: 'antiga', ativo: false, conteudo: { descricao_didatica: '', achados_detalhe: '', observacoes_internas: 'Só interno.' } }
  const FRASE = { id: 8, frase: 'cariezinha', alteracao: 'carie_esmalte' }
  function abrir(extra: Record<string, Rota> = {}) {
    const servidor = servidorFalso(rotasPadrao({
      'GET /macros?incluir_inativas=true': { corpo: { macros: [MACRO, INATIVA] } },
      'GET /voz/frases': { corpo: { frases: [FRASE] } },
      ...extra,
    }))
    montarTela(<MacrosPage />)
    return servidor
  }
  const linha = (nome: string) => screen.getByText(new RegExp(`⚡ ${nome}`)).closest('li') as HTMLElement

  it('sem sessao vai ao login', async () => {
    servidorFalso({ 'GET /auth/me': { status: 401 } })
    montarTela(<MacrosPage />)
    expect(screen.getByText('Carregando...')).toBeTruthy()
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
  })

  it.each(['professor', 'estudante', 'suporte', 'pesquisador'])('%s vai ao "acesso negado"', async (perfil) => {
    servidorFalso(rotasPadrao({ 'GET /auth/me': { corpo: { ...CURADOR, perfil } } }))
    montarTela(<MacrosPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/acesso-negado?de=/macros'))
  })

  it('lista com o resumo de cada macro; a desativada aparece marcada; vazias mostram aviso', async () => {
    abrir()
    const ativa = await waitFor(() => linha('periapical normal'))
    expect(within(ativa).getByText('Sem alterações.')).toBeTruthy()
    expect(within(ativa).getByText(/^Periapical · Boa · 1 alteração\(ões\) · Envio manual \(upload\) · Erros técnicos: 1 · Termos do vocabulário: 1 · Dentes: 11, 21$/)).toBeTruthy()
    expect(within(ativa).getByRole('button', { name: 'Desativar' })).toBeTruthy()
    const inativa = linha('antiga')
    expect(within(inativa).getByText('(desativada)')).toBeTruthy()
    expect(within(inativa).getByText('Só interno.')).toBeTruthy()
    expect(within(inativa).getByRole('button', { name: 'Reativar' })).toBeTruthy()
    expect(screen.getByText('“cariezinha”').closest('li')?.textContent).toContain('Cárie em esmalte')
    cleanup()
    servidorFalso(rotasPadrao())
    montarTela(<MacrosPage />)
    expect(await screen.findByText('Nenhuma macro cadastrada ainda.')).toBeTruthy()
    expect(screen.getByText('Nenhuma frase aprendida ainda.')).toBeTruthy()
  })

  it.each([
    ['macros', { 'GET /macros?incluir_inativas=true': { status: 500 } as Rota }],
    ['frases', { 'GET /voz/frases': 'SEM_CONEXAO' as Rota }],
  ])('falha ao carregar (%s): avisa', async (_n, extra) => {
    abrir(extra)
    expect((await screen.findByRole('alert')).textContent).toBe('Não foi possível carregar as macros.')
  })

  it('nova macro: "nao alterar" vai como null; avisa, fecha e recarrega', async () => {
    const usuario = userEvent.setup()
    const servidor = abrir({ 'POST /macros': { status: 201, corpo: {} } })
    await usuario.click(await screen.findByRole('button', { name: /Nova macro/ }))
    await usuario.type(screen.getByLabelText('Nome (é o que se fala depois de “macro”)'), 'normal')
    await usuario.click(screen.getByRole('button', { name: '36' }))
    await usuario.click(screen.getByRole('button', { name: '11' }))
    expect(screen.getByRole('button', { name: '11' }).getAttribute('aria-pressed')).toBe('true')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Macro salva.')).toBeTruthy()
    expect(servidor.alteracoes()).toEqual([
      {
        metodo: 'POST',
        caminho: '/macros',
        corpo: {
          nome: 'normal',
          conteudo: {
            descricao_didatica: '', achados_detalhe: '', observacoes_internas: '', alteracoes_observadas: [],
            tipo_radiografia: null, qualidade_tecnica: null, origem: null, erros_tecnicos: [], termos: [], dentes: [11, 36],
          },
        },
      },
    ])
    expect(screen.queryByLabelText('Nome (é o que se fala depois de “macro”)')).toBeNull()
  })

  it('editar: vem preenchida (inclusive a macro antiga, sem os campos novos) e salva com PATCH; desmarcar dente', async () => {
    const usuario = userEvent.setup()
    const servidor = abrir({ 'PATCH /macros/3': { corpo: {} }, 'PATCH /macros/4': { corpo: {} } })
    await usuario.click(within(await waitFor(() => linha('antiga'))).getByRole('button', { name: 'Editar' }))
    expect((screen.getByLabelText('Observações internas') as HTMLTextAreaElement).value).toBe('Só interno.')
    expect((screen.getByLabelText('Tipo de radiografia') as HTMLSelectElement).value).toBe('')
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }))
    await usuario.click(within(linha('periapical normal')).getByRole('button', { name: 'Editar' }))
    expect((screen.getByLabelText('Tipo de radiografia') as HTMLSelectElement).value).toBe('periapical')
    await usuario.click(screen.getByRole('button', { name: '21' }))
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(servidor.alteracoes()).toHaveLength(1))
    const [pedido] = servidor.alteracoes()
    expect(pedido.metodo).toBe('PATCH')
    expect(pedido.caminho).toBe('/macros/3')
    expect((pedido.corpo as { conteudo: { dentes: number[]; tipo_radiografia: string } }).conteudo).toMatchObject({ dentes: [11], tipo_radiografia: 'periapical' })
  })

  it.each([
    ['motivo do servidor', { status: 409, corpo: { detail: 'Já existe uma macro com esse nome.' } } as Rota, 'Já existe uma macro com esse nome.'],
    ['validacao (422)', { status: 422, corpo: { detail: [{ msg: 'O nome é obrigatório.' }] } } as Rota, 'O nome é obrigatório.'],
    ['sem motivo', { status: 500, corpo: 'x' } as Rota, 'Não foi possível salvar.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Sem conexão com o servidor. Tente de novo.'],
  ])('falha ao salvar (%s): avisa e o editor continua aberto', async (_n, rota, mensagem) => {
    const usuario = userEvent.setup()
    abrir({ 'POST /macros': rota })
    await usuario.click(await screen.findByRole('button', { name: /Nova macro/ }))
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
    expect(screen.getByLabelText('Nome (é o que se fala depois de “macro”)')).toBeTruthy()
  })

  it('desativar e reativar mandam o novo estado e recarregam', async () => {
    const usuario = userEvent.setup()
    const servidor = abrir({ 'PATCH /macros/3': { corpo: {} }, 'PATCH /macros/4': { corpo: {} } })
    await usuario.click(within(await waitFor(() => linha('periapical normal'))).getByRole('button', { name: 'Desativar' }))
    await usuario.click(within(linha('antiga')).getByRole('button', { name: 'Reativar' }))
    await waitFor(() =>
      expect(servidor.alteracoes()).toEqual([
        { metodo: 'PATCH', caminho: '/macros/3', corpo: { ativo: false } },
        { metodo: 'PATCH', caminho: '/macros/4', corpo: { ativo: true } },
      ])
    )
  })

  it.each([
    ['motivo do servidor', { status: 403, corpo: { detail: 'Sem permissão.' } } as Rota, 'Sem permissão.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Sem conexão com o servidor. Tente de novo.'],
  ])('falha ao desativar (%s): avisa', async (_n, rota, mensagem) => {
    const usuario = userEvent.setup()
    abrir({ 'PATCH /macros/3': rota })
    await usuario.click(within(await waitFor(() => linha('periapical normal'))).getByRole('button', { name: 'Desativar' }))
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
  })

  it('"Esquecer" uma frase aprendida: apaga e recarrega', async () => {
    const usuario = userEvent.setup()
    let frases = [FRASE]
    const servidor = abrir({
      'GET /voz/frases': () => ({ corpo: { frases } }),
      'DELETE /voz/frases/8': () => {
        frases = []
        return { status: 204 }
      },
    })
    await usuario.click(await screen.findByRole('button', { name: 'Esquecer' }))
    expect(await screen.findByText('Nenhuma frase aprendida ainda.')).toBeTruthy()
    expect(servidor.alteracoes()).toEqual([{ metodo: 'DELETE', caminho: '/voz/frases/8', corpo: undefined }])
  })

  // DEFEITO achado na Fase 3c (14/11/2026): se o servidor recusava "Esquecer"
  // (ex.: 403 ou 500), nada aparecia: a frase continuava e a pessoa nao sabia
  // por que. Sem conexao ja avisava.
  it.each([
    ['motivo do servidor', { status: 403, corpo: { detail: 'Só o administrador apaga frases de outros.' } } as Rota, 'Só o administrador apaga frases de outros.'],
    ['sem motivo', { status: 500 } as Rota, 'Não foi possível esquecer a frase.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Sem conexão com o servidor. Tente de novo.'],
  ])('falha ao esquecer (%s): avisa e a frase continua', async (_n, rota, mensagem) => {
    const usuario = userEvent.setup()
    abrir({ 'DELETE /voz/frases/8': rota })
    await usuario.click(await screen.findByRole('button', { name: 'Esquecer' }))
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
    expect(screen.getByText('“cariezinha”')).toBeTruthy()
  })

  it('"Voltar": volta a tela anterior; aberta direto, vai a curadoria', async () => {
    const usuario = userEvent.setup()
    abrir()
    await usuario.click(await screen.findByRole('button', { name: 'Voltar' }))
    expect(window.history.length > 1 ? roteador.back : roteador.push).toHaveBeenCalled()
  })
})

// Fase 3d (16/11/2026): itens 1 e 2 das sobras da 3c.
describe('Fase 3d: salvar a macro', () => {
  async function abrirNova(usuario: ReturnType<typeof userEvent.setup>, extra: Record<string, Rota> = {}) {
    const servidor = servidorFalso(rotasPadrao(extra))
    montarTela(<MacrosPage />)
    await usuario.click(await screen.findByRole('button', { name: /Nova macro/ }))
    await usuario.type(screen.getByLabelText('Nome (é o que se fala depois de “macro”)'), 'normal')
    return servidor
  }

  // item 1: "Salvar" nao travava; dois cliques rapidos mandavam duas macros
  it('durante o envio, "Salvar" fica travado e o segundo clique e ignorado', async () => {
    const usuario = userEvent.setup()
    let liberar: () => void = () => {}
    const espera = new Promise<void>((r) => (liberar = r))
    const servidor = await abrirNova(usuario, { 'POST /macros': { status: 201, corpo: {} } })
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
    await screen.findByText('Macro salva.')
    expect(servidor.alteracoes()).toHaveLength(1)
  })

  it('depois de uma falha, "Salvar" volta a funcionar', async () => {
    const usuario = userEvent.setup()
    await abrirNova(usuario, { 'POST /macros': { status: 500 } })
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    await screen.findByRole('alert')
    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(false)
  })

  // item 2: "Macro salva." aparecia, mas o leitor de tela nao anunciava
  it('"Macro salva." e anunciada (role="status")', async () => {
    const usuario = userEvent.setup()
    await abrirNova(usuario, { 'POST /macros': { status: 201, corpo: {} } })
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect((await screen.findByRole('status')).textContent).toBe('Macro salva.')
  })
})
