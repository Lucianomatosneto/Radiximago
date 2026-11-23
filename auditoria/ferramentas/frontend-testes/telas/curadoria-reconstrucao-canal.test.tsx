// @vitest-environment jsdom
//
// CANAL MANDIBULAR NA PANORAMICA RECONSTRUIDA (pedido do Luciano,
// 23/11/2026). frontend/src/app/curadoria/reconstrucao/page.tsx +
// frontend/src/components/curadoria/MarcarCanal.tsx
// - em cada reconstrucao feita, "Marcar canal mandibular" abre a panoramica;
// - o curador clica pontos ao longo do canal (pixels da panoramica) e pode
//   marcar o OUTRO LADO (ate 2 tracados, cada um com 2 pontos ou mais);
// - "Gravar canal" manda os tracados (POST /reconstrucao/{ref}/{rec}/canal);
// - reconstrucao com canal ja marcado abre com o trajeto salvo.
// Tomografia e medidas inventadas.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReconstrucaoPage from '../../../../frontend/src/app/curadoria/reconstrucao/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/curadoria/reconstrucao' }))
vi.mock('../../../../frontend/src/components/Sidebar', () => ({ default: () => null }))
vi.mock('../../../../frontend/src/components/Topbar', () => ({ default: () => null }))

const CURADOR = { id: 7, nome: 'Curador Teste', email: 'curador@exemplo.test', perfil: 'curador', foto_perfil_url: null }
const GEOMETRIA = {
  cortes: 200, linhas: 400, colunas: 500, espacamento_mm: [0.3, 0.3, 0.3], altura_mm: 59.7,
  limites: { espessura_mm: [0.5, 40], intervalo_mm: [0.2, 10], largura_mm: [5, 80] },
}
const REC = { id: 9, criado_em: '2026-11-23T15:00:00+00:00', total_cortes: 80, tamanho_pixel_mm: 0.3, parametros: { espessura_mm: 10, intervalo_mm: 1, largura_mm: 40 }, canal: null }

function rotas(extra: Record<string, Rota> = {}): Record<string, Rota> {
  return {
    'GET /auth/me': { corpo: CURADOR },
    'GET /reconstrucao/55/geometria': { corpo: GEOMETRIA },
    'GET /reconstrucao/55/lista': { corpo: [REC] },
    'GET /reconstrucao/55/9/panoramica': { corpo: { largura: 600, altura: 200, tamanho_pixel_mm: 0.3, canal: null } },
    'POST /reconstrucao/55/9/canal': { status: 201, corpo: { id: 9, total_cortes: 80 } },
    ...extra,
  }
}

async function abrirCanal(r: Record<string, Rota>) {
  const usuario = userEvent.setup()
  const servidor = servidorFalso(r)
  montarTela(<ReconstrucaoPage />)
  const lista = await screen.findByRole('list', { name: 'Reconstruções já feitas' })
  await usuario.click(within(lista).getByRole('button', { name: 'Marcar canal mandibular' }))
  await screen.findByRole('img', { name: 'Panorâmica reconstruída da tomografia' })
  return { usuario, servidor }
}

// a panoramica aparece com 600 x 200 px na tela (mesmo tamanho da imagem)
function clicar(x: number, y: number) {
  const alvo = screen.getByTestId('area-canal')
  alvo.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 200, right: 600, bottom: 200, x: 0, y: 0, toJSON: () => ({}) })
  fireEvent.click(alvo, { clientX: x, clientY: y })
}

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/curadoria/reconstrucao?ref=55')
})
afterEach(() => cleanup())

describe('marcar o canal mandibular', () => {
  it('abre a panoramica da reconstrucao escolhida', async () => {
    await abrirCanal(rotas())
    const img = screen.getByRole('img', { name: 'Panorâmica reconstruída da tomografia' }) as HTMLImageElement
    expect(img.getAttribute('src')).toContain('/reconstrucao/55/9/panoramica.png')
    expect(screen.getByText(/Material de ensino, não diagnóstico/)).toBeTruthy()
  })

  it('marca os dois lados e grava: os pontos vao em pixels da panoramica', async () => {
    const { usuario, servidor } = await abrirCanal(rotas())
    const gravar = screen.getByRole('button', { name: 'Gravar canal' }) as HTMLButtonElement
    const outroLado = screen.getByRole('button', { name: 'Outro lado' }) as HTMLButtonElement
    clicar(50, 120)
    expect(gravar.disabled).toBe(true) // 1 ponto so nao forma traçado
    expect(outroLado.disabled).toBe(true)
    clicar(200, 140)
    expect(screen.getByText('Traçado 1: 2 pontos')).toBeTruthy()
    expect(gravar.disabled).toBe(false)
    await usuario.click(outroLado)
    expect(screen.getByText('Traçado 2: nenhum ponto')).toBeTruthy()
    expect(outroLado.disabled).toBe(true) // no maximo 2 lados
    clicar(400, 140)
    clicar(550, 120)
    await usuario.click(gravar)
    expect((await screen.findByRole('status')).textContent).toContain('canal desenhado na panorâmica e em 80 cortes')
    expect(servidor.alteracoes()).toEqual([
      { metodo: 'POST', caminho: '/reconstrucao/55/9/canal', corpo: { tracados: [[[50, 120], [200, 140]], [[400, 140], [550, 120]]] } },
    ])
  })

  it('"Desfazer ponto" volta ao lado anterior quando o atual esta vazio; "Limpar" zera', async () => {
    const { usuario } = await abrirCanal(rotas())
    clicar(50, 120)
    clicar(200, 140)
    await usuario.click(screen.getByRole('button', { name: 'Outro lado' }))
    // a tela da curva tambem tem "Desfazer ponto" e "Limpar": usa os do canal
    const canal = screen.getByRole('region', { name: 'Canal mandibular' })
    await usuario.click(within(canal).getByRole('button', { name: 'Desfazer ponto' }))
    expect(screen.getByText('Traçado 1: 2 pontos')).toBeTruthy()
    await usuario.click(within(canal).getByRole('button', { name: 'Limpar' }))
    expect(screen.getByText('Traçado 1: nenhum ponto')).toBeTruthy()
  })

  it('canal ja marcado abre com o trajeto salvo', async () => {
    await abrirCanal(rotas({
      'GET /reconstrucao/55/lista': { corpo: [{ ...REC, canal: { tracados: [[[10, 10], [90, 20]]] } }] },
      'GET /reconstrucao/55/9/panoramica': { corpo: { largura: 600, altura: 200, tamanho_pixel_mm: 0.3, canal: { tracados: [[[10, 10], [90, 20]]] } } },
    }))
    expect(screen.getByText(/canal marcado/)).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Traçado 1: 2 pontos')).toBeTruthy())
  })

  it('erro do servidor aparece com o motivo', async () => {
    const { usuario } = await abrirCanal(rotas({ 'POST /reconstrucao/55/9/canal': { status: 422, corpo: { detail: 'Há pontos do canal fora da panorâmica.' } } }))
    clicar(50, 120)
    clicar(200, 140)
    await usuario.click(screen.getByRole('button', { name: 'Gravar canal' }))
    expect((await screen.findByRole('alert')).textContent).toContain('fora da panorâmica')
  })
})
