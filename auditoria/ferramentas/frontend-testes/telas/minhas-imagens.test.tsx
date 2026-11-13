// @vitest-environment jsdom
//
// TELA "Minhas imagens" (frontend/src/app/minhas-imagens/page.tsx) - Fase 1.
// Grade das imagens salvas: selecionar, tirar da lista (com confirmacao),
// enviar por e-mail (com confirmacao e teto de 10), ver em sequencia e os
// icones de cada quadrado (marcacoes, "i" com a descricao, lupa).
// Ficam de fora (teste proprio / navegador): as miniaturas (imagem real do
// servidor), o visualizador em sequencia (OHIF) e a secao de envios.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MinhasImagensPage from '../../../../frontend/src/app/minhas-imagens/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/minhas-imagens' }))
vi.mock('../../../../frontend/src/components/Sidebar', () => ({ default: () => <nav aria-label="menu lateral" /> }))
vi.mock('../../../../frontend/src/components/Topbar', () => ({ default: () => <header aria-label="barra do topo" /> }))
vi.mock('../../../../frontend/src/components/envios/SecaoEnvios', () => ({
  default: ({ equipe }: { equipe: boolean }) => <section aria-label="meus envios">{equipe ? 'envios: equipe' : 'envios: pessoal'}</section>,
}))
vi.mock('../../../../frontend/src/components/MiniaturaImagem', () => ({
  // imagem "carregada" com proporcao 3:2 (as camadas de marcacao precisam dela)
  default: ({ alt, onProporcao }: { alt: string; onProporcao?: (r: number) => void }) => {
    onProporcao?.(1.5)
    return <img alt={alt} />
  },
}))
vi.mock('../../../../frontend/src/components/VisualizadorSequencial', () => ({
  default: ({ itens, onFechar }: { itens: { numero: number }[]; onFechar: () => void }) => (
    <div role="dialog" aria-label="visualizador em sequência">
      imagens {itens.map((i) => i.numero).join(',')}
      <button type="button" onClick={onFechar}>
        fechar visualizador
      </button>
    </div>
  ),
}))

// ---- dados inventados ----
const ESTUDANTE = { id: 9, nome: 'Estudante Teste', email: 'estudante@exemplo.test', perfil: 'estudante', foto_perfil_url: null }
function imagem(id: number, extra: object = {}) {
  return {
    curation_id: id,
    tipo_radiografia: 'periapical',
    achado_principal: 'carie',
    descricao_didatica: `Descrição didática da ficha ${id} (texto de teste).`,
    salvo_em: '2026-11-01T10:00:00Z',
    viewer_url: null,
    marcacoes: [],
    dentes: [36],
    ...extra,
  }
}
const MARCACAO = { tipo: 'circulo', x: 0.5, y: 0.5, raio: 0.1, rotulo: 'Lesão' }
const IMAGENS = [imagem(101, { marcacoes: [MARCACAO] }), imagem(102), imagem(103)]
const LISTA = 'GET /saved-images/'

