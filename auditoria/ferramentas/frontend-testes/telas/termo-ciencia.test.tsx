// @vitest-environment jsdom
//
// COMPONENTE "Termo de ciencia" (Fase 3b): frontend/src/components/TermoCiencia.tsx.
// Janela que aparece a cada entrada (fora das telas publicas): primeiro
// confere se ha Termos de Uso pendentes (entao mostra o aceite deles); senao,
// pede o termo de ciencia. Confere: telas publicas, sem login, aceitar
// (exige a caixa; texto mudou = 409; erro; sem conexao) e "Nao aceito".
// Simulado: o aceite dos Termos de Uso (teste proprio). Dados inventados.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TermoCiencia from '../../../../frontend/src/components/TermoCiencia'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const nav = vi.hoisted(() => ({ caminho: '/banco-imagens', roteador: { push: vi.fn(), refresh: vi.fn() } }))
vi.mock('next/navigation', () => ({ useRouter: () => nav.roteador, usePathname: () => nav.caminho }))
vi.mock('../../../../frontend/src/components/termos/AceiteTermosUso', () => ({
  default: ({ termos, onAceito }: { termos: { versao: string }; onAceito: () => void }) => (
    <div role="dialog" aria-label="Termos de Uso">
      versão {termos.versao}
      <button type="button" onClick={onAceito}>
        aceitei os termos
      </button>
    </div>
  ),
}))

const SEM_PENDENCIA = { versao: '1.0', pendente: false }
function rotas(extra: Record<string, Rota> = {}): Record<string, Rota> {
  return {
    'GET /termos/meus': { corpo: SEM_PENDENCIA },
    'GET /auth/termo-ciencia': { corpo: { versao: '2026-11', pendente: true } },
    ...extra,
  }
}
async function abrirComTermo(extra: Record<string, Rota> = {}) {
  const servidor = servidorFalso(rotas(extra))
  montarTela(<TermoCiencia />)
  await screen.findByRole('dialog', { name: 'Termo de ciência' })
  return servidor
}
const caixa = () => screen.getByRole('checkbox', { name: /Estou ciente/ }) as HTMLInputElement

beforeEach(() => {
  nav.caminho = '/banco-imagens'
  vi.clearAllMocks()
})
afterEach(() => cleanup())

describe('quando aparece', () => {
  it.each(['/login', '/termos', '/esqueci-senha', '/redefinir-senha/abc', '/'])('tela publica %s: nao consulta nada', async (caminho) => {
    nav.caminho = caminho
    const servidor = servidorFalso(rotas())
    montarTela(<TermoCiencia />)
    await new Promise((r) => setTimeout(r, 10))
    expect(servidor.pedidos).toEqual([])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it.each([
    ['sem login (termos)', { 'GET /termos/meus': { status: 401 } } as Record<string, Rota>],
    ['sem login (ciencia)', { 'GET /auth/termo-ciencia': { status: 401 } } as Record<string, Rota>],
    ['sem conexao', { 'GET /termos/meus': 'SEM_CONEXAO' } as Record<string, Rota>],
    ['ja aceito', { 'GET /auth/termo-ciencia': { corpo: { versao: '2026-11', pendente: false } } } as Record<string, Rota>],
  ])('%s: nada aparece', async (_n, extra) => {
    const servidor = servidorFalso(rotas(extra))
    montarTela(<TermoCiencia />)
    await waitFor(() => expect(servidor.pedidos.length).toBeGreaterThan(0))
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Termos de Uso pendentes vem antes; aceitos, confere de novo e mostra o termo de ciencia', async () => {
    const usuario = userEvent.setup()
    let termos: Rota = { corpo: { versao: '3.0', pendente: true } }
    servidorFalso(rotas({ 'GET /termos/meus': () => termos as never }))
    montarTela(<TermoCiencia />)
    expect((await screen.findByRole('dialog', { name: 'Termos de Uso' })).textContent).toContain('versão 3.0')
    termos = { corpo: SEM_PENDENCIA }
    await usuario.click(screen.getByRole('button', { name: 'aceitei os termos' }))
    expect(await screen.findByRole('dialog', { name: 'Termo de ciência' })).toBeTruthy()
  })

  it('termo de ciencia: texto, caixa com o foco e "Continuar" so com a caixa marcada', async () => {
    await abrirComTermo()
    const janela = screen.getByRole('dialog', { name: 'Termo de ciência' })
    expect(janela.getAttribute('aria-modal')).toBe('true')
    expect(within(janela).getByText(/não têm validade para diagnóstico, não substituem laudo/)).toBeTruthy()
    expect(document.activeElement).toBe(caixa())
    expect((screen.getByRole('button', { name: 'Continuar' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('aceitar', () => {
  it('manda a versao lida e a ciencia; fecha e recarrega a tela', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrirComTermo({ 'POST /auth/termo-ciencia/aceitar': { corpo: {} } })
    await usuario.click(caixa())
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: '/auth/termo-ciencia/aceitar', corpo: { versao: '2026-11', ciente: true } }])
    expect(nav.roteador.refresh).toHaveBeenCalled()
  })

  it('texto do termo mudou enquanto lia (409): busca de novo e pede para ler outra vez', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrirComTermo({ 'POST /auth/termo-ciencia/aceitar': { status: 409 } })
    await usuario.click(caixa())
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))
    expect((await screen.findByRole('alert')).textContent).toBe('O texto do termo foi atualizado. Leia novamente e confirme.')
    expect(servidor.pedidos.filter((p) => p.caminho === '/auth/termo-ciencia')).toHaveLength(2)
  })

  it.each([
    ['erro do servidor', { status: 500 } as Rota],
    ['sem conexao', 'SEM_CONEXAO' as Rota],
  ])('%s: avisa e a janela continua', async (_n, rota) => {
    const usuario = userEvent.setup()
    await abrirComTermo({ 'POST /auth/termo-ciencia/aceitar': rota })
    await usuario.click(caixa())
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Não foi possível registrar o aceite. Tente de novo.')
    expect(screen.getByRole('dialog', { name: 'Termo de ciência' })).toBeTruthy()
  })
})

describe('"Não aceito"', () => {
  it('registra a recusa', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrirComTermo({ 'POST /auth/termo-ciencia/recusar': { corpo: {} } })
    await usuario.click(screen.getByRole('button', { name: 'Não aceito' }))
    await waitFor(() => expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: '/auth/termo-ciencia/recusar', corpo: undefined }]))
  })

  // DEFEITO listado na 3a (14/11/2026) e corrigido na 3b: sem conexao, a
  // recusa deixava um erro solto (promessa rejeitada sem tratamento).
  it('sem conexao: nao deixa erro sem tratamento', async () => {
    const soltos: unknown[] = []
    const aoErroSolto = (motivo: unknown) => soltos.push(motivo)
    process.on('unhandledRejection', aoErroSolto)
    try {
      const usuario = userEvent.setup()
      const servidor = await abrirComTermo({ 'POST /auth/termo-ciencia/recusar': 'SEM_CONEXAO' })
      await usuario.click(screen.getByRole('button', { name: 'Não aceito' }))
      await waitFor(() => expect(servidor.pedidos.map((p) => p.caminho)).toContain('/auth/termo-ciencia/recusar'))
      await new Promise((r) => setTimeout(r, 30))
      expect(soltos).toEqual([])
    } finally {
      process.off('unhandledRejection', aoErroSolto)
    }
  })
})
