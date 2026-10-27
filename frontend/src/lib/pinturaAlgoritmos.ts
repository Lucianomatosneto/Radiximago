// ALGORITMOS DA PINTURA DE ESTRUTURAS (segmentacao) - 22/10/2026.
//
// Funcoes puras (sem tela): recebem a mascara como um vetor de 0/1, um
// valor por pixel (linha por linha, largura x altura), e a imagem em tons
// de cinza (0-255) no MESMO tamanho. As ferramentas da tela
// (PintorSegmentacao.tsx) so chamam estas funcoes e redesenham.
//
// Referencias de mercado das ferramentas (para a dissertacao):
//   - pincel com limiar ("threshold paint") e varinha / crescimento de
//     regiao ("region growing"): 3D Slicer (Segment Editor), ITK-SNAP;
//   - laco (contorno livre preenchido): ferramentas de anotacao para IA
//     (CVAT, Labelbox) e editores de imagem;
//   - preencher buracos e suavizar (morfologia matematica): 3D Slicer.

export type Mascara = Uint8Array

export interface Caixa {
  x0: number
  y0: number
  x1: number
  y1: number
}

const vazia = (): Caixa => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity })

function juntar(a: Caixa, b: Caixa): Caixa {
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }
}

/** Intensidade media (0-255) numa janelinha em volta do ponto: menos sensivel a ruido. */
export function intensidadeEm(cinza: Uint8Array, w: number, h: number, x: number, y: number, raio = 2): number {
  let soma = 0
  let n = 0
  const cx = Math.round(x)
  const cy = Math.round(y)
  for (let j = Math.max(0, cy - raio); j <= Math.min(h - 1, cy + raio); j++) {
    for (let i = Math.max(0, cx - raio); i <= Math.min(w - 1, cx + raio); i++) {
      soma += cinza[j * w + i]
      n++
    }
  }
  return n ? soma / n : 0
}

/**
 * Carimba um circulo na mascara. `valor` 1 pinta, 0 apaga. Com `limiar`
 * (pincel inteligente), so muda os pixels cuja intensidade esta perto da
 * referencia (|cinza - ref| <= tolerancia). Devolve a caixa alterada.
 */
export function carimbar(
  m: Mascara,
  w: number,
  h: number,
  cx: number,
  cy: number,
  raio: number,
  valor: 0 | 1,
  limiar?: { cinza: Uint8Array; ref: number; tolerancia: number }
): Caixa {
  const r = Math.max(0.5, raio)
  const x0 = Math.max(0, Math.floor(cx - r))
  const x1 = Math.min(w - 1, Math.ceil(cx + r))
  const y0 = Math.max(0, Math.floor(cy - r))
  const y1 = Math.min(h - 1, Math.ceil(cy + r))
  const r2 = r * r
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx
      if (dx * dx + dy * dy > r2) continue
      const i = y * w + x
      if (limiar && Math.abs(limiar.cinza[i] - limiar.ref) > limiar.tolerancia) continue
      m[i] = valor
    }
  }
  return x1 < x0 || y1 < y0 ? vazia() : { x0, y0, x1, y1 }
}

/** Traço continuo entre dois pontos (carimbos a cada meio raio, sem falhas). */
export function tracar(
  m: Mascara,
  w: number,
  h: number,
  de: { x: number; y: number },
  ate: { x: number; y: number },
  raio: number,
  valor: 0 | 1,
  limiar?: { cinza: Uint8Array; ref: number; tolerancia: number }
): Caixa {
  const dist = Math.hypot(ate.x - de.x, ate.y - de.y)
  const passos = Math.max(1, Math.ceil(dist / Math.max(0.5, raio / 2)))
  let caixa = vazia()
  for (let k = 0; k <= passos; k++) {
    const t = k / passos
    caixa = juntar(caixa, carimbar(m, w, h, de.x + (ate.x - de.x) * t, de.y + (ate.y - de.y) * t, raio, valor, limiar))
  }
  return caixa
}

