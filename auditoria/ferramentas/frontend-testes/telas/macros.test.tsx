// @vitest-environment jsdom
//
// TELA "Macros da curadoria" (frontend/src/app/macros/page.tsx).
// PR 3a (14/11/2026): os campos do editor de macro precisam ser achados pelo
// rotulo (leitor de tela e clique no rotulo). Os demais testes da tela entram
// no PR 3b. Dados inventados.
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MacrosPage from '../../../../frontend/src/app/macros/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/macros' }))
vi.mock('../../../../frontend/src/components/Sidebar', () => ({ default: () => <nav aria-label="menu lateral" /> }))
vi.mock('../../../../frontend/src/components/Topbar', () => ({ default: () => <header aria-label="barra do topo" /> }))

const CURADOR = { id: 7, nome: 'Curador Teste', email: 'curador@exemplo.test', perfil: 'curador', foto_perfil_url: null }

function rotasPadrao(extra: Record<string, Rota> = {}): Record<string, Rota> {
  return {
    'GET /auth/me': { corpo: CURADOR },
    'GET /macros?incluir_inativas=true': { corpo: { macros: [] } },
    'GET /voz/frases': { corpo: { frases: [] } },
    'GET /vocabulario': { corpo: { termos: [] } },
    ...extra,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})
afterEach(() => cleanup())

describe('PR 3a: rotulos ligados aos campos do editor de macro', () => {
  it('cada campo e encontrado pelo seu rotulo e aceita o que se digita/escolhe', async () => {
    const usuario = userEvent.setup()
    servidorFalso(rotasPadrao())
    montarTela(<MacrosPage />)
    await usuario.click(await screen.findByRole('button', { name: /Nova macro/ }))

    const nome = screen.getByLabelText('Nome (é o que se fala depois de “macro”)')
    await usuario.type(nome, 'periapical normal')
    expect((nome as HTMLInputElement).value).toBe('periapical normal')

    const tipo = screen.getByLabelText('Tipo de radiografia') as HTMLSelectElement
    await usuario.selectOptions(tipo, 'periapical')
    expect(tipo.value).toBe('periapical')
    const qualidade = screen.getByLabelText('Qualidade técnica') as HTMLSelectElement
    await usuario.selectOptions(qualidade, 'boa')
    expect(qualidade.value).toBe('boa')
    const origem = screen.getByLabelText('Origem da imagem') as HTMLSelectElement
    await usuario.selectOptions(origem, 'externa')
    expect(origem.value).toBe('externa')

    for (const rotulo of ['Descrição didática', 'Achados detalhados', 'Observações internas']) {
      const campo = screen.getByLabelText(rotulo)
      expect(campo.tagName).toBe('TEXTAREA')
      await usuario.type(campo, 'Texto de teste')
      expect((campo as HTMLTextAreaElement).value).toBe('Texto de teste')
    }
  })
})
