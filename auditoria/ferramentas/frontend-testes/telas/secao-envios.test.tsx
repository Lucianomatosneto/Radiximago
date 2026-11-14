// @vitest-environment jsdom
//
// COMPONENTE "Secao de envios" (Fase 3b): frontend/src/components/envios/SecaoEnvios.tsx.
// Aparece em Minhas imagens ("meus"), Compartilhadas comigo ("analisar" e
// "recebidas"). Confere, por modo:
// - meus: vazio, situacoes, mandar para analise (exige quem analisa),
//   retirar (com confirmacao), equipe envia a pessoas e grupos;
// - analisar: colocar na fila, devolver (exige recado);
// - recebidas: some quando vazia, marca as novas como vistas.
// Erros: motivo do servidor, mensagem padrao, sem conexao.
// Simulados: miniatura (imagem real) e seletor de pessoas (teste proprio).
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SecaoEnvios from '../../../../frontend/src/components/envios/SecaoEnvios'
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
  viewer_url: null,
  ...extra,
})
const MEUS = [
  item(1, 'so_para_mim', { viewer_url: 'http://ohif.teste/v?1' }),
  item(2, 'devolvida', { devolucao_nota: 'Imagem cortada', analise_nota: 'É lesão?' }),
  item(3, 'em_analise', { analista: 'Prof. Teste' }),
  item(4, 'no_banco', { enviada_para: 3 }),
]
const ANALISTAS = { pessoas: [{ id: 21, nome: 'Prof. Teste', perfil: 'professor' }] }
function abrir(modo: 'meus' | 'analisar' | 'recebidas', rotas: Record<string, Rota>, equipe = false) {
  const servidor = servidorFalso(rotas)
  montarTela(<SecaoEnvios modo={modo} equipe={equipe} />)
  return servidor
}
const cartao = (id: number) => screen.getByText(`Imagem nº ${id}`, { selector: 'span' }).closest('li') as HTMLElement
const meus = (extra: Record<string, Rota> = {}) => ({ 'GET /envios/meus': { corpo: { itens: MEUS } }, 'GET /envios/analistas': { corpo: ANALISTAS }, ...extra })

afterEach(() => cleanup())

