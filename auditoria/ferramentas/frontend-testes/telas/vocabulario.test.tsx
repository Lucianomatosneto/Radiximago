// @vitest-environment jsdom
//
// TELA "Vocabulario controlado" (frontend/src/app/vocabulario/page.tsx).
// Modelo da Fase 0 dos testes de telas (13/11/2026): cada teste confere algo
// que a pessoa VE ou que a tela PEDE ao servidor. Nada de dado real: termos,
// fichas e mensagens abaixo sao inventados.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VocabularioPage from '../../../../frontend/src/app/vocabulario/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

// ---- o que NAO e desta tela fica de fora (tem teste proprio) ----
const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/vocabulario' }))
vi.mock('../../../../frontend/src/components/Sidebar', () => ({ default: () => <nav aria-label="menu lateral" /> }))
vi.mock('../../../../frontend/src/components/Topbar', () => ({ default: () => <header aria-label="barra do topo" /> }))

// ---- dados inventados ----
const CURADOR = { id: 7, nome: 'Curador Teste', email: 'curador@exemplo.test', perfil: 'curador', foto_perfil_url: null }
const ADMIN = { ...CURADOR, id: 1, perfil: 'administrador' }
const LIVRE = { texto: 'nódulo pulpar', normalizado: 'nodulo pulpar', quantidade_fichas: 3 }
const TERMO = {
  id: 10,
  termo: 'Calcificação pulpar',
  categoria: 'achado',
  codigo_decs: 'D000001',
  ativo: true,
  na_busca: true,
  nas_curadorias: true,
  sinonimos: [{ id: 100, sinonimo: 'pedra pulpar' }],
  quantidade_fichas: 5,
  quantidade_aprovadas: 3,
  quantidade_na_busca: 4,
}
const TERMO_INATIVO = { ...TERMO, id: 11, termo: 'Termo antigo', categoria: 'outro', codigo_decs: null, ativo: false, sinonimos: [], quantidade_fichas: 0, quantidade_aprovadas: 0, quantidade_na_busca: 0 }

const LIVRES = 'GET /vocabulario/termos-livres'
const OFICIAIS = 'GET /vocabulario?incluir_inativos=true&com_contagem_busca=true'

function rotasPadrao(extra: Record<string, Rota> = {}): Record<string, Rota> {
  return {
    'GET /auth/me': { corpo: CURADOR },
    [LIVRES]: { corpo: { itens: [LIVRE] } },
    [OFICIAIS]: { corpo: { termos: [TERMO, TERMO_INATIVO] } },
    ...extra,
  }
}

/** monta a tela e espera sair do "Carregando..." */
async function abrir(rotas: Record<string, Rota>) {
  const servidor = servidorFalso(rotas)
  montarTela(<VocabularioPage />)
  await screen.findByRole('heading', { level: 1, name: /Vocabulário\s+controlado/ })
  return servidor
}

