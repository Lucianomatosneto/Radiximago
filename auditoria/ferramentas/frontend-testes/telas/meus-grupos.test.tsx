// @vitest-environment jsdom
//
// ABA "Grupos de que participo" da tela Grupos (frontend/src/app/grupos/page.tsx
// + components/grupos/GruposParticipo.tsx). Ate 22/11/2026 era a tela "Meus
// grupos" (/meus-grupos, que agora abre esta aba). Confere:
// - todos os perfis veem convites recebidos e grupos de que participam;
// - so o estudante ve "Procurar grupo" e "Pedidos enviados" (D7);
// - aceitar/recusar convite, pedir para entrar, desistir e sair (com
//   confirmacao) mandam o pedido certo ao servidor, avisam e pedem ao menu
//   para recontar;
// - a busca exige 3 letras e mostra so o nome do grupo e quem o criou (D2);
// - os erros (motivo do servidor, padrao, sem conexao) aparecem.
// Quem decide de verdade e o servidor (tests/test_grupos_entrada_consentida.py).
// Dados inventados.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GruposPage from '../../../../frontend/src/app/grupos/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/grupos' }))
// a outra aba (grupos que criei) tem teste proprio (grupos.test.tsx)
vi.mock('../../../../frontend/src/components/grupos/GruposCriados', () => ({ default: () => <p>grupos que criei</p> }))
vi.mock('../../../../frontend/src/components/Sidebar', () => ({ default: () => <nav aria-label="menu lateral" /> }))
vi.mock('../../../../frontend/src/components/Topbar', () => ({ default: () => <header aria-label="barra do topo" /> }))
vi.mock('../../../../frontend/src/components/envios/ImagensGrupoParticipante', () => ({
  default: ({ grupoId, aoVer }: { grupoId: number; aoVer?: () => void }) => (
    <p>imagens do grupo {grupoId} <button type="button" onClick={aoVer}>simular imagens vistas</button></p>
  ),
}))

const sessao = (perfil: string) => ({ id: 1, nome: 'Pessoa Teste', email: 'pessoa@exemplo.test', perfil, foto_perfil_url: null })
const CONVITES = [{ id: 7, grupo: { id: 3, nome: 'Turma A' }, convidado_por: 'Prof. Silva', criado_em: '2026-11-17T10:00:00+00:00' }]
const PARTICIPO = [{ id: 4, nome: 'Monitores', criador: 'Prof. Souza', entrou_em: '2026-11-10T10:00:00+00:00', imagens_novas: 2 }]
const PEDIDOS = [{ id: 9, grupo: { id: 5, nome: 'Radiologia II' }, criador: 'Prof. Lima', criado_em: '2026-11-16T10:00:00+00:00' }]
const ACHADOS = [
  { id: 20, nome: 'Radiologia I', criador: 'Prof. Lima', situacao: null },
  { id: 5, nome: 'Radiologia II', criador: 'Prof. Lima', situacao: 'pedido_pendente' },
  { id: 3, nome: 'Radiologia III', criador: 'Prof. Silva', situacao: 'convite_pendente' },
  { id: 4, nome: 'Radiologia IV', criador: 'Prof. Souza', situacao: 'participa' },
]

