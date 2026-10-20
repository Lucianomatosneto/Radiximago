// Sugestao de posicao e giro das marcacoes. Rodar: npx tsx testes/orientacao.teste.ts
import { arcadaDosDentes, chaveSugestao, girarMarcacoes, girarPonto } from '../src/lib/orientacao'
import type { Marcacao } from '../src/lib/marcacoes'
let falhas = 0
const ok = (nome: string, v: boolean) => { if (!v) falhas++; console.log(v ? 'OK  ' : 'FALHA', nome) }
const perto = (a: number, b: number) => Math.abs(a - b) < 1e-9

ok('16 e 17 sao superiores', arcadaDosDentes([16, 17]) === 'superior')
ok('46 e inferior', arcadaDosDentes([46]) === 'inferior')
ok('deciduo 55 e superior, 85 inferior', arcadaDosDentes([55]) === 'superior' && arcadaDosDentes([85]) === 'inferior')
ok('16 e 46 = ambas', arcadaDosDentes([16, 46]) === 'ambas')
ok('sem dentes = null', arcadaDosDentes([]) === null && arcadaDosDentes(undefined) === null)
ok('sugestao panoramica', chaveSugestao(null, 'panoramica') === 'panoramica')
ok('sugestao interproximal', chaveSugestao('ambas', 'interproximal') === 'interproximal')
ok('sugestao sem dentes', chaveSugestao(null, 'periapical') === 'semDentes')
ok('sugestao superior', chaveSugestao('superior', 'periapical') === 'superior')

// mesma conta do servidor (backend/tests/test_geometria_imagem.py)
const [x, y] = girarPonto(0.1, 0.2, 90)
ok('ponto 90 graus', perto(x, 0.8) && perto(y, 0.1))
const m: Marcacao[] = [
  { id: 'a', tipo: 'seta', x1: 0.1, y1: 0.2, x2: 0.3, y2: 0.4 },
  { id: 'b', tipo: 'retangulo', x: 0.1, y: 0.2, largura: 0.3, altura: 0.1, achado: 'carie' },
]
const g = girarMarcacoes(m, 90)
ok('retangulo 90 graus', perto(g[1].x!, 0.7) && perto(g[1].y!, 0.1) && perto(g[1].largura!, 0.1) && perto(g[1].altura!, 0.3))
ok('achado preservado', g[1].achado === 'carie')
let volta = m
for (let i = 0; i < 4; i++) volta = girarMarcacoes(volta, 90)
ok('4 x 90 volta ao inicio', perto(volta[0].x2!, 0.3) && perto(volta[1].largura!, 0.3))
const c = girarMarcacoes(girarMarcacoes(m, 270), 90)
ok('270 + 90 volta ao inicio', perto(c[0].y1!, 0.2) && perto(c[1].x!, 0.1))
process.exit(falhas ? 1 : 0)