/**
 * VARINHA MAGICA (crescimento de regiao): a partir do ponto clicado, junta
 * os pixels VIZINHOS com intensidade parecida (|cinza - ref| <= tolerancia).
 * `limite` (fracao da imagem) impede que um clique no fundo pinte tudo.
 * Devolve a regiao (0/1) ou null se passou do limite.
 */
export function crescerRegiao(
  cinza: Uint8Array,
  w: number,
  h: number,
  sx: number,
  sy: number,
  tolerancia: number,
  limite = 0.6
): Mascara | null {
  const x = Math.round(sx)
  const y = Math.round(sy)
  if (x < 0 || y < 0 || x >= w || y >= h) return null
  const ref = intensidadeEm(cinza, w, h, x, y)
  const regiao = new Uint8Array(w * h)
  const fila = new Int32Array(w * h)
  const maximo = Math.floor(w * h * limite)
  let ini = 0
  let fim = 0
  const inicio = y * w + x
  regiao[inicio] = 1
  fila[fim++] = inicio
  while (ini < fim) {
    const i = fila[ini++]
    const px = i % w
    const py = (i - px) / w
    const vizinhos = [px > 0 ? i - 1 : -1, px < w - 1 ? i + 1 : -1, py > 0 ? i - w : -1, py < h - 1 ? i + w : -1]
    for (const v of vizinhos) {
      if (v < 0 || regiao[v]) continue
      if (Math.abs(cinza[v] - ref) > tolerancia) continue
      regiao[v] = 1
      fila[fim++] = v
      if (fim > maximo) return null
    }
  }
  return regiao
}

/** LACO: preenche o interior de um contorno livre (regra par-impar, linha a linha). */
export function preencherPoligono(w: number, h: number, pontos: { x: number; y: number }[]): Mascara {
  const m = new Uint8Array(w * h)
  if (pontos.length < 3) return m
  const n = pontos.length
  for (let y = 0; y < h; y++) {
    const yc = y + 0.5
    const cortes: number[] = []
    for (let k = 0; k < n; k++) {
      const a = pontos[k]
      const b = pontos[(k + 1) % n]
      if ((a.y <= yc && b.y > yc) || (b.y <= yc && a.y > yc)) {
        cortes.push(a.x + ((yc - a.y) / (b.y - a.y)) * (b.x - a.x))
      }
    }
    cortes.sort((p, q) => p - q)
    for (let k = 0; k + 1 < cortes.length; k += 2) {
      const xa = Math.max(0, Math.ceil(cortes[k] - 0.5))
      const xb = Math.min(w - 1, Math.floor(cortes[k + 1] - 0.5))
      for (let x = xa; x <= xb; x++) m[y * w + x] = 1
    }
  }
  return m
}

/** Junta (valor 1) ou tira (valor 0) uma regiao da mascara. Devolve a caixa alterada. */
export function aplicarRegiao(m: Mascara, regiao: Mascara, w: number, valor: 0 | 1): Caixa {
  let caixa = vazia()
  for (let i = 0; i < regiao.length; i++) {
    if (!regiao[i] || m[i] === valor) continue
    m[i] = valor
    const x = i % w
    const y = (i - x) / w
    caixa = juntar(caixa, { x0: x, y0: y, x1: x, y1: y })
  }
  return caixa
}

/** PREENCHER BURACOS: o que esta cercado pela pintura (sem saida para a borda) passa a ser pintado. */
export function preencherBuracos(m: Mascara, w: number, h: number): Mascara {
  const fora = new Uint8Array(w * h)
  const fila = new Int32Array(w * h)
  let ini = 0
  let fim = 0
  const semear = (i: number) => {
    if (!m[i] && !fora[i]) {
      fora[i] = 1
      fila[fim++] = i
    }
  }
  for (let x = 0; x < w; x++) {
    semear(x)
    semear((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    semear(y * w)
    semear(y * w + w - 1)
  }
  while (ini < fim) {
    const i = fila[ini++]
    const x = i % w
    if (x > 0) semear(i - 1)
    if (x < w - 1) semear(i + 1)
    if (i >= w) semear(i - w)
    if (i < w * (h - 1)) semear(i + w)
  }
  const saida = new Uint8Array(w * h)
  for (let i = 0; i < saida.length; i++) saida[i] = m[i] || !fora[i] ? 1 : 0
  return saida
}

/** SUAVIZAR BORDAS: "maioria" numa janela 3x3 (tira serrilhado e pontinhos soltos), duas passadas. */
export function suavizar(m: Mascara, w: number, h: number, passadas = 2): Mascara {
  let atual = m
  for (let p = 0; p < passadas; p++) {
    const prox = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let soma = 0
        let n = 0
        for (let j = Math.max(0, y - 1); j <= Math.min(h - 1, y + 1); j++) {
          for (let i = Math.max(0, x - 1); i <= Math.min(w - 1, x + 1); i++) {
            soma += atual[j * w + i]
            n++
          }
        }
        prox[y * w + x] = soma * 2 > n ? 1 : 0
      }
    }
    atual = prox
  }
  return atual
}

