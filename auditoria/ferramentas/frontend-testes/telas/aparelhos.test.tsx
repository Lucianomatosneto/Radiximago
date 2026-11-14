// @vitest-environment jsdom
//
// TELA "Aparelhos da rede" (frontend/src/app/aparelhos/page.tsx).
// PR 3a (14/11/2026): o botao "Testar conexao" nao avisava nada quando o
// servidor estava fora do ar. Os demais testes da tela entram no PR 3b.
// Dados inventados.
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AparelhosPage from '../../../../frontend/src/app/aparelhos/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/aparelhos' }))
vi.mock('../../../../frontend/src/components/Sidebar', () => ({ default: () => <nav aria-label="menu lateral" /> }))
vi.mock('../../../../frontend/src/components/Topbar', () => ({ default: () => <header aria-label="barra do topo" /> }))

const SUPORTE = { id: 4, nome: 'Suporte Teste', email: 'suporte@exemplo.test', perfil: 'suporte', foto_perfil_url: null }
const APARELHO = { id: 5, nome: 'Raio-X Sala 2', unidade: 'Clínica escola', aet: 'RXSALA2', ip: '10.0.0.20', porta: 104, liberado: true, total_recebidas: 3, ultimo_recebimento_em: null }

function rotasPadrao(extra: Record<string, Rota> = {}): Record<string, Rota> {
  return {
    'GET /auth/me': { corpo: SUPORTE },
    'GET /aparelhos': { corpo: { aparelhos: [APARELHO], configuracao: { aet: 'RADIX', porta: 4242, endereco: '10.0.0.1' }, pode_gerir: true } },
    ...extra,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})
afterEach(() => cleanup())

describe('PR 3a: "Testar conexão" com o servidor fora do ar', () => {
  it('avisa "Sem conexão" e o botao volta a ficar disponivel', async () => {
    const usuario = userEvent.setup()
    servidorFalso(rotasPadrao({ 'POST /aparelhos/5/testar': 'SEM_CONEXAO' }))
    montarTela(<AparelhosPage />)
    const testar = await screen.findByRole('button', { name: 'Testar conexão' })
    await usuario.click(testar)
    expect((await screen.findByRole('alert')).textContent).toBe('Sem conexão com o servidor. Tente de novo.')
    expect((screen.getByRole('button', { name: 'Testar conexão' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('com o servidor no ar, o resultado do teste continua aparecendo', async () => {
    const usuario = userEvent.setup()
    servidorFalso(rotasPadrao({ 'POST /aparelhos/5/testar': { corpo: { orthanc_no_ar: true, respondeu: true } } }))
    montarTela(<AparelhosPage />)
    await usuario.click(await screen.findByRole('button', { name: 'Testar conexão' }))
    expect(await screen.findByText('Raio-X Sala 2 respondeu: a conexão está funcionando.')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
