// @vitest-environment jsdom
//
// TELA "Imagens recebidas" (frontend/src/app/imagens/page.tsx) - Fase 3b.
// Lista das imagens que chegaram ao Orthanc: quem pode ver, carregar, erros
// (com "Tentar novamente"), contadores, filtros, busca por numero, paginas
// de 50, e o envio de um arquivo DICOM (sucesso, duplicata, recusa, sem
// conexao). Dados inventados (IDs do Orthanc ficticios); nenhum DICOM real:
// o "arquivo" e um texto qualquer com nome .dcm.
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ImagensPage from '../../../../frontend/src/app/imagens/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/imagens' }))
vi.mock('../../../../frontend/src/components/Sidebar', () => ({ default: () => <nav aria-label="menu lateral" /> }))
vi.mock('../../../../frontend/src/components/Topbar', () => ({ default: () => <header aria-label="barra do topo" /> }))

const sessao = (perfil: string) => ({ id: 1, nome: 'Pessoa Teste', email: 'pessoa@exemplo.test', perfil, foto_perfil_url: null })
function imagem(id: number, extra: object = {}) {
  return {
    id,
    orthanc_id: `abcdef-${String(id).replace(/\d/g, (d) => 'ghijklmnop'[Number(d)])}-teste`, // sem algarismos
    resource_type: 'instance',
    anonimizacao_status: 'concluida',
    criado_em: '2026-11-10T12:00:00Z',
    status_curadoria: 'aprovada',
    ...extra,
  }
}
const IMAGENS = [
  imagem(61),
  imagem(7, { status_curadoria: null, aguarda_recorte: true, anonimizacao_status: 'falha', criado_em: '2026-11-09T12:00:00Z' }),
  imagem(8, { status_curadoria: 'pendente', resource_type: 'series', anonimizacao_status: 'desconhecido', criado_em: 'data-invalida' }),
  imagem(161, { status_curadoria: 'em_analise', resource_type: 'outro', criado_em: undefined }),
]
function rotasPadrao(extra: Record<string, Rota> = {}, perfil = 'curador'): Record<string, Rota> {
  return { 'GET /auth/me': { corpo: sessao(perfil) }, 'GET /images/': { corpo: IMAGENS }, ...extra }
}
async function abrir(rotas: Record<string, Rota>) {
  const servidor = servidorFalso(rotas)
  montarTela(<ImagensPage />)
  await waitFor(() => expect(screen.queryByText('Carregando...')).toBeNull())
  return servidor
}
const linhas = () => screen.getAllByRole('row').slice(1).map((l) => l.textContent ?? '')
const numeros = () => linhas().map((l) => l.match(/^nº (\d+)/)?.[1]).filter(Boolean)
const [filtroAnonimizacao, filtroCuradoria] = [() => screen.getAllByRole('combobox')[0], () => screen.getAllByRole('combobox')[1]]
const arquivoDicom = () => document.querySelector('input[type="file"]') as HTMLInputElement

beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

