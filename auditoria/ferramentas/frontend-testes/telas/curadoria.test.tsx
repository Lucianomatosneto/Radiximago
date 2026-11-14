// @vitest-environment jsdom
//
// TELA "Curadoria" (frontend/src/app/curadoria/page.tsx) - Fase 1.
// Confere o que a TELA decide: quem entra, a fila, abrir a imagem (cria a
// ficha), salvar, a conferencia antes de aprovar, aprovar, descartar e pedir
// segunda opiniao (com motivo), o modo professor (sugestao) e as segundas
// opinioes "Aguardando sua decisao".
//
// Ficam SIMULADOS (tem teste proprio na Fase 2 ou dependem do navegador
// real): o visualizador OHIF, a marcacao/pintura (canvas), a voz
// (microfone), o giro da imagem e a COLUNA DA FICHA (ColunaFichaCuradoria),
// trocada por uma ficha simplificada com os campos que a conferencia usa.
// Dados inventados; nenhuma imagem real.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CuradoriaPage from '../../../../frontend/src/app/curadoria/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/curadoria' }))
vi.mock('../../../../frontend/src/components/curadoria/PainelVisualizador', () => ({
  default: ({ viewerInfo }: { viewerInfo: { viewer_url: string | null } | null }) => (
    <div data-testid="visualizador">{viewerInfo?.viewer_url ?? 'sem imagem'}</div>
  ),
}))
vi.mock('../../../../frontend/src/components/curadoria/MarcadorAchado', () => ({ default: () => null }))
vi.mock('../../../../frontend/src/components/segmentacao/PintorSegmentacao', () => ({ default: () => null }))
vi.mock('../../../../frontend/src/components/curadoria/ControleOrientacao', () => ({ default: () => null }))
vi.mock('../../../../frontend/src/components/curadoria/PainelVoz', () => ({
  // so a fileira de botoes que a TELA poe ao lado da voz
  default: ({ aoLado }: { aoLado?: React.ReactNode }) => <div aria-label="barra da voz">{aoLado}</div>,
}))
type Form = Record<string, unknown> & { anonimizacao_validada: boolean; genero: string; qualidade_tecnica: string; descricao_didatica: string; tipo_radiografia: string }
vi.mock('../../../../frontend/src/components/curadoria/ColunaFichaCuradoria', async (original) => ({
  ...(await original<object>()), // ListaConferencia (lista da conferencia) e a de verdade
  default: (p: { form: Form; onChange: (f: Form) => void; erro: string; rascunhoSalvo: boolean; topo: React.ReactNode; acoesFinais: React.ReactNode }) => (
    <section aria-label="ficha simplificada">
      {p.topo}
      <p>tipo: {p.form.tipo_radiografia}</p>
      <label>
        <input type="checkbox" checked={p.form.anonimizacao_validada} onChange={(e) => p.onChange({ ...p.form, anonimizacao_validada: e.target.checked })} />
        Anonimização validada
      </label>
      <label>
        Gênero
        <select value={p.form.genero} onChange={(e) => p.onChange({ ...p.form, genero: e.target.value })}>
          <option value="">—</option>
          <option value="feminino">feminino</option>
        </select>
      </label>
      <label>
        Qualidade
        <select value={p.form.qualidade_tecnica} onChange={(e) => p.onChange({ ...p.form, qualidade_tecnica: e.target.value })}>
          <option value="">—</option>
          <option value="boa">boa</option>
        </select>
      </label>
      <label>
        Descrição didática
        <textarea value={p.form.descricao_didatica} onChange={(e) => p.onChange({ ...p.form, descricao_didatica: e.target.value })} />
      </label>
      {p.erro && <p role="alert">{p.erro}</p>}
      {p.rascunhoSalvo && <p>rascunho salvo</p>}
      {p.acoesFinais}
    </section>
  ),
}))

