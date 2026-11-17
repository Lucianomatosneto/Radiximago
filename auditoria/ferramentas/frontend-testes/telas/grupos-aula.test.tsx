// @vitest-environment jsdom
//
// GRUPOS - "MODO AULA" (17/11/2026, Etapa 3).
// - tela "Preparar aula" (frontend/src/app/grupos/aula/page.tsx): quem pode,
//   imagem nao encontrada, sem grupos, marcacoes que comecam com as oficiais
//   (e "Voltar as oficiais"), destaques, mensagem, chave de comentarios e o
//   que vai ao servidor; erros;
// - atalho "Preparar aula para um grupo" (BotaoPrepararAula) so para quem cria grupos.
// Simulado: a ferramenta de marcacao (MarcadorAchado, teste proprio).
// Quem decide de verdade e o servidor (tests/test_grupos_modo_aula.py). Dados inventados.
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AulaGrupoPage from '../../../../frontend/src/app/grupos/aula/page'
import BotaoPrepararAula from '../../../../frontend/src/components/envios/BotaoPrepararAula'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/grupos/aula' }))
vi.mock('../../../../frontend/src/components/Sidebar', () => ({ default: () => <nav aria-label="menu lateral" /> }))
vi.mock('../../../../frontend/src/components/Topbar', () => ({ default: () => <header aria-label="barra do topo" /> }))
vi.mock('../../../../frontend/src/components/curadoria/MarcadorAchado', () => ({
  default: ({ marcacoes, onMarcar, urlImagem }: { marcacoes: { id: string }[]; onMarcar: (m: { id: string; tipo: string }[]) => void; urlImagem: string }) => (
    <div>
      <p>imagem: {urlImagem}</p>
      <p>marcacoes: {marcacoes.map((m) => m.id).join(',')}</p>
      <button type="button" onClick={() => onMarcar([...marcacoes, { id: 'nova', tipo: 'seta' }])}>desenhar seta</button>
    </div>
  ),
}))

const sessao = (perfil: string) => ({ id: 1, nome: 'Pessoa Teste', email: 'pessoa@exemplo.test', perfil, foto_perfil_url: null })
const OFICIAL = { id: 'm1', tipo: 'oval', x: 0.1, y: 0.1, largura: 0.2, altura: 0.2 }
const BASE = { curation_id: 42, tipo_radiografia: 'periapical', descricao_didatica: 'x', marcacoes: [OFICIAL], alteracoes_observadas: ['carie_dentina', 'lesao_periapical', 'valor_sem_traducao'] }
const GRUPOS = [{ id: 3, nome: 'Turma A' }, { id: 4, nome: 'Monitores' }]