describe('meus envios', () => {
  it('vazio: explica como enviar', async () => {
    abrir('meus', { 'GET /envios/meus': { corpo: { itens: [] } }, 'GET /envios/analistas': 'SEM_CONEXAO' })
    expect(await screen.findByText(/Você ainda não enviou nenhuma imagem/)).toBeTruthy()
  })

  it('lista que falha (erro ou sem conexao) aparece vazia', async () => {
    abrir('meus', { 'GET /envios/meus': 'SEM_CONEXAO', 'GET /envios/analistas': { status: 500 } })
    expect(await screen.findByText(/Você ainda não enviou nenhuma imagem/)).toBeTruthy()
  })

  it('cada cartao mostra a situacao, com quem esta, recados e o link do visualizador', async () => {
    abrir('meus', meus())
    expect(await screen.findByRole('heading', { name: 'Imagens enviadas por mim' })).toBeTruthy()
    expect(within(cartao(1)).getByText('Só para mim')).toBeTruthy()
    expect(within(cartao(1)).getByRole('link', { name: 'Abrir no visualizador' }).getAttribute('href')).toBe('http://ohif.teste/v?1')
    expect(within(cartao(2)).getByText('Recado: “Imagem cortada”')).toBeTruthy()
    expect(within(cartao(2)).getByText('“É lesão?”')).toBeTruthy()
    expect(within(cartao(3)).getByText('Com Prof. Teste')).toBeTruthy()
    expect(within(cartao(4)).getByText('Enviada para 3 pessoas')).toBeTruthy()
    // so as que estao comigo (so para mim ou devolvidas) podem ir para analise ou ser retiradas
    expect(within(cartao(3)).queryByRole('button', { name: 'Retirar' })).toBeNull()
    expect(within(cartao(1)).getByRole('button', { name: 'Retirar' })).toBeTruthy()
  })

  it('mandar para analise: exige quem analisa; manda analista e recado e mostra a resposta', async () => {
    const usuario = userEvent.setup()
    const servidor = abrir('meus', meus({ 'POST /envios/1/analise': { corpo: { mensagem: 'Enviada para Prof. Teste.' } } }))
    await usuario.click(await within(await waitFor(() => cartao(1))).findByRole('button', { name: 'Enviar para análise' }))
    const enviar = within(cartao(1)).getByRole('button', { name: 'Enviar' }) as HTMLButtonElement
    expect(enviar.disabled).toBe(true)
    await usuario.selectOptions(within(cartao(1)).getByRole('combobox', { name: 'Quem vai analisar' }), 'Prof. Teste')
    await usuario.type(within(cartao(1)).getByRole('textbox', { name: 'Recado (opcional)' }), 'Confere?')
    await usuario.click(enviar)
    expect((await screen.findByRole('status')).textContent).toBe('Enviada para Prof. Teste.')
    expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: '/envios/1/analise', corpo: { analista_id: 21, nota: 'Confere?' } }])
    await waitFor(() => expect(servidor.pedidos.filter((p) => p.caminho === '/envios/meus')).toHaveLength(2))
  })

  it('sem recado vai null; "Cancelar" fecha; sem analistas o botao nem aparece', async () => {
    const usuario = userEvent.setup()
    const servidor = abrir('meus', meus({ 'POST /envios/2/analise': { corpo: {} } }))
    await usuario.click(await within(await waitFor(() => cartao(2))).findByRole('button', { name: 'Enviar para análise' }))
    await usuario.click(within(cartao(2)).getByRole('button', { name: 'Cancelar' }))
    expect(within(cartao(2)).queryByRole('combobox')).toBeNull()
    await usuario.click(within(cartao(2)).getByRole('button', { name: 'Enviar para análise' }))
    await usuario.selectOptions(within(cartao(2)).getByRole('combobox'), 'Prof. Teste')
    await usuario.click(within(cartao(2)).getByRole('button', { name: 'Enviar' }))
    await waitFor(() => expect(servidor.alteracoes()[0].corpo).toEqual({ analista_id: 21, nota: null }))
    expect(screen.queryByRole('status')).toBeNull() // sem mensagem do servidor
    cleanup()
    abrir('meus', meus({ 'GET /envios/analistas': { corpo: { pessoas: [] } } }))
    await waitFor(() => expect(within(cartao(1)).getByRole('button', { name: 'Retirar' })).toBeTruthy())
    expect(within(cartao(1)).queryByRole('button', { name: 'Enviar para análise' })).toBeNull()
  })

  it('retirar pede confirmacao: "Cancelar" nao apaga; "Sim, retirar" apaga', async () => {
    const usuario = userEvent.setup()
    const servidor = abrir('meus', meus({ 'DELETE /envios/1': { corpo: { mensagem: 'Retirada.' } } }))
    await usuario.click(await within(await waitFor(() => cartao(1))).findByRole('button', { name: 'Retirar' }))
    const pergunta = screen.getByRole('alertdialog')
    expect(pergunta.textContent).toContain('Retirar esta imagem?')
    await usuario.click(within(pergunta).getByText('Cancelar', { selector: 'button[data-acao="cancelar"]' }))
    expect(servidor.alteracoes()).toEqual([])
    await usuario.click(within(cartao(1)).getByRole('button', { name: 'Retirar' }))
    await usuario.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Sim, retirar' }))
    expect((await screen.findByRole('status')).textContent).toBe('Retirada.')
    expect(servidor.alteracoes()).toEqual([{ metodo: 'DELETE', caminho: '/envios/1', corpo: undefined }])
  })

  it('equipe: "Enviar a pessoas ou grupos" exige alguem; manda pessoas e grupos', async () => {
    const usuario = userEvent.setup()
    const servidor = abrir('meus', meus({ 'POST /envios/4/enviar-para': { corpo: { mensagem: 'Enviada.' } } }), true)
    await usuario.click(await within(await waitFor(() => cartao(4))).findByRole('button', { name: 'Enviar a pessoas ou grupos' }))
    expect((within(cartao(4)).getByRole('button', { name: 'Enviar' }) as HTMLButtonElement).disabled).toBe(true)
    await usuario.click(within(cartao(4)).getByRole('button', { name: 'Cancelar' }))
    await usuario.click(within(cartao(4)).getByRole('button', { name: 'Enviar a pessoas ou grupos' }))
    await usuario.click(within(cartao(4)).getByRole('button', { name: 'escolher Ana e o grupo 9' }))
    await usuario.click(within(cartao(4)).getByRole('button', { name: 'Enviar' }))
    expect((await screen.findByRole('status')).textContent).toBe('Enviada.')
    expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: '/envios/4/enviar-para', corpo: { pessoas_ids: [4], grupos_ids: [9] } }])
    expect(within(cartao(4)).queryByRole('button', { name: 'escolher Ana e o grupo 9' })).toBeNull()
  })

  it('equipe com envio recusado: o seletor continua aberto com o aviso', async () => {
    const usuario = userEvent.setup()
    abrir('meus', meus({ 'POST /envios/4/enviar-para': { status: 400, corpo: { detail: 'Grupo vazio.' } } }), true)
    await usuario.click(await within(await waitFor(() => cartao(4))).findByRole('button', { name: 'Enviar a pessoas ou grupos' }))
    await usuario.click(within(cartao(4)).getByRole('button', { name: 'escolher Ana e o grupo 9' }))
    await usuario.click(within(cartao(4)).getByRole('button', { name: 'Enviar' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Grupo vazio.')
    expect(within(cartao(4)).getByRole('button', { name: 'escolher Ana e o grupo 9' })).toBeTruthy()
  })
})

describe('para analisar (professor e curador)', () => {
  const PARA = [item(7, 'em_analise', { enviado_por: 'Aluna Teste', analise_nota: 'Ajuda?' })]

  it('colocar na fila de curadoria', async () => {
    const usuario = userEvent.setup()
    const servidor = abrir('analisar', { 'GET /envios/para-analisar': { corpo: { itens: PARA } }, 'POST /envios/7/decidir': { corpo: { mensagem: 'Na fila.' } } })
    expect(await screen.findByText('Enviada por Aluna Teste')).toBeTruthy()
    await usuario.click(screen.getByRole('button', { name: 'Colocar na fila de curadoria' }))
    expect((await screen.findByRole('status')).textContent).toBe('Na fila.')
    expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: '/envios/7/decidir', corpo: { acao: 'fila' } }])
    expect(servidor.pedidos.map((p) => p.caminho)).not.toContain('/envios/analistas')
  })

  it('devolver exige recado e manda o recado', async () => {
    const usuario = userEvent.setup()
    const servidor = abrir('analisar', { 'GET /envios/para-analisar': { corpo: { itens: PARA } }, 'POST /envios/7/decidir': { corpo: {} } })
    await usuario.click(await screen.findByRole('button', { name: 'Devolver com recado' }))
    const devolver = screen.getByRole('button', { name: 'Devolver' }) as HTMLButtonElement
    await usuario.type(screen.getByRole('textbox', { name: 'Por que está devolvendo? (o estudante vai ler)' }), '   ')
    expect(devolver.disabled).toBe(true)
    await usuario.type(screen.getByRole('textbox'), 'Falta o 36')
    await usuario.click(devolver)
    await waitFor(() => expect(servidor.alteracoes()[0].corpo).toEqual({ acao: 'devolver', nota: '   Falta o 36' }))
  })

  it.each([
    ['motivo do servidor', { status: 409, corpo: { detail: 'Já decidida.' } } as Rota, 'Já decidida.'],
    ['sem motivo', { status: 500 } as Rota, 'Não foi possível concluir.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Sem conexão com o servidor. Tente de novo.'],
  ])('falha ao decidir (%s): avisa', async (_n, rota, mensagem) => {
    const usuario = userEvent.setup()
    abrir('analisar', { 'GET /envios/para-analisar': { corpo: { itens: PARA } }, 'POST /envios/7/decidir': rota })
    await usuario.click(await screen.findByRole('button', { name: 'Colocar na fila de curadoria' }))
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
  })

  it('sem nada para analisar, a secao nao aparece', async () => {
    const servidor = abrir('analisar', { 'GET /envios/para-analisar': { corpo: { itens: [] } } })
    await waitFor(() => expect(servidor.pedidos).toHaveLength(1))
    expect(screen.queryByRole('heading')).toBeNull()
  })
})

describe('recebidas de colegas', () => {
  it('mostra quem enviou e "nova"; marca as novas como vistas', async () => {
    const servidor = abrir('recebidas', {
      'GET /envios/recebidas': { corpo: { itens: [item(8, 'na_fila', { enviado_por: 'Prof. Teste', nova: true })] } },
      'POST /envios/recebidas/vistas': 'SEM_CONEXAO', // se falhar, nada quebra
    })
    expect(await screen.findByText('Enviada por Prof. Teste · nova')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Recebidas de colegas' })).toBeTruthy()
    await waitFor(() => expect(servidor.alteracoes().map((p) => p.caminho)).toEqual(['/envios/recebidas/vistas']))
  })

  it('sem novas, nao marca nada', async () => {
    const servidor = abrir('recebidas', { 'GET /envios/recebidas': { corpo: { itens: [item(8, 'na_fila', { enviado_por: 'Prof. Teste' })] } } })
    expect(await screen.findByText('Enviada por Prof. Teste')).toBeTruthy()
    expect(servidor.alteracoes()).toEqual([])
  })
})
