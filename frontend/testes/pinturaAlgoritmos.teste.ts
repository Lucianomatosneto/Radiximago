// Ferramentas da pintura de estruturas (lib/pinturaAlgoritmos.ts): pincel,
// varinha, laco, preencher buracos, suavizar, limiar de Otsu e "pontos nas
// extremidades". Tudo com imagens pequenas montadas aqui, com resposta
// conhecida de antemao.
// Rodar dentro da pasta frontend:  npx tsx testes/pinturaAlgoritmos.teste.ts
import {
  aplicarRegiao,
  carimbar,
  contar,
  crescerRegiao,
  curvaSuave,
  dilatar,
  ehBorda,
  intensidadeEm,
  limiarOtsu,
  maiorComponenteDentro,
  ordenarEmVolta,
  preencherBuracos,
  preencherPoligono,
  preencherPorPontos,
  suavizar,
  tracar,
} from '../src/lib/pinturaAlgoritmos'
import { caso, terminar } from './apoio/repositorio'

const W = 40
const H = 30
const idx = (x: number, y: number) => y * W + x

// imagem de teste: fundo escuro (20) e um quadrado claro (200) de x 10-19, y 5-14
const cinza = new Uint8Array(W * H).fill(20)
for (let y = 5; y < 15; y++) for (let x = 10; x < 20; x++) cinza[idx(x, y)] = 200

// --- intensidade media
caso('intensidade no meio do quadrado claro = 200', intensidadeEm(cinza, W, H, 14, 9) === 200)
caso('intensidade no fundo = 20', intensidadeEm(cinza, W, H, 30, 25) === 20)
caso('intensidade no canto (janela cortada pela borda) ainda e a media certa', intensidadeEm(cinza, W, H, 0, 0) === 20)

// --- pincel (carimbo)
{
  const m = new Uint8Array(W * H)
  const caixa = carimbar(m, W, H, 20, 15, 3, 1)
  const n = contar(m)
  caso('carimbo de raio 3 pinta perto de pi*r^2 pixels (25 a 32)', n >= 25 && n <= 32)
  caso('carimbo devolve a caixa que mudou', caixa.x0 === 17 && caixa.x1 === 23 && caixa.y0 === 12 && caixa.y1 === 18)
  carimbar(m, W, H, 20, 15, 3, 0)
  caso('carimbo com valor 0 apaga tudo de novo', contar(m) === 0)
  const c2 = carimbar(m, W, H, 0, 0, 2, 1)
  caso('carimbo na borda nao passa da imagem', c2.x0 === 0 && c2.y0 === 0 && contar(m) > 0)
}

// --- pincel inteligente (limiar): so pinta o que parece com a referencia
{
  const m = new Uint8Array(W * H)
  carimbar(m, W, H, 10, 10, 4, 1, { cinza, ref: 200, tolerancia: 30 })
  let foraDoClaro = 0
  for (let i = 0; i < m.length; i++) if (m[i] && cinza[i] !== 200) foraDoClaro++
  caso('pincel com limiar nao pinta o fundo escuro', contar(m) > 0 && foraDoClaro === 0)
}

// --- traco continuo
{
  const m = new Uint8Array(W * H)
  tracar(m, W, H, { x: 2, y: 2 }, { x: 37, y: 2 }, 1, 1)
  let continuo = true
  for (let x = 2; x <= 37; x++) if (!m[idx(x, 2)] && !m[idx(x, 1)]) continuo = false
  caso('traco entre dois pontos sem falhas', continuo)
}

