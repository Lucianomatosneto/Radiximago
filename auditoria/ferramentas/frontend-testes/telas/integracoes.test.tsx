// @vitest-environment jsdom
//
// TELA "Integracoes" (frontend/src/app/integracoes/page.tsx) - Fase 3b.
// Situacao de cada servico para administrador e suporte: banco e Orthanc
// (checagem de saude pelo servidor), Docker deduzido, OHIF, e-mail (com o
// motivo e a etapa da falha), armazenamento (disco, Orthanc, backups e
// alertas) e aparelhos da rede; "Atualizar status" refaz tudo.
// Simulados: leitura das integracoes, do e-mail e do OHIF
// (lib/servicosSistema, com teste proprio). Dados inventados.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import IntegracoesPage from '../../../../frontend/src/app/integracoes/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/integracoes' }))
vi.mock('../../../../frontend/src/components/Sidebar', () => ({ default: () => <nav aria-label="menu lateral" /> }))
vi.mock('../../../../frontend/src/components/Topbar', () => ({ default: () => <header aria-label="barra do topo" /> }))
const servicos = vi.hoisted(() => ({
  integracoes: null as unknown,
  email: {} as Record<string, unknown>,
  ohif: {} as Record<string, unknown>,
  leituras: 0,
}))
vi.mock('../../../../frontend/src/lib/servicosSistema', async (original) => ({
  ...(await original<typeof import('../../../../frontend/src/lib/servicosSistema')>()),
  lerStatusIntegracoes: async () => {
    servicos.leituras += 1
    return servicos.integracoes
  },
  lerStatusEmail: async () => servicos.email,
  avaliarOhif: async () => servicos.ohif,
}))

const sessao = (perfil: string) => ({ id: 1, nome: 'Pessoa Teste', email: 'pessoa@exemplo.test', perfil, foto_perfil_url: null })
const backup = (bytes: number) => ({ arquivo: 'b.sql', tamanho_bytes: bytes, data: '2026-11-13T03:00:00Z', horas_desde: 5, quantidade_guardada: 7 })
const INTEGRACOES = {
  armazenamento: {
    status: 'online',
    alertas: [],
    disco: { total_gb: 500, livre_gb: 320.5, percentual_livre: 64.1 },
    orthanc: { tamanho_mb: 2048, instancias: 1500 },
    backup_banco: backup(500),
    backup_imagens: backup(3 * 1024 * 1024 * 1024),
  },
  aparelhos: { status: 'online', liberados: 2, bloqueados: 1, ultimo_recebimento_em: '2026-11-13T10:00:00Z' },
}
function rotas(perfil = 'suporte', extra: Record<string, Rota> = {}): Record<string, Rota> {
  return {
    'GET /auth/me': { corpo: sessao(perfil) },
    'GET /health/database': { corpo: { status: 'ok' } },
    'GET /health/orthanc': { corpo: { status: 'ok' } },
    ...extra,
  }
}
async function abrir(extra: Record<string, Rota> = {}, perfil = 'suporte') {
  const servidor = servidorFalso(rotas(perfil, extra))
  montarTela(<IntegracoesPage />)
  await screen.findByRole('heading', { name: 'Integrações' })
  return servidor
}
const cartao = (nome: string) => screen.getByRole('heading', { name: nome }).closest('div.rounded-xl') as HTMLElement
const situacao = (nome: string) => within(cartao(nome)).getAllByText(/./)[1].textContent

beforeEach(() => {
  vi.clearAllMocks()
  servicos.integracoes = structuredClone(INTEGRACOES)
  servicos.email = { status: 'online', etapa: 'ok', erro: null, servidor: 'smtp.exemplo.test' }
  servicos.ohif = { status: 'online', motivo: 'ohifRespondeu', url: 'http://ohif.teste' }
  servicos.leituras = 0
})
afterEach(() => cleanup())

