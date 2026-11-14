// @vitest-environment jsdom
//
// TELA "Enviar imagem" (frontend/src/app/enviar-imagem/page.tsx) - Fase 3b.
// Quem pode enviar, destinos por perfil (estudante: so para mim ou para
// analise; equipe: fila de curadoria ou so para mim), escolher e tirar
// arquivos, exigir arquivo e analista, o que vai para o servidor em cada
// caso (destino, analista, recado, pessoas e grupos), resultado por
// arquivo (deu certo, recusado com motivo, sem conexao) e o modo "foto
// pelo celular". Simulados: o envio de foto (teste proprio) e o seletor de
// pessoas e grupos (teste proprio). Arquivos inventados (texto com nome .dcm).
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EnviarImagemPage from '../../../../frontend/src/app/enviar-imagem/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/enviar-imagem' }))
vi.mock('../../../../frontend/src/components/Sidebar', () => ({ default: () => <nav aria-label="menu lateral" /> }))
vi.mock('../../../../frontend/src/components/Topbar', () => ({ default: () => <header aria-label="barra do topo" /> }))
vi.mock('../../../../frontend/src/components/envios/EnvioFotoCelular', () => ({
  default: ({ opcoes, analistas, onSair }: { opcoes: string[]; analistas: { nome: string }[]; onSair: () => void }) => (
    <section aria-label="envio de foto">
      destinos {opcoes.join(',')}; analistas {analistas.map((a) => a.nome).join(',')}
      <button type="button" onClick={onSair}>
        sair da foto
      </button>
    </section>
  ),
}))
vi.mock('../../../../frontend/src/components/envios/SeletorPessoasGrupos', () => ({
  default: ({ aoMudar }: { aoMudar: (p: { id: number; nome: string }[], g: number[]) => void }) => (
    <button type="button" onClick={() => aoMudar([{ id: 4, nome: 'Ana' }, { id: 6, nome: 'Bia' }], [2])}>
      escolher Ana, Bia e o grupo 2
    </button>
  ),
}))

const sessao = (perfil: string) => ({ id: 1, nome: 'Pessoa Teste', email: 'pessoa@exemplo.test', perfil, foto_perfil_url: null })
const ANALISTAS = [{ id: 21, nome: 'Prof. Teste', perfil: 'professor' }, { id: 22, nome: 'Curadora Teste', perfil: 'curador' }]
function rotasPadrao(perfil: string, extra: Record<string, Rota> = {}): Record<string, Rota> {
  return { 'GET /auth/me': { corpo: sessao(perfil) }, 'GET /envios/analistas': { corpo: { pessoas: ANALISTAS } }, ...extra }
}
async function abrir(perfil: string, extra: Record<string, Rota> = {}) {
  const servidor = servidorFalso(rotasPadrao(perfil, extra))
  montarTela(<EnviarImagemPage />)
  await screen.findByRole('heading', { name: 'Enviar imagem' })
  return servidor
}
const dicom = (nome: string) => new File(['conteudo de teste'], nome, { type: 'application/dicom' })
const entrada = () => screen.getByLabelText('Escolher arquivo', { selector: 'input' }) as HTMLInputElement
const envios = (s: ReturnType<typeof servidorFalso>) => s.alteracoes().filter((p) => p.caminho === '/envios').map((p) => p.corpo)

beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