/** Pixel da BORDA da pintura (pintado com algum vizinho nao pintado) - modo "contorno". */
export function ehBorda(m: Mascara, w: number, h: number, i: number): boolean {
  if (!m[i]) return false
  const x = i % w
  const y = (i - x) / w
  return x === 0 || y === 0 || x === w - 1 || y === h - 1 || !m[i - 1] || !m[i + 1] || !m[i - w] || !m[i + w]
}

export function contar(m: Mascara): number {
  let n = 0
  for (let i = 0; i < m.length; i++) n += m[i]
  return n
}

// ---------------------------------------------------------------------
// MODO "PONTOS NAS EXTREMIDADES" (pedido de 22/10/2026)
// O curador clica pontos na borda da estrutura (em qualquer ordem) e manda
// preencher: os pontos sao ordenados em volta do centro, ligados por uma
// curva suave (spline de Catmull-Rom fechada) e o interior e pintado.
// Opcional: "ajustar a densidade" - dentro desse limite (com uma pequena
// folga), fica so o que tem a densidade da estrutura (limiar de Otsu),
// e a parte ligada ao interior da curva. Referencia de mercado: anotacao
// por pontos extremos (DEXTR, ferramentas de anotacao para IA) e limiar
// automatico de Otsu (3D Slicer, ImageJ).
// ---------------------------------------------------------------------

export interface Pt {
  x: number
  y: number
}

/** Ordena os pontos em volta do centro (o curador pode clicar em qualquer ordem). */
export function ordenarEmVolta(pontos: Pt[]): Pt[] {
  if (pontos.length < 3) return [...pontos]
  const cx = pontos.reduce((s, p) => s + p.x, 0) / pontos.length
  const cy = pontos.reduce((s, p) => s + p.y, 0) / pontos.length
  return [...pontos].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx))
}

/** Curva fechada e suave passando por todos os pontos (Catmull-Rom). */
export function curvaSuave(pontos: Pt[], porTrecho = 16): Pt[] {
  const n = pontos.length
  if (n < 3) return [...pontos]
  const saida: Pt[] = []
  for (let i = 0; i < n; i++) {
    const p0 = pontos[(i - 1 + n) % n]
    const p1 = pontos[i]
    const p2 = pontos[(i + 1) % n]
    const p3 = pontos[(i + 2) % n]
    for (let k = 0; k < porTrecho; k++) {
      const t = k / porTrecho
      const t2 = t * t
      const t3 = t2 * t
      saida.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      })
    }
  }
  return saida
}

/** Limiar de Otsu: o valor que melhor separa os tons em dois grupos. */
export function limiarOtsu(valores: number[]): number {
  const hist = new Array(256).fill(0)
  for (const v of valores) hist[v]++
  const total = valores.length
  let somaTotal = 0
  for (let i = 0; i < 256; i++) somaTotal += i * hist[i]
  let somaFundo = 0
  let pesoFundo = 0
  let melhor = 0
  let limiar = 127
  for (let i = 0; i < 256; i++) {
    pesoFundo += hist[i]
    if (!pesoFundo) continue
    const pesoFrente = total - pesoFundo
    if (!pesoFrente) break
    somaFundo += i * hist[i]
    const mFundo = somaFundo / pesoFundo
    const mFrente = (somaTotal - somaFundo) / pesoFrente
    const entre = pesoFundo * pesoFrente * (mFundo - mFrente) ** 2
    if (entre > melhor) {
      melhor = entre
      limiar = i
    }
  }
  return limiar
}

