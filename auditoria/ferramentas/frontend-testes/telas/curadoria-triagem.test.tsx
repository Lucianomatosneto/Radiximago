// @vitest-environment jsdom
//
// TRIAGEM DA MODALIDADE (frontend/src/app/curadoria/triagem/page.tsx) -
// pedido do Luciano, 23/11/2026: o sistema so reconhece sozinho tomografia
// e panoramica; periapical, interproximal e oclusal (mesmo DICOM) ficam como
// "intraoral". Aqui o curador ve as miniaturas, seleciona varias e diz o tipo
// de uma vez. Dados inventados; miniaturas trocadas por <img> simples.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TriagemPage from '../../../../frontend/src/app/curadoria/triagem/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/curadoria/triagem' }))
vi.mock('../../../../frontend/src/components/Sidebar', () => ({ default: () => null }))
vi.mock('../../../../frontend/src/components/Topbar', () => ({ default: () => null }))
vi.mock('../../../../frontend/src/components/MiniaturaFila', () => ({
  default: ({ orthancReferenceId, alt }: { orthancReferenceId: number; alt: string }) => <img src={`mini-${orthancReferenceId}`} alt={alt} />,
}))

const CURADOR = { id: 7, nome: 'Curador Teste', email: 'curador@exemplo.test', perfil: 'curador', foto_perfil_url: null }
const ITEM = (id: number) => ({ orthanc_reference_id: id, orthanc_id: `sint-${id}`, tipo_preliminar: 'intraoral' })
const LISTA = 'GET /curation/pending?skip=0&limit=60&tipo=intraoral'
const POR_TIPO = { intraoral: 3, panoramica: 1 }

function rotas(extra: Record<string, Rota> = {}): Record<string, Rota> {
  return {
    'GET /auth/me': { corpo: CURADOR },
    [LISTA]: { corpo: { itens: [ITEM(11), ITEM(12), ITEM(13)], total_pendentes: 3, por_tipo: POR_TIPO } },
    ...extra,
  }
}
async function abrir(r: Record<string, Rota>) {
  const servidor = servidorFalso(r)
  montarTela(<TriagemPage />)
  await screen.findByRole('heading', { level: 1, name: /Triagem da modalidade/ })
  return servidor
}
const cartao = (id: number) => screen.getByRole('button', { name: `Imagem ${id}` })

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/curadoria/triagem')
})
afterEach(() => cleanup())

describe('quem pode', () => {
  it.each(['estudante', 'professor', 'suporte', 'pesquisador'])('%s vai para acesso negado', async (perfil) => {
    servidorFalso({ 'GET /auth/me': { corpo: { ...CURADOR, perfil } } })
    montarTela(<TriagemPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/acesso-negado?de=/curadoria/triagem'))
  })
})

describe('triagem', () => {
  it('mostra as intraorais da fila e explica', async () => {
    await abrir(rotas())
    expect(await screen.findByRole('img', { name: 'Imagem 11' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /^Imagem \d+$/ })).toHaveLength(3)
    expect(screen.getByText(/periapical, interproximal e oclusal/)).toBeTruthy()
    expect((screen.getByRole('combobox', { name: 'Mostrar' }) as HTMLSelectElement).value).toBe('intraoral')
  })

  it('seleciona, marca como Oclusal e as marcadas saem da lista', async () => {
    const usuario = userEvent.setup()
    let vez = 0
    const servidor = await abrir(
      rotas({
        [LISTA]: () => ({
          corpo: vez++ === 0
            ? { itens: [ITEM(11), ITEM(12), ITEM(13)], total_pendentes: 3, por_tipo: POR_TIPO }
            : { itens: [ITEM(12)], total_pendentes: 1, por_tipo: { intraoral: 1, oclusal: 2 } },
        }),
        'POST /curation/triagem': { corpo: { alteradas: 2, ignoradas: 0 } },
      }),
    )
    await screen.findByRole('img', { name: 'Imagem 11' })
    const acoes = screen.getByRole('group', { name: 'Marcar as selecionadas como' })
    expect((within(acoes).getByRole('button', { name: 'Oclusal' }) as HTMLButtonElement).disabled).toBe(true)
    await usuario.click(cartao(11))
    await usuario.click(cartao(13))
    expect(cartao(11).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('2 selecionadas')).toBeTruthy()
    await usuario.click(within(acoes).getByRole('button', { name: 'Oclusal' }))
    expect(await screen.findByRole('status')).toHaveProperty('textContent', '2 imagens marcadas como Oclusal.')
    expect(servidor.alteracoes()).toEqual([
      { metodo: 'POST', caminho: '/curation/triagem', corpo: { orthanc_reference_ids: [11, 13], tipo: 'oclusal' } },
    ])
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Imagem \d+$/ })).toHaveLength(1))
  })

  it('"Selecionar todas" e "Limpar seleção"', async () => {
    const usuario = userEvent.setup()
    await abrir(rotas())
    await screen.findByRole('img', { name: 'Imagem 11' })
    await usuario.click(screen.getByRole('button', { name: 'Selecionar todas' }))
    expect(screen.getByText('3 selecionadas')).toBeTruthy()
    await usuario.click(screen.getByRole('button', { name: 'Limpar seleção' }))
    expect(screen.queryByText(/selecionadas/)).toBeNull()
  })

  it('"Ampliar" abre a imagem grande para decidir; Esc fecha', async () => {
    const usuario = userEvent.setup()
    await abrir(rotas())
    await screen.findByRole('img', { name: 'Imagem 11' })
    await usuario.click(screen.getByRole('button', { name: 'Ampliar imagem 12' }))
    const janela = screen.getByRole('dialog', { name: 'Imagem 12' })
    expect(within(janela).getByRole('img', { name: 'Imagem 12 ampliada' })).toBeTruthy()
    await usuario.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('trocar "Mostrar" pede a lista do outro grupo e guarda no endereco', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir(
      rotas({ 'GET /curation/pending?skip=0&limit=60&tipo=nao_informado': { corpo: { itens: [], total_pendentes: 0, por_tipo: POR_TIPO } } }),
    )
    await screen.findByRole('img', { name: 'Imagem 11' })
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Mostrar' }), 'nao_informado')
    expect(await screen.findByText('Nenhuma imagem deste grupo na fila.')).toBeTruthy()
    expect(servidor.pedidos.some((p) => p.caminho === '/curation/pending?skip=0&limit=60&tipo=nao_informado')).toBe(true)
    expect(window.location.search).toBe('?tipo=nao_informado')
  })

  it('erro ao marcar: mostra o motivo e mantem a selecao', async () => {
    const usuario = userEvent.setup()
    await abrir(rotas({ 'POST /curation/triagem': { status: 422, corpo: { detail: 'Tipo invalido.' } } }))
    await screen.findByRole('img', { name: 'Imagem 11' })
    await usuario.click(cartao(11))
    await usuario.click(within(screen.getByRole('group', { name: 'Marcar as selecionadas como' })).getByRole('button', { name: 'Periapical' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Tipo invalido.')
    expect(cartao(11).getAttribute('aria-pressed')).toBe('true')
  })
})
