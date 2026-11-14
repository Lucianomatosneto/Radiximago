// @vitest-environment jsdom
//
// TELA "Painel administrativo" (frontend/src/app/painel-admin/page.tsx) - Fase 3b.
// So o administrador. Confere: cartoes (usuarios, erros em 24 h, falhas de
// e-mail), aviso de migracao pendente, situacao de cada servico (banco e
// Orthanc pela checagem de saude; Docker deduzido; OHIF, e-mail,
// armazenamento e aparelhos pela leitura das integracoes), alertas de login
// falho e os erros (motivo, sem conexao, sessao vencida).
// Simulados: leitura das integracoes/e-mail/OHIF (lib/servicosSistema, que
// tem teste proprio), quadro de integridade da auditoria e resumo de imagens.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PainelAdminPage from '../../../../frontend/src/app/painel-admin/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/painel-admin' }))
vi.mock('../../../../frontend/src/components/Sidebar', () => ({ default: () => <nav aria-label="menu lateral" /> }))
vi.mock('../../../../frontend/src/components/Topbar', () => ({ default: () => <header aria-label="barra do topo" /> }))
vi.mock('../../../../frontend/src/components/IntegridadeAuditoria', () => ({ default: () => null }))
vi.mock('../../../../frontend/src/components/ResumoImagens', () => ({
  default: ({ imagens }: { imagens: { total: number } }) => <p>resumo de {imagens.total} imagens</p>,
}))
const servicos = vi.hoisted(() => ({
  integracoes: null as null | { armazenamento?: { status: string }; aparelhos?: { status: string; liberados: number } },
  email: 'online',
  ohif: 'online',
}))
vi.mock('../../../../frontend/src/lib/servicosSistema', async (original) => ({
  ...(await original<typeof import('../../../../frontend/src/lib/servicosSistema')>()),
  lerStatusIntegracoes: async () => servicos.integracoes,
  lerStatusEmail: async () => ({ status: servicos.email, etapa: '', erro: null }),
  avaliarOhif: async () => ({ status: servicos.ohif }),
}))

const sessao = (perfil: string) => ({ id: 1, nome: 'Admin Teste', email: 'admin@exemplo.test', perfil, foto_perfil_url: null })
const STATS = {
  total_imagens_orthanc: 120,
  usuarios_ativos: 15,
  por_status: {},
  imagens: { total: 120 },
  erros_24h: 0,
  falhas_email_7d: 0,
  ultima_falha_email: null,
  migracao_pendente: false,
}
function rotasPadrao(extra: Record<string, Rota> = {}, perfil = 'administrador'): Record<string, Rota> {
  return {
    'GET /auth/me': { corpo: sessao(perfil) },
    'GET /admin/stats': { corpo: STATS },
    'GET /health/database': { corpo: { status: 'ok' } },
    'GET /health/orthanc': { corpo: { status: 'ok' } },
    'GET /admin/audit-logs?acao=falha_login&resultado=negado&limit=5': { corpo: { total: 0, itens: [] } },
    ...extra,
  }
}
async function abrir(extra: Record<string, Rota> = {}) {
  const servidor = servidorFalso(rotasPadrao(extra))
  montarTela(<PainelAdminPage />)
  await screen.findByRole('heading', { name: 'Painel administrativo' })
  return servidor
}
const situacao = (nome: string) => screen.getByText(nome, { selector: 'span' }).nextElementSibling?.textContent
const cartaoDe = (rotulo: string) => screen.getByText(rotulo).parentElement as HTMLElement

beforeEach(() => {
  vi.clearAllMocks()
  servicos.integracoes = { armazenamento: { status: 'online' }, aparelhos: { status: 'online', liberados: 2 } }
  servicos.email = 'online'
  servicos.ohif = 'online'
})
afterEach(() => cleanup())

