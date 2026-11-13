// @vitest-environment jsdom
//
// TELA "Segunda opiniao" (frontend/src/app/segunda-opiniao/page.tsx) - Fase 1.
// O REVISOR avalia a ficha de outro curador e envia o parecer; QUEM PEDIU ve o
// parecer, acrescenta ou dispensa cada anotacao e aprova/descarta a ficha.
// Os paineis da propria tela (fila, parecer, devolvida) sao os de verdade;
// so o visualizador OHIF (moldura de outro site) fica de fora.
// Dados inventados: pessoas, fichas e textos nao sao reais.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SegundaOpiniaoPage from '../../../../frontend/src/app/segunda-opiniao/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/segunda-opiniao' }))
vi.mock('../../../../frontend/src/components/segundaOpiniao/VisualizadorRevisao', () => ({
  default: ({ viewerInfo, carregando }: { viewerInfo: { viewer_url: string | null } | null; carregando: boolean }) => (
    <div data-testid="visualizador">{carregando ? 'abrindo imagem' : (viewerInfo?.viewer_url ?? 'sem imagem')}</div>
  ),
}))

// ---- dados inventados ----
const CURADOR = { id: 7, nome: 'Revisor Beta', email: 'revisor@exemplo.test', perfil: 'curador', foto_perfil_url: null }
const PEDIDO = {
  id: 31,
  motivo: 'Dúvida entre lesão periapical e alargamento do ligamento.',
  primeiro_parecer: 'Parece lesão periapical.',
  criado_em: '2026-11-10T13:00:00Z',
  solicitante: { id: 3, nome: 'Curadora Alfa' },
  pode_responder: true,
  curation: { id: 501, achado_principal: 'lesao_periapical', tipo_radiografia: 'periapical' },
  orthanc_reference: { id: 901, orthanc_id: 'sintetico-901' },
}
const PEDIDO_PROPRIO = { ...PEDIDO, id: 32, solicitante: { id: 7, nome: 'Revisor Beta' }, pode_responder: false, curation: { ...PEDIDO.curation, id: 502 } }
const DEVOLVIDA = {
  ...PEDIDO,
  id: 41,
  solicitante: { id: 7, nome: 'Revisor Beta' },
  revisor: { id: 3, nome: 'Curadora Alfa' },
  respondido_em: '2026-11-11T15:00:00Z',
  anotacoes_pendentes: 1,
  curation: { id: 601, achado_principal: 'carie', tipo_radiografia: 'interproximal' },
  orthanc_reference: { id: 902, orthanc_id: 'sintetico-902' },
}
function ficha(id: number) {
  return {
    id,
    tipo_radiografia: 'periapical',
    dentes: [36],
    idade_min: 30,
    idade_max: 40,
    genero: 'feminino',
    achado_principal: 'lesao_periapical',
    marcacoes: [],
    achados_detalhe: null,
    alteracoes_observadas: [],
    qualidade_tecnica: 'boa',
    descricao_didatica: 'Imagem radiolúcida no ápice do 36 (texto de teste).',
    observacoes_internas: null,
    status: 'em_revisao',
    erros_tecnicos: [],
  }
}
function detalhe(id: number, curationId: number, extra: object = {}) {
  return {
    id,
    curation_id: curationId,
    orthanc_reference_id: 901,
    status: 'solicitada',
    status_ficha: 'em_revisao',
    motivo: PEDIDO.motivo,
    primeiro_parecer: PEDIDO.primeiro_parecer,
    criado_em: PEDIDO.criado_em,
    respondido_em: null,
    solicitante: PEDIDO.solicitante,
    curador_da_ficha: PEDIDO.solicitante,
    revisor: null,
    classificacao: null,
    concordancia: null,
    parecer_revisor: null,
    anotacoes: [],
    pode_responder: true,
    pode_incorporar: false,
    ...extra,
  }
}
const NOTA = {
  id: 77,
  item: 'tipo_radiografia',
  rotulo: 'Tipo de radiografia',
  tipo_item: 'valor',
  avaliacao: 'ajustar',
  nota: 'É uma interproximal.',
  valor_sugerido: 'interproximal',
  situacao: 'pendente',
  resolvido_em: null,
}
const DETALHE_DEVOLVIDA = detalhe(41, 601, {
  status: 'respondida',
  solicitante: { id: 7, nome: 'Revisor Beta' },
  revisor: { id: 3, nome: 'Curadora Alfa' },
  respondido_em: DEVOLVIDA.respondido_em,
  classificacao: 'discordancia_menor',
  concordancia: 'discorda',
  parecer_revisor: 'Rever o tipo da radiografia.',
  anotacoes: [NOTA],
  pode_responder: false,
  pode_incorporar: true,
})

