// Equivalencia das trocas de regex lenta (SonarCloud S8786, 12/11/2026):
// o resultado novo tem de ser IGUAL ao da regex antiga, em casos normais,
// de borda e aleatorios. Rodar: npx tsx testes/texto.teste.ts
import { aparaFim } from '../src/lib/texto'
import { ocultarParametrosDeBusca } from '../src/lib/acoesAuditoria'
import { lerTitulo } from '../src/components/termos/TextoTermos'

let falhas = 0
const ok = (nome: string, v: boolean) => { if (!v) falhas++; if (!v) console.log('FALHA', nome) }

const antigoPainel = (s: string) => s.replace(/[.\s]+$/, '')
const antigoVoz = (s: string) => s.replace(/[.!?]+$/, '')
const antigoParam = (s: string) => s.replace(/(\/[^\s?]*)\?[^\s]*/g, '$1 (parâmetros de busca ocultos)')
const antigoTitulo = (s: string) => {
  const m = /^(#{1,3})\s+(.*)$/.exec(s)
  return m ? { nivel: m[1].length, texto: m[2] } : null
}

const fixos = [
  '', '.', '...', 'Falha no envio. ', 'Falha.\n \t', 'a.b.c', 'Pronto!?', 'Sem pontuação', '!?.!',
  'GET /pesquisa?texto=carie&p=2 ok', '/a/b/c', '/x?', '?/y', 'abre /a?b /c?d e /e', 'a / b ? c', '//?x', '/a\t?b',
  '# Título', '## Sub', '### Três', '#### Quatro', '#Sem espaço', '#   ', '  # recuado', '#\tTab', '## a  b  ',
]
const alfabeto = ['a', '/', '?', '.', '!', ' ', '\t', '#', 'x', '=', '\n']
const aleatorios: string[] = []
let semente = 12345
const rnd = () => (semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648
for (let n = 0; n < 4000; n++) {
  let s = ''
  const tam = Math.floor(rnd() * 14)
  for (let i = 0; i < tam; i++) s += alfabeto[Math.floor(rnd() * alfabeto.length)]
  aleatorios.push(s)
}
for (const s of [...fixos, ...aleatorios]) {
  ok(`painel ${JSON.stringify(s)}`, aparaFim(s, '.', true) === antigoPainel(s))
  ok(`voz ${JSON.stringify(s)}`, aparaFim(s, '.!?') === antigoVoz(s))
  ok(`param ${JSON.stringify(s)}`, ocultarParametrosDeBusca(s) === antigoParam(s))
  if (!s.includes('\n')) ok(`titulo ${JSON.stringify(s)}`, JSON.stringify(lerTitulo(s)) === JSON.stringify(antigoTitulo(s)))
}

// desempenho: texto enorme no pior caso antigo termina rapido
const grande = '/'.repeat(200000) + 'x'
const t0 = Date.now()
ocultarParametrosDeBusca(grande)
aparaFim('.'.repeat(200000) + 'x', '.', true)
ok('textos de 200 mil caracteres em menos de 1 s', Date.now() - t0 < 1000)

console.log(falhas ? `${falhas} falha(s)` : `OK  ${fixos.length + aleatorios.length} textos iguais ao resultado antigo`)
process.exit(falhas ? 1 : 0)