beforeEach(() => {
  vi.clearAllMocks()
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo // o jsdom nao rola a pagina
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('permissao por perfil', () => {
  it('sem login: vai para o login e nao pede nada do vocabulario', async () => {
    const servidor = servidorFalso({ 'GET /auth/me': { status: 401, corpo: { detail: 'Not authenticated' } } })
    montarTela(<VocabularioPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
    expect(servidor.pedidos.map((p) => p.caminho)).toEqual(['/auth/me'])
    expect(screen.getByText('Carregando...')).toBeTruthy()
  })

  it('estudante: vai para "acesso negado" e nao pede nada do vocabulario', async () => {
    const servidor = servidorFalso({ 'GET /auth/me': { corpo: { ...CURADOR, perfil: 'estudante' } } })
    montarTela(<VocabularioPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/acesso-negado?de=/vocabulario'))
    expect(servidor.pedidos.map((p) => p.caminho)).toEqual(['/auth/me'])
  })

  it.each([
    ['curador', CURADOR],
    ['administrador', ADMIN],
  ])('%s: entra e a tela carrega as duas listas', async (_perfil, usuario) => {
    const servidor = await abrir(rotasPadrao({ 'GET /auth/me': { corpo: usuario } }))
    expect(roteador.push).not.toHaveBeenCalled()
    expect(servidor.pedidos.map((p) => `${p.metodo} ${p.caminho}`)).toEqual(['GET /auth/me', LIVRES, OFICIAIS])
  })
})

describe('carregar a tela', () => {
  it('mostra "Carregando..." enquanto o servidor nao responde', async () => {
    let liberar: () => void = () => {}
    const espera = new Promise<void>((r) => (liberar = r))
    const fetchLento = vi.fn(async (url: string) => {
      if (String(url).endsWith('/auth/me')) return new Response(JSON.stringify(CURADOR))
      await espera
      return new Response(JSON.stringify({ itens: [], termos: [] }))
    })
    vi.stubGlobal('fetch', fetchLento)
    montarTela(<VocabularioPage />)
    await waitFor(() => expect(fetchLento).toHaveBeenCalledTimes(3))
    expect(screen.getByText('Carregando...')).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    liberar()
    expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy()
    expect(screen.queryByText('Carregando...')).toBeNull()
  })

  it('listas vazias: mostra os avisos de "nada por enquanto"', async () => {
    await abrir(rotasPadrao({ [LIVRES]: { corpo: { itens: [] } }, [OFICIAIS]: { corpo: { termos: [] } } }))
    expect(screen.getByText('Nenhum texto livre repetido por enquanto.')).toBeTruthy()
    expect(screen.getByText('Nenhum termo oficial ainda.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('com dados: mostra o texto livre, o termo oficial, os sinonimos e as contagens', async () => {
    await abrir(rotasPadrao())
    const tabela = screen.getByRole('table')
    const linha = within(tabela).getByText('nódulo pulpar').closest('tr') as HTMLElement
    expect(within(linha).getByText('3')).toBeTruthy()
    expect(within(linha).getByRole('button', { name: 'Promover' })).toBeTruthy()

    const item = cartaoDoTermo('Calcificação pulpar')
    expect(within(item).getByText('Achado')).toBeTruthy()
    expect(within(item).getByText('DeCS D000001')).toBeTruthy()
    expect(item.textContent).toContain('5 ficha(s) ligada(s) · 3 aprovada(s) · 4 na busca')
    expect(within(item).getByText(/pedra pulpar/)).toBeTruthy()
    // 5 ligadas, 3 aprovadas: avisa as 2 que ainda nao entram na busca
    const notas = within(item).getAllByRole('note').map((n) => n.textContent)
    expect(notas[0]).toMatch(/^2 ficha\(s\) ligada\(s\) ainda não aprovada/)
    // 4 na busca, 3 aprovadas: 1 achada so pelo texto escrito na ficha
    expect(notas[1]).toMatch(/^\+1 imagem\(ns\) encontrada\(s\) pelo nome ou sinônimo/)
    expect((within(item).getByRole('checkbox', { name: 'Opção na Pesquisa avançada' }) as HTMLInputElement).checked).toBe(true)
    expect(within(item).getByRole('button', { name: 'Desativar' })).toBeTruthy()

    // termo inativo: sem avisos e com o botao "Reativar"
    const inativo = cartaoDoTermo('Termo antigo')
    expect(within(inativo).getByText('Outro')).toBeTruthy()
    expect(within(inativo).queryByRole('note')).toBeNull()
    expect(within(inativo).getByRole('button', { name: 'Reativar' })).toBeTruthy()
  })

  it.each([
    ['o servidor responde erro (500)', { status: 500, corpo: { detail: 'erro interno' } }],
    ['o servidor esta fora do ar', 'SEM_CONEXAO' as const],
  ])('%s: mostra "Nao foi possivel carregar" e as listas vazias', async (_caso, resposta) => {
    await abrir(rotasPadrao({ [OFICIAIS]: resposta }))
    expect(screen.getByRole('alert').textContent).toBe('Não foi possível carregar o vocabulário.')
    expect(screen.queryByText('Calcificação pulpar')).toBeNull()
  })
})

describe('promover um texto livre a termo oficial', () => {
  it('formulario ja vem com o texto; o botao so libera com 2 letras ou mais', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir(rotasPadrao())
    await usuario.click(screen.getByRole('button', { name: 'Promover' }))
    const campo = screen.getByRole('textbox', { name: 'Termo' }) as HTMLInputElement
    expect(campo.value).toBe('nódulo pulpar')
    const criar = screen.getByRole('button', { name: 'Criar termo' }) as HTMLButtonElement
    expect(criar.disabled).toBe(false)
    await usuario.clear(campo)
    await usuario.type(campo, 'n ')
    expect(criar.disabled).toBe(true)
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('heading', { name: 'Promover a termo oficial' })).toBeNull()
    expect(servidor.alteracoes()).toEqual([])
  })

  it('cria o termo, avisa, abre a conferencia e liga so as fichas que ficaram marcadas', async () => {
    const usuario = userEvent.setup()
    const novo = { ...TERMO, id: 20, termo: 'Nódulo pulpar', codigo_decs: null, sinonimos: [], quantidade_fichas: 0, quantidade_aprovadas: 0, quantidade_na_busca: 0 }
    const servidor = await abrir(
      rotasPadrao({
        'POST /vocabulario/termos': { status: 201, corpo: novo },
        'GET /vocabulario/termos/20/candidatas': {
          corpo: {
            itens: [
              { curation_id: 501, status: 'aprovada', tipo_radiografia: 'periapical', trecho: 'nódulo pulpar no 36' },
              { curation_id: 502, status: 'em_revisao', tipo_radiografia: null, trecho: 'possível nódulo pulpar' },
            ],
          },
        },
        'POST /vocabulario/termos/20/vincular': { corpo: { mensagem: '1 ficha ligada ao termo.' } },
      })
    )
    await usuario.click(screen.getByRole('button', { name: 'Promover' }))
    const campo = screen.getByRole('textbox', { name: 'Termo' })
    await usuario.clear(campo)
    await usuario.type(campo, 'Nódulo pulpar')
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Categoria' }), 'Alteração')
    await usuario.type(screen.getByRole('textbox', { name: /Código/ }), 'D999')
    await usuario.type(screen.getByRole('textbox', { name: 'Sinônimos (separados por vírgula)' }), ' pedra no canal, ,calcificação ')
    await usuario.click(screen.getByRole('button', { name: 'Criar termo' }))

    expect(await screen.findByText('Termo "Nódulo pulpar" criado. Confira abaixo as fichas que podem ser ligadas a ele.')).toBeTruthy()
    // o que foi enviado: espacos e itens vazios dos sinonimos sao descartados
    expect(servidor.alteracoes()[0]).toEqual({
      metodo: 'POST',
      caminho: '/vocabulario/termos',
      corpo: { termo: 'Nódulo pulpar', categoria: 'alteracao', codigo_decs: 'D999', sinonimos: ['pedra no canal', 'calcificação'] },
    })
    expect(screen.queryByRole('heading', { name: 'Promover a termo oficial' })).toBeNull()

    // conferencia: as duas fichas vem marcadas; desmarcar a 502 e ligar so a 501
    await screen.findByRole('heading', { name: 'Fichas que mencionam "Nódulo pulpar"' })
    expect(screen.getByText('“possível nódulo pulpar”')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ligar 2 ficha(s) ao termo' })).toBeTruthy()
    await usuario.click(screen.getByRole('checkbox', { name: 'Ficha 502' }))
    await usuario.click(screen.getByRole('button', { name: 'Ligar 1 ficha(s) ao termo' }))
    expect(await screen.findByText('1 ficha ligada ao termo.')).toBeTruthy()
    expect(servidor.alteracoes()[1]).toEqual({ metodo: 'POST', caminho: '/vocabulario/termos/20/vincular', corpo: { curation_ids: [501] } })
    expect(screen.queryByRole('heading', { name: /Fichas que mencionam/ })).toBeNull()
  })

  it.each([
    ['o servidor recusa com motivo: mostra o motivo', { status: 409, corpo: { detail: 'Já existe um termo com esse nome.' } }, 'Já existe um termo com esse nome.'],
    ['o servidor recusa sem motivo legivel: mensagem padrao', { status: 500, corpo: 'texto qualquer' }, 'Não foi possível salvar.'],
    ['sem conexao: pede para tentar de novo', 'SEM_CONEXAO' as const, 'Sem conexão com o servidor. Tente de novo.'],
  ])('%s, e o formulario continua aberto', async (_caso, resposta, mensagem) => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao({ 'POST /vocabulario/termos': resposta }))
    await usuario.click(screen.getByRole('button', { name: '+ Novo termo' }))
    const criar = screen.getByRole('button', { name: 'Criar termo' }) as HTMLButtonElement
    expect(criar.disabled).toBe(true) // "Novo termo" comeca vazio
    await usuario.type(screen.getByRole('textbox', { name: 'Termo' }), 'Reabsorção')
    await usuario.click(criar)
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
    expect(screen.getByRole('heading', { name: 'Promover a termo oficial' })).toBeTruthy()
  })
})

describe('sinonimos', () => {
  it('Enter acrescenta o sinonimo, limpa o campo e atualiza os termos livres', async () => {
    const usuario = userEvent.setup()
    const comNovo = { ...TERMO, sinonimos: [...TERMO.sinonimos, { id: 101, sinonimo: 'nódulo pulpar' }] }
    const rotas = rotasPadrao({ 'POST /vocabulario/termos/10/sinonimos': { status: 201, corpo: comNovo } })
    const servidor = await abrir(rotas)
    const item = cartaoDoTermo('Calcificação pulpar')
    const campo = within(item).getByPlaceholderText('+ sinônimo (Enter)') as HTMLInputElement
    await usuario.type(campo, '   {Enter}') // so espacos: nao envia nada
    expect(servidor.alteracoes()).toEqual([])

    rotas[LIVRES] = { corpo: { itens: [] } } // o texto saiu da lista de livres
    await usuario.clear(campo)
    await usuario.type(campo, ' nódulo pulpar {Enter}')
    expect(await within(item).findByText(/^nódulo pulpar/)).toBeTruthy()
    expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: '/vocabulario/termos/10/sinonimos', corpo: { sinonimo: 'nódulo pulpar' } }])
    expect(campo.value).toBe('')
    expect(await screen.findByText('Nenhum texto livre repetido por enquanto.')).toBeTruthy()
  })

  it('o X remove o sinonimo da tela depois que o servidor confirma', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir(rotasPadrao({ 'DELETE /vocabulario/sinonimos/100': { status: 204 } }))
    const item = cartaoDoTermo('Calcificação pulpar')
    await usuario.click(within(item).getByRole('button', { name: 'Remover sinônimo' }))
    await waitFor(() => expect(within(item).queryByText(/pedra pulpar/)).toBeNull())
    expect(servidor.alteracoes()).toEqual([{ metodo: 'DELETE', caminho: '/vocabulario/sinonimos/100', corpo: undefined }])
  })

  it.each([
    ['recusa do servidor', { status: 403, corpo: { detail: 'Sem permissão.' } }, 'Sem permissão.'],
    ['sem conexao', 'SEM_CONEXAO' as const, 'Sem conexão com o servidor. Tente de novo.'],
  ])('se o servidor nao confirmar a remocao (%s), o sinonimo continua na tela', async (_caso, resposta, mensagem) => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao({ 'DELETE /vocabulario/sinonimos/100': resposta }))
    const item = cartaoDoTermo('Calcificação pulpar')
    await usuario.click(within(item).getByRole('button', { name: 'Remover sinônimo' }))
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
    expect(within(item).getByText(/pedra pulpar/)).toBeTruthy()
  })

  it.each([
    ['recusa do servidor', { status: 422, corpo: { detail: 'Sinônimo repetido.' } }, 'Sinônimo repetido.'],
    ['sem conexao', 'SEM_CONEXAO' as const, 'Sem conexão com o servidor. Tente de novo.'],
  ])('erro ao acrescentar (%s): mostra a mensagem e mantem o texto digitado', async (_caso, resposta, mensagem) => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao({ 'POST /vocabulario/termos/10/sinonimos': resposta }))
    const campo = within(cartaoDoTermo('Calcificação pulpar')).getByPlaceholderText('+ sinônimo (Enter)') as HTMLInputElement
    await usuario.type(campo, 'pedra pulpar{Enter}')
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
    expect(campo.value).toBe('pedra pulpar')
  })
})

