// @vitest-environment jsdom
//
// "IMAGENS ENVIADAS POR MIM" EM GRADE (pedido do video, 22/11/2026):
// frontend/src/components/envios/GradeEnvios.tsx, usada em Minhas imagens.
// Mesmo padrao das outras telas: quadrados numerados com a situacao, caixa de
// selecao, "i" com as informacoes e lupa (abrir no visualizador); barra com
// selecao e as acoes alinhadas ao lado de "Ver selecionadas":
// - equipe (professor, curador, administrador): Enviar a pessoas ou grupos;
// - quem tem imagem "so para mim"/devolvida: Enviar para analise e Retirar;
// - Ver selecionadas: abre o visualizador com as selecionadas juntas.
// Filtro por tipo vem da tela (prop filtroTipo).
// Simulados: miniatura (imagem real) e seletor de pessoas (teste proprio).
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import GradeEnvios from '../../../../frontend/src/components/envios/GradeEnvios'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

vi.mock('../../../../frontend/src/components/MiniaturaFila', () => ({ default: ({ alt }: { alt: string }) => <img alt={alt} /> }))
vi.mock('../../../../frontend/src/components/envios/SeletorPessoasGrupos', () => ({
  default: ({ aoMudar }: { aoMudar: (p: { id: number; nome: string }[], g: number[]) => void }) => (
    <button type="button" onClick={() => aoMudar([{ id: 4, nome: 'Ana' }], [9])}>
      escolher Ana e o grupo 9
    </button>
  ),
}))

const item = (id: number, situacao: string, extra: object = {}) => ({
  id,
  situacao,
  enviado_em: '2026-11-10T12:00:00Z',
  enviado_por: null,
  analista: null,
  analise_nota: null,
  devolucao_nota: null,
  curation_id: null,
  viewer_url: `http://ohif.teste/viewer?StudyInstanceUIDs=1.2.${id}`,
  tipo_radiografia: 'periapical',
  ...extra,
})
const ITENS = [
  item(1, 'so_para_mim'),
  item(2, 'devolvida', { devolucao_nota: 'Imagem cortada', tipo_radiografia: 'oclusal' }),
  item(3, 'na_fila', { enviada_para: 2, tipo_radiografia: null }),
  item(4, 'so_para_mim', { em_volume: true, cortes: 120, tipo_radiografia: 'tomografia' }),
]
const ANALISTAS = { pessoas: [{ id: 21, nome: 'Prof. Teste', perfil: 'professor' }] }
const rotas = (extra: Record<string, Rota> = {}): Record<string, Rota> => ({
  'GET /envios/meus': { corpo: { itens: ITENS } },
  'GET /envios/analistas': { corpo: ANALISTAS },
  ...extra,
})
function abrir(r: Record<string, Rota>, { equipe = false, filtroTipo = null as string | null } = {}) {
  const servidor = servidorFalso(r)
  montarTela(<GradeEnvios equipe={equipe} filtroTipo={filtroTipo} />)
  return servidor
}
const quadrado = (id: number) => screen.getByRole('img', { name: `Imagem nº ${id}` }).closest('[data-cartao-envio]') as HTMLElement
const marcar = (id: number) => fireEvent.click(within(quadrado(id)).getByRole('checkbox'))

afterEach(() => cleanup())