function rotasPadrao(extra: Record<string, Rota> = {}): Record<string, Rota> {
  return {
    'GET /auth/me': { corpo: ESTUDANTE },
    [LISTA]: { corpo: { itens: IMAGENS } },
    'GET /search/101/serie-info': { corpo: { eh_serie: false } },
    'GET /search/102/serie-info': { corpo: { eh_serie: false } },
    'GET /search/103/serie-info': { corpo: { eh_serie: false } },
    ...extra,
  }
}
async function abrir(rotas: Record<string, Rota>) {
  const servidor = servidorFalso(rotas)
  montarTela(<MinhasImagensPage />)
  await screen.findByRole('heading', { level: 1, name: /Minhas\s+imagens/ })
  return servidor
}
const caixa = (n: number) => screen.getByRole('checkbox', { name: `Selecionar imagem #${n}` }) as HTMLInputElement
/** numeros (na grade) das imagens marcadas */
const marcadas = () =>
  screen.getAllByRole('checkbox', { name: /^Selecionar imagem #/ }).flatMap((c, n) => ((c as HTMLInputElement).checked ? [n + 1] : []))

beforeEach(() => vi.clearAllMocks())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('permissao por perfil e carregar', () => {
  it('sem login: vai para o login sem pedir a lista', async () => {
    const servidor = servidorFalso({ 'GET /auth/me': { status: 401 } })
    montarTela(<MinhasImagensPage />)
    expect(screen.getByText('Carregando...')).toBeTruthy()
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
    expect(servidor.pedidos.map((p) => p.caminho)).toEqual(['/auth/me'])
  })

  it.each([
    ['estudante', 'envios: pessoal'],
    ['curador', 'envios: equipe'],
    ['administrador', 'envios: equipe'],
    ['professor', 'envios: equipe'],
  ])('%s: entra e ve a sua lista (secao de envios: %s)', async (perfil, envios) => {
    await abrir(rotasPadrao({ 'GET /auth/me': { corpo: { ...ESTUDANTE, perfil } } }))
    expect(roteador.push).not.toHaveBeenCalled()
    expect(screen.getByRole('region', { name: 'meus envios' }).textContent).toBe(envios)
    expect(screen.getByText('3 imagens salvas')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Imagem 1' })).toBeTruthy()
    expect(screen.getByAltText('Descrição didática da ficha 103 (texto de teste).')).toBeTruthy()
  })

  it('lista vazia: convida a salvar imagens na Pesquisa avancada', async () => {
    await abrir(rotasPadrao({ [LISTA]: { corpo: { itens: [] } } }))
    expect(screen.getByText(/Você ainda não salvou nenhuma imagem/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Pesquisa avançada' }).getAttribute('href')).toBe('/pesquisa')
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it.each([
    ['recusa com motivo', { status: 500, corpo: { detail: 'Banco indisponível.' } }, 'Banco indisponível.'],
    ['sem conexao', 'SEM_CONEXAO' as const, 'Não foi possível carregar suas imagens salvas.'],
  ])('erro ao carregar (%s): mostra a mensagem', async (_caso, resposta, mensagem) => {
    await abrir(rotasPadrao({ [LISTA]: resposta }))
    expect(screen.getByRole('alert').textContent).toBe(mensagem)
  })

  it('sessao expirada (401) ao carregar a lista: vai para o login', async () => {
    servidorFalso(rotasPadrao({ [LISTA]: { status: 401 } }))
    montarTela(<MinhasImagensPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
  })
})

describe('selecao', () => {
  it('marcar, "Selecionar todas", "+10" e "Limpar selecao"', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao())
    expect(screen.queryByRole('button', { name: 'Limpar seleção' })).toBeNull()
    await usuario.click(caixa(2))
    expect(marcadas()).toEqual([2])
    expect(screen.getByRole('button', { name: /Ver 1 selecionada em sequência/ })).toBeTruthy()
    await usuario.click(screen.getByRole('button', { name: 'Selecionar todas (3)' }))
    expect(marcadas()).toEqual([1, 2, 3])
    expect(screen.getByRole('button', { name: /Ver 3 selecionadas em sequência/ })).toBeTruthy()
    await usuario.click(screen.getByRole('button', { name: 'Limpar seleção' }))
    expect(marcadas()).toEqual([])
    await usuario.click(screen.getByRole('button', { name: '+10' }))
    expect(marcadas()).toEqual([1, 2, 3])
  })

  it('"Selecionar mais" com um numero escolhido acrescenta so as que faltam', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao())
    await usuario.click(caixa(1))
    const campo = screen.getByRole('spinbutton', { name: 'Selecionar mais' })
    await usuario.clear(campo)
    await usuario.type(campo, '1')
    await usuario.click(screen.getByRole('button', { name: 'Selecionar mais' }))
    expect(marcadas()).toEqual([1, 2])
    await usuario.clear(campo)
    await usuario.type(campo, '0') // numero invalido: nada muda
    await usuario.click(screen.getByRole('button', { name: 'Selecionar mais' }))
    expect(marcadas()).toEqual([1, 2])
  })

  it('"Ver selecionadas" abre o visualizador so com as escolhidas, na numeracao da grade', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao())
    await usuario.click(caixa(1))
    await usuario.click(caixa(3))
    await usuario.click(screen.getByRole('button', { name: /Ver 2 selecionadas em sequência/ }))
    const visualizador = screen.getByRole('dialog', { name: 'visualizador em sequência' })
    expect(visualizador.textContent).toContain('imagens 1,3')
    await usuario.click(within(visualizador).getByRole('button', { name: 'fechar visualizador' }))
    expect(screen.queryByRole('dialog', { name: 'visualizador em sequência' })).toBeNull()
  })
})

describe('tirar da lista', () => {
  it('pede confirmacao; "Cancelar" nao apaga nada', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir(rotasPadrao())
    await usuario.click(caixa(1))
    await usuario.click(screen.getByRole('button', { name: 'Tirar da lista (1)' }))
    expect(screen.getByText(/Tirar 1 imagem de Minhas imagens\?/)).toBeTruthy()
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByText(/Tirar 1 imagem de Minhas imagens\?/)).toBeNull()
    expect(servidor.alteracoes()).toEqual([])
  })

  it('"Sim, tirar" apaga cada selecionada no servidor e some da grade', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir(rotasPadrao({
      'DELETE /saved-images/101': { status: 204 },
      'DELETE /saved-images/103': { status: 204 },
    }))
    await usuario.click(caixa(1))
    await usuario.click(caixa(3))
    await usuario.click(screen.getByRole('button', { name: 'Tirar da lista (2)' }))
    await usuario.click(screen.getByRole('button', { name: 'Sim, tirar' }))
    await waitFor(() => expect(screen.getByText('1 imagem salva')).toBeTruthy())
    expect(servidor.alteracoes().map((p) => `${p.metodo} ${p.caminho}`)).toEqual(['DELETE /saved-images/101', 'DELETE /saved-images/103'])
    expect(screen.getByAltText('Descrição didática da ficha 102 (texto de teste).')).toBeTruthy()
    expect(screen.queryByAltText('Descrição didática da ficha 101 (texto de teste).')).toBeNull()
  })

  it('se o servidor recusar a 2a, a 1a sai, a 2a fica marcada e o motivo aparece', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao({
      'DELETE /saved-images/101': { status: 204 },
      'DELETE /saved-images/102': { status: 403, corpo: { detail: 'Imagem bloqueada.' } },
    }))
    await usuario.click(screen.getByRole('button', { name: 'Selecionar todas (3)' }))
    await usuario.click(screen.getByRole('button', { name: 'Tirar da lista (3)' }))
    await usuario.click(screen.getByRole('button', { name: 'Sim, tirar' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Imagem bloqueada.')
    expect(screen.getByText('2 imagens salvas')).toBeTruthy()
    expect(marcadas()).toEqual([1, 2]) // as que sobraram (102 e 103) continuam marcadas
  })

  it('sem conexao ao apagar: avisa e nada sai da grade', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao({ 'DELETE /saved-images/101': 'SEM_CONEXAO' }))
    await usuario.click(caixa(1))
    await usuario.click(screen.getByRole('button', { name: 'Tirar da lista (1)' }))
    await usuario.click(screen.getByRole('button', { name: 'Sim, tirar' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Não foi possível remover a imagem.')
    expect(screen.getByText('3 imagens salvas')).toBeTruthy()
  })
})

describe('enviar por e-mail', () => {
  async function pedirEnvio(usuario: ReturnType<typeof userEvent.setup>, quantidade: number) {
    await usuario.click(screen.getByRole('button', { name: /✉ E-mail/ }))
    await usuario.click(await screen.findByRole('button', { name: `✉ Enviar ${quantidade} selecionadas por e-mail` }))
  }

  it('pede confirmacao e envia as selecionadas; mostra a mensagem do servidor', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir(rotasPadrao({ 'POST /search/send-email-lote': { corpo: { mensagem: '2 imagens enviadas para o seu e-mail.' } } }))
    await usuario.click(caixa(1))
    await usuario.click(caixa(2))
    await waitFor(() => expect(servidor.pedidos.filter((p) => p.caminho.endsWith('/serie-info'))).toHaveLength(2))
    await pedirEnvio(usuario, 2)
    const quadro = await screen.findByRole('alertdialog', { name: 'Enviar por e-mail?' })
    expect(quadro.textContent).toContain('As 2 imagens selecionadas vão para o e-mail cadastrado')
    await usuario.click(within(quadro).getByRole('button', { name: 'Sim, enviar' }))
    expect(await screen.findByText('2 imagens enviadas para o seu e-mail.')).toBeTruthy()
    expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: '/search/send-email-lote', corpo: { curation_ids: [101, 102] } }])
  })

  it('"Cancelar" na confirmacao nao envia', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir(rotasPadrao())
    await usuario.click(caixa(1))
    await usuario.click(caixa(2))
    await waitFor(() => expect(servidor.pedidos.filter((p) => p.caminho.endsWith('/serie-info'))).toHaveLength(2))
    await pedirEnvio(usuario, 2)
    await usuario.click(within(await screen.findByRole('alertdialog', { name: 'Enviar por e-mail?' })).getAllByRole('button', { name: 'Cancelar' })[1])
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(servidor.alteracoes()).toEqual([])
  })

  it.each([
    ['recusa com motivo', { status: 429, corpo: { detail: 'Limite de envios atingido.' } }, 'Limite de envios atingido.'],
    ['sem conexao', 'SEM_CONEXAO' as const, 'Não foi possível enviar as imagens por e-mail.'],
  ])('erro ao enviar (%s): mostra a mensagem', async (_caso, resposta, mensagem) => {
    const usuario = userEvent.setup()
    const servidor = await abrir(rotasPadrao({ 'POST /search/send-email-lote': resposta }))
    await usuario.click(caixa(1))
    await usuario.click(caixa(2))
    await waitFor(() => expect(servidor.pedidos.filter((p) => p.caminho.endsWith('/serie-info'))).toHaveLength(2))
    await pedirEnvio(usuario, 2)
    await usuario.click(within(await screen.findByRole('alertdialog', { name: 'Enviar por e-mail?' })).getByRole('button', { name: 'Sim, enviar' }))
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
  })

  it('tomografia (serie de cortes) selecionada: avisa e nao oferece o envio das selecionadas', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao({ 'GET /search/102/serie-info': { corpo: { eh_serie: true } } }))
    await usuario.click(caixa(2))
    expect(await screen.findByText(/fazem parte de uma série com vários cortes/)).toBeTruthy()
    await usuario.click(screen.getByRole('button', { name: /✉ E-mail/ }))
    expect(screen.queryByRole('button', { name: /✉ Enviar .* por e-mail/ })).toBeNull()
  })

  it('mais de 10 selecionadas: recusa antes de perguntar (mesmo teto do servidor)', async () => {
    const usuario = userEvent.setup()
    const muitas = Array.from({ length: 11 }, (_, n) => imagem(200 + n))
    const rotas = rotasPadrao({ [LISTA]: { corpo: { itens: muitas } } })
    muitas.forEach((m) => (rotas[`GET /search/${m.curation_id}/serie-info`] = { corpo: { eh_serie: false } }))
    const servidor = await abrir(rotas)
    await usuario.click(screen.getByRole('button', { name: 'Selecionar todas (11)' }))
    await waitFor(() => expect(servidor.pedidos.filter((p) => p.caminho.endsWith('/serie-info'))).toHaveLength(11))
    await pedirEnvio(usuario, 11)
    expect((await screen.findByRole('alert')).textContent).toBe('Envie no máximo 10 imagens por e-mail. Desmarque algumas e tente de novo.')
    expect(screen.queryByRole('alertdialog', { name: 'Enviar por e-mail?' })).toBeNull()
    expect(servidor.alteracoes()).toEqual([])
  })
})

