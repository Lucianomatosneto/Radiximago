export interface RecorteRelativo {
  x: number
  y: number
  largura: number
  altura: number
}

// Amostra a imagem numa resolucao BEM menor antes de escanear - nao
// precisa (nem seria rapido) escanear pixel a pixel numa imagem de varios
// MB; a borda branca de uma radiografia e uma faixa larga e uniforme, uma
// amostra pequena ja localiza ela com precisao suficiente.
const LADO_MAX_AMOSTRA = 160
// Luminancia (0-255) acima disso conta como "fundo branco".
const LIMIAR_BRANCO = 235
// Fracao minima de pixels "nao-brancos" numa linha/coluna pra ela contar
// como parte do conteudo - tolera ruido/compressao sem achar que a borda
// branca comeca ali.
const FRACAO_MINIMA_CONTEUDO = 0.02
// Se o recorte detectado cobrir isso ou mais da imagem em AMBOS os eixos,
// nao vale a pena recortar (a "borda branca" seria imperceptivel).
const LIMITE_QUASE_INTEIRA = 0.97
// Se o recorte detectado for MENOR que isso em algum eixo, e mais provavel
// que a deteccao tenha falhado (limiar errado pra essa imagem em
// particular) do que a imagem realmente ter uma borda tao grande -
// mais seguro nao recortar do que aplicar um zoom exagerado errado.
const LIMITE_MINIMO_CONTEUDO = 0.15

// Detecta a caixa delimitadora do conteudo "nao-branco" (a parte preta
// util da radiografia, sem a borda branca ao redor) dentro de uma
// <img> ja carregada, em coordenadas RELATIVAS (0.0-1.0) - o MESMO
// sistema usado pelas marcacoes (ver lib/marcacoes.ts). Isso e proposital:
// um <svg viewBox={`${x} ${y} ${largura} ${altura}`}> alinhado a essa
// caixa mostra as marcacoes na posicao certa automaticamente, sem
// precisar tocar nas coordenadas ja salvas no banco.
//
// Devolve null se nao houver borda relevante pra recortar, ou se a
// deteccao falhar por qualquer motivo (canvas "tainted", imagem sem
// dimensoes etc.) - nesses casos quem chama deve mostrar a imagem
// inteira, sem recorte, como sempre foi.
export function detectarRecorteConteudo(imagem: HTMLImageElement): RecorteRelativo | null {
  const largura = imagem.naturalWidth
  const altura = imagem.naturalHeight
  if (!largura || !altura) return null

  const escala = Math.min(1, LADO_MAX_AMOSTRA / Math.max(largura, altura))
  const larguraAmostra = Math.max(1, Math.round(largura * escala))
  const alturaAmostra = Math.max(1, Math.round(altura * escala))

  const canvas = document.createElement('canvas')
  canvas.width = larguraAmostra
  canvas.height = alturaAmostra
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  try {
    ctx.drawImage(imagem, 0, 0, larguraAmostra, alturaAmostra)
    const { data } = ctx.getImageData(0, 0, larguraAmostra, alturaAmostra)

    function naoBranco(px: number, py: number): boolean {
      const i = (py * larguraAmostra + px) * 4
      const luminancia = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      return luminancia < LIMIAR_BRANCO
    }

    let minX = larguraAmostra
    let maxX = -1
    let minY = alturaAmostra
    let maxY = -1

    for (let x = 0; x < larguraAmostra; x++) {
      let contagem = 0
      for (let y = 0; y < alturaAmostra; y++) {
        if (naoBranco(x, y)) contagem++
      }
      if (contagem / alturaAmostra >= FRACAO_MINIMA_CONTEUDO) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
      }
    }
    for (let y = 0; y < alturaAmostra; y++) {
      let contagem = 0
      for (let x = 0; x < larguraAmostra; x++) {
        if (naoBranco(x, y)) contagem++
      }
      if (contagem / larguraAmostra >= FRACAO_MINIMA_CONTEUDO) {
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }

    if (maxX < minX || maxY < minY) return null

    const x = minX / larguraAmostra
    const y = minY / alturaAmostra
    const larguraRel = (maxX - minX + 1) / larguraAmostra
    const alturaRel = (maxY - minY + 1) / alturaAmostra

    if (larguraRel >= LIMITE_QUASE_INTEIRA && alturaRel >= LIMITE_QUASE_INTEIRA) return null
    if (larguraRel < LIMITE_MINIMO_CONTEUDO || alturaRel < LIMITE_MINIMO_CONTEUDO) return null

    return { x, y, largura: larguraRel, altura: alturaRel }
  } catch {
    // getImageData pode falhar se o canvas ficar "tainted" (imagem
    // cross-origin sem CORS) - aqui a imagem sempre vem de uma blob: URL
    // (fetch com credenciais + createObjectURL, nao um <img src> direto
    // pra API), entao isso nao deveria acontecer na pratica, mas o
    // fallback seguro e nao recortar.
    return null
  }
}