describe('grade das imagens enviadas por mim', () => {
  it('mostra os quadrados numerados com a situacao; sem imagens, o aviso de vazio', async () => {
    abrir(rotas())
    await screen.findByRole('img', { name: 'Imagem nº 1' })
    expect(within(quadrado(2)).getByText('Devolvida')).toBeTruthy()
    expect(within(quadrado(4)).getByText('TC · 120 cortes')).toBeTruthy()
    cleanup()
    abrir(rotas({ 'GET /envios/meus': { corpo: { itens: [] } } }))
    expect(await screen.findByText(/Você ainda não enviou nenhuma imagem/)).toBeTruthy()
  })

  it('o filtro por tipo esconde as de outro tipo (sem tipo so aparece em Todos)', async () => {
    abrir(rotas(), { filtroTipo: 'periapical' })
    await screen.findByRole('img', { name: 'Imagem nº 1' })
    expect(screen.queryByRole('img', { name: 'Imagem nº 2' })).toBeNull()
    expect(screen.queryByRole('img', { name: 'Imagem nº 3' })).toBeNull()
    expect(screen.queryByRole('img', { name: 'Imagem nº 4' })).toBeNull()
  })

  it('o "i" mostra as informacoes da imagem', async () => {
    abrir(rotas())
    await screen.findByRole('img', { name: 'Imagem nº 2' })
    fireEvent.click(within(quadrado(2)).getByRole('button', { name: 'Ver informações' }))
    expect(within(quadrado(2)).getByText(/Imagem cortada/)).toBeTruthy()
  })

  it('equipe: seleciona e envia a pessoas ou grupos, uma chamada por imagem', async () => {
    const usuario = userEvent.setup()
    const servidor = abrir(
      rotas({
        'POST /envios/1/enviar-para': { corpo: { mensagem: 'Enviada.' } },
        'POST /envios/3/enviar-para': { corpo: { mensagem: 'Enviada.' } },
      }),
      { equipe: true },
    )
    await screen.findByRole('img', { name: 'Imagem nº 1' })
    expect(screen.queryByRole('button', { name: 'Enviar a pessoas ou grupos' })).toBeNull() // so com selecao
    marcar(1)
    marcar(3)
    await usuario.click(screen.getByRole('button', { name: 'Enviar a pessoas ou grupos' }))
    await usuario.click(screen.getByRole('button', { name: 'escolher Ana e o grupo 9' }))
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }))
    await waitFor(() => expect(servidor.alteracoes()).toHaveLength(2))
    expect(servidor.alteracoes()).toEqual([
      { metodo: 'POST', caminho: '/envios/1/enviar-para', corpo: { pessoas_ids: [4], grupos_ids: [9] } },
      { metodo: 'POST', caminho: '/envios/3/enviar-para', corpo: { pessoas_ids: [4], grupos_ids: [9] } },
    ])
    expect(await screen.findByText('Enviado: 2 imagens.')).toBeTruthy()
  })

  it('estudante: nao envia a pessoas; manda as selecionadas para analise com quem escolher', async () => {
    const usuario = userEvent.setup()
    const servidor = abrir(
      rotas({
        'POST /envios/1/analise': { corpo: { mensagem: 'ok' } },
        'POST /envios/2/analise': { corpo: { mensagem: 'ok' } },
      }),
    )
    await screen.findByRole('img', { name: 'Imagem nº 1' })
    marcar(1)
    marcar(2)
    expect(screen.queryByRole('button', { name: 'Enviar a pessoas ou grupos' })).toBeNull()
    await usuario.click(screen.getByRole('button', { name: 'Enviar para análise' }))
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Quem vai analisar' }), '21')
    await usuario.type(screen.getByRole('textbox', { name: 'Recado (opcional)' }), 'Ajuda?')
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }))
    await waitFor(() => expect(servidor.alteracoes()).toHaveLength(2))
    expect(servidor.alteracoes()[0]).toEqual({ metodo: 'POST', caminho: '/envios/1/analise', corpo: { analista_id: 21, nota: 'Ajuda?' } })
  })

  it('"Enviar para análise" e "Retirar" so aparecem se todas as selecionadas ainda sao so minhas ou devolvidas', async () => {
    abrir(rotas())
    await screen.findByRole('img', { name: 'Imagem nº 1' })
    marcar(1)
    marcar(3) // na fila
    expect(screen.queryByRole('button', { name: 'Enviar para análise' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Retirar/ })).toBeNull()
  })

  it('retirar as selecionadas pede confirmacao e apaga uma por uma', async () => {
    const usuario = userEvent.setup()
    const servidor = abrir(
      rotas({ 'DELETE /envios/1': { corpo: { mensagem: 'ok' } }, 'DELETE /envios/2': { corpo: { mensagem: 'ok' } } }),
    )
    await screen.findByRole('img', { name: 'Imagem nº 1' })
    marcar(1)
    marcar(2)
    await usuario.click(screen.getByRole('button', { name: /Retirar/ }))
    await usuario.click(await screen.findByRole('button', { name: 'Sim, retirar' }))
    await waitFor(() => expect(servidor.alteracoes()).toHaveLength(2))
    expect(servidor.alteracoes().map((a) => `${a.metodo} ${a.caminho}`)).toEqual(['DELETE /envios/1', 'DELETE /envios/2'])
  })

  it('"Ver selecionadas" abre o visualizador com as selecionadas juntas', async () => {
    const abrirJanela = vi.spyOn(window, 'open').mockImplementation(() => null)
    abrir(rotas())
    await screen.findByRole('img', { name: 'Imagem nº 1' })
    marcar(1)
    marcar(2)
    fireEvent.click(screen.getByRole('button', { name: /Ver 2 selecionadas/ }))
    expect(abrirJanela).toHaveBeenCalledWith('http://ohif.teste/viewer?StudyInstanceUIDs=1.2.1%2C1.2.2', '_blank', 'noopener,noreferrer')
    abrirJanela.mockRestore()
  })
})

