// @vitest-environment jsdom
//
// IMAGENS DO GRUPO (17/11/2026, Etapa 3):
// - visao do DONO (components/envios/ImagensGrupoDono.tsx): lista das
//   imagens enviadas, chave "Participantes podem comentar", conversas (uma
//   por participante) com resposta, "Retirar do grupo" com confirmacao;
// - visao do PARTICIPANTE (components/envios/ImagensGrupoParticipante.tsx):
//   imagem com as marcacoes DA AULA e o selo, destaques, mensagem, a PROPRIA
//   conversa, campo "Comentar" so quando o dono permitiu, apagar o proprio
//   comentario.
// Simulado: a imagem marcada (ImagemPrincipalMarcada, teste proprio).
// Quem decide de verdade e o servidor (tests/test_grupos_modo_aula.py). Dados inventados.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ImagensGrupoDono from '../../../../frontend/src/components/envios/ImagensGrupoDono'
import ImagensGrupoParticipante from '../../../../frontend/src/components/envios/ImagensGrupoParticipante'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

vi.mock('../../../../frontend/src/components/detalhe/ImagemPrincipalMarcada', () => ({
  default: ({ curationId, marcacoes }: { curationId: number; marcacoes: { id: string }[] }) => (
    <p>imagem {curationId} com marcacoes {marcacoes.map((m) => m.id).join(',')}</p>
  ),
}))

const ENVIOS_DONO = [
  { id: 9, curation_id: 42, tipo_radiografia: 'periapical', mensagem: 'Observem o ápice.', permite_comentar: true, destaques: ['lesao_periapical'], comentarios: 2, criado_em: null },
  { id: 8, curation_id: 41, tipo_radiografia: null, mensagem: null, permite_comentar: false, destaques: [], comentarios: 0, criado_em: null },
]
const CONVERSAS = [
  { participante: { id: 20, nome: 'Ana' }, comentarios: [{ id: 1, autor: 'participante', texto: 'Seria o 36?' }, { id: 2, autor: 'dono', texto: 'Isso.' }] },
]

beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

