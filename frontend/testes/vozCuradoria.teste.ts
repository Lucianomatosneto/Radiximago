// Testes do interpretador da curadoria por voz (regras fixas).
// Rodar dentro da pasta frontend:  npx tsx testes/vozCuradoria.teste.ts

import type { SecaoFicha } from '../src/lib/secoesCuradoria'
import { aplicarMacro, interpretar, type FichaVoz, type OpcoesInterpretar } from '../src/lib/vozCuradoria'
const vazia: FichaVoz = { tipo_radiografia: 'panoramica', dentes: [], idade_min: '', idade_max: '', genero: '', marcacoes: [
  { id: 'a', tipo: 'oval', x: .1, y: .1, largura: .1, altura: .1 }, { id: 'b', tipo: 'seta', x1: 0, y1: 0, x2: .2, y2: .2 }],
  achados_detalhe: '', alteracoes_observadas: [], qualidade_tecnica: '', descricao_didatica: '', observacoes_internas: '', termos: [] }
const vocab = [{ id: 7, termo: 'Calcificação pulpar', sinonimos: [{ sinonimo: 'nódulo pulpar' }] }]
let falhas = 0
function caso(nome: string, texto: string, verificar: (r: ReturnType<typeof interpretar>) => boolean, secaoAtiva?: SecaoFicha, extra: Omit<OpcoesInterpretar, 'secaoAtiva'> = {}) {
  const r = interpretar(texto, vazia, vocab, { secaoAtiva, ...extra })
  const ok = verificar(r)
  if (!ok) falhas++
  console.log(ok ? 'OK  ' : 'FALHA', nome)
  if (!ok) console.log(JSON.stringify({ f: r.ficha, alt: r.alteracoes, nr: r.naoReconhecidos.map(n => [n.texto, n.sugestoes.map(s => s.rotulo)]), c: r.comandos }, null, 1))
}
caso('exemplo completo', 'Periapical, qualidade boa, dente 36 e 37. Achado outro: reabsorção cervical. Alteração perda óssea vertical. Descrição: imagem didática para estudo de reabsorção, fim. Leve espessamento do ligamento.', r =>
  r.ficha.tipo_radiografia === 'periapical' && r.ficha.qualidade_tecnica === 'boa' && r.ficha.dentes.join() === '36,37' &&
  r.ficha.achados_detalhe === 'Reabsorção cervical' && r.ficha.alteracoes_observadas.includes('perda_ossea_vertical') &&
  r.ficha.descricao_didatica === 'Imagem didática para estudo de reabsorção' &&
  r.ficha.alteracoes_observadas.includes('alargamento_ligamento_periodontal') && r.naoReconhecidos.length === 1 && r.naoReconhecidos[0].texto === 'Leve')
caso('dentes por extenso e digito a digito', 'dentes trinta e seis, quarenta e seis e tres sete', r => r.ficha.dentes.join() === '36,37,46')
caso('dente incluso nao e palavra-guia', 'dente incluso', r => r.ficha.alteracoes_observadas.includes('dente_incluso') && r.ficha.dentes.length === 0)
caso('marcacao com achado e outro', 'marcação um cárie. marcação dois outro: nódulo calcificado', r =>
  r.ficha.marcacoes[0].achado === 'carie' && r.ficha.marcacoes[1].achado === 'outro' && r.ficha.marcacoes[1].achado_descricao === 'Nódulo calcificado')
caso('marcacao outro com termo liga termo', 'marcação dois outro: nódulo pulpar', r => r.ficha.marcacoes[1].achado === 'outro' && r.ficha.termos.includes(7))
caso('marcacao inexistente', 'marcação cinco cárie', r => r.naoReconhecidos.some(n => n.texto.includes('Marcação 5')))
caso('termo do vocabulario por sinonimo', 'alteração nódulo pulpar', r => r.ficha.termos.includes(7) && r.ficha.achados_detalhe === 'Calcificação pulpar')
caso('outro que e termo vira termo', 'outro: nodulo pulpar', r => r.ficha.termos.includes(7))
caso('idade e sexo', 'idade de 30 a 45 anos, sexo feminino', r => r.ficha.idade_min === '30' && r.ficha.idade_max === '45' && r.ficha.genero === 'feminino')
caso('comandos', 'salvar. desfazer', r => r.comandos.join() === 'salvar,desfazer')
caso('corrigir dente', 'dente 36. corrigir dente 36 para 46', r => r.ficha.dentes.join() === '46')
caso('parecido vira duvida, nao preenche', 'reabsorsão radicular externa', r =>
  r.ficha.alteracoes_observadas.length === 0 && r.alteracoes.length === 0 && r.naoReconhecidos.length === 1 &&
  r.naoReconhecidos[0].parecido === true && r.naoReconhecidos[0].sugestoes[0].destino?.valor === 'reabsorcao_radicular_externa')
caso('carie sozinha pede escolha', 'cárie', r => r.naoReconhecidos.length === 1 && r.naoReconhecidos[0].sugestoes.length >= 4)
caso('continuar descricao', 'descrição: primeira parte fim. continuar descrição: segunda parte', r => r.ficha.descricao_didatica === 'Primeira parte; Segunda parte')
caso('achados detalhados livre', 'achados detalhados: área radiolúcida na região apical do dente 36', r => r.ficha.achados_detalhe === 'Área radiolúcida na região apical do dente 36' && r.ficha.dentes.length === 0)
caso('apagar descricao', 'apagar descrição', r => r.ficha.descricao_didatica === '' && r.alteracoes.length === 1)
caso('panoramica bitewing', 'panorâmica', r => r.ficha.tipo_radiografia === 'panoramica')
caso('qualidade ruim', 'qualidade ruim', r => r.ficha.qualidade_tecnica === 'insatisfatoria')
caso('frase totalmente desconhecida', 'o paciente mexeu muito durante o exame', r => r.naoReconhecidos.length === 1 && Object.keys(r.ficha).length > 0)
// ---- secao ativa (coluna da ficha)
caso('descricao ativa recebe fala sem guia', 'imagem com boa nitidez mostrando lesão periapical no dente 36', r =>
  r.ficha.descricao_didatica === 'Imagem com boa nitidez mostrando lesão periapical no dente 36' && r.ficha.dentes.length === 0 &&
  r.ficha.alteracoes_observadas.length === 0 && r.naoReconhecidos.length === 0, 'descricao')
