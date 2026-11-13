// Regras da ficha de curadoria que nao dependem da tela:
// - ordem das secoes e etapas do holofote (lib/secoesCuradoria.ts);
// - secao concluida/pendente (lib/progressoFicha.ts);
// - achados da ficha e o resumo derivado (lib/achadosFicha.ts, lib/achados.ts);
// - erros tecnicos por tipo de exame (lib/errosTecnicos.ts).
// Tambem confere que as listas copiadas do backend continuam iguais a ele.
// Rodar dentro da pasta frontend:  npx tsx testes/fichaCuradoria.teste.ts
import { REGIOES_ANATOMICAS, TIPOS_ACHADO, rotularTipoAchado } from '../src/lib/achados'
import {
  REGIAO_PADRAO_POR_ACHADO,
  REGIOES,
  REGIOES_PADRAO_POR_EXAME,
  achadosDaApi,
  achadosParaApi,
  adicionarAchado,
  comAchados,
  marcacoesSincronizadas,
  regiaoDoAchado,
  regioesAoTrocarExame,
  resumoAlteracoes,
  rotuloTipo,
  termosDosAchados,
  type AchadoFicha,
  type FichaComAchados,
} from '../src/lib/achadosFicha'
import { ERROS_TECNICOS, erroCabeNoExame, errosParaTipo, rotuloErro } from '../src/lib/errosTecnicos'
import { estadoSecoes, proximaPendente, temConteudo, type FichaProgresso } from '../src/lib/progressoFicha'
import {
  ETAPAS_FICHA,
  ETAPA_INICIAL,
  SECAO_DA_ETAPA,
  SECOES_FICHA,
  etapaVizinha,
  primeiraEtapa,
  secaoVizinha,
} from '../src/lib/secoesCuradoria'
import { caso, chavesDoDicionarioPython, lerDoRepositorio, terminar, valoresDoEnumPython } from './apoio/repositorio'

// ---------------- secoes e etapas
caso('secao seguinte e anterior', secaoVizinha('dados', 1) === 'achados' && secaoVizinha('achados', -1) === 'dados')
caso('secao nao passa do comeco nem do fim', secaoVizinha('dados', -1) === 'dados' && secaoVizinha('observacoes', 1) === 'observacoes')
caso('holofote comeca na anonimizacao', ETAPA_INICIAL === 'anonimizacao' && ETAPAS_FICHA[0] === 'anonimizacao')
caso('ultima etapa e aprovar', ETAPAS_FICHA[ETAPAS_FICHA.length - 1] === 'aprovar' && etapaVizinha('aprovar', 1) === 'aprovar')
caso('etapa seguinte de "dentes" e "qualidade"', etapaVizinha('dentes', 1) === 'qualidade')
caso('toda etapa tem uma secao', ETAPAS_FICHA.every((e) => SECOES_FICHA.includes(SECAO_DA_ETAPA[e])))
caso('primeira etapa de cada secao', primeiraEtapa('dados') === 'anonimizacao' && primeiraEtapa('achados') === 'achados' && primeiraEtapa('observacoes') === 'observacoes')

// ---------------- progresso (secao concluida ou pendente)
const ficha: FichaProgresso = {
  tipo_radiografia: 'periapical',
  dentes: [36],
  genero: 'feminino',
  qualidade_tecnica: 'boa',
  anonimizacao_validada: true,
  alteracoes_observadas: [],
  achados_detalhe: '',
  descricao_didatica: 'Lesão no 36.',
  observacoes_internas: '',
  marcacoes: [{ id: 'm1' }],
  achados: [{ tipo: 'lesao_periapical', marcacoes: ['m1'] }],
}
caso('dados completos: concluida', temConteudo('dados', ficha))
caso('dados sem anonimizacao validada: pendente', !temConteudo('dados', { ...ficha, anonimizacao_validada: false }))
caso('periapical sem dente: pendente', !temConteudo('dados', { ...ficha, dentes: [] }))
caso('panoramica sem dente: concluida (pega a boca toda)', temConteudo('dados', { ...ficha, tipo_radiografia: 'panoramica', dentes: [] }))
caso('achados com todas as marcacoes ligadas: concluida', temConteudo('achados', ficha))
caso('marcacao sem achado deixa "achados" pendente', !temConteudo('achados', { ...ficha, marcacoes: [{ id: 'm1' }, { id: 'm2' }] }))
caso('"imagem sem alteracoes" conclui achados', temConteudo('achados', { ...ficha, achados: [], marcacoes: [], sem_alteracoes: true }))
caso('descricao so com espacos: pendente', !temConteudo('descricao', { ...ficha, descricao_didatica: '   ' }))
caso('erro tecnico marcado: concluida', temConteudo('erro_tecnico', { ...ficha, erros_tecnicos: ['movimento'] }))
const est = estadoSecoes(ficha, [])
caso('estado: observacoes vazias ficam pendentes', est.observacoes === 'pendente' && est.dados === 'concluida')
caso('"nada a registrar" conclui secao opcional', estadoSecoes(ficha, ['observacoes', 'erro_tecnico']).observacoes === 'concluida')
caso('"nada a registrar" NAO vale para secao obrigatoria', estadoSecoes({ ...ficha, descricao_didatica: '' }, ['dados']).dados === 'concluida' && estadoSecoes({ ...ficha, anonimizacao_validada: false }, ['dados']).dados === 'pendente')
caso('proxima pendente depois da atual', proximaPendente(est, 'dados') === 'erro_tecnico')
caso('proxima pendente da a volta ao comeco', proximaPendente({ ...est, erro_tecnico: 'concluida', observacoes: 'concluida', dados: 'pendente' }, 'descricao') === 'dados')
caso('tudo concluido: nenhuma pendente', proximaPendente(estadoSecoes(ficha, ['erro_tecnico', 'observacoes']), 'dados') === null)

