// LUPA DA GRADE DE IMAGENS (Pesquisa avancada, Compartilhadas comigo...):
// calcula como o quadro cresce 2x mantendo a lupa parada embaixo do mouse.
// Explicacao completa em app/pesquisa/page.tsx (onde nasceu).

export interface Ampliacao {
  id: number
  /** ponto fixo (a lupa) dentro do quadro, em px */
  origemQuadro: string
  /** o mesmo ponto dentro do grupo de icones, em px */
  origemIcones: string
  dx: number
  dy: number
}

export function calcularAmpliacao(id: number, lupa: HTMLElement): Ampliacao | null {
  const quadro = lupa.closest('[data-cartao-imagem]') as HTMLElement | null
  const icones = lupa.parentElement
  if (!quadro || !icones) return null
  const rq = quadro.getBoundingClientRect()
  const ri = icones.getBoundingClientRect()
  const rl = lupa.getBoundingClientRect()
  const lx = rl.left + rl.width / 2
  const ly = rl.top + rl.height / 2
  // quadro ampliado com a lupa parada: cresce (lx - left) para a esquerda etc.
  const novo = {
    left: rq.left - (lx - rq.left),
    top: rq.top - (ly - rq.top),
    right: rq.right + (rq.right - lx),
    bottom: rq.bottom + (rq.bottom - ly),
  }
  const area = (quadro.closest('main') ?? document.body).getBoundingClientRect()
  const MARGEM = 8
  const esq = area.left + MARGEM
  const dir = Math.min(area.right, window.innerWidth) - MARGEM
  // a imagem ampliada nunca fica por baixo da barra fixa de cima (selecao,
  // salvar, imprimir...) - pedido de 22/10/2026
  const barra = document.querySelector('[data-barra-grade]') as HTMLElement | null
  const fimBarra = barra ? barra.getBoundingClientRect().bottom : 0
  const topo = Math.max(area.top, 0, fimBarra) + MARGEM
  const base = window.innerHeight - MARGEM
  const dx = novo.left < esq ? esq - novo.left : novo.right > dir ? dir - novo.right : 0
  // primeiro cabe embaixo; o topo tem a palavra final (nunca sob a barra)
  let dy = novo.bottom > base ? base - novo.bottom : 0
  if (novo.top + dy < topo) dy = topo - novo.top
  return {
    id,
    origemQuadro: `${lx - rq.left}px ${ly - rq.top}px`,
    origemIcones: `${lx - ri.left}px ${ly - ri.top}px`,
    dx: Math.round(dx),
    dy: Math.round(dy),
  }
}