describe('quem pode enviar', () => {
  it('sem sessao vai ao login; antes disso mostra "Carregando..."', async () => {
    servidorFalso({ 'GET /auth/me': { status: 401 } })
    montarTela(<EnviarImagemPage />)
    expect(screen.getByText('Carregando...')).toBeTruthy()
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
  })

  it.each(['suporte', 'pesquisador'])('%s vai ao "acesso negado"', async (perfil) => {
    servidorFalso(rotasPadrao(perfil))
    montarTela(<EnviarImagemPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/acesso-negado?de=/enviar-imagem'))
  })

  it('estudante: "Só para mim" ou "Enviar para análise"; busca quem pode analisar', async () => {
    const servidor = await abrir('estudante')
    expect(screen.getByText(/Escolha se ela fica só com você/)).toBeTruthy()
    expect(screen.getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual(['pessoal', 'analise'])
    expect((screen.getByRole('radio', { name: /Só para mim/ }) as HTMLInputElement).checked).toBe(true)
    expect(servidor.pedidos.map((p) => p.caminho)).toContain('/envios/analistas')
    expect(screen.queryByText('3. Enviar também para (opcional)')).toBeNull()
  })

  it.each(['professor', 'curador', 'administrador'])('%s: comeca em "Fila de curadoria" e pode enviar a pessoas e grupos', async (perfil) => {
    const servidor = await abrir(perfil)
    expect(screen.getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual(['fila', 'pessoal'])
    expect((screen.getByRole('radio', { name: /Fila de curadoria/ }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByText('3. Enviar também para (opcional)')).toBeTruthy()
    expect(servidor.pedidos.map((p) => p.caminho)).not.toContain('/envios/analistas')
  })

  it('lista de analistas que falha fica vazia (sem travar a tela)', async () => {
    const usuario = userEvent.setup()
    await abrir('estudante', { 'GET /envios/analistas': 'SEM_CONEXAO' })
    await usuario.click(screen.getByRole('radio', { name: /Enviar para análise/ }))
    expect((screen.getByLabelText('Quem vai analisar') as HTMLSelectElement).options).toHaveLength(1)
  })
})

describe('escolher arquivos', () => {
  it('sem arquivo: pede para escolher; com arquivos, o botao conta e "×" tira da lista', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir('estudante')
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(screen.getByRole('alert').textContent).toBe('Escolha pelo menos uma imagem.')
    expect(envios(servidor)).toEqual([])
    await usuario.upload(entrada(), [dicom('a.dcm'), dicom('b.dcm')])
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'Enviar 2 imagens' })).toBeTruthy()
    expect(screen.getAllByText('DICOM')).toHaveLength(2)
    await usuario.click(screen.getByRole('button', { name: 'Tirar a.dcm da lista' }))
    expect(screen.getByRole('button', { name: 'Enviar 1 imagem' })).toBeTruthy()
    fireEvent.change(entrada(), { target: { files: [] } }) // escolha cancelada: nada muda
    expect(screen.getByRole('button', { name: 'Enviar 1 imagem' })).toBeTruthy()
  })

  it('aceita no maximo 20 arquivos por vez', async () => {
    const usuario = userEvent.setup()
    await abrir('curador')
    await usuario.upload(entrada(), Array.from({ length: 25 }, (_, i) => dicom(`f${i}.dcm`)))
    expect(screen.getByRole('button', { name: 'Enviar 20 imagens' })).toBeTruthy()
  })

  it('foto com previa: arquivo de imagem aparece em miniatura', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:previa')
    URL.revokeObjectURL = vi.fn()
    await abrir('curador')
    // o campo so aceita .dcm; a previa vale para quando o navegador entrega uma imagem
    fireEvent.change(entrada(), { target: { files: [new File(['x'], 'foto.png', { type: 'image/png' })] } })
    expect((await screen.findByRole('img', { name: 'foto.png' })).getAttribute('src')).toBe('blob:previa')
  })
})