// --- varinha magica (crescimento de regiao)
{
  const r = crescerRegiao(cinza, W, H, 14, 9, 30)
  caso('varinha pega exatamente o quadrado claro (100 pixels)', r !== null && contar(r) === 100 && r[idx(10, 5)] === 1 && r[idx(9, 5)] === 0)
  caso('varinha no fundo (70% da imagem) passa do limite e devolve nada', crescerRegiao(cinza, W, H, 30, 25, 30) === null)
  const fundo = crescerRegiao(cinza, W, H, 30, 25, 30, 1)
  caso('com limite 100% o fundo inteiro e pego', fundo !== null && contar(fundo) === W * H - 100)
  caso('clique fora da imagem devolve nada', crescerRegiao(cinza, W, H, -1, 5, 30) === null && crescerRegiao(cinza, W, H, W, 5, 30) === null)
}

// --- laco (poligono)
{
  const q = preencherPoligono(W, H, [{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 }])
  caso('laco quadrado 10x10 pinta 100 pixels', contar(q) === 100 && q[idx(5, 5)] === 1 && q[idx(15, 5)] === 0)
  caso('laco com menos de 3 pontos nao pinta nada', contar(preencherPoligono(W, H, [{ x: 1, y: 1 }, { x: 9, y: 9 }])) === 0)
  const tri = preencherPoligono(W, H, [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 20 }])
  caso('laco triangular pinta cerca de metade do quadrado (190 a 210)', contar(tri) >= 190 && contar(tri) <= 210)
}

// --- juntar/tirar regiao
{
  const m = new Uint8Array(W * H)
  const reg = new Uint8Array(W * H)
  reg[idx(3, 4)] = 1
  reg[idx(7, 9)] = 1
  const c = aplicarRegiao(m, reg, W, 1)
  caso('juntar regiao pinta e devolve a caixa certa', contar(m) === 2 && c.x0 === 3 && c.y0 === 4 && c.x1 === 7 && c.y1 === 9)
  const c2 = aplicarRegiao(m, reg, W, 1)
  caso('juntar de novo nao muda nada (caixa vazia)', c2.x0 === Infinity && contar(m) === 2)
  aplicarRegiao(m, reg, W, 0)
  caso('tirar a regiao apaga', contar(m) === 0)
}

// --- preencher buracos
{
  const anel = new Uint8Array(W * H)
  for (let y = 5; y <= 15; y++) for (let x = 5; x <= 15; x++) if (x === 5 || x === 15 || y === 5 || y === 15) anel[idx(x, y)] = 1
  const cheio = preencherBuracos(anel, W, H)
  caso('anel fechado vira quadrado cheio (11x11 = 121)', contar(cheio) === 121)
  anel[idx(5, 10)] = 0 // abre uma saida
  caso('anel com saida para fora nao e preenchido', contar(preencherBuracos(anel, W, H)) === contar(anel))
}

// --- suavizar: tira pixel solto e mantem bloco
{
  const m = new Uint8Array(W * H)
  m[idx(30, 3)] = 1
  for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) m[idx(x, y)] = 1
  const s = suavizar(m, W, H)
  caso('suavizar some com o pixel solto', s[idx(30, 3)] === 0)
  caso('suavizar mantem o miolo do bloco', s[idx(15, 15)] === 1 && contar(s) >= 90)
  caso('com 0 passadas nada muda', suavizar(m, W, H, 0) === m)
}

// --- borda
{
  const m = new Uint8Array(W * H)
  for (let y = 10; y < 13; y++) for (let x = 10; x < 13; x++) m[idx(x, y)] = 1
  caso('pixel da beira do bloco e borda', ehBorda(m, W, H, idx(10, 11)))
  caso('pixel do meio do bloco nao e borda', !ehBorda(m, W, H, idx(11, 11)))
  caso('pixel nao pintado nao e borda', !ehBorda(m, W, H, idx(0, 0)))
  const cheio = new Uint8Array(W * H).fill(1)
  caso('pixel pintado na margem da imagem e borda', ehBorda(cheio, W, H, idx(0, 5)) && ehBorda(cheio, W, H, idx(W - 1, H - 1)))
}