// ---------------- achados da ficha
const base: FichaComAchados = { alteracoes_observadas: [], dentes: [11], marcacoes: [{ id: 'm1', tipo: 'oval' }, { id: 'm2', tipo: 'seta' }], achados: [] }
caso('regiao padrao do achado quando o curador nao escolhe', regiaoDoAchado({ tipo: 'carie_dentina', regiao: '' }) === 'coroa')
caso('regiao escolhida vale mais que a padrao', regiaoDoAchado({ tipo: 'carie_dentina', regiao: 'raiz' }) === 'raiz')
caso('trocar exame com regioes intocadas usa as do exame novo', regioesAoTrocarExame([], 'periapical', 'tomografia').join() === 'maxila,mandibula,osso_alveolar')
caso('trocar exame mantem regioes escolhidas pelo curador', regioesAoTrocarExame(['atm'], 'panoramica', 'tomografia').join() === 'atm')
caso('regioes iguais ao padrao do exame anterior sao trocadas', regioesAoTrocarExame([...REGIOES_PADRAO_POR_EXAME.tomografia], 'tomografia', 'periapical').length === 0)
const a1: AchadoFicha = { tipo: 'carie_dentina', dentes: [36], regiao: '', marcacoes: ['m1'] }
const a2: AchadoFicha = { tipo: 'carie_dentina', dentes: [37], regiao: '', marcacoes: [] }
const termo: AchadoFicha = { tipo: 'outro', dentes: [], regiao: '', marcacoes: ['m2'], termo_id: 7, rotulo: 'Pérola de esmalte' }
caso('resumo sem repetir e sem termos do vocabulario', resumoAlteracoes([a1, a2, termo]).join() === 'carie_dentina')
caso('termos do vocabulario usados nos achados', termosDosAchados([a1, termo, termo]).join() === '7')
const f1 = comAchados({ ...base, termos: [3, 7] }, [a1, termo])
caso('comAchados junta os dentes em ordem', f1.dentes.join() === '11,36')
caso('comAchados refaz o resumo legado', f1.alteracoes_observadas.join() === 'carie_dentina')
caso('comAchados liga os termos dos achados e mantem os outros', (f1.termos ?? []).slice().sort().join() === '3,7')
const marcadaSemAlteracoes: FichaComAchados = { ...base, sem_alteracoes: true }
caso('comAchados desmarca "sem alteracoes" quando ha achado', comAchados(marcadaSemAlteracoes, [a1]).sem_alteracoes === false)
caso('comAchados sem lista de termos nao cria uma', comAchados(base, [a1]).termos === undefined)
const m = f1.marcacoes
caso('marcacao ligada a carie vira achado "carie" (cor do visualizador)', m[0].achado === 'carie' && m[0].achado_descricao === null)
caso('marcacao ligada a termo vira "outro" com o nome do termo', m[1].achado === 'outro' && m[1].achado_descricao === 'Pérola de esmalte')
caso('achado sem equivalente vira "outro" com o rotulo', marcacoesSincronizadas([{ id: 'x', tipo: 'oval' }], [{ tipo: 'cisto', dentes: [], regiao: '', marcacoes: ['x'] }])[0].achado_descricao === rotuloTipo('cisto'))
caso('marcacao solta nao muda', marcacoesSincronizadas([{ id: 'x', tipo: 'oval', achado: 'normal' }], [])[0].achado === 'normal')
// adicionar sem duplicar
const comUm = adicionarAchado(base, { tipo: 'carie_dentina' })
caso('adicionar um achado novo', comUm.achados?.length === 1)
caso('adicionar o mesmo achado de novo nao duplica', adicionarAchado(comUm, { tipo: 'carie_dentina' }).achados?.length === 1)
const completado = adicionarAchado(comUm, { tipo: 'carie_dentina', dentes: [46] })
caso('achado sem dente e completado pelo novo dente', completado.achados?.length === 1 && completado.achados?.[0].dentes.join() === '46')
const comMarcacao = adicionarAchado(completado, { tipo: 'carie_dentina', dentes: [46], marcacoes: ['m1'] })
caso('mesmo achado com marcacao nova: junta a marcacao', comMarcacao.achados?.length === 1 && comMarcacao.achados?.[0].marcacoes.join() === 'm1')
caso('mesmo tipo em outro dente vira outra linha', adicionarAchado(completado, { tipo: 'carie_dentina', dentes: [47] }).achados?.length === 2)
// formato da API
const api = achadosParaApi([a1, termo], base.marcacoes)
caso('para a API: regiao padrao preenchida e marcacoes completas', api[0].regiao_anatomica === 'coroa' && api[0].marcacoes.length === 1 && api[0].marcacoes[0].id === 'm1')
caso('para a API: termo vai como "outro" com termo_id e descricao', api[1].tipo === 'outro' && 'termo_id' in api[1] && api[1].termo_id === 7 && api[1].descricao === 'Pérola de esmalte')
const daApi = achadosDaApi([{ tipo: 'carie_dentina', dentes: null, regiao_anatomica: null, marcacoes: [{ id: 'm1' }, {}] }, { tipo: 'invalido' }], ['cisto'])
caso('da API: tipo invalido descartado, marcacao sem id descartada', daApi.length === 1 && daApi[0].marcacoes.join() === 'm1' && daApi[0].dentes.length === 0)
caso('ficha antiga (so checklist) vira achados sem dente', achadosDaApi([], ['cisto', 'nao_existe']).map((a) => a.tipo).join() === 'cisto')
caso('da API: termo do vocabulario e mantido', achadosDaApi([{ tipo: 'outro', termo_id: 9, descricao: 'X' }], []).at(0)?.rotulo === 'X')

