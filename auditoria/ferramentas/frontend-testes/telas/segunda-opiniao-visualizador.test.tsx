// @vitest-environment jsdom
//
// VISUALIZADOR DA SEGUNDA OPINIAO (frontend/src/components/segundaOpiniao/
// VisualizadorRevisao.tsx) - pedidos do video (22/11/2026):
//  - o icone "marcações do curador" aparece SEMPRE nesta tela (antes so
//    aparecia quando a ficha tinha marcacoes);
//  - as marcacoes sugeridas pelo revisor vao para o OHIF destacadas
//    (sugerida: true -> tracejadas em rosa, ver ohif/app-config.template.js).
// Dados inventados: nenhuma imagem real.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import VisualizadorRevisao from '../../../../frontend/src/components/segundaOpiniao/VisualizadorRevisao'
import type { Marcacao } from '../../../../frontend/src/lib/marcacoes'
import { montarTela } from './apoio/montar'

const ORIGEM = 'http://ohif.teste'
const VIEWER = { abrivel: true, viewer_url: `${ORIGEM}/viewer?StudyInstanceUIDs=1.2.3` }
const DO_CURADOR: Marcacao[] = [{ id: 'c1', tipo: 'oval', x: 0.1, y: 0.1, largura: 0.2, altura: 0.2, achado: 'carie' }]
const SUGERIDAS: Marcacao[] = [{ id: 's1', tipo: 'seta', x1: 0.4, y1: 0.4, x2: 0.5, y2: 0.5 }]

function montar(props: Partial<Parameters<typeof VisualizadorRevisao>[0]> = {}) {
  const alternar = vi.fn()
  montarTela(
    <VisualizadorRevisao
      carregando={false}
      viewerInfo={VIEWER}
      marcacoes={DO_CURADOR}
      mostrarMarcacoes
      onAlternarMarcacoes={alternar}
      {...props}
    />,
  )
  return alternar
}

/** a ultima mensagem enviada ao OHIF depois que ele avisa que esta pronto */
function mensagemAoOhif() {
  const iframe = document.querySelector('iframe') as HTMLIFrameElement
  const envio = vi.spyOn(iframe.contentWindow as Window, 'postMessage')
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { origin: ORIGEM, data: { tipo: 'radix-ohif-pronto' } }))
  })
  const chamadas = envio.mock.calls
  return chamadas[chamadas.length - 1][0] as { estudos: Record<string, (Marcacao & { sugerida?: boolean; texto: string })[]>; visiveis: string[] }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('icone das marcacoes do curador', () => {
  it('aparece mesmo quando o curador nao fez marcacoes (desligado, explicando)', () => {
    montar({ marcacoes: [] })
    const botao = screen.getByRole('button', { name: /O curador não fez marcações/ }) as HTMLButtonElement
    expect(botao.disabled).toBe(true)
  })

  it('com marcacoes: liga e desliga', () => {
    const alternar = montar()
    screen.getByRole('button', { name: 'Esconder marcações do curador (1)' }).click()
    expect(alternar).toHaveBeenCalledTimes(1)
  })
})

describe('marcacoes sugeridas pelo revisor', () => {
  it('vao ao OHIF marcadas como sugeridas, junto com as do curador', () => {
    montar({ marcacoesSugeridas: SUGERIDAS })
    const msg = mensagemAoOhif()
    expect(msg.visiveis).toEqual(['1.2.3'])
    expect(msg.estudos['1.2.3'].map((m) => [m.id, !!m.sugerida])).toEqual([
      ['c1', false],
      ['s1', true],
    ])
    expect(msg.estudos['1.2.3'][1].texto).toMatch(/^Sugestão do revisor 1: /)
  })

  it('com as do curador escondidas, as sugeridas continuam na imagem', () => {
    montar({ marcacoesSugeridas: SUGERIDAS, mostrarMarcacoes: false })
    const msg = mensagemAoOhif()
    expect(msg.visiveis).toEqual(['1.2.3'])
    expect(msg.estudos['1.2.3'].map((m) => m.id)).toEqual(['s1'])
  })

  it('legenda explica o destaque', () => {
    montar({ marcacoesSugeridas: SUGERIDAS })
    expect(screen.getByText('Tracejado rosa: sugestões do revisor (1)')).toBeTruthy()
  })

  it('o OHIF desenha a sugerida tracejada e em rosa', () => {
    const script = readFileSync(resolve(__dirname, '../../../../ohif/app-config.template.js'), 'utf8')
    expect(script).toContain("var COR_SUGERIDA = '#F472B6'")
    expect(script).toMatch(/m\.sugerida\)\s*traco\['stroke-dasharray'\]/)
  })
})
