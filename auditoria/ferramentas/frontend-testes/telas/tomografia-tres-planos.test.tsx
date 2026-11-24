// @vitest-environment jsdom
//
// TRES PLANOS JUNTOS, SINCRONIZADOS (pedido do Luciano, 24/11/2026,
// recurso 7): axial, sagital e coronal lado a lado, com um CURSOR 3D comum
// (coluna, linha, corte). Cada quadro mostra o corte que passa pelo cursor e
// uma cruz amarela onde ele esta; clicar num ponto de um quadro leva os
// outros dois ao mesmo lugar. Imagens de cada plano como em plano.png:
// axial (x = coluna, y = linha); sagital (x = linha; alto da cabeca em cima)
// e coronal (x = coluna; alto em cima).
// frontend/src/components/curadoria/TresPlanosTomografia.tsx
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TresPlanosTomografia from '../../../../frontend/src/components/curadoria/TresPlanosTomografia'
import { montarTela } from './apoio/montar'

afterEach(() => cleanup())

const GEO = { cortes: 200, linhas: 400, colunas: 500 }
const url = (p: string, i: number) => `/x/${p}/${i}`
const quadro = (nome: string) => screen.getByRole('button', { name: new RegExp(`^${nome}`) })
const img = (nome: string) => screen.getByRole('img', { name: new RegExp(`^${nome}`) }).getAttribute('src')
const caixa100 = (el: Element) => {
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
}

function montar(extra: Partial<Parameters<typeof TresPlanosTomografia>[0]> = {}) {
  const onCursor = vi.fn()
  const onEscolherPlano = vi.fn()
  montarTela(
    <TresPlanosTomografia
      geo={GEO}
      urlPlano={url}
      cursor={{ coluna: 250, linha: 100, corte: 150 }}
      onCursor={onCursor}
      planoPrincipal="axial"
      onEscolherPlano={onEscolherPlano}
      {...extra}
    />,
  )
  return { onCursor, onEscolherPlano }
}

describe('quadros', () => {
  it('cada plano mostra o corte que passa pelo cursor', () => {
    montar()
    expect(img('Axial')).toBe('/x/axial/150')
    expect(img('Sagital')).toBe('/x/sagital/250')
    expect(img('Coronal')).toBe('/x/coronal/100')
  })

  it('cruz no lugar do cursor em cada quadro (alto da cabeca em cima no sagital e no coronal)', () => {
    montar()
    const cruz = (p: string) => screen.getByTestId(`cruz-${p}`)
    // axial: coluna 250/500 = 50%, linha 100/400 = 25%
    expect(cruz('axial').getAttribute('data-x')).toBe('50.1')
    expect(cruz('axial').getAttribute('data-y')).toBe('25.13')
    // sagital: x = linha (25%); y = corte 150 de 200 contado de baixo = 24,75%
    expect(cruz('sagital').getAttribute('data-x')).toBe('25.13')
    expect(cruz('sagital').getAttribute('data-y')).toBe('24.75')
    // coronal: x = coluna; y como no sagital
    expect(cruz('coronal').getAttribute('data-x')).toBe('50.1')
    expect(cruz('coronal').getAttribute('data-y')).toBe('24.75')
  })

  it('o plano principal fica destacado', () => {
    montar({ planoPrincipal: 'sagital' })
    expect(quadro('Sagital').getAttribute('aria-pressed')).toBe('true')
    expect(quadro('Axial').getAttribute('aria-pressed')).toBe('false')
  })
})

describe('clicar leva os outros ao mesmo lugar', () => {
  it('no axial: muda coluna e linha, mantem o corte', () => {
    const { onCursor } = montar()
    caixa100(quadro('Axial'))
    fireEvent.click(quadro('Axial'), { clientX: 10, clientY: 50 })
    expect(onCursor).toHaveBeenCalledWith({ coluna: 50, linha: 200, corte: 150 })
  })

  it('no sagital: muda linha e corte (de cima para baixo), mantem a coluna', () => {
    const { onCursor } = montar()
    caixa100(quadro('Sagital'))
    fireEvent.click(quadro('Sagital'), { clientX: 50, clientY: 10 })
    expect(onCursor).toHaveBeenCalledWith({ coluna: 250, linha: 200, corte: 180 })
  })

  it('no coronal: muda coluna e corte, mantem a linha', () => {
    const { onCursor } = montar()
    caixa100(quadro('Coronal'))
    fireEvent.click(quadro('Coronal'), { clientX: 20, clientY: 90 })
    expect(onCursor).toHaveBeenCalledWith({ coluna: 100, linha: 100, corte: 20 })
  })

  it('duplo clique faz do quadro o plano principal (onde se marca)', () => {
    const { onEscolherPlano } = montar()
    fireEvent.doubleClick(quadro('Coronal'))
    expect(onEscolherPlano).toHaveBeenCalledWith('coronal')
  })
})
