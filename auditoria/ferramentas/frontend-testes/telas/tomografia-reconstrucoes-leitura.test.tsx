// @vitest-environment jsdom
//
// PANORAMICA E CANAL PARA QUEM ESTUDA (pedido do Luciano, 24/11/2026,
// recurso 5). Na tela da imagem aprovada, a secao "Panorâmica reconstruída"
// (frontend/src/components/detalhe/ReconstrucoesTomografia.tsx):
// - so aparece se o curador gerou alguma reconstrucao;
// - panoramica em cima, com uma linha amarela onde esta o corte transversal
//   aberto; clicar na panoramica abre o corte daquele ponto;
// - corte transversal embaixo: barra, roda e setas passam os cortes;
// - "Mostrar canal mandibular" (quando o curador marcou) troca as imagens
//   pelas versoes com o canal desenhado;
// - mais de uma reconstrucao: escolhe qual.
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import ReconstrucoesTomografia from '../../../../frontend/src/components/detalhe/ReconstrucoesTomografia'
import { montarTela, servidorFalso } from './apoio/montar'

afterEach(() => cleanup())

const REC = { id: 3, criado_em: '2026-11-23T15:00:00+00:00', total_cortes: 41, tamanho_pixel_mm: 0.5, intervalo_mm: 2, largura_mm: 40, tem_canal: true }
const REC_ANTIGA = { ...REC, id: 2, criado_em: '2026-11-22T10:00:00+00:00', total_cortes: 11, tem_canal: false }

async function abrir(lista: object[] = [REC]) {
  servidorFalso({ 'GET /search/7/tomografia/reconstrucoes': { corpo: lista } })
  const tela = montarTela(<ReconstrucoesTomografia curationId={7} />)
  if (lista.length) await screen.findByRole('img', { name: /Panorâmica reconstruída/ })
  else await new Promise((r) => setTimeout(r, 20))
  return tela
}
const pano = () => screen.getByRole('img', { name: /Panorâmica reconstruída/ }) as HTMLImageElement
const corte = () => screen.getByRole('img', { name: /Corte transversal/ }).getAttribute('src') ?? ''
/** a panoramica "carregou" com 800 px de largura (400 mm / 0,5 mm) */
function carregarPano() {
  Object.defineProperty(pano(), 'naturalWidth', { configurable: true, value: 800 })
  fireEvent.load(pano())
  pano().getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 100, right: 400, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
}

describe('quando aparece', () => {
  it('sem reconstrucoes: nada aparece', async () => {
    const { container } = await abrir([])
    expect(container.textContent).toBe('')
  })

  it('panoramica com canal (padrao quando o curador marcou) e o corte do meio', async () => {
    await abrir()
    expect(screen.getByRole('heading', { name: 'Panorâmica reconstruída e cortes transversais' })).toBeTruthy()
    expect(pano().getAttribute('src')).toContain('/search/7/tomografia/reconstrucoes/3/imagem.png?tipo=panoramica&canal=true')
    expect(corte()).toContain('/search/7/tomografia/reconstrucoes/3/imagem.png?tipo=corte&n=21&canal=true')
    expect(screen.getByText('Corte transversal 21 de 41 · 40 mm ao longo da arcada')).toBeTruthy()
  })
})

describe('navegar', () => {
  it('linha do corte na panoramica; clicar na panoramica abre o corte daquele ponto', async () => {
    await abrir()
    carregarPano()
    // corte 21: (21 - 1) x 2 mm / 0,5 mm = coluna 80 de 800 = 10%
    expect(screen.getByTestId('linha-corte-transversal').style.left).toBe('10%')
    // clique a 50% da largura: coluna 400 = 200 mm = corte 101 -> limitado ao ultimo (41)
    fireEvent.click(pano(), { clientX: 200, clientY: 50 })
    expect(corte()).toContain('n=41')
    // clique a 5%: coluna 40 = 20 mm = corte 11
    fireEvent.click(pano(), { clientX: 20, clientY: 50 })
    expect(corte()).toContain('n=11')
  })

  it('roda, setas e barra passam os cortes transversais', async () => {
    await abrir()
    const area = screen.getByTestId('area-corte-transversal')
    fireEvent.wheel(area, { deltaY: -100 })
    expect(corte()).toContain('n=22')
    fireEvent.keyDown(area, { key: 'ArrowLeft' })
    fireEvent.keyDown(area, { key: 'ArrowLeft' })
    expect(corte()).toContain('n=20')
    fireEvent.change(screen.getByRole('slider', { name: 'Corte transversal' }), { target: { value: '1' } })
    expect(corte()).toContain('n=1&')
    fireEvent.keyDown(area, { key: 'ArrowLeft' })
    expect(corte()).toContain('n=1&')
  })

  it('desligar o canal mostra as imagens sem o desenho', async () => {
    await abrir()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mostrar canal mandibular' }))
    expect(pano().getAttribute('src')).toContain('canal=false')
    expect(corte()).toContain('canal=false')
  })

  it('reconstrucao sem canal: sem a opcao; mais de uma: escolhe qual', async () => {
    await abrir([REC, REC_ANTIGA])
    const escolha = screen.getByRole('combobox', { name: 'Reconstrução' }) as HTMLSelectElement
    expect(escolha.options).toHaveLength(2)
    fireEvent.change(escolha, { target: { value: '2' } })
    expect(pano().getAttribute('src')).toContain('/reconstrucoes/2/imagem.png?tipo=panoramica&canal=false')
    expect(corte()).toContain('n=6&')
    expect(screen.queryByRole('checkbox', { name: 'Mostrar canal mandibular' })).toBeNull()
  })
})