describe('editar um termo oficial', () => {
  it('"Desativar" envia ativo=false e o botao vira "Reativar"', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir(rotasPadrao({ 'PATCH /vocabulario/termos/10': { corpo: { ...TERMO, ativo: false } } }))
    await usuario.click(within(cartaoDoTermo('Calcificação pulpar')).getByRole('button', { name: 'Desativar' }))
    expect(await within(cartaoDoTermo('Calcificação pulpar')).findByRole('button', { name: 'Reativar' })).toBeTruthy()
    expect(servidor.alteracoes()).toEqual([{ metodo: 'PATCH', caminho: '/vocabulario/termos/10', corpo: { ativo: false } }])
  })

  it('desmarcar "Opção na Pesquisa avançada" e "Opção nas curadorias" envia cada escolha', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir(
      rotasPadrao({ 'PATCH /vocabulario/termos/10': (p) => ({ corpo: { ...TERMO, ...(p.corpo as object) } }) })
    )
    const item = cartaoDoTermo('Calcificação pulpar')
    await usuario.click(within(item).getByRole('checkbox', { name: 'Opção na Pesquisa avançada' }))
    await waitFor(() => expect((within(item).getByRole('checkbox', { name: 'Opção na Pesquisa avançada' }) as HTMLInputElement).checked).toBe(false))
    await usuario.click(within(item).getByRole('checkbox', { name: 'Opção nas curadorias' }))
    await waitFor(() => expect((within(item).getByRole('checkbox', { name: 'Opção nas curadorias' }) as HTMLInputElement).checked).toBe(false))
    expect(servidor.alteracoes().map((p) => p.corpo)).toEqual([{ na_busca: false }, { nas_curadorias: false }])
  })

  it.each([
    ['recusa do servidor', { status: 500, corpo: {} }, 'Não foi possível salvar.'],
    ['sem conexao', 'SEM_CONEXAO' as const, 'Sem conexão com o servidor. Tente de novo.'],
  ])('erro ao salvar (%s): avisa e o termo continua como estava', async (_caso, resposta, mensagem) => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao({ 'PATCH /vocabulario/termos/10': resposta }))
    await usuario.click(within(cartaoDoTermo('Calcificação pulpar')).getByRole('button', { name: 'Desativar' }))
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
    expect(within(cartaoDoTermo('Calcificação pulpar')).getByRole('button', { name: 'Desativar' })).toBeTruthy()
  })
})

