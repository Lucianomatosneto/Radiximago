// @vitest-environment jsdom
//
// TELA "Relatorios e indicadores" (frontend/src/app/relatorios/page.tsx) - Fase 3b.
// Quem ve (administrador e curador), carregando, erros (motivo do servidor,
// sem conexao, sessao vencida), cartoes (o administrador ve tambem os
// usuarios), tabelas com porcentagem e rotulos traduzidos (inclusive valores
// desconhecidos e "nao informado"), nomes dos curadores e o cartao pessoal
// do curador (so a posicao dele, sem os colegas). 18/11/2026: so o
// administrador ve os nomes em "Fichas por curador"; o curador ve "Curador 1",
// "Curador 2"... (o servidor ja manda sem nomes). Dados inventados.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RelatoriosPage from '../../../../frontend/src/app/relatorios/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/relatorios' }))
vi.mock('../../../../frontend/src/components/Sidebar', () => ({ default: () => <nav aria-label="menu lateral" /> }))
vi.mock('../../../../frontend/src/components/Topbar', () => ({ default: () => <header aria-label="barra do topo" /> }))

const sessao = (perfil: string) => ({ id: 1, nome: 'Pessoa Teste', email: 'pessoa@exemplo.test', perfil, foto_perfil_url: null })
const STATS = {
  total_imagens_orthanc: 120,
  total_fichas_curadoria: 40,
  usuarios_ativos: 15,
  usuarios_bloqueados: 2,
  por_status: { aprovada: 30, pendente: 10 },
  por_tipo_radiografia: { panoramica: 30, cefalometrica: 5, nao_informado: 5 },
  por_achado: { carie_esmalte: 10, sem_alteracoes: 8, carie: 4, desconhecido_x: 2, nao_informado: 1 },
  por_qualidade_tecnica: {},
  por_curador: { '7': 25, '8': 10, '9': 4, nao_informado: 1 },
  nomes_curadores: { '7': 'Curadora Sete' },
}
function rotasPadrao(perfil: string, extra: Record<string, Rota> = {}): Record<string, Rota> {
  return {
    'GET /auth/me': { corpo: sessao(perfil) },
    'GET /admin/stats': { corpo: STATS },
    'GET /users/': { corpo: [{ id: 8, nome: 'Curador Oito' }] },
    'GET /curation/minhas-estatisticas': { corpo: { aprovadas_no_mes: 12, curadorias_no_mes: 15, posicao_ranking: 2, total_curadores: 5 } },
    ...extra,
  }
}
async function abrir(perfil: string, extra: Record<string, Rota> = {}) {
  const servidor = servidorFalso(rotasPadrao(perfil, extra))
  montarTela(<RelatoriosPage />)
  await screen.findByRole('heading', { name: 'Relatórios e indicadores' })
  return servidor
}
const tabela = (titulo: string) => screen.getByRole('heading', { name: titulo }).closest('section') as HTMLElement
const valorDoCartao = (rotulo: string) => screen.getByText(rotulo).nextElementSibling?.textContent

beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