describe('visao do dono', () => {
  async function abrir(extra: Record<string, Rota> = {}) {
    const servidor = servidorFalso({ 'GET /grupos/3/envios': { corpo: { envios: ENVIOS_DONO } }, ...extra })
    montarTela(<ImagensGrupoDono grupoId={3} />)
    await screen.findByRole('link', { name: 'Imagem nº 42' })
    return servidor
  }
  const item = (n: number) => screen.getByRole('link', { name: `Imagem nº ${n}` }).closest('li') as HTMLElement

  it('lista as imagens com mensagem, destaques e a chave de comentarios; orienta como enviar', async () => {
    await abrir()
    expect(screen.getByRole('link', { name: 'Ir ao Banco de imagens' }).getAttribute('href')).toBe('/banco-imagens')
    expect(item(42).textContent).toContain('“Observem o ápice.”')
    expect(item(42).textContent).toContain('Destaques: Lesão periapical')
    expect((within(item(42)).getByLabelText('Participantes podem comentar') as HTMLInputElement).checked).toBe(true)
    expect((within(item(41)).getByLabelText('Participantes podem comentar') as HTMLInputElement).checked).toBe(false)
    expect(within(item(41)).getByRole('button', { name: 'Conversas (nenhum comentário)' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Imagem nº 42' }).getAttribute('href')).toBe('/visualizar/42')
  })

  it.each([
    ['nenhuma imagem', { corpo: { envios: [] } } as Rota],
    ['erro', { status: 500 } as Rota],
    ['sem conexao', 'SEM_CONEXAO' as Rota],
    ['sem corpo', { status: 204 } as Rota],
  ])('%s: "Nenhuma imagem enviada"', async (_n, rota) => {
    servidorFalso({ 'GET /grupos/3/envios': rota })
    montarTela(<ImagensGrupoDono grupoId={3} />)
    expect(await screen.findByText('Nenhuma imagem enviada a este grupo ainda.')).toBeTruthy()
  })

  it('liga e desliga os comentarios (PATCH) e avisa', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir({ 'PATCH /grupos/3/envios/9': { corpo: {} }, 'PATCH /grupos/3/envios/8': { corpo: {} } })
    await usuario.click(within(item(42)).getByLabelText('Participantes podem comentar'))
    expect((await screen.findByRole('status')).textContent).toBe('Comentários fechados nesta imagem. As conversas anteriores continuam visíveis.')
    await usuario.click(within(item(41)).getByLabelText('Participantes podem comentar'))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Comentários abertos nesta imagem.'))
    expect(servidor.alteracoes()).toEqual([
      { metodo: 'PATCH', caminho: '/grupos/3/envios/9', corpo: { permite_comentar: false } },
      { metodo: 'PATCH', caminho: '/grupos/3/envios/8', corpo: { permite_comentar: true } },
    ])
  })

  it('abre as conversas, responde a uma pessoa e recarrega', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir({
      'GET /grupos/3/envios/9/conversas': { corpo: { conversas: CONVERSAS } },
      'POST /grupos/3/envios/9/conversas/20': { corpo: {} },
    })
    await usuario.click(within(item(42)).getByRole('button', { name: 'Conversas (2 comentários)' }))
    const conversa = await screen.findByRole('region', { name: 'Conversa com Ana' })
    expect(conversa.textContent).toContain('Ana: Seria o 36?')
    expect(conversa.textContent).toContain('Você: Isso.')
    await usuario.click(within(conversa).getByRole('button', { name: 'Responder' })) // vazio: nao manda
    expect(servidor.alteracoes()).toEqual([])
    await usuario.type(within(conversa).getByLabelText('Responder a Ana'), 'Muito bem.')
    await usuario.click(within(conversa).getByRole('button', { name: 'Responder' }))
    await waitFor(() => expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: '/grupos/3/envios/9/conversas/20', corpo: { texto: 'Muito bem.' } }]))
    await waitFor(() => expect((within(conversa).getByLabelText('Responder a Ana') as HTMLInputElement).value).toBe(''))
    expect(servidor.pedidos.filter((p) => p.caminho === '/grupos/3/envios/9/conversas' && p.metodo === 'GET').length).toBe(2)
  })

  it.each([
    ['sem conversas', { corpo: { conversas: [] } } as Rota, 'Nenhum comentário nesta imagem.'],
    ['erro', { status: 500 } as Rota, 'Nenhum comentário nesta imagem.'],
    ['sem corpo', { status: 204 } as Rota, 'Nenhum comentário nesta imagem.'],
  ])('conversas (%s)', async (_n, rota, texto) => {
    const usuario = userEvent.setup()
    await abrir({ 'GET /grupos/3/envios/9/conversas': rota })
    await usuario.click(within(item(42)).getByRole('button', { name: 'Conversas (2 comentários)' }))
    expect(await screen.findByText(texto)).toBeTruthy()
    await usuario.click(within(item(42)).getByRole('button', { name: 'Conversas (2 comentários)' })) // fecha
    expect(screen.queryByText(texto)).toBeNull()
  })

  it.each([
    ['motivo do servidor', { status: 404, corpo: { detail: 'Essa pessoa não participa do grupo.' } } as Rota, 'Essa pessoa não participa do grupo.'],
    ['sem motivo', { status: 500 } as Rota, 'Não foi possível concluir. Tente de novo.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Sem conexão com o servidor. Tente de novo.'],
  ])('falha ao responder (%s): avisa', async (_n, rota, mensagem) => {
    const usuario = userEvent.setup()
    await abrir({ 'GET /grupos/3/envios/9/conversas': { corpo: { conversas: CONVERSAS } }, 'POST /grupos/3/envios/9/conversas/20': rota })
    await usuario.click(within(item(42)).getByRole('button', { name: 'Conversas (2 comentários)' }))
    const conversa = await screen.findByRole('region', { name: 'Conversa com Ana' })
    await usuario.type(within(conversa).getByLabelText('Responder a Ana'), 'Oi')
    await usuario.click(within(conversa).getByRole('button', { name: 'Responder' }))
    expect((await within(conversa.parentElement as HTMLElement).findByRole('alert')).textContent).toBe(mensagem)
  })

  it('retirar do grupo pede confirmacao; "Cancelar" nao retira', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir({ 'DELETE /grupos/3/envios/9': { corpo: {} } })
    await usuario.click(screen.getByRole('button', { name: 'Retirar a imagem nº 42 do grupo' }))
    await usuario.click(within(screen.getByRole('alertdialog')).getByText('Cancelar', { selector: 'button[data-acao="cancelar"]' }))
    expect(servidor.alteracoes()).toEqual([])
    await usuario.click(screen.getByRole('button', { name: 'Retirar a imagem nº 42 do grupo' }))
    await usuario.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Sim, retirar' }))
    expect((await screen.findByRole('status')).textContent).toBe('Imagem retirada do grupo.')
    expect(servidor.alteracoes()).toEqual([{ metodo: 'DELETE', caminho: '/grupos/3/envios/9', corpo: undefined }])
  })

  it.each([
    ['motivo do servidor', { status: 404, corpo: { detail: 'Imagem do grupo não encontrada.' } } as Rota, 'Imagem do grupo não encontrada.'],
    ['sem motivo', { status: 500 } as Rota, 'Não foi possível concluir. Tente de novo.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Sem conexão com o servidor. Tente de novo.'],
  ])('falha ao mudar a chave (%s): avisa', async (_n, rota, mensagem) => {
    const usuario = userEvent.setup()
    await abrir({ 'PATCH /grupos/3/envios/9': rota })
    await usuario.click(within(item(42)).getByLabelText('Participantes podem comentar'))
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
  })
})

