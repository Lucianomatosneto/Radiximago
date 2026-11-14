// @vitest-environment jsdom
//
// TELA "Auditoria e seguranca" (frontend/src/app/auditoria/page.tsx).
// PR 3a (14/11/2026): os filtros precisam ser achados pelo rotulo. Os demais
// testes da tela entram no PR 3b. Dados inventados.
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuditoriaPage from '../../../../frontend/src/app/auditoria/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/auditoria' }))
vi.mock('../../../../frontend/src/components/Sidebar', () => ({ default: () => <nav aria-label="menu lateral" /> }))
vi.mock('../../../../frontend/src/components/Topbar', () => ({ default: () => <header aria-label="barra do topo" /> }))

const ADMIN = { id: 1, nome: 'Admin Teste', email: 'admin@exemplo.test', perfil: 'administrador', foto_perfil_url: null }

function rotasPadrao(extra: Record<string, Rota> = {}): Record<string, Rota> {
  return {
    'GET /auth/me': { corpo: ADMIN },
    'GET /users/': { corpo: [{ id: 3, nome: 'Usuária Teste' }] },
    'GET /admin/audit-logs/acoes': { corpo: { acoes: {} } },
    'GET /admin/audit-logs?*': { corpo: { itens: [], total: 0 } },
    ...extra,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})
afterEach(() => cleanup())

describe('PR 3a: rotulos ligados aos filtros da auditoria', () => {
  it('os 5 filtros sao achados pelo rotulo; o escolhido vai na pesquisa', async () => {
    const usuario = userEvent.setup()
    const servidor = servidorFalso(rotasPadrao())
    montarTela(<AuditoriaPage />)
    await waitFor(() => expect(servidor.pedidos.some((p) => p.caminho.startsWith('/admin/audit-logs?'))).toBe(true))

    expect(screen.getByLabelText('Ação').tagName).toBe('SELECT')
    const usuarioFiltro = screen.getByLabelText('Usuário') as HTMLSelectElement
    await waitFor(() => expect(usuarioFiltro.options.length).toBe(2))
    await usuario.selectOptions(usuarioFiltro, '3')
    expect(screen.getByLabelText('Resultado').tagName).toBe('SELECT')
    const de = screen.getByLabelText('Data inicial') as HTMLInputElement
    const ate = screen.getByLabelText('Data final') as HTMLInputElement
    expect([de.type, ate.type]).toEqual(['date', 'date'])
  })
})