// ---- dados inventados ----
const CURADOR = { id: 7, nome: 'Curador Teste', email: 'curador@exemplo.test', perfil: 'curador', foto_perfil_url: null }
const IMAGEM = (ref: number) => ({ orthanc_reference_id: ref, orthanc_id: `sintetico-${ref}`, resource_type: 'instance', dicomweb_url: null })
function ficha(id: number, extra: object = {}) {
  return {
    id,
    status: 'em_analise',
    tipo_radiografia: 'periapical',
    dentes: [],
    idade_min: null,
    idade_max: null,
    genero: null,
    marcacoes: [],
    achados_detalhe: null,
    alteracoes_observadas: [],
    qualidade_tecnica: null,
    descricao_didatica: null,
    observacoes_internas: null,
    anonimizacao_validada: false,
    texto_na_imagem: 'sem_texto',
    ...extra,
  }
}
const RESPONDIDA = {
  id: 90,
  motivo: 'Dúvida no tipo do exame.',
  primeiro_parecer: null,
  criado_em: '2026-11-10T10:00:00Z',
  curation: { id: 800, achado_principal: 'carie', tipo_radiografia: 'interproximal' },
  orthanc_reference: { id: 1800, orthanc_id: 'sintetico-1800' },
}
const FILA = 'GET /curation/pending?skip=0&limit=50'
const RESPONDIDAS = 'GET /curation/reviews/answered'