describe('conferir fichas de um termo ja existente', () => {
  it('sem fichas novas: avisa, o botao de ligar fica travado e "Fechar" fecha', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir(rotasPadrao({ 'GET /vocabulario/termos/10/candidatas': { corpo: { itens: [] } } }))
    await usuario.click(within(cartaoDoTermo('Calcificação pulpar')).getByRole('button', { name: 'Conferir fichas para ligar' }))
    expect(await screen.findByText('Nenhuma ficha nova menciona este termo.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Ligar 0 ficha(s) ao termo' }) as HTMLButtonElement).disabled).toBe(true)
    await usuario.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByText('Nenhuma ficha nova menciona este termo.')).toBeNull()
    expect(servidor.alteracoes()).toEqual([])
  })

  it.each([
    ['recusa do servidor', { status: 404, corpo: { detail: 'Termo não encontrado.' } }, 'Termo não encontrado.'],
    ['sem conexao', 'SEM_CONEXAO' as const, 'Sem conexão com o servidor. Tente de novo.'],
  ])('erro ao buscar as fichas (%s): avisa e nao abre a conferencia', async (_caso, resposta, mensagem) => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao({ 'GET /vocabulario/termos/10/candidatas': resposta }))
    await usuario.click(within(cartaoDoTermo('Calcificação pulpar')).getByRole('button', { name: 'Conferir fichas para ligar' }))
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
    expect(screen.queryByRole('heading', { name: /Fichas que mencionam/ })).toBeNull()
  })

  it.each([
    ['recusa do servidor', { status: 400, corpo: { detail: 'Ficha já ligada.' } }, 'Ficha já ligada.'],
    ['sem conexao', 'SEM_CONEXAO' as const, 'Sem conexão com o servidor. Tente de novo.'],
  ])('erro ao ligar (%s): avisa e a conferencia continua aberta', async (_caso, resposta, mensagem) => {
    const usuario = userEvent.setup()
    await abrir(
      rotasPadrao({
        'GET /vocabulario/termos/10/candidatas': { corpo: { itens: [{ curation_id: 501, status: 'aprovada', tipo_radiografia: null, trecho: 'pedra pulpar' }] } },
        'POST /vocabulario/termos/10/vincular': resposta,
      })
    )
    await usuario.click(within(cartaoDoTermo('Calcificação pulpar')).getByRole('button', { name: 'Conferir fichas para ligar' }))
    await usuario.click(await screen.findByRole('button', { name: 'Ligar 1 ficha(s) ao termo' }))
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
    expect(screen.getByRole('heading', { name: 'Fichas que mencionam "Calcificação pulpar"' })).toBeTruthy()
  })
})

/** o cartao (item da lista) de um termo oficial, achado pelo nome */
function cartaoDoTermo(nome: string): HTMLElement {
  return screen.getByText(nome, { selector: 'span' }).closest('li') as HTMLElement
}