function rotasPadrao(perfil: string, extra: Record<string, Rota> = {}): Record<string, Rota> {
  return {
    'GET /auth/me': { corpo: sessao(perfil) },
    'GET /grupos/convites-recebidos': { corpo: { convites: CONVITES } },
    'GET /grupos/participo': { corpo: { grupos: PARTICIPO } },
    'GET /grupos/pedidos-enviados': { corpo: { pedidos: PEDIDOS } },
    'GET /grupos/procurar?*': { corpo: { grupos: ACHADOS } },
    'GET /grupos/pendencias': { corpo: { convites: 1, pedidos: 0, imagens_novas: 2 } },
    ...extra,
  }
}
async function abrir(perfil = 'estudante', extra: Record<string, Rota> = {}) {
  const servidor = servidorFalso(rotasPadrao(perfil, extra))
  window.history.replaceState(null, '', '/grupos?aba=participo')
  montarTela(<GruposPage />)
  await screen.findByRole('heading', { level: 1, name: 'Grupos' })
  await screen.findByRole('region', { name: 'Convites recebidos' })
  return servidor
}
const secao = (nome: string) => screen.getByRole('region', { name: nome })
async function procurar(usuario: ReturnType<typeof userEvent.setup>, texto: string) {
  await usuario.type(screen.getByLabelText('Nome do grupo'), texto)
  await usuario.click(screen.getByRole('button', { name: 'Procurar' }))
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

describe('o que cada perfil ve', () => {
  it('sem sessao vai ao login (antes mostra "Carregando...")', async () => {
    servidorFalso({ 'GET /auth/me': { status: 401 } })
    montarTela(<GruposPage />)
    expect(screen.getByText('Carregando...')).toBeTruthy()
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
  })

  // o endereco antigo /meus-grupos e redirecionado pelo next.config.mjs
  // (teste: backend/tests/test_grupos_e_envio_a_pessoas.py)

  it('quem cria grupos ve as duas abas, com o numero de pendencias; trocar de aba mostra a outra', async () => {
    const usuario = userEvent.setup()
    await abrir('professor')
    expect(screen.getByRole('tab', { name: /Grupos de que participo/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: /Grupos de que participo/ }).textContent).toContain('3')
    await usuario.click(screen.getByRole('tab', { name: /Grupos que criei/ }))
    expect(screen.getByText('grupos que criei')).toBeTruthy()
    expect(window.location.search).toBe('')
  })

  it('estudante nao ve abas (so participa de grupos)', async () => {
    await abrir('estudante')
    expect(screen.queryByRole('tab')).toBeNull()
  })

  it('estudante: convites, procurar, pedidos enviados e grupos de que participa', async () => {
    const servidor = await abrir('estudante')
    await waitFor(() => expect(within(secao('Convites recebidos')).getByText('Turma A')).toBeTruthy())
    expect(secao('Convites recebidos').textContent).toContain('Convite de Prof. Silva')
    expect(secao('Procurar grupo')).toBeTruthy()
    expect(within(secao('Pedidos enviados')).getByText('Radiologia II')).toBeTruthy()
    const participo = secao('Grupos de que participo')
    expect(within(participo).getByText('Monitores')).toBeTruthy()
    expect(participo.textContent).toContain('Criado por Prof. Souza')
    expect(participo.textContent).toContain('Entrou em 10/11/2026')
    expect(servidor.pedidos.map((p) => p.caminho)).toContain('/grupos/pedidos-enviados')
  })

  it.each(['professor', 'pesquisador', 'curador', 'administrador', 'suporte'])(
    '%s: so convites e grupos de que participa (nao procura nem pede)', async (perfil) => {
      const servidor = await abrir(perfil)
      await waitFor(() => expect(within(secao('Convites recebidos')).getByText('Turma A')).toBeTruthy())
      expect(screen.queryByRole('region', { name: 'Procurar grupo' })).toBeNull()
      expect(screen.queryByRole('region', { name: 'Pedidos enviados' })).toBeNull()
      expect(servidor.pedidos.map((p) => p.caminho)).not.toContain('/grupos/pedidos-enviados')
    })

  it.each([
    ['listas vazias', { corpo: { convites: [] } } as Rota, { corpo: { grupos: [] } } as Rota],
    ['erro do servidor', { status: 500 } as Rota, { status: 500 } as Rota],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'SEM_CONEXAO' as Rota],
    ['resposta sem corpo', { status: 204 } as Rota, { status: 204 } as Rota],
  ])('%s: avisa que nao ha convites nem grupos', async (_n, convites, participo) => {
    await abrir('estudante', {
      'GET /grupos/convites-recebidos': convites,
      'GET /grupos/participo': participo,
      'GET /grupos/pedidos-enviados': { corpo: { pedidos: [] } },
    })
    expect(await screen.findByText('Nenhum convite esperando resposta.')).toBeTruthy()
    expect(screen.getByText('Você ainda não participa de nenhum grupo.')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Pedidos enviados' })).toBeNull()
  })
})

describe('convites e saida', () => {
  it.each([
    ['Aceitar o convite do grupo Turma A', '/grupos/convites-recebidos/7/aceitar', 'Convite aceito: você agora participa do grupo.'],
    ['Recusar o convite do grupo Turma A', '/grupos/convites-recebidos/7/recusar', 'Convite recusado.'],
  ])('"%s": chama o servidor, avisa, recarrega e pede ao menu para recontar', async (botao, caminho, mensagem) => {
    const usuario = userEvent.setup()
    const servidor = await abrir('professor', { [`POST ${caminho}`]: { corpo: {} } })
    const recontar = vi.fn()
    window.addEventListener('radix-grupos-mudou', recontar)
    await usuario.click(await screen.findByRole('button', { name: botao }))
    expect((await screen.findByRole('status')).textContent).toBe(mensagem)
    expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho, corpo: undefined }])
    expect(recontar).toHaveBeenCalled()
    window.removeEventListener('radix-grupos-mudou', recontar)
    await waitFor(() => expect(servidor.pedidos.filter((p) => p.caminho === '/grupos/convites-recebidos')).toHaveLength(2))
  })

  it('sair pede confirmacao com o nome do grupo; "Cancelar" nao sai; "Sim, sair" sai', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir('estudante', { 'DELETE /grupos/participo/4': { corpo: {} } })
    await usuario.click(await screen.findByRole('button', { name: 'Sair do grupo Monitores' }))
    const pergunta = screen.getByRole('alertdialog')
    expect(pergunta.textContent).toContain('Sair do grupo Monitores?')
    await usuario.click(within(pergunta).getByText('Cancelar', { selector: 'button[data-acao="cancelar"]' }))
    expect(servidor.alteracoes()).toEqual([])
    await usuario.click(screen.getByRole('button', { name: 'Sair do grupo Monitores' }))
    await usuario.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Sim, sair' }))
    expect((await screen.findByRole('status')).textContent).toBe('Você saiu do grupo.')
    expect(servidor.alteracoes()).toEqual([{ metodo: 'DELETE', caminho: '/grupos/participo/4', corpo: undefined }])
  })

  it.each([
    ['motivo do servidor', { status: 404, corpo: { detail: 'Convite ou pedido não encontrado (pode ter vencido).' } } as Rota,
      'Convite ou pedido não encontrado (pode ter vencido).'],
    ['sem motivo', { status: 500 } as Rota, 'Não foi possível concluir. Tente de novo.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Sem conexão com o servidor. Tente de novo.'],
  ])('falha ao aceitar (%s): avisa', async (_n, rota, mensagem) => {
    const usuario = userEvent.setup()
    await abrir('estudante', { 'POST /grupos/convites-recebidos/7/aceitar': rota })
    await usuario.click(await screen.findByRole('button', { name: 'Aceitar o convite do grupo Turma A' }))
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
  })
})

