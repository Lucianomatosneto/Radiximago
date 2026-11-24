// @vitest-environment jsdom
//
// LOCALIZADOR DA TOMOGRAFIA (pedido do Luciano, 23/11/2026): enquanto o
// curador passa os cortes, uma MINIATURA na margem de cima do quadro da
// imagem mostra, com uma LINHA DE REFERENCIA, onde esta o corte aberto:
// - axial: miniatura SAGITAL (meio do exame) com linha horizontal na altura
//   do corte (o alto da cabeca fica em cima);
// - sagital: miniatura AXIAL com linha vertical na coluna do corte;
// - coronal: miniatura AXIAL com linha horizontal na linha do corte;
// - faixa (MIP): a linha vira uma faixa com a espessura;
// - clicar na miniatura leva ao corte daquele ponto.
// frontend/src/components/curadoria/LocalizadorTomografia.tsx
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LocalizadorTomografia from '../../../../frontend/src/components/curadoria/LocalizadorTomografia'
import { montarTela } from './apoio/montar'

const GEO = { cortes: 200, linhas: 400, colunas: 500 }
afterEach(() => cleanup())

const miniatura = () => screen.getByRole('img', { name: /Localizador/ }) as HTMLImageElement
const linha = () => screen.getByTestId('linha-referencia')

function clicarNa(x: number, y: number) {
  const alvo = screen.getByRole('button', { name: /Ir para o ponto clicado/ })
  alvo.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
  fireEvent.click(alvo, { clientX: x, clientY: y })
}

describe('miniatura e linha de referencia', () => {
  it('axial: miniatura sagital do meio, linha na altura do corte (alto em cima)', () => {
    montarTela(<LocalizadorTomografia refId={55} geo={GEO} plano="axial" corte={149} onIr={() => {}} />)
    expect(miniatura().getAttribute('src')).toContain('/reconstrucao/55/plano.png?plano=sagital&indice=250')
    expect(miniatura().getAttribute('alt')).toBe('Localizador: sagital com a posição do corte axial')
    // corte 150 de 200, contado de baixo: 25% a partir de cima
    expect(linha().getAttribute('y')).toBe('25%')
  })

  it('sagital: miniatura axial do meio, linha vertical na coluna do corte', () => {
    montarTela(<LocalizadorTomografia refId={55} geo={GEO} plano="sagital" corte={124} onIr={() => {}} />)
    expect(miniatura().getAttribute('src')).toContain('plano=axial&indice=100')
    expect(linha().getAttribute('x')).toBe('25%')
  })

  it('coronal: miniatura axial, linha horizontal na linha do corte', () => {
    montarTela(<LocalizadorTomografia refId={55} geo={GEO} plano="coronal" corte={299} onIr={() => {}} />)
    expect(miniatura().getAttribute('src')).toContain('plano=axial&indice=100')
    expect(linha().getAttribute('y')).toBe('75%')
  })

  it('com faixa (MIP), a linha vira uma faixa da espessura', () => {
    montarTela(<LocalizadorTomografia refId={55} geo={GEO} plano="axial" corte={99} faixaCortes={20} onIr={() => {}} />)
    expect(linha().getAttribute('height')).toBe('10%')
    expect(linha().getAttribute('y')).toBe('45.25%')
  })
})

describe('clicar na miniatura', () => {
  it('axial: leva ao corte da altura clicada', () => {
    const onIr = vi.fn()
    montarTela(<LocalizadorTomografia refId={55} geo={GEO} plano="axial" corte={0} onIr={onIr} />)
    clicarNa(50, 25)
    expect(onIr).toHaveBeenCalledWith(150)
  })

  it('sagital: leva a coluna clicada', () => {
    const onIr = vi.fn()
    montarTela(<LocalizadorTomografia refId={55} geo={GEO} plano="sagital" corte={0} onIr={onIr} />)
    clicarNa(50, 10)
    expect(onIr).toHaveBeenCalledWith(250)
  })
})
