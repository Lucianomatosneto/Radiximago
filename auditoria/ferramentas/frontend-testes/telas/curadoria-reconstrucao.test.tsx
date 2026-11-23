// @vitest-environment jsdom
//
// RECONSTRUCAO PANORAMICA - TELA DE TRACAR A CURVA (etapa 3, pedido do
// Luciano, 23/11/2026). frontend/src/app/curadoria/reconstrucao/page.tsx
// - o curador escolhe a altura do corte axial (e a espessura da faixa MIP),
//   clica pontos ao longo da arcada e gera a panoramica + cortes
//   transversais (POST /reconstrucao/{ref});
// - os pontos vao em PIXELS do corte axial (coluna, linha);
// - erros do servidor aparecem com o motivo.
// Tomografia e medidas inventadas.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReconstrucaoPage from '../../../../frontend/src/app/curadoria/reconstrucao/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/curadoria/reconstrucao' }))
vi.mock('../../../../frontend/src/components/Sidebar', () => ({ default: () => <nav aria-label="Navegação lateral" /> }))
vi.mock('../../../../frontend/src/components/Topbar', () => ({ default: ({ acao }: { acao?: React.ReactNode }) => <header aria-label="Barra do topo">{acao}</header> }))

const CURADOR = { id: 7, nome: 'Curador Teste', email: 'curador@exemplo.test', perfil: 'curador', foto_perfil_url: null }
const GEOMETRIA = {
  cortes: 200, linhas: 400, colunas: 500, espacamento_mm: [0.3, 0.3, 0.3], altura_mm: 59.7,
  limites: { espessura_mm: [0.5, 40], intervalo_mm: [0.2, 10], largura_mm: [5, 80] },
}
const RESULTADO = { id: 3, serie_panoramica_uid: '1.2.9.1', serie_cortes_uid: '1.2.9.2', total_cortes: 12, tamanho_pixel_mm: 0.3 }

function rotas(extra: Record<string, Rota> = {}): Record<string, Rota> {
  return {
    'GET /auth/me': { corpo: CURADOR },
    'GET /reconstrucao/55/geometria': { corpo: GEOMETRIA },
    'GET /reconstrucao/55/lista': { corpo: [] },
    'POST /reconstrucao/55': { status: 201, corpo: RESULTADO },
    ...extra,
  }
}

async function abrir(r: Record<string, Rota>) {
  const servidor = servidorFalso(r)
  montarTela(<ReconstrucaoPage />)
  await screen.findByRole('heading', { level: 1, name: /Reconstrução panorâmica/ })
  return servidor
}

const imagem = () => screen.getByRole('img', { name: 'Corte axial da tomografia' }) as HTMLImageElement
// a imagem aparece com 500 x 400 px na tela (mesmo tamanho do corte)
function clicar(x: number, y: number) {
  const alvo = screen.getByTestId('area-curva')
  alvo.getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 400, right: 500, bottom: 400, x: 0, y: 0, toJSON: () => ({}) })
  fireEvent.click(alvo, { clientX: x, clientY: y })
}

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/curadoria/reconstrucao?ref=55')
})
afterEach(() => cleanup())