describe('enviar', () => {
  it('estudante "Só para mim": manda arquivo e destino; avisa e limpa a lista', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir('estudante', { 'POST /envios': { status: 201, corpo: {} } })
    await usuario.upload(entrada(), dicom('meu.dcm'))
    await usuario.click(screen.getByRole('button', { name: 'Enviar 1 imagem' }))
    expect(await screen.findByText(/guardada em Minhas imagens \(só você vê\)/)).toBeTruthy()
    expect(envios(servidor)).toEqual([{ arquivo: 'arquivo:meu.dcm:application/dicom', destino: 'pessoal' }])
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeTruthy() // lista vazia
    await usuario.click(screen.getByRole('button', { name: 'Ver em Minhas imagens' }))
    expect(roteador.push).toHaveBeenCalledWith('/minhas-imagens')
  })

  it('estudante "Enviar para análise": exige quem analisa; manda analista e recado', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir('estudante', { 'POST /envios': { status: 201, corpo: {} } })
    await usuario.upload(entrada(), dicom('duvida.dcm'))
    await usuario.click(screen.getByRole('radio', { name: /Enviar para análise/ }))
    await usuario.click(screen.getByRole('button', { name: 'Enviar 1 imagem' }))
    expect(screen.getByRole('alert').textContent).toBe('Escolha quem vai analisar.')
    expect(envios(servidor)).toEqual([])
    await usuario.selectOptions(screen.getByLabelText('Quem vai analisar'), 'Curadora Teste (curador)')
    await usuario.type(screen.getByLabelText('Recado (opcional)'), '  é lesão periapical?  ')
    await usuario.click(screen.getByRole('button', { name: 'Enviar 1 imagem' }))
    expect(await screen.findByText(/enviada para análise\./)).toBeTruthy()
    expect(envios(servidor)).toEqual([{ arquivo: 'arquivo:duvida.dcm:application/dicom', destino: 'analise', analista_id: '22', nota: 'é lesão periapical?' }])
  })

  it('equipe: fila de curadoria com pessoas e grupos; mostra quantas pessoas receberam', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir('professor', { 'POST /envios': { status: 201, corpo: { enviada_para: 3 } } })
    await usuario.upload(entrada(), dicom('aula.dcm'))
    await usuario.click(screen.getByRole('button', { name: 'escolher Ana, Bia e o grupo 2' }))
    await usuario.click(screen.getByRole('button', { name: 'Enviar 1 imagem' }))
    expect(await screen.findByText(/enviada para a fila de curadoria\. Recebida por 3 pessoas\./)).toBeTruthy()
    expect(envios(servidor)).toEqual([{ arquivo: 'arquivo:aula.dcm:application/dicom', destino: 'fila', pessoas: '4,6', grupos: '2' }])
  })

  it('resultado por arquivo: os que falharam ficam na lista para tentar de novo', async () => {
    const usuario = userEvent.setup()
    let n = 0
    await abrir('curador', {
      'POST /envios': () => {
        n += 1
        if (n === 1) return { status: 201, corpo: {} }
        if (n === 2) return { status: 422, corpo: { detail: [{ msg: 'Arquivo não é DICOM' }] } }
        if (n === 3) return { status: 400, corpo: { detail: 'Imagem já enviada.' } }
        if (n === 4) return { status: 500, corpo: { outro: 1 } }
        return 'SEM_CONEXAO'
      },
    })
    await usuario.upload(entrada(), ['ok', 'lista', 'texto', 'geral', 'rede'].map((x) => dicom(`${x}.dcm`)))
    await usuario.click(screen.getByRole('button', { name: 'Enviar 5 imagens' }))
    const resultado = await screen.findByText('ok.dcm:')
    const linhas = [...(resultado.closest('section') as HTMLElement).querySelectorAll('p')].map((p) => p.textContent)
    expect(linhas).toEqual([
      'ok.dcm: enviada para a fila de curadoria.',
      'lista.dcm: Arquivo não é DICOM',
      'texto.dcm: Imagem já enviada.',
      'geral.dcm: Não foi possível enviar esta imagem.',
      'rede.dcm: Sem conexão com o servidor. Tente de novo.',
    ])
    expect(screen.getByRole('button', { name: 'Enviar 4 imagens' })).toBeTruthy() // so os que falharam
  })
})

describe('foto pelo celular', () => {
  it('"Enviar foto da radiografia" troca o formulario pelo envio de foto, com os mesmos destinos; "sair" volta', async () => {
    const usuario = userEvent.setup()
    await abrir('estudante')
    await usuario.click(screen.getByRole('button', { name: /Enviar foto da radiografia/ }))
    const foto = screen.getByRole('region', { name: 'envio de foto' })
    expect(foto.textContent).toContain('destinos pessoal,analise; analistas Prof. Teste,Curadora Teste')
    expect(screen.queryByRole('button', { name: 'Enviar' })).toBeNull()
    await usuario.click(screen.getByRole('button', { name: 'sair da foto' }))
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeTruthy()
  })
})