function rotas(perfil = 'professor', extra: Record<string, Rota> = {}): Record<string, Rota> {
  return {
    'GET /auth/me': { corpo: sessao(perfil) },
    'GET /grupos/aula/imagem/42': { corpo: BASE },
    'GET /grupos': { corpo: { grupos: GRUPOS } },
    ...extra,
  }
}
async function abrir(extra: Record<string, Rota> = {}, perfil = 'professor', endereco = '?imagem=42') {
  window.history.replaceState({}, '', `/grupos/aula${endereco}`)
  const servidor = servidorFalso(rotas(perfil, extra))
  montarTela(<AulaGrupoPage />)
  await screen.findByRole('heading', { name: 'Preparar aula para um grupo' })
  return servidor
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

describe('quem pode e o que aparece', () => {
  it('sem sessao vai ao login', async () => {
    servidorFalso({ 'GET /auth/me': { status: 401 } })
    montarTela(<AulaGrupoPage />)
    expect(screen.getByText('Carregando...')).toBeTruthy()
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
  })

  it.each(['estudante', 'suporte'])('%s vai ao "acesso negado"', async (perfil) => {
    servidorFalso(rotas(perfil))
    montarTela(<AulaGrupoPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/acesso-negado?de=/grupos'))
  })

  it.each([
    ['sem o numero da imagem', '', {}],
    ['numero invalido', '?imagem=abc', {}],
    ['imagem nao aprovada (404)', '?imagem=42', { 'GET /grupos/aula/imagem/42': { status: 404 } as Rota }],
    ['sem conexao', '?imagem=42', { 'GET /grupos/aula/imagem/42': 'SEM_CONEXAO' as Rota }],
  ])('%s: avisa que a imagem nao foi encontrada', async (_n, endereco, extra) => {
    await abrir(extra, 'professor', endereco)
    expect((await screen.findByRole('alert')).textContent).toBe('Imagem não encontrada. Só imagens aprovadas e ativas podem ir para um grupo.')
  })

  it.each([
    ['nenhum grupo', { corpo: { grupos: [] } } as Rota],
    ['erro ao ler os grupos', { status: 500 } as Rota],
    ['resposta sem corpo', { status: 204 } as Rota],
  ])('%s: orienta a criar um grupo', async (_n, rota) => {
    await abrir({ 'GET /grupos': rota })
    expect(await screen.findByRole('link', { name: 'Criar um grupo' })).toBeTruthy()
  })

  it('mostra o aviso do modo aula, a imagem aprovada, as marcacoes oficiais e as alteracoes da ficha', async () => {
    await abrir()
    expect(await screen.findByText('Modo aula: o que você mudar aqui vale só para este envio. A ficha oficial da imagem não muda.')).toBeTruthy()
    expect(screen.getByText('imagem: http://api.teste/search/42/preview')).toBeTruthy()
    expect(screen.getByText('marcacoes: m1')).toBeTruthy()
    expect(screen.getByLabelText('Cárie em dentina')).toBeTruthy()
    expect(screen.getByLabelText('Lesão periapical')).toBeTruthy()
    expect(screen.getByLabelText('valor_sem_traducao')).toBeTruthy() // sem traducao: o proprio valor
    expect((screen.getByLabelText(/Participantes podem comentar/) as HTMLInputElement).checked).toBe(true)
  })

  it('ficha sem alteracoes: avisa que nao ha o que destacar; um grupo so ja vem escolhido', async () => {
    await abrir({ 'GET /grupos/aula/imagem/42': { corpo: { ...BASE, alteracoes_observadas: [] } }, 'GET /grupos': { corpo: { grupos: [GRUPOS[0]] } } })
    expect(await screen.findByText('A ficha desta imagem não tem alterações registradas para destacar.')).toBeTruthy()
    expect((screen.getByLabelText('Grupo') as HTMLSelectElement).value).toBe('3')
  })
})

describe('enviar', () => {
  it('manda o grupo escolhido, as marcacoes da aula, os destaques, a mensagem e a chave; depois confirma', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir({ 'POST /grupos/4/envios': { corpo: { id: 9 } } })
    await usuario.click(await screen.findByRole('button', { name: 'desenhar seta' }))
    await usuario.click(screen.getByLabelText('Lesão periapical'))
    await usuario.click(screen.getByLabelText('Cárie em dentina'))
    await usuario.click(screen.getByLabelText('Cárie em dentina')) // desmarca
    await usuario.type(screen.getByLabelText('Mensagem para o grupo'), 'Observem o ápice.')
    await usuario.click(screen.getByLabelText(/Participantes podem comentar/))
    await usuario.selectOptions(screen.getByLabelText('Grupo'), '4')
    await usuario.click(screen.getByRole('button', { name: 'Enviar ao grupo' }))
    expect((await screen.findByRole('status')).textContent).toContain('Imagem enviada ao grupo Monitores.')
    expect(screen.getByRole('link', { name: 'Ver em Grupos' }).getAttribute('href')).toBe('/grupos')
    expect(servidor.alteracoes()).toEqual([{
      metodo: 'POST', caminho: '/grupos/4/envios',
      corpo: { curation_id: 42, mensagem: 'Observem o ápice.', permite_comentar: false, marcacoes: [OFICIAL, { id: 'nova', tipo: 'seta' }], destaques: ['lesao_periapical'] },
    }])
  })

  it('"Voltar as marcacoes oficiais" desfaz o que foi desenhado', async () => {
    const usuario = userEvent.setup()
    await abrir()
    await usuario.click(await screen.findByRole('button', { name: 'desenhar seta' }))
    expect(screen.getByText('marcacoes: m1,nova')).toBeTruthy()
    await usuario.click(screen.getByRole('button', { name: 'Voltar às marcações oficiais' }))
    expect(screen.getByText('marcacoes: m1')).toBeTruthy()
  })

  it('sem grupo escolhido: avisa e nao envia', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir()
    await usuario.click(await screen.findByRole('button', { name: 'Enviar ao grupo' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Escolha o grupo que vai receber a imagem.')
    expect(servidor.alteracoes()).toEqual([])
  })

  it.each([
    ['motivo do servidor', { status: 409, corpo: { detail: 'Essa imagem já foi enviada a este grupo.' } } as Rota, 'Essa imagem já foi enviada a este grupo.'],
    ['sem motivo', { status: 500 } as Rota, 'Não foi possível enviar a imagem.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Sem conexão com o servidor. Tente de novo.'],
  ])('falha ao enviar (%s): avisa e mantem o formulario', async (_n, rota, mensagem) => {
    const usuario = userEvent.setup()
    await abrir({ 'POST /grupos/3/envios': rota })
    await usuario.selectOptions(await screen.findByLabelText('Grupo'), '3')
    await usuario.click(screen.getByRole('button', { name: 'Enviar ao grupo' }))
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
    expect(screen.getByRole('button', { name: 'Enviar ao grupo' })).toBeTruthy()
  })
})

describe('atalho "Preparar aula para um grupo"', () => {
  it.each([
    ['professor', true], ['pesquisador', true], ['curador', true], ['administrador', true], ['estudante', false], ['suporte', false],
  ])('%s: aparece = %s', async (perfil, aparece) => {
    const servidor = servidorFalso({ 'GET /auth/me': { corpo: sessao(perfil) } })
    montarTela(<BotaoPrepararAula curationId={42} />)
    await waitFor(() => expect(servidor.pedidos.map((p) => p.caminho)).toContain('/auth/me'))
    if (aparece) {
      expect((await screen.findByRole('link', { name: 'Preparar aula para um grupo' })).getAttribute('href')).toBe('/grupos/aula?imagem=42')
    } else {
      await new Promise((r) => setTimeout(r, 20))
      expect(screen.queryByRole('link')).toBeNull()
    }
  })
})