describe('tela inteira', () => {
  // 23/11/2026 (pedido do Luciano): sem a coluna de navegacao, para a imagem
  // ter mais espaco; "Voltar" leva de volta
  it('nao mostra a coluna de navegacao', async () => {
    await abrir(rotas())
    expect(screen.queryByRole('navigation', { name: 'Navegação lateral' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeTruthy()
  })
})

// 23/11/2026 (pedido do Luciano): a imagem estava pequena. O titulo e o
// texto vao para a barra do topo (depois de RADIX IMAGO); altura e faixa do
// corte ficam numa linha acima da imagem; a imagem ganha zoom,
// deslocamento e brilho/contraste; "Marcar canal mandibular" vira um botao
// grande, igual ao "Gerar".
describe('tela maior para a imagem', () => {
  const quadro = () => screen.getByTestId('area-curva') as HTMLElement
  it('titulo e explicacao na barra do topo; Voltar tambem', async () => {
    await abrir(rotas())
    const topo = screen.getByRole('banner', { name: 'Barra do topo' })
    expect(within(topo).getByRole('heading', { level: 1, name: /Reconstrução panorâmica/ })).toBeTruthy()
    expect(within(topo).getByText(/Gera, a partir da tomografia/)).toBeTruthy()
    expect(within(topo).getByRole('button', { name: 'Voltar' })).toBeTruthy()
  })

  it('zoom: botoes + e - e Ctrl + roda (sem passar corte); "Ajustar" volta', async () => {
    await abrir(rotas())
    const antes = imagem().getAttribute('src')
    fireEvent.click(screen.getByRole('button', { name: 'Aproximar' }))
    expect(quadro().style.transform).toContain('scale(1.25)')
    fireEvent.wheel(screen.getByTestId('janela-imagem'), { deltaY: -100, ctrlKey: true })
    expect(quadro().style.transform).not.toContain('scale(1.25)')
    expect(imagem().getAttribute('src')).toBe(antes)
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar à tela' }))
    expect(quadro().style.transform).toBe('translate(0px, 0px) scale(1)')
    fireEvent.click(screen.getByRole('button', { name: 'Afastar' }))
    expect(quadro().style.transform).toContain('scale(1)')
  })

  it('arrastar com o botao esquerdo desloca a imagem e nao marca ponto', async () => {
    await abrir(rotas())
    const janela = screen.getByTestId('janela-imagem')
    fireEvent.mouseDown(janela, { button: 0, clientX: 100, clientY: 100 })
    fireEvent.mouseMove(janela, { clientX: 140, clientY: 120 })
    fireEvent.mouseUp(janela, { button: 0, clientX: 140, clientY: 120 })
    clicar(140, 120)
    expect(quadro().style.transform).toContain('translate(40px, 20px)')
    expect(screen.getByText('Nenhum ponto marcado')).toBeTruthy()
    // um clique simples (sem arrastar) continua marcando ponto
    fireEvent.mouseDown(janela, { button: 0, clientX: 50, clientY: 50 })
    fireEvent.mouseUp(janela, { button: 0, clientX: 50, clientY: 50 })
    clicar(50, 50)
    expect(screen.getByText('1 ponto marcado')).toBeTruthy()
  })

  it('botao direito arrastando muda brilho e contraste; "Restaurar" volta', async () => {
    await abrir(rotas())
    const janela = screen.getByTestId('janela-imagem')
    fireEvent.mouseDown(janela, { button: 2, clientX: 100, clientY: 100 })
    fireEvent.mouseMove(janela, { clientX: 200, clientY: 50 })
    fireEvent.mouseUp(janela, { button: 2 })
    expect(imagem().style.filter).toMatch(/brightness\((?!1\))/)
    expect(imagem().style.filter).toMatch(/contrast\((?!1\))/)
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar brilho e contraste' }))
    expect(imagem().style.filter).toBe('brightness(1) contrast(1)')
  })

  it('"Marcar canal mandibular" e um botao grande, como o "Gerar"', async () => {
    await abrir(rotas({
      'GET /reconstrucao/55/lista': { corpo: [{ id: 1, criado_em: '2026-11-23T15:00:00+00:00', total_cortes: 80, tamanho_pixel_mm: 0.3, parametros: { espessura_mm: 10, intervalo_mm: 1, largura_mm: 40 } }] },
    }))
    const canal = await screen.findByRole('button', { name: 'Marcar canal mandibular' })
    const gerar = screen.getByRole('button', { name: 'Gerar panorâmica e cortes' })
    expect(canal.className).toContain('bg-brand')
    expect(canal.className).toContain('w-full')
    expect(gerar.className).toContain('bg-brand')
  })
})

describe('quem pode', () => {
  it.each(['estudante', 'professor', 'suporte', 'pesquisador'])('%s vai para acesso negado', async (perfil) => {
    servidorFalso({ 'GET /auth/me': { corpo: { ...CURADOR, perfil } } })
    montarTela(<ReconstrucaoPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/acesso-negado?de=/curadoria/reconstrucao'))
  })
})

describe('tracar a curva e gerar', () => {
  it('mostra o corte axial na altura escolhida, com a faixa MIP', async () => {
    await abrir(rotas())
    await waitFor(() => expect(imagem().getAttribute('src')).toContain('/reconstrucao/55/axial.png?altura_mm='))
    const altura = screen.getByRole('slider', { name: 'Altura do corte axial (mm)' })
    fireEvent.change(altura, { target: { value: '20' } })
    expect(imagem().getAttribute('src')).toContain('altura_mm=20')
    expect(imagem().getAttribute('src')).toContain('espessura_mm=10')
  })

  // 23/11/2026 (pedido do Luciano): "nao consigo passar os cortes" - a roda
  // do mouse sobre a imagem e as setas passam os cortes axiais, um corte
  // (espacamento entre cortes) por vez, sem rolar a pagina
  it('roda do mouse e setas passam os cortes axiais, um por vez', async () => {
    await abrir(rotas())
    const area = screen.getByTestId('area-curva')
    // comeca em 45% da altura: 59,7 x 0,45 = 26,9 mm
    expect(screen.getByText('26.9 mm')).toBeTruthy()
    fireEvent.wheel(area, { deltaY: -100 })
    expect(screen.getByText('27.2 mm')).toBeTruthy()
    expect(imagem().getAttribute('src')).toContain('altura_mm=27.2')
    fireEvent.wheel(area, { deltaY: 100 })
    fireEvent.wheel(area, { deltaY: 100 })
    expect(screen.getByText('26.6 mm')).toBeTruthy()
    fireEvent.keyDown(area, { key: 'ArrowUp' })
    expect(screen.getByText('26.9 mm')).toBeTruthy()
    fireEvent.keyDown(area, { key: 'ArrowDown' })
    expect(screen.getByText('26.6 mm')).toBeTruthy()
    expect(screen.getByText(/Roda do mouse ou setas/)).toBeTruthy()
  })

  it('a roda nao passa do primeiro nem do ultimo corte', async () => {
    await abrir(rotas())
    const area = screen.getByTestId('area-curva')
    for (let i = 0; i < 300; i++) fireEvent.wheel(area, { deltaY: -100 })
    expect(screen.getByText('59.7 mm')).toBeTruthy()
    for (let i = 0; i < 300; i++) fireEvent.wheel(area, { deltaY: 100 })
    expect(screen.getByText('0 mm')).toBeTruthy()
  })

  it('clica 3 pontos ao longo da arcada e gera: os pontos vao em pixels do corte', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir(rotas())
    const gerar = screen.getByRole('button', { name: 'Gerar panorâmica e cortes' }) as HTMLButtonElement
    expect(gerar.disabled).toBe(true)
    clicar(100, 300)
    clicar(250, 100)
    expect(gerar.disabled).toBe(true)
    clicar(400, 300)
    expect(screen.getByText('3 pontos marcados')).toBeTruthy()
    expect(gerar.disabled).toBe(false)
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Faixa da panorâmica (mm)' }), { target: { value: '12' } })
    await usuario.click(gerar)
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Pronto: panorâmica e 12 cortes transversais gerados. Abra o exame no visualizador e use o painel Tomografia → Reconstrução.')
    expect(servidor.alteracoes()).toEqual([
      {
        metodo: 'POST',
        caminho: '/reconstrucao/55',
        corpo: { pontos_px: [[100, 300], [250, 100], [400, 300]], espessura_mm: 12, intervalo_mm: 1, largura_mm: 40 },
      },
    ])
  })

  it('"Desfazer ponto" e "Limpar"', async () => {
    const usuario = userEvent.setup()
    await abrir(rotas())
    clicar(100, 300)
    clicar(250, 100)
    await usuario.click(screen.getByRole('button', { name: 'Desfazer ponto' }))
    expect(screen.getByText('1 ponto marcado')).toBeTruthy()
    await usuario.click(screen.getByRole('button', { name: 'Limpar' }))
    expect(screen.getByText('Nenhum ponto marcado')).toBeTruthy()
  })

  it('erro do servidor aparece com o motivo', async () => {
    const usuario = userEvent.setup()
    await abrir(rotas({ 'POST /reconstrucao/55': { status: 409, corpo: { detail: 'Há outra reconstrução em andamento no servidor; tente de novo em instantes.' } } }))
    clicar(100, 300)
    clicar(250, 100)
    clicar(400, 300)
    await usuario.click(screen.getByRole('button', { name: 'Gerar panorâmica e cortes' }))
    expect((await screen.findByRole('alert')).textContent).toContain('outra reconstrução em andamento')
  })

  it('nao e tomografia: explica e nao mostra a ferramenta', async () => {
    await abrir(rotas({ 'GET /reconstrucao/55/geometria': { status: 422, corpo: { detail: 'Esta imagem não é uma tomografia (modalidade diferente de CT).' } } }))
    expect((await screen.findByRole('alert')).textContent).toContain('não é uma tomografia')
    expect(screen.queryByRole('button', { name: 'Gerar panorâmica e cortes' })).toBeNull()
  })

  it('lista as reconstrucoes ja feitas', async () => {
    await abrir(rotas({
      'GET /reconstrucao/55/lista': {
        corpo: [{ id: 1, criado_em: '2026-11-23T15:00:00+00:00', total_cortes: 80, tamanho_pixel_mm: 0.3, parametros: { espessura_mm: 10, intervalo_mm: 1, largura_mm: 40 } }],
      },
    }))
    const lista = await screen.findByRole('list', { name: 'Reconstruções já feitas' })
    expect(within(lista).getByText(/80 cortes/)).toBeTruthy()
  })
})