caso('observacoes ativa ate fim e depois regras normais', 'conferir com o professor fim. qualidade boa', r =>
  r.ficha.observacoes_internas === 'Conferir com o professor' && r.ficha.qualidade_tecnica === 'boa', 'observacoes')
caso('palavra-guia vence a secao ativa', 'dente 36 e 37', r => r.ficha.dentes.join() === '36,37' && r.ficha.descricao_didatica === '', 'descricao')
caso('achados ativa', 'reabsorção cervical na distal', r => r.ficha.achados_detalhe === 'Reabsorção cervical na distal', 'achados_detalhados')
caso('marcacoes ativa sem a palavra marcacao', 'um cárie', r => r.ficha.marcacoes[0].achado === 'carie', 'marcacoes')
caso('dados ativa continua com regras normais', 'o paciente mexeu', r => r.naoReconhecidos.length === 1, 'dados')
caso('comandos de navegacao', 'próxima seção', r => r.comandos.join() === 'proxima_secao' && r.ficha.descricao_didatica === '', 'descricao')
caso('secao anterior', 'seção anterior', r => r.comandos.join() === 'secao_anterior')
// ---- frases aprendidas e macros
const aprendidas = { frasesAprendidas: [{ frase: 'reabsorsão radicular externa', alteracao: 'reabsorcao_radicular_externa' }] }
caso('frase aprendida vira reconhecimento exato', 'reabsorsão radicular externa', r =>
  r.ficha.alteracoes_observadas.includes('reabsorcao_radicular_externa') && r.naoReconhecidos.length === 0, undefined, aprendidas)
const macros = { macros: [
  { id: 1, nome: 'Periapical normal', conteudo: { descricao_didatica: 'Radiografia periapical sem alterações.', tipo_radiografia: 'periapical', qualidade_tecnica: 'boa' } },
  { id: 2, nome: 'Cárie profunda', conteudo: { alteracoes_observadas: ['carie_proxima_polpa'], achados_detalhe: 'Cárie extensa' } },
] }
caso('macro exata aplica', 'macro periapical normal. dente 36', r =>
  r.ficha.descricao_didatica === 'Radiografia periapical sem alterações.' && r.ficha.tipo_radiografia === 'periapical' &&
  r.ficha.qualidade_tecnica === 'boa' && r.ficha.dentes.join() === '36', undefined, macros)
caso('macro com acento falado sem acento', 'macro carie profunda', r =>
  r.ficha.alteracoes_observadas.includes('carie_proxima_polpa') && r.ficha.achados_detalhe === 'Cárie extensa', undefined, macros)
caso('macro parecida vira duvida', 'macro periapical normau', r =>
  r.ficha.descricao_didatica === '' && r.naoReconhecidos.length === 1 && r.naoReconhecidos[0].sugestoes[0].rotulo === 'Macro: Periapical normal', undefined, macros)
caso('palavra curta solta nao vira duvida de semelhanca', 'cisto', r => r.ficha.alteracoes_observadas.includes('cisto'))
{
  const r = aplicarMacro({ ...vazia, descricao_didatica: 'Texto já escrito' }, macros.macros[0])
  const ok = r.ficha.descricao_didatica === 'Texto já escrito; Radiografia periapical sem alterações.' && r.alteracoes.length === 3
  if (!ok) falhas++
  console.log(ok ? 'OK  ' : 'FALHA', 'aplicarMacro acrescenta ao texto existente')
}
caso('nada a registrar e comando mesmo com secao de texto ativa', 'nada a registrar', r =>
  r.comandos.join() === 'nada_a_registrar' && r.ficha.observacoes_internas === '', 'observacoes')
// ---- secao unica Achados: achado + onde
caso('achado com dente, regiao e marcacao', 'lesão periapical no dente 36, região periapical, marcação um', r => {
  const a = r.ficha.achados ?? []
  return a.length === 1 && a[0].tipo === 'lesao_periapical' && a[0].dentes.join() === '36' && a[0].regiao === 'regiao_periapical' &&
    a[0].marcacoes.join() === 'a' && r.ficha.dentes.join() === '36' && r.ficha.alteracoes_observadas.join() === 'lesao_periapical'
})
caso('dois achados em sequencia com dentes', 'cárie em dentina no 37 e cálculo nos dentes 31 e 41', r => {
  const a = r.ficha.achados ?? []
  return a.length === 2 && a[0].dentes.join() === '37' && a[1].tipo === 'calculo_dentario' && a[1].dentes.join() === '31,41'
})
caso('mesmo tipo sem dente e completado depois', 'perda óssea horizontal. perda óssea horizontal no dente 46', r => {
  const a = r.ficha.achados ?? []
  return a.length === 1 && a[0].dentes.join() === '46'
})
caso('sem alteracoes marca imagem normal', 'Imagem sem alterações.', r => r.ficha.sem_alteracoes === true && r.alteracoes.length === 1)
caso('dente depois de achado nao vira descricao', 'alteração cisto na mandíbula', r => (r.ficha.achados ?? [])[0]?.regiao === 'mandibula')
process.exit(falhas ? 1 : 0)
