// @vitest-environment jsdom
//
// VISUALIZADOR OHIF MAIS LIMPO (pedido do video, 22/11/2026).
// Roda o ohif/app-config.template.js de verdade numa pagina falsa com os
// mesmos marcadores (data-cy) do OHIF v3.9.2 e confere que, MESMO SEM
// parametros no endereco (ex.: "Abrir no visualizador" de Minhas imagens),
// somem: a coluna "Studies" (com a seta), o cubo (TrackballRotate), a camera
// (Capture), o quadro de layout (Layout) e o circulo do canto superior
// direito da imagem (menu de janela do OHIF). As outras ferramentas ficam.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const SCRIPT = readFileSync(resolve(__dirname, '../../../../ohif/app-config.template.js'), 'utf8')

function paginaOhif() {
  document.body.innerHTML = `
    <div id="raiz">
      <div id="coluna-estudos"><div><button data-cy="side-panel-header-left">⇤</button><div data-cy="studyBrowser-panel">Studies</div></div></div>
      <div id="direita">
        <div id="barra">
          <div><div><button data-cy="Zoom">zoom</button></div></div>
          <div><div><button data-cy="TrackballRotate">cubo</button></div></div>
          <div><div><button data-cy="Capture">camera</button></div></div>
          <div><div><button data-cy="Layout">layout</button></div></div>
          <div><div><button data-cy="WindowLevel">contraste</button></div></div>
        </div>
        <div data-cy="viewport-grid">
          <div class="pointer-events-auto flex items-center gap-1 absolute top-[4px] right-[4px] right-viewport-scrollbar" id="canto"><span>◐</span></div>
          <div class="pointer-events-auto flex items-center gap-1 absolute bottom-[4px] right-[0px] right-viewport-scrollbar" id="canto-baixo"><span>1/1</span></div>
        </div>
      </div>
    </div>`
}

function rodarConfig() {
  // eslint-disable-next-line no-new-func
  new Function(SCRIPT)()
}

const escondido = (el: Element | null) => {
  let atual: Element | null = el
  while (atual) {
    if ((atual as HTMLElement).style?.display === 'none') return true
    if (getComputedStyle(atual).display === 'none') return true
    atual = atual.parentElement
  }
  return false
}

afterEach(() => {
  vi.useRealTimers()
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

describe('OHIF sem os itens que nao tem funcao no Radix', () => {
  it('sem parametros no endereco: some Studies, cubo, camera, layout e o circulo do canto; o resto fica', () => {
    vi.useFakeTimers()
    paginaOhif()
    rodarConfig()
    vi.advanceTimersByTime(1000)
    expect(escondido(document.querySelector('[data-cy="studyBrowser-panel"]'))).toBe(true)
    expect(escondido(document.querySelector('[data-cy="side-panel-header-left"]'))).toBe(true)
    expect(escondido(document.querySelector('[data-cy="TrackballRotate"]'))).toBe(true)
    expect(escondido(document.querySelector('[data-cy="Capture"]'))).toBe(true)
    expect(escondido(document.querySelector('[data-cy="Layout"]'))).toBe(true)
    expect(escondido(document.getElementById('canto'))).toBe(true)
    // continuam: zoom, contraste, a imagem e o contador de baixo
    expect(escondido(document.querySelector('[data-cy="Zoom"]'))).toBe(false)
    expect(escondido(document.querySelector('[data-cy="WindowLevel"]'))).toBe(false)
    expect(escondido(document.querySelector('[data-cy="viewport-grid"]'))).toBe(false)
    expect(escondido(document.getElementById('canto-baixo'))).toBe(false)
  })
})