describe('quem pode ver', () => {
  it('sem sessao vai ao login', async () => {
    servidorFalso({ 'GET /auth/me': { status: 401 } })
    montarTela(<ImagensPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
  })

  it('estudante e levado ao "acesso negado" sem buscar a lista', async () => {
    const servidor = servidorFalso(rotasPadrao({}, 'estudante'))
    montarTela(<ImagensPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/acesso-negado?de=/imagens'))
    expect(servidor.pedidos.some((p) => p.caminho === '/images/')).toBe(false)
  })

  it.each(['administrador', 'suporte', 'curador', 'professor'])('%s ve a lista', async (perfil) => {
    await abrir(rotasPadrao({}, perfil))
    expect(screen.getByRole('heading', { name: 'Imagens recebidas' })).toBeTruthy()
    expect(numeros()).toEqual(['61', '7', '8', '161'])
  })
})

describe('lista', () => {
  it('contadores, tipo, situacao da anonimizacao, "Sem ficha" e datas', async () => {
    await abrir(rotasPadrao())
    // aguardando = sem ficha (7) + pendente (8) + em analise (161); 1 deles espera o recorte
    expect(screen.getByText('Aguardando curadoria').parentElement?.textContent).toContain('3')
    expect(screen.getByText(/2 estão na fila da Curadoria \(ou já em curadoria\) e 1 ainda esperam o recorte/)).toBeTruthy()
    expect(screen.getByText('Aprovadas').parentElement?.textContent).toContain('1')
    const [l61, l7, l8, l161] = linhas()
    expect(l61).toContain('abcdef-m…') // so os 8 primeiros caracteres
    expect(l61).toContain('Imagem (instância DICOM)')
    expect(l61).toContain(new Date('2026-11-10T12:00:00Z').toLocaleDateString('pt-BR'))
    expect(l7).toContain('Falha')
    expect(l7).toContain('Sem ficha')
    expect(l8).toContain('Série')
    expect(l8).toContain('desconhecido') // situacao sem traducao aparece como veio
    expect(l8).toContain('—') // data invalida
    expect(l161).toContain('outro')
    expect(l161).toContain('—') // sem data
    expect(screen.getByText('Mostrando 1–4 de 4')).toBeTruthy()
  })

  it.each([
    ['erro com explicacao', { status: 503, corpo: { detail: 'Orthanc fora do ar.' } } as Rota, 'Orthanc fora do ar.'],
    ['erro sem explicacao', { status: 500, corpo: {} } as Rota, 'Não foi possível carregar as imagens (erro 500). Tente novamente em instantes.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'],
  ])('%s: mostra o motivo e "Tentar novamente" recarrega', async (_n, rota, mensagem) => {
    const usuario = userEvent.setup()
    let resposta = rota
    const servidor = await abrir(rotasPadrao({ 'GET /images/': () => resposta as never }))
    expect(screen.getByText(mensagem)).toBeTruthy()
    expect(screen.getByText('Nenhuma imagem encontrada.')).toBeTruthy()
    resposta = { corpo: IMAGENS }
    await usuario.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    await waitFor(() => expect(numeros()).toHaveLength(4))
    expect(screen.queryByText(mensagem)).toBeNull()
    expect(servidor.pedidos.filter((p) => p.caminho === '/images/')).toHaveLength(2)
  })

  it('sessao expirada na lista: vai ao login', async () => {
    servidorFalso(rotasPadrao({ 'GET /images/': { status: 401 } }))
    montarTela(<ImagensPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
  })
})

describe('filtros e busca', () => {
  it('busca por numero ("61", "nº 61") so traz o 61; por ID do Orthanc acha pelo trecho', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao())
    const busca = screen.getByRole('searchbox', { name: 'Buscar por nº ou ID do Orthanc' })
    await usuario.type(busca, '61')
    expect(numeros()).toEqual(['61']) // "161" nao entra: o numero tem de ser igual
    await usuario.clear(busca)
    await usuario.type(busca, 'nº 61')
    expect(numeros()).toEqual(['61'])
    await usuario.clear(busca)
    await usuario.type(busca, 'ABCDEF-O-') // trecho do ID da imagem 8
    expect(numeros()).toEqual(['8'])
    await usuario.clear(busca)
    await usuario.type(busca, 'nada-disso')
    expect(screen.getByText('Nenhuma imagem encontrada.')).toBeTruthy()
  })

  it('filtros de anonimizacao, curadoria ("Sem ficha") e data de entrada', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao())
    await usuario.selectOptions(filtroAnonimizacao(), 'Falha')
    expect(numeros()).toEqual(['7'])
    await usuario.selectOptions(filtroAnonimizacao(), 'Todos os status de anonimização')
    await usuario.selectOptions(filtroCuradoria(), 'Sem ficha')
    expect(numeros()).toEqual(['7'])
    await usuario.selectOptions(filtroCuradoria(), 'Aprovada')
    expect(numeros()).toEqual(['61'])
    await usuario.selectOptions(filtroCuradoria(), 'Todos os status de curadoria')
    fireEvent.change(screen.getByLabelText('Entrada em'), { target: { value: '2026-11-09' } })
    expect(numeros()).toEqual(['7'])
  })

  it('paginas de 50: "Próxima" e "Anterior"', async () => {
    const usuario = userEvent.setup()
    const muitas = Array.from({ length: 60 }, (_, i) => imagem(i + 1))
    await abrir(rotasPadrao({ 'GET /images/': { corpo: muitas } }))
    expect(screen.getByText('Mostrando 1–50 de 60')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Anterior' }) as HTMLButtonElement).disabled).toBe(true)
    await usuario.click(screen.getByRole('button', { name: 'Próxima' }))
    expect(screen.getByText('Mostrando 51–60 de 60')).toBeTruthy()
    expect(screen.getByText('Página 2 de 2')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Próxima' }) as HTMLButtonElement).disabled).toBe(true)
    await usuario.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(screen.getByText('Página 1 de 2')).toBeTruthy()
  })
})

describe('enviar imagem DICOM', () => {
  const arquivo = () => new File(['conteudo de teste'], 'exame-teste.dcm', { type: 'application/dicom' })

  async function enviar(rota: Rota) {
    const usuario = userEvent.setup()
    const servidor = await abrir(rotasPadrao({ 'POST /images/upload': rota }))
    await usuario.upload(arquivoDicom(), arquivo())
    // o navegador de teste (jsdom) nao reconhece arquivo escolhido como "preenchido"
    // no campo obrigatorio e bloquearia o envio; por isso o formulario e enviado direto
    fireEvent.submit(arquivoDicom().closest('form') as HTMLFormElement)
    return servidor
  }

  it('sem arquivo escolhido, nada e enviado', async () => {
    const servidor = await abrir(rotasPadrao())
    fireEvent.submit(arquivoDicom().closest('form') as HTMLFormElement)
    expect(servidor.alteracoes()).toEqual([])
  })

  it('envia o arquivo, avisa o sucesso, limpa o campo e atualiza a lista', async () => {
    const servidor = await enviar({ status: 201, corpo: { status: 'criado' } })
    expect(await screen.findByText('Imagem enviada e anonimizada com sucesso.')).toBeTruthy()
    expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: '/images/upload', corpo: { arquivo: 'arquivo:exame-teste.dcm:application/dicom' } }])
    expect(arquivoDicom().value).toBe('')
    await waitFor(() => expect(servidor.pedidos.filter((p) => p.caminho === '/images/')).toHaveLength(2))
  })

  it('arquivo que ja existia: avisa que nao criou duplicata', async () => {
    await enviar({ corpo: { status: 'ja_existente' } })
    expect(await screen.findByText(/nenhuma duplicata foi criada/)).toBeTruthy()
  })

  it.each([
    ['recusado com motivo', { status: 400, corpo: { detail: 'O arquivo não é DICOM.' } } as Rota, 'O arquivo não é DICOM.'],
    ['recusado sem motivo', { status: 500 } as Rota, 'Não foi possível enviar o arquivo. Verifique se é um DICOM válido.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Não foi possível enviar o arquivo. Verifique sua conexão e tente novamente.'],
  ])('%s: mostra o aviso', async (_n, rota, mensagem) => {
    await enviar(rota)
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
    expect(screen.getByRole('button', { name: 'Enviar imagem' })).toBeTruthy() // botao volta ao normal
  })
})