describe('recebidas de colegas (Compartilhadas comigo, 22/11/2026)', () => {
  const RECEBIDAS = [
    item(11, 'na_fila', { enviado_por: 'Prof. Silva', nova: true }),
    item(12, 'no_banco', { enviado_por: 'Curadora Lima', tipo_radiografia: 'oclusal' }),
  ]
  const rotasRecebidas = (extra: Record<string, Rota> = {}): Record<string, Rota> => ({
    'GET /envios/recebidas': { corpo: { itens: RECEBIDAS } },
    'POST /envios/recebidas/vistas': { status: 204 },
    ...extra,
  })
  function abrirRecebidas(r: Record<string, Rota>, filtroTipo: string | null = null) {
    const servidor = servidorFalso(r)
    montarTela(<GradeEnvios modo="recebidas" equipe filtroTipo={filtroTipo} />)
    return servidor
  }

  it('mostra quem enviou no "i", marca as novas como vistas e so oferece "Ver selecionadas"', async () => {
    const servidor = abrirRecebidas(rotasRecebidas())
    expect(await screen.findByRole('heading', { name: 'Recebidas de colegas' })).toBeTruthy()
    await screen.findByRole('img', { name: 'Imagem nº 11' })
    fireEvent.click(within(quadrado(11)).getByRole('button', { name: 'Ver informações' }))
    expect(within(quadrado(11)).getByText(/Enviada por Prof\. Silva/)).toBeTruthy()
    await waitFor(() => expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: '/envios/recebidas/vistas', corpo: undefined }]))
    marcar(11)
    expect(screen.queryByRole('button', { name: 'Enviar a pessoas ou grupos' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Retirar/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Ver 1 selecionada/ })).toBeTruthy()
    expect(servidor.pedidos.some((p) => p.caminho === '/envios/analistas')).toBe(false)
  })

  it('sem nenhuma recebida: a secao nao aparece', async () => {
    const servidor = abrirRecebidas(rotasRecebidas({ 'GET /envios/recebidas': { corpo: { itens: [] } } }))
    await waitFor(() => expect(servidor.pedidos.some((p) => p.caminho === '/envios/recebidas')).toBe(true))
    expect(screen.queryByRole('heading', { name: 'Recebidas de colegas' })).toBeNull()
  })

  it('o filtro por tipo vale aqui tambem', async () => {
    abrirRecebidas(rotasRecebidas(), 'oclusal')
    await screen.findByRole('img', { name: 'Imagem nº 12' })
    expect(screen.queryByRole('img', { name: 'Imagem nº 11' })).toBeNull()
  })
})