describe('quem pode', () => {
  it('sem sessao vai ao login', async () => {
    servidorFalso({ 'GET /auth/me': { status: 401 } })
    montarTela(<PainelAdminPage />)
    expect(screen.getByText('Carregando...')).toBeTruthy()
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
  })

  it.each(['curador', 'suporte', 'professor'])('%s vai ao "acesso negado" sem buscar nada', async (perfil) => {
    const servidor = servidorFalso(rotasPadrao({}, perfil))
    montarTela(<PainelAdminPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/acesso-negado?de=/painel-admin'))
    expect(servidor.pedidos.map((p) => p.caminho)).toEqual(['/auth/me'])
  })
})

describe('numeros e servicos', () => {
  it('tudo no ar: cartoes verdes, servicos "Online", atalhos e nenhum alerta', async () => {
    await abrir()
    expect(screen.getByText('resumo de 120 imagens')).toBeTruthy()
    expect(cartaoDe('Usuários ativos').textContent).toContain('15')
    expect(cartaoDe('Erros nas últimas 24 h').textContent).toContain('0')
    expect(cartaoDe('Falhas de envio de e-mail (7 dias)').textContent).toContain('Nenhuma falha de envio nos últimos 7 dias.')
    await waitFor(() => expect(situacao('OHIF')).toBe('Online'))
    for (const s of ['FastAPI', 'PostgreSQL', 'Orthanc', 'Next.js', 'DICOMWeb (via Orthanc)', 'Docker', 'E-mail (SMTP)', 'Armazenamento']) {
      expect(situacao(s)).toBe('Online')
    }
    expect(within(screen.getByRole('link', { name: /Aparelhos da rede/ })).getByText('2 liberados')).toBeTruthy()
    expect(screen.getByText('Nenhum alerta de segurança recente')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Usuários' }).getAttribute('href')).toBe('/usuarios')
    expect(screen.getByRole('link', { name: 'Ver todos os serviços →' }).getAttribute('href')).toBe('/integracoes')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('banco fora e Orthanc com erro: Docker "Offline" (nada no ar); e-mail e OHIF com problema', async () => {
    servicos.email = 'erro'
    servicos.ohif = 'offline'
    servicos.integracoes = null // leitura das integracoes falhou
    await abrir({ 'GET /health/database': { status: 503 }, 'GET /health/orthanc': { corpo: { status: 'erro', orthanc: 'sem resposta' } } })
    await waitFor(() => expect(situacao('E-mail (SMTP)')).toBe('Erro'))
    expect(situacao('PostgreSQL')).toBe('Offline')
    expect(situacao('Orthanc')).toBe('Erro')
    expect(situacao('Docker')).toBe('Offline')
    expect(situacao('OHIF')).toBe('Offline')
    expect(situacao('Armazenamento')).toBe('Instável') // sem leitura: nao da para afirmar que esta bem
    expect(within(screen.getByRole('link', { name: /Aparelhos da rede/ })).getByText('Verificando...')).toBeTruthy()
  })

  it('so o banco no ar: Docker "Instável"; aparelhos sem liberados e com problema', async () => {
    servicos.integracoes = { armazenamento: { status: 'online' }, aparelhos: { status: 'online', liberados: 0 } }
    await abrir({ 'GET /health/orthanc': 'SEM_CONEXAO' })
    await waitFor(() => expect(within(screen.getByRole('link', { name: /Aparelhos da rede/ })).getByText('Nenhum liberado')).toBeTruthy())
    expect(situacao('Docker')).toBe('Instável')
    cleanup()
    servicos.integracoes = { aparelhos: { status: 'instavel', liberados: 3 } }
    await abrir()
    await waitFor(() => expect(within(screen.getByRole('link', { name: /Aparelhos da rede/ })).getByText('Instável')).toBeTruthy())
  })

  it('erros em 24 h, falha de e-mail e migracao pendente aparecem em destaque', async () => {
    await abrir({
      'GET /admin/stats': {
        corpo: { ...STATS, erros_24h: 3, falhas_email_7d: 2, migracao_pendente: true, ultima_falha_email: { quando: '2026-11-10T12:00:00Z', detalhes: 'SMTP recusou.' } },
      },
    })
    expect(screen.getByRole('alert').textContent).toContain('falta aplicar a atualização do banco de dados')
    expect(cartaoDe('Erros nas últimas 24 h').textContent).toContain('3')
    const email = cartaoDe('Falhas de envio de e-mail (7 dias)').textContent ?? ''
    expect(email).toContain('2')
    expect(email).toContain(`Última: ${new Date('2026-11-10T12:00:00Z').toLocaleString('pt-BR')} – SMTP recusou.`)
  })

  it('falha de e-mail sem data nem detalhes: mostra "—"', async () => {
    await abrir({ 'GET /admin/stats': { corpo: { ...STATS, falhas_email_7d: 1, ultima_falha_email: { quando: null, detalhes: null } } } })
    expect(cartaoDe('Falhas de envio de e-mail (7 dias)').textContent).toContain('Última: —')
  })
})

describe('alertas de seguranca', () => {
  it('lista as tentativas de login falhas com data (ou "—") e detalhes', async () => {
    await abrir({
      'GET /admin/audit-logs?acao=falha_login&resultado=negado&limit=5': {
        corpo: {
          total: 7,
          itens: [
            { id: 1, criado_em: '2026-11-10T12:00:00Z', detalhes: 'email=x@exemplo.test' },
            { id: 2, criado_em: null, detalhes: null },
            { id: 3, criado_em: 'data-invalida', detalhes: '' },
          ],
        },
      },
    })
    expect(screen.getByText('7 tentativas de login falhas recentes')).toBeTruthy()
    const itens = screen.getAllByRole('listitem').map((l) => l.textContent)
    expect(itens[0]).toContain(new Date('2026-11-10T12:00:00Z').toLocaleString('pt-BR'))
    expect(itens[1]).toBe('— — Sem detalhes.')
    expect(itens[2]).toBe('— — Sem detalhes.')
  })

  it('uma so tentativa: texto no singular; lista que falha nao mostra alertas', async () => {
    await abrir({ 'GET /admin/audit-logs?acao=falha_login&resultado=negado&limit=5': { corpo: { total: 1, itens: [] } } })
    expect(screen.getByText('1 tentativa de login falha recente')).toBeTruthy()
    cleanup()
    await abrir({ 'GET /admin/audit-logs?acao=falha_login&resultado=negado&limit=5': { status: 500 } })
    expect(screen.getByText('Nenhum alerta de segurança recente')).toBeTruthy()
  })
})

describe('erros', () => {
  it.each([
    ['motivo do servidor', { status: 500, corpo: { detail: 'Estatística indisponível.' } } as Rota, 'Estatística indisponível.'],
    ['sem motivo', { status: 500 } as Rota, 'Não foi possível carregar os indicadores.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Não foi possível carregar o painel.'],
  ])('%s: avisa e nao mostra os cartoes', async (_n, rota, mensagem) => {
    await abrir({ 'GET /admin/stats': rota })
    expect(screen.getByRole('alert').textContent).toBe(mensagem)
    expect(screen.queryByText('Usuários ativos')).toBeNull()
  })

  it.each([
    ['numeros', 'GET /admin/stats'],
    ['alertas', 'GET /admin/audit-logs?acao=falha_login&resultado=negado&limit=5'],
  ])('sessao vencida (%s): vai ao login', async (_n, rota) => {
    servidorFalso(rotasPadrao({ [rota]: { status: 401 } }))
    montarTela(<PainelAdminPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
  })
})
