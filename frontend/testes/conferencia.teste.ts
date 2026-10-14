// Testes da conferencia antes de aprovar (regras fixas).
// Rodar dentro da pasta frontend:  npx tsx testes/conferencia.teste.ts
import { conferirFicha, dentesCitados, type FichaConferencia } from '../src/lib/conferenciaFicha'

let falhas = 0
function caso(nome: string, ok: boolean) {
  if (!ok) falhas++
  console.log(ok ? 'OK  ' : 'FALHA', nome)
}
const base: FichaConferencia = {
  tipo_radiografia: 'periapical', dentes: [36], genero: 'feminino', qualidade_tecnica: 'boa', anonimizacao_validada: true,
  alteracoes_observadas: ['lesao_periapical'], achados_detalhe: '', descricao_didatica: 'Lesão periapical no dente 36.', marcacoes: [{ id: 'm1', achado: 'lesao_periapical' }],
  achados: [{ tipo: 'lesao_periapical', dentes: [36], regiao: '', marcacoes: ['m1'] }],
}
const chaves = (f: Partial<FichaConferencia>, d = 0) => conferirFicha({ ...base, ...f }, d).map((i) => i.chave)

caso('ficha completa sem pendencias', chaves({}).length === 0)
caso('anonimizacao e tipo bloqueiam', (() => { const r = conferirFicha({ ...base, anonimizacao_validada: false, tipo_radiografia: '' }); return r.filter((i) => i.nivel === 'bloqueio').length === 2 })())
caso('dente citado no texto e nao marcado', chaves({ descricao_didatica: 'Reabsorção nos dentes 36 e 37 e no elemento 46.' }).includes('denteNoTexto'))
caso('dentesCitados le lista', dentesCitados('dentes 36, 37 e 38; elemento 11. Idade 45 anos').join() === '11,36,37,38')
caso('numero que nao e dente ignorado', dentesCitados('dente 59 e idade 30').length === 0)
caso('contradicao normal x alteracoes', chaves({ descricao_didatica: 'Radiografia sem alterações.' }).includes('contradicao'))
caso('marcacao sem achado', chaves({ marcacoes: [{ id: 'm1' }, { id: 'm2' }] }).includes('marcacaoSemAchado'))
caso('achado sem dente nem regiao', chaves({ achados: [{ tipo: 'cisto', dentes: [], regiao: '', marcacoes: ['m1'] }] }).includes('achadoSemLocal'))
caso('nenhum achado e descricao nao diz normal', chaves({ alteracoes_observadas: [], marcacoes: [], achados: [], descricao_didatica: 'Imagem para estudo.' }).includes('semAchados'))
caso('normal declarado nao pede achado', !chaves({ alteracoes_observadas: [], marcacoes: [], achados: [], descricao_didatica: 'Dentro da normalidade.' }).includes('semAchados'))
caso('duvidas da voz', chaves({}, 2).includes('duvidasVoz'))
process.exit(falhas ? 1 : 0)
