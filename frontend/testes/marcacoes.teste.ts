// Marcacoes da imagem (lib/marcacoes.ts): contas de forma, numero, cor e
// "qual marcacao esta sob o mouse". Tambem confere que a tabela de cores
// por achado e a MESMA no frontend, no backend (prancha/PNG) e no OHIF.
// Rodar dentro da pasta frontend:  npx tsx testes/marcacoes.teste.ts
import {
  CORES_ACHADO,
  COR_SEM_ACHADO,
  CORES_SEQUENCIA,
  buracoHolofote,
  caminhoHolofote,
  contornoRelativo,
  corDaSequencia,
  corMarcacao,
  gerarIdMarcacao,
  geometriaMarcacao,
  girarRelativo,
  marcacaoSobPonto,
  pontoNumeroMarcacao,
  rotularAchadoMarcacao,
  type Marcacao,
} from '../src/lib/marcacoes'
import { caso, lerDoRepositorio, terminar } from './apoio/repositorio'

const perto = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol
const paraTela = (rx: number, ry: number): [number, number] => [rx * 1000, ry * 500]

const ret: Marcacao = { id: 'r', tipo: 'retangulo', x: 0.1, y: 0.2, largura: 0.4, altura: 0.2 }
const oval: Marcacao = { id: 'o', tipo: 'oval', x: 0.5, y: 0.5, largura: 0.2, altura: 0.2 }
const seta: Marcacao = { id: 's', tipo: 'seta', x1: 0.1, y1: 0.1, x2: 0.3, y2: 0.1 }

// --- contorno e giro (coordenadas relativas 0-1)
const cantos = contornoRelativo(ret, 2)
caso('retangulo sem giro: 4 cantos na ordem', cantos.length === 4 && perto(cantos[0].x, 0.1) && perto(cantos[2].x, 0.5) && perto(cantos[2].y, 0.4))
caso('oval: no minimo 36 pontos no contorno', contornoRelativo(oval, 1).length === 36)
caso('oval: todos os pontos a meia largura do centro', contornoRelativo(oval, 1).every((p) => perto(Math.hypot(p.x - 0.6, p.y - 0.6), 0.1, 1e-9)))
caso('giro de 0 grau devolve o mesmo ponto', JSON.stringify(girarRelativo(0.3, 0.4, 0.5, 0.5, 0, 2)) === JSON.stringify({ x: 0.3, y: 0.4 }))
// 90 graus em volta do centro, com imagem 2x mais larga que alta (a conta e em pixels)
const g = girarRelativo(0.6, 0.5, 0.5, 0.5, 90, 2)
caso('giro de 90 graus respeita a proporcao da imagem', perto(g.x, 0.5) && perto(g.y, 0.7))

// --- rotulo, id, numero e cor
caso('rotulo do achado conhecido', rotularAchadoMarcacao('lesao_periapical') === 'Lesão periapical')
caso('rotulo de valor desconhecido devolve o proprio valor', rotularAchadoMarcacao('xyz') === 'xyz')
caso('rotulo vazio para nulo', rotularAchadoMarcacao(null) === '' && rotularAchadoMarcacao(undefined) === '')
caso('id da marcacao tem ate 8 letras/numeros', /^[a-z0-9]{1,8}$/.test(gerarIdMarcacao()))
caso('numero da seta fica na cauda', JSON.stringify(pontoNumeroMarcacao(seta)) === JSON.stringify({ x: 0.1, y: 0.1 }))
caso('numero do retangulo fica no canto de cima', JSON.stringify(pontoNumeroMarcacao(ret)) === JSON.stringify({ x: 0.1, y: 0.2 }))
const pn = pontoNumeroMarcacao(oval)
caso('numero do oval fica sobre a borda (a 45 graus)', perto(Math.hypot(pn.x - 0.6, pn.y - 0.6), 0.1, 1e-12))
caso('cor por achado', corMarcacao({ achado: 'carie' }) === '#E69F00')
caso('sem achado ou achado desconhecido: cor padrao', corMarcacao({ achado: null }) === COR_SEM_ACHADO && corMarcacao({ achado: 'xyz' }) === COR_SEM_ACHADO)
caso('cor da sequencia da a volta na paleta', corDaSequencia(0) === CORES_SEQUENCIA[0] && corDaSequencia(CORES_SEQUENCIA.length + 2) === CORES_SEQUENCIA[2])