describe('quem pode', () => {
  it('sem sessao vai ao login', async () => {
    servidorFalso({ 'GET /auth/me': { status: 401 } })
    montarTela(<IntegracoesPage />)
    expect(screen.getByText('Carregando...')).toBeTruthy()
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
  })

  it.each(['curador', 'professor', 'estudante'])('%s vai ao "acesso negado"', async (perfil) => {
    servidorFalso(rotas(perfil))
    montarTela(<IntegracoesPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/acesso-negado?de=/integracoes'))
    expect(servicos.leituras).toBe(0)
  })

  it.each(['administrador', 'suporte'])('%s ve os servicos', async (perfil) => {
    await abrir({}, perfil)
    expect(screen.getByRole('heading', { name: 'FastAPI' })).toBeTruthy()
  })
})

describe('tudo no ar', () => {
  it('cada cartao "Online", com descricao e detalhes', async () => {
    await abrir()
    await waitFor(() => expect(within(cartao('PostgreSQL')).getByText('Verificado agora.')).toBeTruthy())
    for (const nome of ['FastAPI', 'PostgreSQL', 'Orthanc', 'Next.js', 'OHIF', 'DICOMWeb (via Orthanc)', 'Docker', 'E-mail (SMTP)', 'Armazenamento', 'Aparelhos da rede']) {
      expect(within(cartao(nome)).getByText('Online')).toBeTruthy()
    }
    expect(within(cartao('OHIF')).getByText('Respondeu em http://ohif.teste (teste feito pelo seu navegador).')).toBeTruthy()
    expect(within(cartao('Docker')).getByText(/estão respondendo/)).toBeTruthy()
    expect(within(cartao('E-mail (SMTP)')).getByText('Conectou e entrou em smtp.exemplo.test (teste sem enviar e-mail).')).toBeTruthy()
    const armazenamento = cartao('Armazenamento').textContent ?? ''
    expect(armazenamento).toContain('Disco: 320,5 GB livres de 500 GB (64,1%).')
    expect(armazenamento).toContain('Imagens no Orthanc: 2 GB (1500 imagens).')
    expect(armazenamento).toContain('do banco')
    expect(armazenamento).toContain('500 B (7 guardados)')
    expect(armazenamento).toContain('3 GB (7 guardados)')
    const aparelhos = cartao('Aparelhos da rede').textContent ?? ''
    expect(aparelhos).toContain('2 aparelhos liberados')
    expect(aparelhos).toContain('1 bloqueado')
    expect(aparelhos).toContain(`Última imagem recebida: ${new Date('2026-11-13T10:00:00Z').toLocaleString('pt-BR')}`)
    expect(screen.getByRole('link', { name: 'Gerenciar aparelhos da rede →' }).getAttribute('href')).toBe('/aparelhos')
  })
})

describe('com problemas', () => {
  it('banco fora, Orthanc com erro: Docker "Offline"; DICOMWeb segue o Orthanc', async () => {
    await abrir({ 'GET /health/database': { status: 503 }, 'GET /health/orthanc': { corpo: { status: 'erro', orthanc: 'sem resposta' } } })
    await waitFor(() => expect(situacao('PostgreSQL')).toBe('Offline'))
    expect(situacao('Orthanc')).toBe('Erro')
    expect(situacao('DICOMWeb (via Orthanc)')).toBe('Erro')
    expect(situacao('Docker')).toBe('Offline')
    expect(within(cartao('Docker')).getByText(/Algum serviço que roda no Docker não respondeu/)).toBeTruthy()
  })

  it('e-mail com senha recusada: motivo, por que importa, etapa e resposta do servidor', async () => {
    servicos.email = { status: 'erro', etapa: 'login', erro: 'senha_recusada', detalhe: '535 Authentication failed' }
    await abrir()
    const email = await waitFor(() => {
      const c = cartao('E-mail (SMTP)')
      expect(c.textContent).toContain('O servidor recusou o usuário/senha.')
      return c
    })
    expect(email.textContent).toContain('dependem deste serviço')
    expect(email.textContent).toContain('Parou na etapa: login (usuário e senha de app).')
    expect(email.textContent).toContain('Resposta do servidor: 535 Authentication failed')
  })

  it('e-mail que nao pode ser consultado: mensagem geral, sem etapa', async () => {
    servicos.email = { status: 'instavel', etapa: 'consulta', erro: null }
    await abrir()
    await waitFor(() => expect(cartao('E-mail (SMTP)').textContent).toContain('Não foi possível consultar o servidor de e-mail agora.'))
    expect(cartao('E-mail (SMTP)').textContent).not.toContain('Parou na etapa')
  })

  it('backups vazios/antigos e disco cheio viram alertas; alerta desconhecido aparece como veio', async () => {
    const dados = servicos.integracoes as typeof INTEGRACOES
    dados.armazenamento = {
      ...dados.armazenamento,
      status: 'instavel',
      alertas: ['backup_banco_vazio', 'disco_pouco_espaco', 'alerta_novo_do_servidor'] as never,
      disco: null as never,
      orthanc: { tamanho_mb: null, instancias: null } as never,
      backup_imagens: null as never,
    }
    await abrir()
    const alertas = await within(cartao('Armazenamento')).findAllByRole('alert')
    expect(alertas.map((a) => a.textContent)).toEqual([
      '⚠ O último backup do banco de dados está VAZIO (0 bytes).',
      '⚠ Pouco espaço em disco (menos de 10% livre).',
      '⚠ alerta_novo_do_servidor',
    ])
    expect(cartao('Armazenamento').textContent).not.toContain('Disco:')
    expect(cartao('Armazenamento').textContent).not.toContain('Imagens no Orthanc')
    expect(situacao('Armazenamento')).toBe('Instável')
  })

  it('leitura das integracoes falhou: armazenamento e aparelhos "Instável" com o aviso', async () => {
    servicos.integracoes = null
    servicos.ohif = { status: 'offline', motivo: 'ohifSemEndereco' }
    await abrir()
    await waitFor(() => expect(cartao('Armazenamento').textContent).toContain('Não foi possível consultar o armazenamento agora.'))
    expect(situacao('Armazenamento')).toBe('Instável')
    expect(situacao('Aparelhos da rede')).toBe('Instável')
    expect(cartao('OHIF').textContent).toContain('Não foi possível obter o endereço do OHIF no servidor.')
  })

  it('aparelhos: nenhum liberado; ou lista diferente do servidor de imagens; sem chegadas', async () => {
    const dados = servicos.integracoes as typeof INTEGRACOES
    dados.aparelhos = { status: 'online', liberados: 0, bloqueados: 0, ultimo_recebimento_em: null as never }
    await abrir()
    await waitFor(() => expect(cartao('Aparelhos da rede').textContent).toContain('Nenhum aparelho de raio X liberado'))
    expect(cartao('Aparelhos da rede').textContent).toContain('Nenhum bloqueado')
    expect(cartao('Aparelhos da rede').textContent).toContain('Nenhuma imagem recebida pela rede ainda')
    cleanup()
    dados.aparelhos = { status: 'instavel', liberados: 3, bloqueados: 2, ultimo_recebimento_em: null as never }
    await abrir()
    await waitFor(() => expect(cartao('Aparelhos da rede').textContent).toContain('a lista dele ainda está diferente da do Radix'))
  })
})

describe('atualizar', () => {
  it('"Atualizar status" refaz as checagens', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar status' })).toBeTruthy())
    await usuario.click(screen.getByRole('button', { name: 'Atualizar status' }))
    await waitFor(() => expect(servidor.pedidos.filter((p) => p.caminho === '/health/database')).toHaveLength(2))
    expect(servicos.leituras).toBe(2)
  })
})
