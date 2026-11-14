// @vitest-environment jsdom
//
// TELA "Configuracoes" (frontend/src/app/configuracoes/page.tsx) - Fase 3c.
// So o administrador. Mostra (sem editar) as configuracoes do servidor e os
// valores fixos do sistema. Confere: quem pode, cada valor, o aviso de
// ambiente que nao e o oficial (producao sem aviso), ambiente desconhecido,
// valores fixos com o codigo interno na dica, e os erros (motivo, padrao,
// sem conexao, sessao vencida). Simulados: menu e topo. Dados inventados.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ConfiguracoesPage from '../../../../frontend/src/app/configuracoes/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/configuracoes' }))
vi.mock('../../../../frontend/src/components/Sidebar', () => ({ default: () => <nav aria-label="menu lateral" /> }))
vi.mock('../../../../frontend/src/components/Topbar', () => ({ default: () => <header aria-label="barra do topo" /> }))

const sessao = (perfil: string) => ({ id: 1, nome: 'Pessoa Teste', email: 'pessoa@exemplo.test', perfil, foto_perfil_url: null })
const CONFIG = {
  orthanc_url: 'http://orthanc.teste:8042',
  dicomweb_url: 'http://orthanc.teste:8042/dicom-web',
  ohif_base_url: 'http://ohif.teste',
  max_upload_size_mb: 50,
  environment: 'production',
  jwt_algorithm: 'HS256',
  jwt_expire_minutes: 60,
}
async function abrir(rota: Rota = { corpo: CONFIG }) {
  const servidor = servidorFalso({ 'GET /auth/me': { corpo: sessao('administrador') }, 'GET /admin/settings': rota })
  montarTela(<ConfiguracoesPage />)
  await screen.findByRole('heading', { name: 'Configurações' })
  return servidor
}
const valor = (rotulo: string) => screen.getByText(rotulo, { selector: 'dt' }).nextElementSibling?.textContent
const secao = (titulo: string) => screen.getByRole('heading', { name: titulo }).closest('section') as HTMLElement

beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

describe('quem pode', () => {
  it('sem sessao vai ao login', async () => {
    servidorFalso({ 'GET /auth/me': { status: 401 } })
    montarTela(<ConfiguracoesPage />)
    expect(screen.getByText('Carregando...')).toBeTruthy()
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
  })

  it.each(['curador', 'suporte', 'professor', 'estudante', 'pesquisador'])('%s vai ao "acesso negado" sem pedir as configuracoes', async (perfil) => {
    const servidor = servidorFalso({ 'GET /auth/me': { corpo: sessao(perfil) } })
    montarTela(<ConfiguracoesPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/acesso-negado?de=/configuracoes'))
    expect(servidor.pedidos.map((p) => p.caminho)).toEqual(['/auth/me'])
  })
})

describe('valores', () => {
  it('producao: mostra cada valor, so leitura, sem aviso de ambiente', async () => {
    await abrir()
    expect(screen.getByText(/A edição pela interface ainda não está disponível/)).toBeTruthy()
    expect(valor('Nome do sistema')).toBe('Rádix Imago')
    expect(valor('Ambiente')).toBe('Produção (versão oficial)')
    expect(valor('Algoritmo de token')).toBe('HS256')
    expect(valor('Tempo de sessão')).toBe('60 minutos')
    expect(valor('URL do Orthanc')).toBe('http://orthanc.teste:8042')
    expect(valor('URL do DICOMWeb')).toBe('http://orthanc.teste:8042/dicom-web')
    expect(valor('URL do OHIF')).toBe('http://ohif.teste')
    expect(valor('Tamanho máximo de upload')).toBe('50 MB')
    expect(screen.queryByRole('note')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull() // nada editavel
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each([
    ['development', 'Desenvolvimento (versão de testes)'],
    ['homologacao', 'homologacao (não reconhecido)'],
  ])('ambiente "%s": nome traduzido e aviso de nao usar com dados reais', async (ambiente, nome) => {
    await abrir({ corpo: { ...CONFIG, environment: ambiente } })
    expect(valor('Ambiente')).toBe(nome)
    expect(within(secao('Geral')).getByRole('note').textContent).toContain('não usar com dados reais de pacientes')
  })

  it('valores fixos: nomes traduzidos com o codigo interno na dica', async () => {
    await abrir()
    const fixos = secao('Valores fixos do sistema')
    const tipos = within(fixos).getByText('Modalidades de radiografia').nextElementSibling as HTMLElement
    expect([...tipos.children].map((c) => c.getAttribute('title'))).toEqual(['periapical', 'panoramica', 'interproximal', 'oclusal', 'tomografia'])
    expect(within(tipos).getByTitle('panoramica').textContent).toBe('Panorâmica')
    const status = within(fixos).getByText('Status de curadoria').nextElementSibling as HTMLElement
    expect(status.children).toHaveLength(6)
    const perfis = within(fixos).getByText('Perfis de usuário').nextElementSibling as HTMLElement
    expect(within(perfis).getByTitle('administrador').textContent).toBe('Administrador')
    // nenhum valor ficou sem traducao (o rotulo seria o proprio codigo)
    for (const item of [...tipos.children, ...status.children, ...perfis.children]) {
      expect(item.textContent).not.toBe(item.getAttribute('title'))
    }
  })
})

describe('erros', () => {
  it.each([
    ['motivo do servidor', { status: 500, corpo: { detail: 'Configurações indisponíveis.' } } as Rota, 'Configurações indisponíveis.'],
    ['sem motivo', { status: 500, corpo: 'x' } as Rota, 'Não foi possível carregar as configurações.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Não foi possível carregar as configurações.'],
  ])('%s: avisa e mostra "—" no lugar dos valores (os fixos continuam)', async (_n, rota, mensagem) => {
    await abrir(rota)
    expect(screen.getByRole('alert').textContent).toBe(mensagem)
    expect(valor('Ambiente')).toBe('—')
    expect(valor('Tempo de sessão')).toBe('—')
    expect(valor('Tamanho máximo de upload')).toBe('—')
    expect(screen.queryByRole('note')).toBeNull()
    expect(screen.getByText('Modalidades de radiografia')).toBeTruthy()
  })

  it('sessao vencida ao carregar: vai ao login', async () => {
    servidorFalso({ 'GET /auth/me': { corpo: sessao('administrador') }, 'GET /admin/settings': { status: 401 } })
    montarTela(<ConfiguracoesPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
  })
})
