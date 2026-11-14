// @vitest-environment jsdom
//
// TELA "Solicitar acesso" (frontend/src/app/solicitar-acesso/page.tsx).
// PR 3a (14/11/2026): o titulo "Tipo de acesso" e um rotulo sem campo (os
// perfis sao botoes). O leitor de tela precisa anunciar os botoes como um
// GRUPO com esse nome. Dados inventados.
import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SolicitarAcessoPage from '../../../../frontend/src/app/solicitar-acesso/page'
import { montarTela, servidorFalso } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/solicitar-acesso' }))

afterEach(() => cleanup())

describe('PR 3a: perfis da solicitacao como grupo com nome', () => {
  it('os 4 perfis ficam num grupo chamado "Tipo de acesso"', () => {
    servidorFalso({})
    montarTela(<SolicitarAcessoPage />)
    const grupo = screen.getByRole('group', { name: /Tipo de acesso/ })
    expect(within(grupo).getAllByRole('button').map((b) => b.textContent)).toEqual(['Curador', 'Professor', 'Estudante', 'Pesquisador'])
    // nao sobra rotulo solto (sem campo ligado) na tela
    const soltos = [...document.querySelectorAll('label')].filter((l) => !l.htmlFor && !l.querySelector('input,select,textarea'))
    expect(soltos.map((l) => l.textContent)).toEqual([])
  })
})