// --- geometria em pixels
const gr = geometriaMarcacao(ret, paraTela)
caso('retangulo: area em pixels (400 x 100)', perto(gr.area, 40000, 1e-6))
caso('retangulo: caminho SVG fechado com 4 pontos', gr.caminho === 'M100,100 L500,100 L500,200 L100,200 Z')
caso('retangulo: selo fica fora da forma (acima e a esquerda)', gr.selo[0] < 100 && gr.selo[1] < 100)
const gs = geometriaMarcacao(seta, paraTela)
caso('seta: liga cauda e ponta', gs.caminho === 'M100,50 L300,50' && !!gs.seta)
caso('seta: ponta desenhada em volta da ponta', gs.seta?.ponta.includes('L300,50') === true)
const gGirado = geometriaMarcacao({ ...ret, angulo: 90 }, paraTela)
caso('retangulo girado 90 graus: area igual', perto(gGirado.area, 40000, 1e-6))
caso('retangulo girado 90 graus: largura vira altura na tela', perto(Math.max(...gGirado.pontos.map((p) => p[0])) - Math.min(...gGirado.pontos.map((p) => p[0])), 100, 1e-6))

// --- qual marcacao esta sob o mouse
const grande = geometriaMarcacao({ id: 'g', tipo: 'retangulo', x: 0, y: 0, largura: 1, altura: 1 }, paraTela)
const pequena = geometriaMarcacao({ id: 'p', tipo: 'retangulo', x: 0.4, y: 0.4, largura: 0.2, altura: 0.2 }, paraTela)
caso('formas sobrepostas: a menor (de dentro) ganha', marcacaoSobPonto([grande, pequena], 500, 250) === 1)
caso('fora da pequena: a grande', marcacaoSobPonto([grande, pequena], 50, 450) === 0)
caso('perto da linha da seta: a seta', marcacaoSobPonto([grande, gs], 200, 53) === 1)
caso('em cima do selo: o selo ganha', marcacaoSobPonto([grande, pequena], pequena.selo[0], pequena.selo[1]) === 1)
caso('fora de tudo: nenhuma', marcacaoSobPonto([pequena, null], 900, 20) === null)

// --- holofote
caso('holofote cobre a tela e abre o buraco da forma', caminhoHolofote(gr, 1000, 500) === `M0,0 H1000 V500 H0 Z ${gr.caminho}`)
const buraco = buracoHolofote(gs)
caso('holofote da seta: circulo de 48 pontos em volta da ponta', buraco.startsWith('M') && buraco.split(' L').length === 48)
caso('holofote da seta longa: raio = metade da seta (200 px -> 100)', buraco.startsWith('M400,50 '))
const setaCurta = geometriaMarcacao({ id: 'c', tipo: 'seta', x1: 0.1, y1: 0.1, x2: 0.12, y2: 0.1 }, paraTela)
caso('holofote da seta curta: raio minimo de 28 px', buracoHolofote(setaCurta).startsWith('M148,50 '))

// --- a mesma tabela de cores no backend e no OHIF (o comentario do arquivo pede "mudar nos tres lugares")
const backend = lerDoRepositorio('backend/app/modules/marcacoes_imagem.py')
const ohif = lerDoRepositorio('ohif/app-config.template.js')
for (const [achado, hex] of Object.entries(CORES_ACHADO)) {
  const r = hex.slice(1, 3), gg = hex.slice(3, 5), b = hex.slice(5, 7)
  caso(`backend usa a mesma cor para ${achado}`, new RegExp(`"${achado}": \\(0x${r}, 0x${gg}, 0x${b}\\)`, 'i').test(backend))
  caso(`OHIF usa a mesma cor para ${achado}`, new RegExp(`${achado}: '${hex}'`, 'i').test(ohif))
}

terminar()