// --- pontos em volta e curva suave
{
  const embaralhados = [{ x: 10, y: 0 }, { x: -10, y: 0 }, { x: 0, y: 10 }, { x: 0, y: -10 }]
  const ord = ordenarEmVolta(embaralhados)
  const angulos = ord.map((p) => Math.atan2(p.y, p.x))
  caso('pontos ordenados em volta do centro (angulo crescente)', angulos.every((a, i) => i === 0 || a > angulos[i - 1]))
  caso('menos de 3 pontos ficam como estao', ordenarEmVolta([{ x: 1, y: 1 }]).length === 1 && curvaSuave([{ x: 1, y: 1 }]).length === 1)
  const curva = curvaSuave(ord, 8)
  caso('curva tem 8 pontos por trecho', curva.length === 32)
  caso('curva passa pelos pontos clicados', ord.every((p) => curva.some((c) => Math.abs(c.x - p.x) < 1e-9 && Math.abs(c.y - p.y) < 1e-9)))
}

// --- limiar de Otsu
caso('Otsu separa dois grupos de tons (20 e 200)', (() => { const t = limiarOtsu([...Array(50).fill(20), ...Array(50).fill(200)]); return t >= 20 && t < 200 })())
caso('Otsu com um tom so devolve o padrao 127', limiarOtsu(Array(10).fill(80)) === 127)

// --- dilatar
{
  const m = new Uint8Array(W * H)
  m[idx(20, 15)] = 1
  caso('dilatar 2 pixels vira quadrado 5x5', contar(dilatar(m, W, H, 2)) === 25)
  const copia = dilatar(m, W, H, 0)
  caso('dilatar 0 devolve copia igual (e nao a mesma)', copia !== m && contar(copia) === 1)
}

// --- maior componente ligado a referencia
{
  const m = new Uint8Array(W * H)
  for (let x = 0; x < 5; x++) m[idx(x, 0)] = 1 // pedaco A (5 px)
  for (let x = 20; x < 23; x++) m[idx(x, 20)] = 1 // pedaco B (3 px)
  const ref = new Uint8Array(W * H)
  ref[idx(21, 20)] = 1 // a referencia toca so o B
  const comp = maiorComponenteDentro(m, ref, W, H)
  caso('fica o pedaco que encosta na referencia', contar(comp) === 3 && comp[idx(20, 20)] === 1 && comp[idx(0, 0)] === 0)
  caso('mascara vazia devolve vazio', contar(maiorComponenteDentro(new Uint8Array(W * H), ref, W, H)) === 0)
}

// --- pontos nas extremidades (com e sem "ajustar a densidade")
{
  const disco = new Uint8Array(W * H).fill(20)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.hypot(x + 0.5 - 20, y + 0.5 - 15) <= 8) disco[idx(x, y)] = 200
  const claros = contar(disco.map((v) => (v === 200 ? 1 : 0)) as Uint8Array)
  // pontos um pouco FORA do disco (raio 11)
  const pontos = Array.from({ length: 6 }, (_, k) => ({ x: 20 + 11 * Math.cos((k * Math.PI) / 3), y: 15 + 11 * Math.sin((k * Math.PI) / 3) }))
  const semAjuste = preencherPorPontos(disco, W, H, pontos, false)
  const comAjuste = preencherPorPontos(disco, W, H, pontos, true)
  caso('sem ajuste: pinta toda a area dentro da curva (maior que o disco)', contar(semAjuste) > claros)
  let fora = 0
  for (let i = 0; i < comAjuste.length; i++) if (comAjuste[i] && disco[i] !== 200) fora++
  caso('com ajuste: a pintura gruda no disco claro (poucos pixels de fundo)', fora <= 10 && Math.abs(contar(comAjuste) - claros) <= 20)
  const poucos = preencherPorPontos(disco, W, H, [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 2, y: 3 }], true)
  caso('curva pequena demais: fica so a curva (sem ajuste)', contar(poucos) < 20)
}

terminar()
