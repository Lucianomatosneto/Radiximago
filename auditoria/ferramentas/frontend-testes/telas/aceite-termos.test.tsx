// @vitest-environment jsdom
//
// COMPONENTE "Aceite dos termos de uso" (frontend/src/components/termos/AceiteTermosUso.tsx).
// PR 3a (14/11/2026): "Nao aceito" com o servidor fora do ar deixava um erro
// solto (promessa rejeitada sem tratamento). A pessoa continua sendo levada
// ao login; o que muda e que o erro passa a ser tratado. Dados inventados.
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AceiteTermosUso from '../../../../frontend/src/components/termos/AceiteTermosUso'
import { montarTela, servidorFalso } from './apoio/montar'

vi.mock('../../../../frontend/src/components/termos/TextoTermos', () => ({ default: () => <p>texto dos termos</p> }))

const TERMOS = {
  versao: '1.0',
  vigencia: '2026-11-01',
  mudancas: '',
  perfil: 'estudante',
  pendente: true,
  primeiro_aceite: true,
  documentos: { termos_uso: '/termos', anexo_perfil: '/termos#estudante', privacidade: '/privacidade' },
}

afterEach(() => cleanup())

describe('PR 3a: "Não aceito" sem conexão', () => {
  it('manda a recusa e nao deixa erro sem tratamento quando o servidor esta fora do ar', async () => {
    const soltos: unknown[] = []
    const aoErroSolto = (motivo: unknown) => soltos.push(motivo)
    process.on('unhandledRejection', aoErroSolto)
    try {
      const usuario = userEvent.setup()
      const servidor = servidorFalso({ 'POST /termos/recusar': 'SEM_CONEXAO' })
      montarTela(<AceiteTermosUso termos={TERMOS} onAceito={vi.fn()} />)
      await usuario.click(screen.getByRole('button', { name: /Não aceito/ }))
      await waitFor(() => expect(servidor.pedidos.map((p) => p.caminho)).toContain('/termos/recusar'))
      await new Promise((r) => setTimeout(r, 30))
      expect(soltos).toEqual([])
    } finally {
      process.off('unhandledRejection', aoErroSolto)
    }
  })
})
