// @vitest-environment jsdom
//
// MARCAR LESAO NA TOMOGRAFIA - NO CORTE (pedido do Luciano, 23/11/2026,
// "opcao 1"). frontend/src/components/curadoria/MarcadorTomografia.tsx
// - o curador escolhe o PLANO (Axial, Sagital, Coronal) e passa os CORTES
//   (barra, roda do mouse ou setas); a imagem do corte vem de
//   GET /reconstrucao/{ref}/plano.png;
// - desenha como nas radiografias (o MarcadorAchado de sempre); cada
//   marcacao nova leva o plano e o numero do corte;
// - so aparecem as marcacoes do corte aberto; a lista "Marcações do exame"
//   mostra todas e o botao "Ir" abre o corte de cada uma.
// O MarcadorAchado e trocado por um falso (ele ja tem testes proprios).
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MarcadorTomografia from '../../../../frontend/src/components/curadoria/MarcadorTomografia'
import type { Marcacao } from '../../../../frontend/src/lib/marcacoes'
import { montarTela, servidorFalso } from './apoio/montar'

vi.mock('../../../../frontend/src/components/curadoria/MarcadorAchado', () => ({
  default: (p: { urlImagem?: string; marcacoes: Marcacao[]; onMarcar: (m: Marcacao[]) => void }) => (
    <div data-testid="marcador" data-url={p.urlImagem}>
      <span>{p.marcacoes.length} marcações neste corte</span>
      <button type="button" onClick={() => p.onMarcar([...p.marcacoes, { id: 'nova', tipo: 'oval', x: 0.1, y: 0.1, largura: 0.2, altura: 0.2 }])}>
        desenhar
      </button>
    </div>
  ),
}))

const GEOMETRIA = {
  cortes: 200, linhas: 400, colunas: 500, espacamento_mm: [0.3, 0.3, 0.3], altura_mm: 59.7,
  limites: { espessura_mm: [0.5, 40], intervalo_mm: [0.2, 10], largura_mm: [5, 80] },
}
const JA_MARCADA: Marcacao = { id: 'm1', tipo: 'seta', x1: 0.1, y1: 0.1, x2: 0.3, y2: 0.3, plano: 'sagital', corte: 120 }

async function abrir(marcacoes: Marcacao[] = []) {
  servidorFalso({ 'GET /reconstrucao/55/geometria': { corpo: GEOMETRIA } })
  const onMarcar = vi.fn()
  montarTela(<MarcadorTomografia orthancReferenceId={55} marcacoes={marcacoes} onMarcar={onMarcar} />)
  await screen.findByTestId('marcador')
  return onMarcar
}
const url = () => screen.getByTestId('marcador').getAttribute('data-url') ?? ''

beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

describe('plano e corte', () => {
  it('abre no axial, no corte do meio', async () => {
    await abrir()
    expect(url()).toContain('/reconstrucao/55/plano.png?plano=axial&indice=100')
    expect(screen.getByText('Corte 101 de 200')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Axial' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('trocar o plano: sagital vai pelas colunas, coronal pelas linhas', async () => {
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Sagital' }))
    expect(url()).toContain('plano=sagital&indice=250')
    expect(screen.getByText('Corte 251 de 500')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Coronal' }))
    expect(url()).toContain('plano=coronal&indice=200')
  })

  it('roda do mouse e setas passam os cortes, sem sair do exame', async () => {
    await abrir()
    const area = screen.getByTestId('area-tomografia')
    fireEvent.wheel(area, { deltaY: -100 })
    expect(url()).toContain('indice=101')
    fireEvent.keyDown(area, { key: 'ArrowDown' })
    fireEvent.keyDown(area, { key: 'ArrowDown' })
    expect(url()).toContain('indice=99')
    fireEvent.change(screen.getByRole('slider', { name: 'Corte' }), { target: { value: '0' } })
    fireEvent.wheel(area, { deltaY: 100 })
    expect(url()).toContain('indice=0')
  })
})

describe('marcacoes', () => {
  it('a marcacao nova leva o plano e o corte; as de outros cortes continuam', async () => {
    const onMarcar = await abrir([JA_MARCADA])
    expect(screen.getByText('0 marcações neste corte')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'desenhar' }))
    expect(onMarcar).toHaveBeenCalledWith([
      JA_MARCADA,
      { id: 'nova', tipo: 'oval', x: 0.1, y: 0.1, largura: 0.2, altura: 0.2, plano: 'axial', corte: 100 },
    ])
  })

  it('a lista mostra as marcacoes do exame e "Ir" abre o corte de cada uma', async () => {
    await abrir([JA_MARCADA])
    const lista = screen.getByRole('list', { name: 'Marcações do exame' })
    expect(within(lista).getByText(/Sagital · corte 121/)).toBeTruthy()
    fireEvent.click(within(lista).getByRole('button', { name: 'Ir' }))
    expect(url()).toContain('plano=sagital&indice=120')
    expect(screen.getByText('1 marcações neste corte')).toBeTruthy()
  })
})