describe('icones de cada quadrado', () => {
  it('marcacoes: so a imagem que tem marcacao liga o botao; ligado, aparece o holofote', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao())
    const comMarcacao = screen.getByTitle('Mostrar a marcação do curador na imagem') as HTMLButtonElement
    expect(comMarcacao.disabled).toBe(false)
    // sem marcacao: botao travado (o portugues trata 0 como singular: "0 marcação")
    expect(screen.getAllByTitle('0 marcação do curador').every((b) => (b as HTMLButtonElement).disabled)).toBe(true)
    expect(screen.queryByRole('button', { name: /^Holofote/ })).toBeNull()
    await usuario.click(comMarcacao)
    expect(comMarcacao.getAttribute('aria-pressed')).toBe('true')
    expect(comMarcacao.title).toBe('Esconder as marcações do curador')
    const holofote = screen.getByRole('button', { name: 'Holofote: escurecer a imagem fora da marcação em destaque' })
    await usuario.click(holofote)
    expect(screen.getByRole('button', { name: 'Desligar o holofote' })).toBeTruthy()
  })

  it('"i": clique fixa a descricao da imagem por cima do quadrado; outro clique fecha', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao())
    const [info] = screen.getAllByRole('button', { name: 'Clique para abrir as informações da imagem' })
    await usuario.click(info)
    const descricao = await screen.findByRole('tooltip')
    expect(descricao.textContent).toContain('Curadoria da imagem #1')
    expect(descricao.textContent).toContain('Descrição didática da ficha 101 (texto de teste).')
    await usuario.click(screen.getByRole('button', { name: 'Clique para fechar as informações da imagem' }))
    await usuario.unhover(screen.getAllByRole('button', { name: 'Clique para abrir as informações da imagem' })[0])
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('lupa: mouse em cima amplia; clique alterna; sair do quadrado volta ao normal', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao())
    const [lupa] = screen.getAllByRole('button', { name: 'Passe o mouse para ampliar a imagem' })
    await usuario.hover(lupa)
    expect(lupa.getAttribute('aria-pressed')).toBe('true')
    await usuario.click(lupa) // ja ampliado: o clique desfaz
    expect(lupa.getAttribute('aria-pressed')).toBe('false')
    await usuario.click(lupa)
    expect(lupa.getAttribute('aria-pressed')).toBe('true')
    await usuario.unhover(lupa.closest('[data-cartao-imagem]') as HTMLElement)
    expect(lupa.getAttribute('aria-pressed')).toBe('false')
  })
})
