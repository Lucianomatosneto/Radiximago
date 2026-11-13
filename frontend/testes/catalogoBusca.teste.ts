// "Busca por termos" da Pesquisa avancada (lib/catalogoTermos.ts): como a
// lista de sugestoes procura e ordena enquanto a pessoa digita, e que os
// grupos enviados a API sao os mesmos que o backend conhece.
// Rodar dentro da pasta frontend:  npx tsx testes/catalogoBusca.teste.ts
import {
  DENTES_FDI,
  GRUPOS_DENTES,
  GRUPOS_TERMOS,
  itensDoVocabulario,
  normalizarBusca,
  procurarNoCatalogo,
  token,
  type ItemCatalogo,
} from '../src/lib/catalogoTermos'
import { caso, chavesDoDicionarioPython, lerDoRepositorio, terminar } from './apoio/repositorio'

const item = (tipo: ItemCatalogo['tipo'], valor: string, rotulo: string, ...extras: string[]): ItemCatalogo => ({
  tipo,
  valor,
  rotulo,
  chaves: [rotulo, ...extras].map(normalizarBusca),
})
const catalogo: ItemCatalogo[] = [
  item('achado', 'carie_dentina', 'Cárie em dentina'),
  item('achado', 'carie_esmalte', 'Cárie em esmalte'),
  item('grupo', 'carie', 'Cárie - todos os tipos'),
  item('regiao', 'coroa', 'Coroa'),
  item('vocab', '5', 'Nódulo pulpar', 'pedra pulpar'),
  item('achado', 'lesao_periapical', 'Lesão periapical'),
  ...[36, 46].map((d) => item('dente', String(d), `Dente ${d}`)),
]
const rotulos = (q: string, limite?: number) => procurarNoCatalogo(catalogo, q, limite).map((i) => i.rotulo)

caso('token junta tipo e valor', token({ tipo: 'achado', valor: 'cisto', rotulo: 'Cisto' }) === 'achado:cisto')
caso('normalizar tira acento, maiuscula e espacos sobrando', normalizarBusca('  Lesão   PERIAPICAL ') === 'lesao periapical')
caso('busca vazia nao sugere nada', procurarNoCatalogo(catalogo, '   ').length === 0)
caso('iniciais de palavras: "car den" acha "Cárie em dentina"', rotulos('car den')[0] === 'Cárie em dentina')
caso('ignora acento: "lesao" acha "Lesão periapical"', rotulos('lesao').includes('Lesão periapical'))
caso('grupo vem antes dos achados com a mesma pontuacao', rotulos('carie')[0] === 'Cárie - todos os tipos')
caso('todas as palavras digitadas precisam aparecer', rotulos('carie coroa').length === 0)
caso('sinonimo tambem encontra o termo', rotulos('pedra')[0] === 'Nódulo pulpar')
caso('nome vale mais que sinonimo', (() => {
  const c = [item('vocab', '1', 'Pedra fundamental'), item('vocab', '2', 'Nódulo pulpar', 'pedra pulpar')]
  return procurarNoCatalogo(c, 'pedra').map((i) => i.valor).join() === '1,2'
})())
caso('dentes um a um so aparecem quando ha numero', !rotulos('de').some((r) => r.startsWith('Dente')) && rotulos('dente 36')[0] === 'Dente 36')
caso('limite de sugestoes respeitado', rotulos('e', 2).length === 2)
caso('comeco do nome vale mais que meio da palavra', (() => {
  const c = [item('regiao', 'a', 'Mandíbula'), item('regiao', 'b', 'Canal mandibular')]
  return procurarNoCatalogo(c, 'mand').map((i) => i.valor).join() === 'a,b'
})())

const vocab = itensDoVocabulario(
  [
    { id: 1, termo: 'Nódulo pulpar', categoria: 'x', sinonimos: [{ id: 1, sinonimo: 'Pedra pulpar' }] },
    { id: 2, termo: 'Oculto da busca', categoria: 'x', na_busca: false },
    { id: 3, termo: 'Inativo', categoria: 'x', ativo: false },
    { id: 4, termo: 'Sem sinônimo', categoria: 'x' },
  ],
  (s) => `sinônimo: ${s}`
)
caso('vocabulario: so os termos ativos e marcados para a busca', vocab.map((v) => v.valor).join() === '1,4')
caso('vocabulario: chaves normalizadas com os sinonimos', vocab[0].chaves.join('|') === 'nodulo pulpar|pedra pulpar')
caso('vocabulario: detalhe mostra os sinonimos, ou nada', vocab[0].detalhe === 'sinônimo: Pedra pulpar' && vocab[1].detalhe === undefined)

caso('52 dentes FDI (32 permanentes + 20 deciduos)', DENTES_FDI.length === 52 && DENTES_FDI.includes(48) && DENTES_FDI.includes(85) && !DENTES_FDI.includes(19) && !DENTES_FDI.includes(56))

// as listas enviadas a API sao as mesmas que o backend aceita (busca_termos.py)
const buscaPy = lerDoRepositorio('backend/app/modules/busca_termos.py')
caso('grupos de achados = GRUPOS_ACHADO do backend', [...GRUPOS_TERMOS].sort().join() === chavesDoDicionarioPython(buscaPy, 'GRUPOS_ACHADO').sort().join())
caso('grupos de dentes = GRUPOS_DENTES do backend', [...GRUPOS_DENTES].sort().join() === chavesDoDicionarioPython(buscaPy, 'GRUPOS_DENTES').sort().join())

terminar()