/** Dilata (engorda) a mascara em `r` pixels - janela quadrada, em duas passadas. */
export function dilatar(m: Mascara, w: number, h: number, r: number): Mascara {
  if (r <= 0) return new Uint8Array(m)
  const tmp = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0
      for (let i = Math.max(0, x - r); i <= Math.min(w - 1, x + r) && !v; i++) v = m[y * w + i]
      tmp[y * w + x] = v
    }
  }
  const saida = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0
      for (let j = Math.max(0, y - r); j <= Math.min(h - 1, y + r) && !v; j++) v = tmp[j * w + x]
      saida[y * w + x] = v
    }
  }
  return saida
}

/**
 * Preenche a estrutura limitada pelos pontos. Com `ajustar`, a pintura
 * "gruda" na borda real da estrutura (densidade), sem passar da curva
 * (mais uma folga de ~2% do tamanho da estrutura).
 */
export function preencherPorPontos(cinza: Uint8Array, w: number, h: number, pontos: Pt[], ajustar: boolean): Mascara {
  const curva = curvaSuave(ordenarEmVolta(pontos))
  const dentro = preencherPoligono(w, h, curva)
  if (!ajustar || contar(dentro) < 20) return dentro
  const xs = curva.map((p) => p.x)
  const ys = curva.map((p) => p.y)
  const lado = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  const folga = dilatar(dentro, w, h, Math.max(1, Math.round(lado * 0.02)))
  // limiar de Otsu com os tons da regiao (com a folga, para pegar um pouco de "fora")
  const tons: number[] = []
  for (let i = 0; i < folga.length; i++) if (folga[i]) tons.push(cinza[i])
  const limiar = limiarOtsu(tons)
  // a estrutura e o grupo (claro ou escuro) que domina DENTRO da curva
  let claros = 0
  let n = 0
  for (let i = 0; i < dentro.length; i++) {
    if (!dentro[i]) continue
    n++
    if (cinza[i] > limiar) claros++
  }
  const estruturaClara = claros * 2 >= n
  const candidato = new Uint8Array(w * h)
  for (let i = 0; i < folga.length; i++) {
    if (folga[i] && (cinza[i] > limiar) === estruturaClara) candidato[i] = 1
  }
  // fica so a parte ligada ao interior da curva (a maior), sem buracos
  const comp = maiorComponenteDentro(candidato, dentro, w, h)
  const resultado = suavizar(preencherBuracos(comp, w, h), w, h, 1)
  // seguranca: se o ajuste "sumiu" com a estrutura, fica a curva
  return contar(resultado) < contar(dentro) * 0.15 ? dentro : resultado
}

/** Componente ligado (4 vizinhos) de `m` que mais se sobrepoe a `referencia`. */
export function maiorComponenteDentro(m: Mascara, referencia: Mascara, w: number, h: number): Mascara {
  const rotulo = new Int32Array(w * h)
  const fila = new Int32Array(w * h)
  let atual = 0
  let melhor = 0
  let melhorSobreposicao = -1
  for (let s = 0; s < m.length; s++) {
    if (!m[s] || rotulo[s]) continue
    atual++
    let ini = 0
    let fim = 0
    let sobreposicao = 0
    rotulo[s] = atual
    fila[fim++] = s
    while (ini < fim) {
      const i = fila[ini++]
      if (referencia[i]) sobreposicao++
      const x = i % w
      const viz = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < w * (h - 1) ? i + w : -1]
      for (const v of viz) {
        if (v >= 0 && m[v] && !rotulo[v]) {
          rotulo[v] = atual
          fila[fim++] = v
        }
      }
    }
    if (sobreposicao > melhorSobreposicao) {
      melhorSobreposicao = sobreposicao
      melhor = atual
    }
  }
  const saida = new Uint8Array(w * h)
  if (!melhor) return saida
  for (let i = 0; i < saida.length; i++) if (rotulo[i] === melhor) saida[i] = 1
  return saida
}
