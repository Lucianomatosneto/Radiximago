// Busca da Central de Ajuda. Rodar: npx tsx testes/ajuda.teste.ts
import { TOPICOS_AJUDA } from '../src/lib/ajuda/conteudo'
import { buscarAjuda, normalizar, topicosDaTela, visiveisPara } from '../src/lib/ajuda/busca'
let falhas = 0
const ok = (nome: string, v: boolean) => { if (!v) falhas++; console.log(v ? 'OK  ' : 'FALHA', nome) }
const primeiro = (q: string, perfil: string | null = 'estudante') => buscarAjuda(visiveisPara(TOPICOS_AJUDA, perfil), q, 'pt')[0]?.id

ok('normaliza acento', normalizar('Anotações  Avançada!') === 'anotacoes avancada')
ok('ids unicos', new Set(TOPICOS_AJUDA.map((t) => t.id)).size === TOPICOS_AJUDA.length)
ok('todo topico tem pt e en com passos', TOPICOS_AJUDA.every((t) => t.pt.passos.length > 0 && t.en.passos.length === t.pt.passos.length))
ok('como usar a busca avançada', primeiro('como usar a busca avançada') === 'buscaAvancada')
ok('apagar anotações', primeiro('apagar anotações') === 'apagarAnotacao')
ok('excluir nota (sinonimo)', primeiro('excluir nota') === 'apagarAnotacao')
ok('apagar imagens de minhas imagens', primeiro('apagar imagens de minhas imagens') === 'removerMinhas')
ok('remover imagem', primeiro('remover imagem') === 'removerMinhas')
ok('sem acento: imprimir pdf', primeiro('imprimir pdf') === 'imprimir')
ok('comeco de palavra: compart', primeiro('compart') !== undefined)
ok('esqueci senha', primeiro('esqueci a senha') === 'senha')
ok('dente molar', primeiro('molar') === 'buscaDentes')
ok('nada encontrado', buscarAjuda(TOPICOS_AJUDA, 'xyzabc', 'pt').length === 0)
ok('consulta vazia', buscarAjuda(TOPICOS_AJUDA, '  como  ', 'pt').length === 0)
ok('estudante nao ve curadoria', !visiveisPara(TOPICOS_AJUDA, 'estudante').some((t) => t.categoria === 'curadoria'))
ok('curador ve curadoria por voz', primeiro('microfone voz', 'curador') === 'curadoriaVoz')
ok('estudante nao acha usuarios', primeiro('aprovar usuario') !== 'usuarios')
ok('sem perfil so topicos gerais', visiveisPara(TOPICOS_AJUDA, null).every((t) => !t.perfis))
ok('nesta tela: minhas imagens', topicosDaTela(TOPICOS_AJUDA, '/minhas-imagens').some((t) => t.id === 'removerMinhas'))
ok('frase livre: como apago a anotacao que fiz', primeiro('como apago a anotação que eu fiz') === 'apagarAnotacao')
ok('verbo: imprimo', primeiro('imprimo') === 'imprimir')
ok('ingles: delete note', buscarAjuda(TOPICOS_AJUDA, 'delete note', 'en')[0]?.id === 'apagarAnotacao')
process.exit(falhas ? 1 : 0)