describe('visao do participante', () => {
  const ENVIOS = [
    {
      id: 9, curation_id: 42, remetente: 'Prof. Silva', mensagem: 'Observem o ápice.', permite_comentar: true,
      marcacoes: [{ id: 'a1', tipo: 'seta' }], destaques: ['lesao_periapical', 'valor_sem_traducao'],
      comentarios: [{ id: 1, autor: 'eu', texto: 'Seria o 36?' }, { id: 2, autor: 'dono', texto: 'Isso.' }],
    },
    { id: 8, curation_id: 41, remetente: 'Prof. Silva', mensagem: null, permite_comentar: false, marcacoes: [], destaques: [], comentarios: [] },
  ]
  async function abrir(extra: Record<string, Rota> = {}) {
    const servidor = servidorFalso({ 'GET /grupos/participo/3/envios': { corpo: { envios: ENVIOS } }, ...extra })
    montarTela(<ImagensGrupoParticipante grupoId={3} />)
    await screen.findByRole('listitem', { name: 'Imagem nº 42' })
    return servidor
  }
  const item = (n: number) => screen.getByRole('listitem', { name: `Imagem nº ${n}` })

  it('mostra a imagem com as marcacoes da aula e o selo, mensagem, destaques e a propria conversa', async () => {
    await abrir()
    const i = item(42)
    expect(within(i).getByText('Marcações de Prof. Silva para esta aula')).toBeTruthy()
    expect(within(i).getByText('imagem 42 com marcacoes a1')).toBeTruthy()
    expect(i.textContent).toContain('“Observem o ápice.”')
    expect(i.textContent).toContain('Destaques: Lesão periapical, valor_sem_traducao')
    expect(within(i).getByRole('link', { name: 'Ver a ficha oficial desta imagem' }).getAttribute('href')).toBe('/visualizar/42')
    const conversa = within(i).getByRole('region', { name: 'Sua conversa com o dono do grupo' })
    expect(conversa.textContent).toContain('Você: Seria o 36?')
    expect(conversa.textContent).toContain('Prof. Silva: Isso.')
    expect(within(conversa).getAllByRole('button', { name: 'Apagar o meu comentário' })).toHaveLength(1) // so o proprio
    expect(within(i).getByText('Só você e o dono do grupo veem esta conversa.')).toBeTruthy()
    // comentarios fechados: sem campo
    expect(within(item(41)).queryByLabelText('Seu comentário')).toBeNull()
    expect(within(item(41)).getByText('Os comentários desta imagem estão fechados.')).toBeTruthy()
  })

  it.each([
    ['nenhuma imagem', { corpo: { envios: [] } } as Rota],
    ['erro', { status: 404 } as Rota],
    ['sem conexao', 'SEM_CONEXAO' as Rota],
    ['sem corpo', { status: 204 } as Rota],
  ])('%s: "ainda nao enviou imagens"', async (_n, rota) => {
    servidorFalso({ 'GET /grupos/participo/3/envios': rota })
    montarTela(<ImagensGrupoParticipante grupoId={3} />)
    expect(await screen.findByText('O dono do grupo ainda não enviou imagens.')).toBeTruthy()
  })

  it('comenta (vazio nao manda), limpa o campo e recarrega', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir({ 'POST /grupos/participo/3/envios/9/comentarios': { corpo: {} } })
    await usuario.click(within(item(42)).getByRole('button', { name: 'Comentar' }))
    expect(servidor.alteracoes()).toEqual([])
    await usuario.type(within(item(42)).getByLabelText('Seu comentário'), 'Outra dúvida')
    await usuario.click(within(item(42)).getByRole('button', { name: 'Comentar' }))
    await waitFor(() => expect(servidor.alteracoes()).toEqual([
      { metodo: 'POST', caminho: '/grupos/participo/3/envios/9/comentarios', corpo: { texto: 'Outra dúvida' } },
    ]))
    await waitFor(() => expect((within(item(42)).getByLabelText('Seu comentário') as HTMLInputElement).value).toBe(''))
  })

  it('apaga o proprio comentario', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir({ 'DELETE /grupos/participo/3/envios/9/comentarios/1': { corpo: {} } })
    await usuario.click(within(item(42)).getByRole('button', { name: 'Apagar o meu comentário' }))
    await waitFor(() => expect(servidor.alteracoes()).toEqual([
      { metodo: 'DELETE', caminho: '/grupos/participo/3/envios/9/comentarios/1', corpo: undefined },
    ]))
  })

  it.each([
    ['comentarios fechados pelo dono', { status: 403, corpo: { detail: 'O dono do grupo não abriu esta imagem para comentários.' } } as Rota,
      'O dono do grupo não abriu esta imagem para comentários.'],
    ['sem motivo', { status: 500 } as Rota, 'Não foi possível concluir. Tente de novo.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Sem conexão com o servidor. Tente de novo.'],
  ])('falha ao comentar (%s): avisa e mantem o texto', async (_n, rota, mensagem) => {
    const usuario = userEvent.setup()
    await abrir({ 'POST /grupos/participo/3/envios/9/comentarios': rota })
    await usuario.type(within(item(42)).getByLabelText('Seu comentário'), 'Dúvida')
    await usuario.click(within(item(42)).getByRole('button', { name: 'Comentar' }))
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
    expect((within(item(42)).getByLabelText('Seu comentário') as HTMLInputElement).value).toBe('Dúvida')
  })
})