// ---------------- listas de achados (lib/achados.ts)
caso('tipos de achado: sem repeticao e com "outro" no fim', new Set(TIPOS_ACHADO).size === TIPOS_ACHADO.length && TIPOS_ACHADO.at(-1) === 'outro')
caso('rotulo "outro" usa o texto proprio', rotularTipoAchado('outro', 'Outro', () => 'x') === 'Outro' && rotularTipoAchado('cisto', 'Outro', (v) => `[${v}]`) === '[cisto]')
caso('as duas listas de regioes do frontend sao iguais', REGIOES.join() === REGIOES_ANATOMICAS.join())

// ---------------- erros tecnicos por exame
const valores = (l: { valor: string }[]) => l.map((e) => e.valor)
caso('valores dos erros sem repeticao', new Set(valores(ERROS_TECNICOS)).size === ERROS_TECNICOS.length)
caso('tomografia so mostra erros de tomografia', errosParaTipo('tomografia').every((e) => e.grupo === 'tomografia') && errosParaTipo('tomografia').length === 8)
caso('panoramica nao mostra "corte de cone"', !valores(errosParaTipo('panoramica')).includes('corte_cone') && valores(errosParaTipo('panoramica')).includes('imagem_fantasma'))
caso('intraorais so mostram os gerais', ['periapical', 'interproximal', 'oclusal'].every((t) => errosParaTipo(t).every((e) => e.grupo === 'geral') && errosParaTipo(t).length === 14))
caso('sem tipo de exame: todos', errosParaTipo('').length === ERROS_TECNICOS.length)
caso('erro de outro exame nao cabe', !erroCabeNoExame('imagem_fantasma', 'periapical') && erroCabeNoExame('imagem_fantasma', 'panoramica'))
caso('valor antigo (legado) passa: o servidor decide', erroCabeNoExame('corte_apice', 'tomografia'))
caso('rotulo do erro e de valor desconhecido', rotuloErro('tc_truncamento') === 'Truncamento' && rotuloErro('xyz') === 'xyz')

// ---------------- copias do backend continuam iguais
const achadosPy = lerDoRepositorio('backend/app/modules/achados.py')
caso('regioes anatomicas = enum RegiaoAnatomica do backend', REGIOES_ANATOMICAS.join() === valoresDoEnumPython(achadosPy, 'RegiaoAnatomica').join())
const errosBackend = valoresDoEnumPython(achadosPy, 'TipoErroTecnico')
caso('todo erro do frontend existe no backend', valores(ERROS_TECNICOS).every((v) => errosBackend.includes(v)))
caso('todo erro atual do backend (sem os legados) existe no frontend', errosBackend.slice(0, errosBackend.indexOf('corte_apice')).join() === valores(ERROS_TECNICOS).join())
caso('regiao padrao por achado = backend', chavesDoDicionarioPython(achadosPy, 'REGIAO_PADRAO_POR_ACHADO').join() === Object.keys(REGIAO_PADRAO_POR_ACHADO).join())
caso('regioes padrao por exame = backend', chavesDoDicionarioPython(achadosPy, 'REGIOES_PADRAO_POR_EXAME').join() === Object.keys(REGIOES_PADRAO_POR_EXAME).join())
for (const [achado, regiao] of Object.entries(REGIAO_PADRAO_POR_ACHADO)) {
  caso(`regiao padrao de ${achado} = backend (${regiao})`, new RegExp(`"${achado}": RegiaoAnatomica\\.${regiao.toUpperCase()}\\.value`).test(achadosPy))
}

terminar()