const PENDENTES = 'GET /curation/reviews/pending'
const RESPONDIDAS = 'GET /curation/reviews/answered'

function rotasPadrao(extra: Record<string, Rota> = {}): Record<string, Rota> {
  return {
    'GET /auth/me': { corpo: CURADOR },
    [PENDENTES]: { corpo: { itens: [PEDIDO] } },
    [RESPONDIDAS]: { corpo: { itens: [DEVOLVIDA] } },
    'GET /curation/reviews/31/detalhe': { corpo: detalhe(31, 501) },
    'GET /curation/501': { corpo: ficha(501) },
    'GET /curation/901/viewer-url': { corpo: { abrivel: true, viewer_url: 'http://ohif.teste/viewer?StudyInstanceUIDs=1.2.3' } },
    'GET /curation/reviews/41/detalhe': { corpo: DETALHE_DEVOLVIDA },
    'GET /curation/601': { corpo: ficha(601) },
    'GET /curation/902/viewer-url': { corpo: { abrivel: true, viewer_url: 'http://ohif.teste/viewer?StudyInstanceUIDs=4.5.6' } },
    ...extra,
  }
}

async function abrir(rotas: Record<string, Rota>) {
  const servidor = servidorFalso(rotas)
  montarTela(<SegundaOpiniaoPage />)
  await screen.findByRole('heading', { level: 1, name: 'Segunda opinião' })
  return servidor
}
/** espera a ficha do pedido aparecer no painel do revisor */
async function esperarFicha() {
  return screen.findByRole('heading', { name: 'Ficha do curador — avalie cada item' })
}
function aba(nome: RegExp) {
  return screen.getByRole('tab', { name: nome })
}
function classificacao(nome: string) {
  return within(screen.getByRole('radiogroup', { name: 'Avaliação geral' })).getByRole('radio', { name: new RegExp(`^\\d${nome}`) })
}

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/segunda-opiniao')
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('permissao por perfil', () => {
  it('sem login: vai para o login e nao pede as filas', async () => {
    const servidor = servidorFalso({ 'GET /auth/me': { status: 401 } })
    montarTela(<SegundaOpiniaoPage />)
    expect(screen.getByText('Carregando...')).toBeTruthy()
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
    expect(servidor.pedidos.map((p) => p.caminho)).toEqual(['/auth/me'])
  })

  it('estudante: vai para "acesso negado" e nao pede as filas', async () => {
    const servidor = servidorFalso({ 'GET /auth/me': { corpo: { ...CURADOR, perfil: 'estudante' } } })
    montarTela(<SegundaOpiniaoPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/acesso-negado?de=/segunda-opiniao'))
    expect(servidor.pedidos.map((p) => p.caminho)).toEqual(['/auth/me'])
  })

  it.each(['curador', 'administrador'])('%s: entra, ve as filas e o primeiro pedido ja aberto', async (perfil) => {
    await abrir(rotasPadrao({ 'GET /auth/me': { corpo: { ...CURADOR, perfil } } }))
    await esperarFicha()
    expect(roteador.push).not.toHaveBeenCalled()
    expect(aba(/Para revisar/).getAttribute('aria-selected')).toBe('true')
    expect(aba(/Para revisar/).textContent).toContain('1')
    expect(aba(/Devolvidas para mim/).textContent).toContain('1')
    // cartao do pedido: quem pediu, motivo e 1o parecer
    expect(screen.getAllByText('Curadora Alfa').length).toBeGreaterThan(0)
    expect(screen.getByText(PEDIDO.motivo)).toBeTruthy()
    expect(screen.getByText('Parece lesão periapical.')).toBeTruthy()
    // a imagem do pedido foi pedida ao servidor
    expect((await screen.findByTestId('visualizador')).textContent).toContain('StudyInstanceUIDs=1.2.3')
    // fila: o pedido aparece com quem pediu
    expect(screen.getByText('Pedido por Curadora Alfa')).toBeTruthy()
  })
})

describe('filas', () => {
  it('filas vazias: avisos de "nada aguardando" e contadores zerados', async () => {
    await abrir(rotasPadrao({ [PENDENTES]: { corpo: { itens: [] } }, [RESPONDIDAS]: { corpo: { itens: [] } } }))
    expect(await screen.findByText('Nenhum pedido aguardando parecer.')).toBeTruthy()
    expect(screen.getByText('Escolha um pedido na fila para revisar.')).toBeTruthy()
    expect(aba(/Para revisar/).textContent).toContain('0')
    expect(screen.queryByRole('button', { name: 'Enviar parecer' })).toBeNull()
  })

  it('sessao expirada (401) ao pedir as filas: vai para o login', async () => {
    servidorFalso(rotasPadrao({ [PENDENTES]: { status: 401 } }))
    montarTela(<SegundaOpiniaoPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
  })

  it('servidor fora do ar ao pedir as filas: avisa "Nao foi possivel carregar as filas."', async () => {
    await abrir(rotasPadrao({ [PENDENTES]: 'SEM_CONEXAO' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Não foi possível carregar as filas.')
  })

  it('o pedido nao abre (recusa do servidor): mostra o motivo', async () => {
    await abrir(rotasPadrao({ 'GET /curation/reviews/31/detalhe': { status: 403, corpo: { detail: 'Pedido de outro grupo.' } } }))
    expect((await screen.findByRole('alert')).textContent).toBe('Pedido de outro grupo.')
    expect(screen.queryByRole('button', { name: 'Enviar parecer' })).toBeNull()
  })

  it('pedido feito por mim mesmo: so leitura, sem botao de enviar e fora do contador', async () => {
    await abrir(rotasPadrao({
      [PENDENTES]: { corpo: { itens: [PEDIDO_PROPRIO] } },
      [RESPONDIDAS]: { corpo: { itens: [] } },
      'GET /curation/reviews/32/detalhe': { corpo: detalhe(32, 502, { pode_responder: false }) },
      'GET /curation/502': { corpo: ficha(502) },
    }))
    expect(await screen.findByText(/Você pediu esta segunda opinião: outro curador precisa dar o parecer/)).toBeTruthy()
    expect(screen.getByText('Você pediu esta segunda opinião')).toBeTruthy() // na fila
    expect(screen.queryByRole('button', { name: 'Enviar parecer' })).toBeNull()
    expect((classificacao('Concordo') as HTMLButtonElement).disabled).toBe(true)
    expect(aba(/Para revisar/).textContent).toContain('0')
  })

  it('recolher e abrir a fila', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao())
    await usuario.click(screen.getByRole('button', { name: 'Recolher a fila' }))
    expect(screen.queryByText('Pedidos de segunda opinião')).toBeNull()
    await usuario.click(screen.getByRole('button', { name: 'Abrir a fila' }))
    expect(screen.getByText('Pedidos de segunda opinião')).toBeTruthy()
  })
})

describe('revisor: enviar o parecer', () => {
  it('"Concordo" sem anotacoes: envia, avisa e a fila esvazia', async () => {
    const usuario = userEvent.setup()
    const rotas = rotasPadrao({ 'POST /curation/reviews/31/respond': { corpo: { ok: true } } })
    const servidor = await abrir(rotas)
    await esperarFicha()
    const enviar = screen.getByRole('button', { name: 'Enviar parecer' }) as HTMLButtonElement
    expect(enviar.disabled).toBe(true)
    expect(screen.getByText('Escolha a avaliação geral (1, 2 ou 3) para enviar.')).toBeTruthy()

    // 1o clique so "acende" a avaliacao geral; o 2o escolhe
    await usuario.click(classificacao('Concordo'))
    await usuario.click(classificacao('Concordo'))
    expect(classificacao('Concordo').getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Sem anotações por item · volta para Curadora Alfa')).toBeTruthy()

    rotas[PENDENTES] = { corpo: { itens: [] } } // depois de enviar, nao ha mais pedidos
    await usuario.click(enviar)
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Parecer enviado para Curadora Alfa.')
    expect(servidor.alteracoes()).toEqual([
      { metodo: 'POST', caminho: '/curation/reviews/31/respond', corpo: { classificacao: 'concordo', parecer_revisor: null, anotacoes: [] } },
    ])
    expect(await screen.findByText('Nenhum pedido aguardando parecer.')).toBeTruthy()
  })

  it('anotacao num item: so libera com explicacao; envia o valor proposto, a nota e o comentario geral', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir(rotasPadrao({ 'POST /curation/reviews/31/respond': { corpo: { ok: true } } }))
    await esperarFicha()
    const item = screen.getByRole('radiogroup', { name: 'Avaliar: Tipo de radiografia' })
    await usuario.click(within(item).getByRole('radio', { name: 'Ajustar' }))
    expect(screen.getByText('Escreva a anotação (ou proponha um valor) para este item.')).toBeTruthy()

    await usuario.click(classificacao('Discordância menor'))
    await usuario.click(classificacao('Discordância menor'))
    expect(screen.getByText('Explique cada item marcado com ✎ ou ✕ (anotação ou valor proposto).')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Enviar parecer' }) as HTMLButtonElement).disabled).toBe(true)

    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Valor proposto' }), 'Interproximal')
    await usuario.type(screen.getByRole('textbox', { name: 'Sua anotação' }), '  Contatos proximais visíveis.  ')
    await usuario.type(screen.getByRole('textbox', { name: 'Comentário geral (opcional)' }), 'Rever o tipo.')
    expect(screen.getByText('1 anotação · volta para Curadora Alfa')).toBeTruthy()
    await usuario.click(screen.getByRole('button', { name: 'Enviar parecer' }))
    await screen.findByRole('status')
    expect(servidor.alteracoes()[0].corpo).toEqual({
      classificacao: 'discordancia_menor',
      parecer_revisor: 'Rever o tipo.',
      anotacoes: [{ item: 'tipo_radiografia', avaliacao: 'ajustar', nota: 'Contatos proximais visíveis.', valor_sugerido: 'interproximal' }],
    })
  })

  it('com a avaliacao geral escolhida, Enter fora dos campos envia o parecer', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir(rotasPadrao({ 'POST /curation/reviews/31/respond': { corpo: { ok: true } } }))
    await esperarFicha()
    await usuario.click(classificacao('Concordo'))
    await usuario.click(classificacao('Concordo'))
    fireEvent.keyDown(window, { key: 'Enter' })
    await screen.findByRole('status')
    expect(servidor.alteracoes()).toHaveLength(1)
  })

  it('servidor falha (500): avisa que NAO foi enviado e "Tentar de novo" reenvia o mesmo parecer', async () => {
    const usuario = userEvent.setup()
    let tentativas = 0
    const servidor = await abrir(rotasPadrao({
      'POST /curation/reviews/31/respond': () => (++tentativas === 1 ? { status: 500, corpo: {} } : { corpo: { ok: true } }),
    }))
    await esperarFicha()
    await usuario.click(classificacao('Concordo'))
    await usuario.click(classificacao('Concordo'))
    await usuario.click(screen.getByRole('button', { name: 'Enviar parecer' }))
    const alerta = await screen.findByRole('alert')
    expect(alerta.textContent).toContain('O parecer NÃO foi enviado')
    await usuario.click(within(alerta).getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Parecer enviado para Curadora Alfa.')
    const envios = servidor.alteracoes()
    expect(envios).toHaveLength(2)
    expect(envios[1].corpo).toEqual(envios[0].corpo)
  })

  it.each([
    ['recusa com motivo (400): mostra o motivo, sem "Tentar de novo"', { status: 400, corpo: { detail: 'Pedido já respondido.' } }, 'Pedido já respondido.', false],
    ['sem conexao: avisa que NAO foi enviado e oferece "Tentar de novo"', 'SEM_CONEXAO' as const, /O parecer NÃO foi enviado/, true],
  ])('%s', async (_caso, resposta, mensagem, temRepetir) => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao({ 'POST /curation/reviews/31/respond': resposta }))
    await esperarFicha()
    await usuario.click(classificacao('Concordo'))
    await usuario.click(classificacao('Concordo'))
    await usuario.click(screen.getByRole('button', { name: 'Enviar parecer' }))
    const alerta = await screen.findByRole('alert')
    expect(alerta.textContent).toMatch(mensagem)
    expect(within(alerta).queryByRole('button', { name: 'Tentar de novo' }) !== null).toBe(temRepetir)
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('quem pediu: parecer devolvido', () => {
  async function abrirDevolvida(extra: Record<string, Rota> = {}) {
    window.history.replaceState(null, '', '/segunda-opiniao?review=41&aba=devolvidas')
    const servidor = await abrir(rotasPadrao(extra))
    await screen.findByRole('heading', { name: 'Anotações do revisor' })
    return servidor
  }

  it('endereco com ?review=41&aba=devolvidas abre direto o parecer, com a anotacao e a proposta', async () => {
    await abrirDevolvida()
    expect(aba(/Devolvidas para mim/).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Rever o tipo da radiografia.')).toBeTruthy()
    expect(screen.getByText('É uma interproximal.')).toBeTruthy()
    expect(screen.getByText('1 a decidir')).toBeTruthy()
    expect(screen.getByText('1 anotação a decidir')).toBeTruthy() // selo na fila
  })

  it('trocar de aba abre o primeiro parecer devolvido', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir(rotasPadrao())
    await esperarFicha()
    await usuario.click(aba(/Devolvidas para mim/))
    expect(await screen.findByRole('heading', { name: 'Anotações do revisor' })).toBeTruthy()
    expect(screen.getByText('Pareceres recebidos')).toBeTruthy()
    expect(servidor.pedidos.some((p) => p.caminho === '/curation/reviews/41/detalhe')).toBe(true)
  })

  it.each([
    ['Acrescentar à curadoria', /\+ Acrescentar à curadoria/, 'incorporar', 'Tipo de radiografia: acrescentado à curadoria.'],
    ['Dispensar', /^Dispensar$/, 'dispensar', 'Tipo de radiografia: anotação dispensada.'],
  ])('"%s" registra a escolha no servidor e avisa', async (_nome, botao, acao, aviso) => {
    const usuario = userEvent.setup()
    const resolvida = { ...DETALHE_DEVOLVIDA, anotacoes: [{ ...NOTA, situacao: acao === 'incorporar' ? 'incorporada' : 'dispensada' }] }
    let resolveu = false
    const servidor = await abrirDevolvida({
      [`POST /curation/reviews/41/anotacoes/77/${acao}`]: () => ((resolveu = true), { corpo: { ok: true } }),
      'GET /curation/reviews/41/detalhe': () => ({ corpo: resolveu ? resolvida : DETALHE_DEVOLVIDA }),
    })
    await usuario.click(screen.getByRole('button', { name: botao }))
    expect(await screen.findByRole('status')).toHaveProperty('textContent', aviso)
    expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: `/curation/reviews/41/anotacoes/77/${acao}`, corpo: undefined }])
    // selo da fila: nenhuma anotacao a decidir
    await waitFor(() => expect(screen.queryByText('1 anotação a decidir')).toBeNull())
    expect(screen.getByText('todas decididas')).toBeTruthy()
  })

  it('erro ao registrar a escolha: mostra o motivo do servidor', async () => {
    const usuario = userEvent.setup()
    await abrirDevolvida({ 'POST /curation/reviews/41/anotacoes/77/incorporar': { status: 409, corpo: { detail: 'Ficha já aprovada.' } } })
    await usuario.click(screen.getByRole('button', { name: /\+ Acrescentar à curadoria/ }))
    expect((await screen.findByRole('alert')).textContent).toBe('Ficha já aprovada.')
  })

  it('aprovar: so libera depois de conferir a anonimizacao; envia a decisao e avisa', async () => {
    const usuario = userEvent.setup()
    const rotas = rotasPadrao({ 'POST /curation/601/apply-review-decision': { corpo: { ok: true } } })
    window.history.replaceState(null, '', '/segunda-opiniao?review=41&aba=devolvidas')
    const servidor = await abrir(rotas)
    const decisao = (await screen.findByRole('heading', { name: 'Decisão final' })).closest('section') as HTMLElement
    const aprovar = within(decisao).getByRole('button', { name: /Aprovar ficha/ }) as HTMLButtonElement
    expect(aprovar.disabled).toBe(true)
    await usuario.click(decisao) // acende a decisao final
    await usuario.click(within(decisao).getByRole('checkbox', { name: 'Conferi a anonimização da imagem' }))
    expect(aprovar.disabled).toBe(false)
    rotas[RESPONDIDAS] = { corpo: { itens: [] } }
    await usuario.click(aprovar)
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Ficha aprovada.')
    expect(servidor.alteracoes()).toEqual([
      { metodo: 'POST', caminho: '/curation/601/apply-review-decision', corpo: { decisao: 'aprovar', anonimizacao_validada: true } },
    ])
    expect(await screen.findByText('Nenhum parecer aguardando sua decisão.')).toBeTruthy()
  })

  it('descartar: pede o motivo e envia', async () => {
    const usuario = userEvent.setup()
    window.history.replaceState(null, '', '/segunda-opiniao?review=41&aba=devolvidas')
    const servidor = await abrir(rotasPadrao({ 'POST /curation/601/apply-review-decision': { corpo: { ok: true } } }))
    const decisao = (await screen.findByRole('heading', { name: 'Decisão final' })).closest('section') as HTMLElement
    await usuario.click(decisao)
    await usuario.click(within(decisao).getByRole('button', { name: 'Descartar' }))
    const confirmar = within(decisao).getByRole('button', { name: 'Confirmar descarte' }) as HTMLButtonElement
    expect(confirmar.disabled).toBe(true)
    await usuario.type(within(decisao).getByRole('textbox'), 'Imagem duplicada.')
    await usuario.click(confirmar)
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Ficha descartada.')
    expect(servidor.alteracoes()[0].corpo).toEqual({ decisao: 'descartar', motivo: 'Imagem duplicada.' })
  })

  it.each([
    ['recusa com motivo', { status: 400, corpo: { detail: 'Anonimização pendente.' } }, 'Anonimização pendente.'],
    ['sem conexao', 'SEM_CONEXAO' as const, 'Não foi possível aplicar a decisão.'],
  ])('erro ao aprovar (%s): avisa e nada muda', async (_caso, resposta, mensagem) => {
    const usuario = userEvent.setup()
    window.history.replaceState(null, '', '/segunda-opiniao?review=41&aba=devolvidas')
    await abrir(rotasPadrao({ 'POST /curation/601/apply-review-decision': resposta }))
    const decisao = (await screen.findByRole('heading', { name: 'Decisão final' })).closest('section') as HTMLElement
    await usuario.click(decisao)
    await usuario.click(within(decisao).getByRole('checkbox', { name: 'Conferi a anonimização da imagem' }))
    await usuario.click(within(decisao).getByRole('button', { name: /Aprovar ficha/ }))
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
    expect(screen.queryByRole('status')).toBeNull()
  })
})
