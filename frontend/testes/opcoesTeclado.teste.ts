// Setas ←/→ e barra de espaco no item aceso. Rodar: npx tsx testes/opcoesTeclado.teste.ts
import { FORM_VAZIO } from '../src/components/curadoria/FichaCuradoriaForm'
import { alternarNoCursor, tamanhoCursor, trocarOpcao } from '../src/lib/opcoesTeclado'
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
process.exit(falhas ? 1 : 0)