describe('procurar e pedir (so estudante)', () => {
  it('menos de 3 letras: avisa e nao pergunta ao servidor', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir()
    await procurar(usuario, ' ab ')
    expect((await screen.findByRole('alert')).textContent).toBe('Digite pelo menos 3 letras.')
    expect(servidor.pedidos.some((p) => p.caminho.startsWith('/grupos/procurar'))).toBe(false)
  })

  it('mostra so o nome e quem criou, e a situacao de cada grupo', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir()
    await procurar(usuario, 'Radio logia')
    const lista = await screen.findByRole('list', { name: 'Procurar grupo' })
    expect(servidor.pedidos.map((p) => p.caminho)).toContain('/grupos/procurar?nome=Radio%20logia')
    const itens = within(lista).getAllByRole('listitem')
    expect(itens).toHaveLength(4)
    expect(itens[0].textContent).toContain('Radiologia I · Criado por Prof. Lima')
    expect(within(itens[0]).getByRole('button', { name: 'Pedir para entrar no grupo Radiologia I' })).toBeTruthy()
    expect(itens[1].textContent).toContain('Pedido enviado, aguardando o dono do grupo')
    expect(itens[2].textContent).toContain('Você tem um convite deste grupo (veja acima)')
    expect(itens[3].textContent).toContain('Você já participa')
    expect(within(itens[3]).queryByRole('button')).toBeNull()
  })

  it('nenhum grupo encontrado', async () => {
    const usuario = userEvent.setup()
    await abrir('estudante', { 'GET /grupos/procurar?*': { corpo: { grupos: [] } } })
    await procurar(usuario, 'xyz')
    expect(await screen.findByText('Nenhum grupo encontrado com esse nome.')).toBeTruthy()
    // pedido do video (22/11): diz por que a turma pode nao aparecer
    expect(screen.getByText(/Só aparecem os grupos que o dono deixou abertos a pedidos/)).toBeTruthy()
  })

  it.each([
    ['limite por minuto', { status: 429, corpo: { detail: 'Muitas buscas seguidas. Espere um minuto.' } } as Rota, 'Muitas buscas seguidas. Espere um minuto.'],
    ['sem motivo', { status: 500 } as Rota, 'Não foi possível concluir. Tente de novo.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Sem conexão com o servidor. Tente de novo.'],
  ])('falha na busca (%s): avisa', async (_n, rota, mensagem) => {
    const usuario = userEvent.setup()
    await abrir('estudante', { 'GET /grupos/procurar?*': rota })
    await procurar(usuario, 'Radiologia')
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
  })

  it.each([
    ['pedido_pendente', 'Pedido enviado, aguardando o dono do grupo.'],
    ['participa', 'Você já tinha um convite deste grupo: agora participa dele.'],
  ])('pedir para entrar (servidor responde %s): avisa e refaz a busca', async (situacao, mensagem) => {
    const usuario = userEvent.setup()
    const servidor = await abrir('estudante', { 'POST /grupos/20/pedir': { corpo: { situacao } } })
    await procurar(usuario, 'Radiologia')
    await usuario.click(await screen.findByRole('button', { name: 'Pedir para entrar no grupo Radiologia I' }))
    expect((await screen.findByRole('status')).textContent).toBe(mensagem)
    expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: '/grupos/20/pedir', corpo: undefined }])
    await waitFor(() => expect(servidor.pedidos.filter((p) => p.caminho.startsWith('/grupos/procurar'))).toHaveLength(2))
  })

  it('desistir do pedido', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir('estudante', { 'DELETE /grupos/pedidos-enviados/9': { status: 204 } })
    await usuario.click(await screen.findByRole('button', { name: 'Desistir do pedido para o grupo Radiologia II' }))
    expect((await screen.findByRole('status')).textContent).toBe('Pedido cancelado.')
    expect(servidor.alteracoes()).toEqual([{ metodo: 'DELETE', caminho: '/grupos/pedidos-enviados/9', corpo: undefined }])
  })
})

describe('imagens do grupo (Etapa 3)', () => {
  it('"Ver imagens" abre e fecha as imagens do grupo', async () => {
    const usuario = userEvent.setup()
    await abrir('estudante')
    const botao = await screen.findByRole('button', { name: 'Ver as imagens do grupo Monitores' })
    await usuario.click(botao)
    expect(screen.getByText(/imagens do grupo 4/)).toBeTruthy()
    expect(botao.getAttribute('aria-expanded')).toBe('true')
    await usuario.click(botao)
    expect(screen.queryByText(/imagens do grupo 4/)).toBeNull()
  })

  it('mostra quantas imagens novas chegaram e recarrega a lista depois que a pessoa ve as imagens', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir('estudante')
    expect(await within(secao('Grupos de que participo')).findByText('2 imagens novas')).toBeTruthy()
    await usuario.click(screen.getByRole('button', { name: 'Ver as imagens do grupo Monitores' }))
    await usuario.click(screen.getByRole('button', { name: 'simular imagens vistas' }))
    await waitFor(() => expect(servidor.pedidos.filter((p) => p.caminho === '/grupos/participo')).toHaveLength(2))
  })
})