function rotasPadrao(extra: Record<string, Rota> = {}): Record<string, Rota> {
  return {
    'GET /auth/me': { corpo: CURADOR },
    [FILA]: { corpo: { itens: [IMAGEM(301), IMAGEM(302)], total_pendentes: 2, aguardando_recorte: 1 } },
    [RESPONDIDAS]: { corpo: { itens: [] } },
    'GET /macros': { corpo: { macros: [] } },
    'GET /voz/frases': { corpo: { frases: [] } },
    'POST /curation/301': { status: 201, corpo: { curation_id: 501 } },
    'POST /curation/302': { status: 201, corpo: { curation_id: 502 } },
    'GET /curation/501': { corpo: ficha(501) },
    'GET /curation/502': { corpo: ficha(502) },
    'GET /curation/301/viewer-url': { corpo: { abrivel: true, viewer_url: 'http://ohif.teste/?StudyInstanceUIDs=1.1' } },
    'GET /curation/302/viewer-url': { corpo: { abrivel: true, viewer_url: 'http://ohif.teste/?StudyInstanceUIDs=2.2' } },
    'PATCH /curation/501': { corpo: {} },
    'PATCH /curation/502': { corpo: {} },
    ...extra,
  }
}
async function abrir(rotas: Record<string, Rota>) {
  const servidor = servidorFalso(rotas)
  montarTela(<CuradoriaPage />)
  await screen.findByRole('heading', { level: 1, name: 'Curadoria' })
  return servidor
}
/** espera a 1a imagem da fila abrir sozinha (ficha criada e carregada) */
async function abrirComFicha(rotas: Record<string, Rota>) {
  const servidor = await abrir(rotas)
  await screen.findByRole('region', { name: 'ficha simplificada' })
  return servidor
}
const ficha_ = () => screen.getByRole('region', { name: 'ficha simplificada' })
const botao = (nome: string | RegExp) => within(ficha_()).getByRole('button', { name: nome })
async function preencherObrigatorios(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.click(within(ficha_()).getByRole('checkbox', { name: 'Anonimização validada' }))
  await usuario.selectOptions(within(ficha_()).getByRole('combobox', { name: 'Gênero' }), 'feminino')
  await usuario.selectOptions(within(ficha_()).getByRole('combobox', { name: 'Qualidade' }), 'boa')
  await usuario.type(within(ficha_()).getByRole('textbox', { name: 'Descrição didática' }), 'Imagem normal, sem alterações.')
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.setItem('radix-guia-laudo-visto', '1') // o guia "Como laudar" ja foi visto
  window.history.replaceState(null, '', '/curadoria')
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('permissao por perfil', () => {
  it('sem login: vai para o login sem pedir a fila', async () => {
    const servidor = servidorFalso({ 'GET /auth/me': { status: 401 } })
    montarTela(<CuradoriaPage />)
    expect(screen.getByText('Carregando...')).toBeTruthy()
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
    expect(servidor.pedidos.map((p) => p.caminho)).toEqual(['/auth/me'])
  })

  it.each(['estudante', 'pesquisador', 'suporte'])('%s: vai para "acesso negado" sem pedir a fila', async (perfil) => {
    const servidor = servidorFalso({ 'GET /auth/me': { corpo: { ...CURADOR, perfil } } })
    montarTela(<CuradoriaPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/acesso-negado?de=/curadoria'))
    expect(servidor.pedidos.map((p) => p.caminho)).toEqual(['/auth/me'])
  })

  it.each(['curador', 'administrador'])('%s: a 1a imagem da fila abre sozinha (cria a ficha) e a posicao aparece', async (perfil) => {
    const servidor = await abrirComFicha(rotasPadrao({ 'GET /auth/me': { corpo: { ...CURADOR, perfil } } }))
    expect(servidor.alteracoes()[0]).toEqual({ metodo: 'POST', caminho: '/curation/301', corpo: { tipo_radiografia: 'periapical' } })
    expect(screen.getByText('Imagem 1 de 2')).toBeTruthy()
    expect((await screen.findByTestId('visualizador')).textContent).toContain('StudyInstanceUIDs=1.1')
    expect(within(ficha_()).getByText('tipo: periapical')).toBeTruthy()
    // curador/admin: pede as segundas opinioes respondidas; tem Aprovar
    expect(servidor.pedidos.some((p) => p.caminho === '/curation/reviews/answered')).toBe(true)
    expect(botao('✓ Aprovar')).toBeTruthy()
    expect(within(ficha_()).queryByRole('button', { name: 'Enviar ao curador' })).toBeNull()
  })

  it('professor: so a fila dele, aviso do modo professor e "Enviar ao curador" no lugar de Aprovar', async () => {
    const servidor = await abrirComFicha(
      rotasPadrao({
        'GET /auth/me': { corpo: { ...CURADOR, perfil: 'professor' } },
        'GET /curation/professor/fila': { corpo: { itens: [IMAGEM(301)], total_pendentes: 1 } },
      })
    )
    expect(servidor.pedidos.some((p) => p.caminho.startsWith('/curation/pending'))).toBe(false)
    expect(servidor.pedidos.some((p) => p.caminho === '/curation/reviews/answered')).toBe(false)
    expect(screen.getByText(/Você está marcando as imagens que você enviou/)).toBeTruthy()
    expect(botao('Enviar ao curador')).toBeTruthy()
    expect(botao('Guardar em Minhas imagens')).toBeTruthy()
    expect(within(ficha_()).queryByRole('button', { name: '✓ Aprovar' })).toBeNull()
  })
})

describe('fila', () => {
  it('fila vazia: "Nenhuma imagem pendente." e nenhuma ficha aberta', async () => {
    const servidor = await abrir(rotasPadrao({ [FILA]: { corpo: { itens: [], total_pendentes: 0 } } }))
    expect(await screen.findByText('Nenhuma imagem pendente.')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'ficha simplificada' })).toBeNull()
    expect(servidor.alteracoes()).toEqual([])
  })

  it.each([
    ['recusa com motivo', { status: 500, corpo: { detail: 'Orthanc indisponível.' } }, 'Orthanc indisponível.'],
    ['sem conexao', 'SEM_CONEXAO' as const, 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'],
  ])('erro ao carregar a fila (%s): mostra na fila, sem mandar para o login', async (_caso, resposta, mensagem) => {
    await abrir(rotasPadrao({ [FILA]: resposta }))
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
    expect(roteador.push).not.toHaveBeenCalled()
  })

  it('sessao expirada (401) na fila: vai para o login', async () => {
    servidorFalso(rotasPadrao({ [FILA]: { status: 401 } }))
    montarTela(<CuradoriaPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
  })

  it('a imagem nao abre (recusa ao criar a ficha): mostra o motivo e a fila continua', async () => {
    await abrir(rotasPadrao({ 'POST /curation/301': { status: 409, corpo: { detail: 'Imagem já tem ficha aberta por outra pessoa.' } } }))
    expect((await screen.findByRole('alert')).textContent).toBe('Imagem já tem ficha aberta por outra pessoa.')
    expect(screen.queryByRole('region', { name: 'ficha simplificada' })).toBeNull()
  })

  it('a ficha criada nao carrega: avisa', async () => {
    await abrir(rotasPadrao({ 'GET /curation/501': { status: 500 } }))
    expect((await screen.findByRole('alert')).textContent).toBe('Não foi possível carregar a ficha criada.')
  })

  it('endereco ?editar=&ref= (editar depois do envio) abre ESSA ficha, sem criar outra', async () => {
    window.history.replaceState(null, '', '/curadoria?editar=777&ref=1777')
    const servidor = await abrir(rotasPadrao({
      'GET /curation/777': { corpo: ficha(777, { status: 'aprovada', genero: 'feminino', idade_min: 20, idade_max: 30, regioes_imagem: ['periapice'] }) },
      'GET /curation/1777/viewer-url': { corpo: { abrivel: true, viewer_url: 'http://ohif.teste/?StudyInstanceUIDs=7.7' } },
    }))
    await screen.findByRole('region', { name: 'ficha simplificada' })
    expect((within(ficha_()).getByRole('combobox', { name: 'Gênero' }) as HTMLSelectElement).value).toBe('feminino')
    expect(servidor.alteracoes()).toEqual([]) // nao criou ficha nova
    expect((await screen.findByTestId('visualizador')).textContent).toContain('7.7')
  })
})

describe('salvar e aprovar', () => {
  it('"Salvar" grava a ficha (o que esta na tela) e passa para a proxima imagem', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrirComFicha(rotasPadrao())
    await usuario.click(within(ficha_()).getByRole('checkbox', { name: 'Anonimização validada' }))
    await usuario.type(within(ficha_()).getByRole('textbox', { name: 'Descrição didática' }), 'Texto de teste.')
    await usuario.click(botao('Salvar'))
    await waitFor(() => expect(screen.getByText('Imagem 2 de 2')).toBeTruthy())
    const patch = servidor.alteracoes().find((p) => p.metodo === 'PATCH')
    expect(patch?.caminho).toBe('/curation/501')
    expect(patch?.corpo).toMatchObject({ tipo_radiografia: 'periapical', descricao_didatica: 'Texto de teste.', anonimizacao_validada: true, marcacoes: [], achados: [] })
    expect(patch?.corpo).not.toHaveProperty('genero') // vazio nao vai
    expect(servidor.alteracoes().some((p) => p.metodo === 'POST' && p.caminho === '/curation/302')).toBe(true)
  })

  it('erro de validacao (422) ao salvar: mostra o campo recusado e fica na mesma imagem', async () => {
    const usuario = userEvent.setup()
    await abrirComFicha(rotasPadrao({
      'PATCH /curation/501': { status: 422, corpo: { detail: [{ loc: ['body', 'idade_min'], msg: 'Value error, idade inválida' }] } },
    }))
    await usuario.click(botao('Salvar'))
    expect((await within(ficha_()).findByRole('alert')).textContent).toBe('Não foi possível salvar o rascunho. (idade_min) idade inválida')
    expect(screen.getByText('Imagem 1 de 2')).toBeTruthy()
  })

  it('servidor fora do ar ao salvar: avisa que nao respondeu', async () => {
    const usuario = userEvent.setup()
    await abrirComFicha(rotasPadrao({ 'PATCH /curation/501': 'SEM_CONEXAO' }))
    await usuario.click(botao('Salvar'))
    expect((await within(ficha_()).findByRole('alert')).textContent).toMatch(/^Não foi possível salvar o rascunho\. O servidor não respondeu/)
  })

  it('aprovar sem a anonimizacao validada: a conferencia BLOQUEIA e nada e enviado', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrirComFicha(rotasPadrao())
    await usuario.click(botao('✓ Aprovar'))
    const conferencia = screen.getByRole('dialog', { name: 'Conferência antes de aprovar' })
    expect(within(conferencia).getByText('Há itens obrigatórios pendentes. Corrija para poder aprovar.')).toBeTruthy()
    expect(within(conferencia).getByText('Anonimização não validada.')).toBeTruthy()
    expect((within(conferencia).getByRole('button', { name: 'Aprovar mesmo assim' }) as HTMLButtonElement).disabled).toBe(true)
    await usuario.click(within(conferencia).getByRole('button', { name: 'Voltar e revisar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(servidor.alteracoes().filter((p) => p.caminho.includes('approve'))).toEqual([])
  })

  it('so avisos na conferencia: "Aprovar mesmo assim" salva, aprova e passa para a proxima', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrirComFicha(rotasPadrao({ 'POST /curation/501/approve': { corpo: { status: 'aprovada' } } }))
    await preencherObrigatorios(usuario)
    await usuario.click(botao('✓ Aprovar'))
    const conferencia = screen.getByRole('dialog', { name: 'Conferência antes de aprovar' })
    expect(within(conferencia).getByText(/Encontramos pontos que podem estar faltando/)).toBeTruthy()
    expect(within(conferencia).queryByText('OBRIGATÓRIO')).toBeNull()
    await usuario.click(within(conferencia).getByRole('button', { name: 'Aprovar mesmo assim' }))
    await waitFor(() => expect(screen.getByText('Imagem 2 de 2')).toBeTruthy())
    const ordem = servidor.alteracoes().map((p) => `${p.metodo} ${p.caminho}`)
    expect(ordem.indexOf('PATCH /curation/501')).toBeLessThan(ordem.indexOf('POST /curation/501/approve'))
    expect(servidor.alteracoes().find((p) => p.caminho === '/curation/501/approve')?.corpo).toEqual({ anonimizacao_validada: true })
  })

  it('o servidor recusa a aprovacao: mostra o motivo e fica na mesma imagem', async () => {
    const usuario = userEvent.setup()
    await abrirComFicha(rotasPadrao({ 'POST /curation/501/approve': { status: 400, corpo: { detail: 'Ficha sem tipo de exame.' } } }))
    await preencherObrigatorios(usuario)
    await usuario.click(botao('✓ Aprovar'))
    await usuario.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Aprovar mesmo assim' }))
    expect((await within(ficha_()).findByRole('alert')).textContent).toBe('Ficha sem tipo de exame.')
    expect(screen.getByText('Imagem 1 de 2')).toBeTruthy()
  })

  it('ultima imagem aprovada: a ficha fecha e a fila e pedida de novo', async () => {
    const usuario = userEvent.setup()
    const rotas = rotasPadrao({
      [FILA]: { corpo: { itens: [IMAGEM(301)], total_pendentes: 1 } },
      'POST /curation/501/approve': { corpo: {} },
    })
    const servidor = await abrirComFicha(rotas)
    await preencherObrigatorios(usuario)
    rotas[FILA] = { corpo: { itens: [], total_pendentes: 0 } }
    await usuario.click(botao('✓ Aprovar'))
    await usuario.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Aprovar mesmo assim' }))
    expect(await screen.findByText('Nenhuma imagem pendente.')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'ficha simplificada' })).toBeNull()
    expect(servidor.pedidos.filter((p) => p.caminho === '/curation/pending?skip=0&limit=50')).toHaveLength(2)
  })

  it('setas: "Proxima imagem" abre a seguinte e "Imagem anterior" fica travada sem pendentes antes', async () => {
    const usuario = userEvent.setup()
    await abrirComFicha(rotasPadrao())
    expect((screen.getByRole('button', { name: 'Imagem anterior' }) as HTMLButtonElement).disabled).toBe(true)
    await usuario.click(screen.getByRole('button', { name: 'Próxima imagem' }))
    await waitFor(() => expect(screen.getByText('Imagem 2 de 2')).toBeTruthy())
    expect((screen.getByRole('button', { name: 'Próxima imagem' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('descartar e pedir segunda opiniao (motivo obrigatorio)', () => {
  it.each([
    ['Descartar', 'Descartar ficha', 'discard'],
    ['Solicitar segunda opinião', 'Solicitar segunda opinião', 'request-review'],
  ])('"%s": exige o motivo, envia e passa para a proxima', async (botaoNome, titulo, rota) => {
    const usuario = userEvent.setup()
    const servidor = await abrirComFicha(rotasPadrao({ [`POST /curation/501/${rota}`]: { corpo: {} } }))
    await usuario.click(within(ficha_()).getAllByRole('button', { name: botaoNome })[0])
    const janela = screen.getByRole('heading', { name: titulo }).closest('div') as HTMLElement
    await usuario.click(within(janela).getByRole('button', { name: 'Confirmar' }))
    expect(within(janela).getByRole('alert').textContent).toBe('Informe um motivo.')
    await usuario.type(within(janela).getByRole('textbox'), '  Imagem duplicada.  ')
    await usuario.click(within(janela).getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(screen.getByText('Imagem 2 de 2')).toBeTruthy())
    expect(servidor.alteracoes().find((p) => p.caminho === `/curation/501/${rota}`)?.corpo).toEqual({ motivo: 'Imagem duplicada.' })
  })

  it('erro ao descartar: o motivo do servidor aparece na janela; "Cancelar" fecha', async () => {
    const usuario = userEvent.setup()
    await abrirComFicha(rotasPadrao({ 'POST /curation/501/discard': { status: 403, corpo: { detail: 'Só o curador da ficha pode descartar.' } } }))
    await usuario.click(within(ficha_()).getAllByRole('button', { name: 'Descartar' })[0])
    const janela = screen.getByRole('heading', { name: 'Descartar ficha' }).closest('div') as HTMLElement
    await usuario.type(within(janela).getByRole('textbox'), 'Teste.')
    await usuario.click(within(janela).getByRole('button', { name: 'Confirmar' }))
    expect((await within(janela).findByRole('alert')).textContent).toBe('Só o curador da ficha pode descartar.')
    await usuario.click(within(janela).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('heading', { name: 'Descartar ficha' })).toBeNull()
  })
})

describe('professor: sugestao ao curador', () => {
  const rotasProfessor = (extra: Record<string, Rota> = {}) =>
    rotasPadrao({
      'GET /auth/me': { corpo: { ...CURADOR, perfil: 'professor' } },
      'GET /curation/professor/fila': { corpo: { itens: [IMAGEM(301), IMAGEM(302)], total_pendentes: 2 } },
      ...extra,
    })

  it.each([
    ['Enviar ao curador', 'enviar-sugestao', /Enviada ao curador/],
    ['Guardar em Minhas imagens', 'guardar-para-mim', /Guardada em Minhas imagens/],
  ])('"%s": salva, envia e avisa', async (nome, acao, aviso) => {
    const usuario = userEvent.setup()
    const servidor = await abrirComFicha(rotasProfessor({ [`POST /curation/501/${acao}`]: { corpo: {} } }))
    await usuario.click(botao(nome))
    expect((await screen.findByRole('status')).textContent).toMatch(aviso)
    const ordem = servidor.alteracoes().map((p) => `${p.metodo} ${p.caminho}`)
    expect(ordem).toContain('PATCH /curation/501')
    expect(ordem.indexOf('PATCH /curation/501')).toBeLessThan(ordem.indexOf(`POST /curation/501/${acao}`))
  })

  it('erro ao enviar a sugestao: avisa na ficha', async () => {
    const usuario = userEvent.setup()
    await abrirComFicha(rotasProfessor({ 'POST /curation/501/enviar-sugestao': { status: 500, corpo: {} } }))
    await usuario.click(botao('Enviar ao curador'))
    expect((await within(ficha_()).findByRole('alert')).textContent).toBe('Não foi possível concluir. Tente de novo.')
  })
})

describe('segundas opinioes "Aguardando sua decisao"', () => {
  const comRespondida = (extra: Record<string, Rota> = {}) =>
    rotasPadrao({
      [RESPONDIDAS]: { corpo: { itens: [RESPONDIDA] } },
      'GET /curation/800/reviews': { corpo: { itens: [{ id: 90, concordancia: 'discorda', parecer_revisor: 'É uma panorâmica recortada.', decisao_final: null }] } },
      ...extra,
    })
  async function abrirPainel(usuario: ReturnType<typeof userEvent.setup>) {
    await usuario.click(await screen.findByRole('button', { name: /Aguardando sua decisão \(1\)/ }))
    return screen.getByRole('heading', { name: 'Segundas opiniões respondidas' }).parentElement as HTMLElement
  }

  it('mostra o parecer do revisor e o link para o parecer completo', async () => {
    const usuario = userEvent.setup()
    await abrirComFicha(comRespondida())
    const painel = await abrirPainel(usuario)
    expect(within(painel).getByText('Discordou do curador')).toBeTruthy()
    expect(within(painel).getByText('É uma panorâmica recortada.')).toBeTruthy()
    expect(within(painel).getByText('Dúvida no tipo do exame.')).toBeTruthy()
    expect(within(painel).getByText(/Interproximal · Cárie/)).toBeTruthy()
    expect(within(painel).getByRole('link', { name: /Ver anotações/ }).getAttribute('href')).toBe('/segunda-opiniao?aba=devolvidas&review=90')
  })

  it('aprovar so libera depois de confirmar a anonimizacao; envia e o item sai', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrirComFicha(comRespondida({ 'POST /curation/800/apply-review-decision': { corpo: {} } }))
    const painel = await abrirPainel(usuario)
    const aprovar = within(painel).getByRole('button', { name: 'Aprovar' }) as HTMLButtonElement
    expect(aprovar.disabled).toBe(true)
    await usuario.click(within(painel).getByRole('checkbox', { name: 'Confirmo que a anonimização foi validada' }))
    await usuario.click(aprovar)
    await waitFor(() => expect(screen.queryByRole('button', { name: /Aguardando sua decisão/ })).toBeNull())
    expect(servidor.alteracoes().find((p) => p.caminho === '/curation/800/apply-review-decision')?.corpo).toEqual({ decisao: 'aprovar', anonimizacao_validada: true })
  })

  it('erro ao aprovar: aparece no item', async () => {
    const usuario = userEvent.setup()
    await abrirComFicha(comRespondida({ 'POST /curation/800/apply-review-decision': { status: 409, corpo: { detail: 'Decisão já aplicada.' } } }))
    const painel = await abrirPainel(usuario)
    await usuario.click(within(painel).getByRole('checkbox', { name: 'Confirmo que a anonimização foi validada' }))
    await usuario.click(within(painel).getByRole('button', { name: 'Aprovar' }))
    expect((await within(painel).findByRole('alert')).textContent).toBe('Decisão já aplicada.')
  })

  it('descartar: pede o motivo (obrigatorio) e envia a decisao', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrirComFicha(comRespondida({ 'POST /curation/800/apply-review-decision': { corpo: {} } }))
    const painel = await abrirPainel(usuario)
    await usuario.click(within(painel).getByRole('button', { name: 'Descartar' }))
    const janela = screen.getByRole('heading', { name: 'Descartar ficha' }).closest('div') as HTMLElement
    await usuario.click(within(janela).getByRole('button', { name: 'Confirmar' }))
    expect(within(janela).getByRole('alert').textContent).toBe('Informe um motivo.')
    await usuario.type(within(janela).getByRole('textbox'), 'Imagem de baixa qualidade.')
    await usuario.click(within(janela).getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Descartar ficha' })).toBeNull())
    expect(servidor.alteracoes().find((p) => p.caminho === '/curation/800/apply-review-decision')?.corpo).toEqual({ decisao: 'descartar', motivo: 'Imagem de baixa qualidade.' })
  })

  it('erro ao carregar as respondidas: avisa no cabecalho', async () => {
    await abrirComFicha(rotasPadrao({ [RESPONDIDAS]: { status: 500, corpo: {} } }))
    expect(screen.getByText('Não foi possível carregar as segundas opiniões respondidas.')).toBeTruthy()
  })
})

describe('guia "Como laudar"', () => {
  it('abre sozinho na primeira ficha deste navegador; o botao "Como laudar" reabre depois de fechar', async () => {
    const usuario = userEvent.setup()
    window.localStorage.clear()
    await abrir(rotasPadrao())
    const guia = await screen.findByRole('dialog', { name: 'Como laudar no Rádix Imago — passo a passo' })
    await usuario.click(within(guia).getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(window.localStorage.getItem('radix-guia-laudo-visto')).toBe('1') // nao abre sozinho de novo
    await usuario.click(screen.getByRole('button', { name: /Como laudar/ }))
    expect(screen.getByRole('dialog', { name: 'Como laudar no Rádix Imago — passo a passo' })).toBeTruthy()
  })
})

describe('correcao de 13/11/2026: acessibilidade da janela de motivo (defeito 2)', () => {
  it.each(['Descartar', 'Solicitar segunda opinião'])('"%s": a caixa do motivo e encontrada pelo rotulo "Motivo"', async (nome) => {
    const usuario = userEvent.setup()
    await abrirComFicha(rotasPadrao())
    await usuario.click(within(ficha_()).getAllByRole('button', { name: nome })[0])
    const motivo = screen.getByLabelText('Motivo')
    expect(motivo.tagName).toBe('TEXTAREA')
    await usuario.type(motivo, 'Teste')
    expect((motivo as HTMLTextAreaElement).value).toBe('Teste')
  })
})
