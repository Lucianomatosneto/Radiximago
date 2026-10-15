// Setas ←/→ e barra de espaco no item aceso. Rodar: npx tsx testes/opcoesTeclado.teste.ts
import { FORM_VAZIO } from '../src/components/curadoria/FichaCuradoriaForm'
import { alternarNoCursor, confirmarComEnter, tamanhoCursor, trocarOpcao } from '../src/lib/opcoesTeclado'
let falhas = 0
const ok = (nome: string, v: boolean) => { if (!v) falhas++; console.log(v ? 'OK  ' : 'FALHA', nome) }
const f = { ...FORM_VAZIO, tipo_radiografia: '', genero: '', qualidade_tecnica: '' }
ok('anonimizacao alterna', trocarOpcao('anonimizacao', f, 1)!.anonimizacao_validada === !f.anonimizacao_validada)
ok('tipo vazio -> primeira', trocarOpcao('tipo', f, 1)!.tipo_radiografia === 'periapical')
ok('tipo vazio <- ultima', trocarOpcao('tipo', f, -1)!.tipo_radiografia === 'tomografia')
ok('tipo da a volta', trocarOpcao('tipo', { ...f, tipo_radiografia: 'tomografia' }, 1)!.tipo_radiografia === 'periapical')
ok('genero', trocarOpcao('genero', { ...f, genero: 'masculino' }, 1)!.genero === 'feminino')
ok('qualidade', trocarOpcao('qualidade', { ...f, qualidade_tecnica: 'boa' }, -1)!.qualidade_tecnica === 'otima')
ok('idade nao tem opcoes', trocarOpcao('idade', f, 1) === null)
ok('dentes tem 32 posicoes', tamanhoCursor('dentes', f) === 32)
const d = alternarNoCursor('dentes', f, 13)!
ok('espaco marca dente 26', d.dentes.join() === '26')
ok('espaco de novo desmarca', alternarNoCursor('dentes', d, 13)!.dentes.length === 0)
const pan = { ...f, tipo_radiografia: 'panoramica' }
ok('erros da panoramica', tamanhoCursor('erro_tecnico', pan) > 10)
ok('espaco marca erro', alternarNoCursor('erro_tecnico', pan, 0)!.erros_tecnicos.length === 1)
// Enter confirma e avanca
const fa = { ...f, anonimizacao_validada: false }
const ea = confirmarComEnter('anonimizacao', fa, 0)!
ok('enter valida anonimizacao e avanca', ea.avancar && ea.form!.anonimizacao_validada === true)
const eb = confirmarComEnter('anonimizacao', { ...fa, anonimizacao_validada: true }, 0)!
ok('enter com anonimizacao ja validada so avanca', eb.avancar && eb.form === null)
ok('enter no tipo sem escolha nao faz nada', confirmarComEnter('tipo', f, 0) === null)
ok('enter no tipo escolhido avanca', confirmarComEnter('tipo', pan, 0)!.avancar === true)
ok('enter no sexo escolhido avanca', confirmarComEnter('genero', { ...f, genero: 'feminino' }, 0)!.avancar)
ok('enter na qualidade escolhida avanca', confirmarComEnter('qualidade', { ...f, qualidade_tecnica: 'boa' }, 0)!.avancar)
ok('enter na idade avanca', confirmarComEnter('idade', f, 0)!.avancar)
const ed = confirmarComEnter('dentes', f, 13)!
ok('enter nos dentes marca e fica', !ed.avancar && ed.form!.dentes.join() === '26')
ok('enter na descricao nao faz nada', confirmarComEnter('descricao', f, 0) === null)
process.exit(falhas ? 1 : 0)