describe('quem pode ver', () => {
  it('sem sessao vai ao login (antes mostra "Carregando...")', async () => {
    servidorFalso({ 'GET /auth/me': { status: 401 } })
    montarTela(<RelatoriosPage />)
    expect(screen.getByText('Carregando...')).toBeTruthy()
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
  })

  it.each(['estudante', 'professor', 'suporte'])('%s vai ao "acesso negado" sem buscar os numeros', async (perfil) => {
    const servidor = servidorFalso(rotasPadrao(perfil))
    montarTela(<RelatoriosPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/acesso-negado?de=/relatorios'))
    expect(servidor.pedidos.map((p) => p.caminho)).toEqual(['/auth/me'])
  })

  it('administrador: 4 cartoes (com usuarios) e sem o cartao pessoal de curador', async () => {
    await abrir('administrador')
    expect(valorDoCartao('Total de imagens')).toBe('120')
    expect(valorDoCartao('Total de fichas')).toBe('40')
    expect(valorDoCartao('Usuários ativos')).toBe('15')
    expect(valorDoCartao('Usuários bloqueados')).toBe('2')
    expect(screen.queryByText('Minhas estatísticas (mês atual)')).toBeNull()
  })

  it('curador: sem os cartoes de usuarios; ve a propria posicao, sem os colegas', async () => {
    await abrir('curador')
    expect(screen.queryByText('Usuários ativos')).toBeNull()
    const meu = screen.getByText('Minhas estatísticas (mês atual)').closest('section') as HTMLElement
    expect(within(meu).getByText('12')).toBeTruthy()
    expect(within(meu).getByText('2º de 5')).toBeTruthy()
  })

  it('curador sem curadorias no mes', async () => {
    await abrir('curador', { 'GET /curation/minhas-estatisticas': { corpo: { aprovadas_no_mes: 0, curadorias_no_mes: 0, posicao_ranking: null, total_curadores: 5 } } })
    expect(screen.getByText('Sem curadorias este mês')).toBeTruthy()
  })
})

describe('tabelas', () => {
  it('status, tipo e qualidade: porcentagem, ordem e rotulos; tabela sem dados avisa', async () => {
    await abrir('administrador')
    expect(tabela('Fichas por status').textContent).toContain('30 (75%)')
    expect(tabela('Fichas por status').textContent).toContain('10 (25%)')
    const tipos = tabela('Fichas por tipo de radiografia').textContent ?? ''
    expect(tipos).toContain('Panorâmica30 (75%)')
    expect(tipos).toContain('cefalometrica5 (13%)') // valor fora da lista aparece como veio
    expect(tipos).toContain('Não informado5 (13%)')
    expect(within(tabela('Fichas por qualidade técnica')).getByText('Sem dados.')).toBeTruthy()
  })

  it('achados: porcentagem sobre o total de fichas e rotulos de cada origem', async () => {
    await abrir('administrador')
    const achados = tabela('Fichas por achado (alterações observadas)').textContent ?? ''
    expect(achados).toContain('Cárie em esmalte10 (25%)') // item de "alteracoes observadas"
    expect(achados).toContain('Sem alterações8 (20%)')
    expect(achados).toContain('Cárie4 (10%)') // achado principal antigo
    expect(achados).toContain('desconhecido_x2 (5%)')
    expect(achados).toContain('Não informado1 (3%)')
  })

  it('curadores: nome vindo dos numeros, da lista de usuarios, "Usuário #" e "sem curador"', async () => {
    await abrir('administrador')
    const curadores = tabela('Fichas por curador').textContent ?? ''
    expect(curadores).toContain('Curadora Sete25')
    expect(curadores).toContain('Curador Oito10')
    expect(curadores).toContain('Usuário #94')
    expect(curadores).toContain('Sem curador atribuído1')
  })

  it('lista de usuarios e cartao pessoal que falham: a tela segue com o resto', async () => {
    await abrir('administrador', { 'GET /users/': { status: 403 }, 'GET /curation/minhas-estatisticas': { status: 500 } })
    expect(tabela('Fichas por curador').textContent).toContain('Usuário #810')
    expect(screen.queryByText('Minhas estatísticas (mês atual)')).toBeNull()
  })

  it('curador: ranking so com a posicao (Curador 1, 2, 3), sem nomes, e aviso de privacidade', async () => {
    const servidor = await abrir('curador', {
      'GET /admin/stats': { corpo: { ...STATS, por_curador: { curador_1: 25, curador_2: 10, curador_3: 4, nao_informado: 1 }, nomes_curadores: {} } },
    })
    const curadores = tabela('Fichas por curador')
    const texto = curadores.textContent ?? ''
    expect(texto).toContain('Curador 125')
    expect(texto).toContain('Curador 210')
    expect(texto).toContain('Curador 34')
    expect(texto).toContain('Sem curador atribuído1')
    expect(within(curadores).getByText('Ranking geral sem nomes e sem instituições: só a administração do Rádix vê quem é cada curador.')).toBeTruthy()
    // sem nome, a tela nem pede a lista de usuarios
    expect(servidor.pedidos.map((p) => p.caminho)).not.toContain('/users/')
  })

  it('administrador nao ve o aviso de ranking sem nomes', async () => {
    await abrir('administrador')
    expect(screen.queryByText(/Ranking geral sem nomes/)).toBeNull()
  })
})

describe('erros', () => {
  it.each([
    ['motivo do servidor', { status: 503, corpo: { detail: 'Banco em manutenção.' } } as Rota, 'Banco em manutenção.'],
    ['sem motivo', { status: 500, corpo: {} } as Rota, 'Não foi possível carregar os indicadores.'],
  ])('%s: mostra o aviso e nenhum numero', async (_n, rota, mensagem) => {
    await abrir('administrador', { 'GET /admin/stats': rota })
    expect(screen.getByRole('alert').textContent).toBe(mensagem)
    expect(screen.queryByText('Total de imagens')).toBeNull()
  })

  it('sem conexao: aviso padrao', async () => {
    await abrir('administrador', { 'GET /admin/stats': 'SEM_CONEXAO' })
    expect(screen.getByRole('alert').textContent).toBe('Não foi possível carregar os indicadores.')
  })

  it.each([
    ['numeros', 'GET /admin/stats'],
    ['usuarios', 'GET /users/'],
  ])('sessao vencida (%s): vai ao login', async (_n, rota) => {
    servidorFalso(rotasPadrao('administrador', { [rota]: { status: 401 } }))
    montarTela(<RelatoriosPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
  })
})

// PEDIDO DO VIDEO (22/11/2026, B1): o curador ve o PROPRIO nome na linha
// dele (os colegas continuam "Curador 1, 2, 3"), os dados dele ("Meus dados")
// e os totais aguardando curadoria e curados; o administrador ve cada
// curador separado por situacao.
describe('meus dados e cada curador', () => {
  const IMAGENS = { total: 120, aguardando_curadoria: 35, por_situacao: { aprovada: 30, sem_ficha: 25 }, desativadas: 0 }
  const COMO_CURADOR = {
    ...STATS,
    imagens: IMAGENS,
    por_curador: { curador_1: 25, curador_2: 10, curador_3: 4 },
    nomes_curadores: { curador_2: 'Pessoa Teste' },
    minha_chave: 'curador_2',
    por_curador_detalhe: {},
  }
  const MINHAS = {
    aprovadas_no_mes: 3,
    curadorias_no_mes: 4,
    posicao_ranking: 2,
    total_curadores: 3,
    minhas_fichas_total: 10,
    minhas_por_status: { aprovada: 7, em_analise: 2, segunda_opiniao: 1 },
  }

  it('curador: a propria linha com o nome e "(você)"; os outros so pela posicao', async () => {
    await abrir('curador', { 'GET /admin/stats': { corpo: COMO_CURADOR }, 'GET /curation/minhas-estatisticas': { corpo: MINHAS } })
    const texto = tabela('Fichas por curador').textContent ?? ''
    expect(texto).toContain('Curador 125')
    expect(texto).toContain('Pessoa Teste (você)10')
    expect(texto).toContain('Curador 34')
  })

  it('curador: "Meus dados" com o total e cada situacao das proprias fichas', async () => {
    await abrir('curador', { 'GET /admin/stats': { corpo: COMO_CURADOR }, 'GET /curation/minhas-estatisticas': { corpo: MINHAS } })
    const meus = screen.getByRole('heading', { name: 'Meus dados (todas as minhas fichas)' }).closest('section') as HTMLElement
    expect(meus.textContent).toContain('Minhas fichas10')
    expect(meus.textContent).toContain('Aprovada7')
    expect(meus.textContent).toContain('Em análise2')
    expect(meus.textContent).toContain('Segunda opinião1')
  })

  it.each(['curador', 'administrador'])('%s: cartoes "Aguardando curadoria" e "Curadas (no banco)"', async (perfil) => {
    await abrir(perfil, { 'GET /admin/stats': { corpo: COMO_CURADOR } })
    expect(valorDoCartao('Aguardando curadoria')).toBe('35')
    expect(valorDoCartao('Curadas (no banco)')).toBe('30')
  })

  it('administrador: tabela "Cada curador por situação" com nome, situacoes e total', async () => {
    await abrir('administrador', {
      'GET /admin/stats': {
        corpo: { ...STATS, imagens: IMAGENS, por_curador_detalhe: { '7': { aprovada: 20, em_analise: 5 }, '8': { arquivada: 1 } } },
      },
    })
    const cada = tabela('Cada curador por situação')
    const linhas = within(cada).getAllByRole('row').map((l) => Array.from(l.children).map((c) => c.textContent))
    expect(linhas[0]).toEqual(['Curador', 'Aprovada', 'Em análise', 'Segunda opinião', 'Pendente', 'Descartada', 'Arquivada', 'Total'])
    expect(linhas).toContainEqual(['Curadora Sete', '20', '5', '0', '0', '0', '0', '25'])
    expect(linhas).toContainEqual(['Curador Oito', '0', '0', '0', '0', '0', '1', '1'])
  })

  it('curador nao recebe nem ve a tabela de cada curador', async () => {
    await abrir('curador', { 'GET /admin/stats': { corpo: COMO_CURADOR } })
    expect(screen.queryByRole('heading', { name: 'Cada curador por situação' })).toBeNull()
  })
})
