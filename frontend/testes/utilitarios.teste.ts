// Funcoes pequenas de lib/ que ainda nao tinham teste (13/11/2026):
// dentes FDI, regiao do globo, navegacao, aviso de e-mail digitado errado,
// cores dos achados, pintura (cores e tamanho da mascara, mensagens de erro
// da API), leitura com repeticao, gerador de ZIP e estado dos servicos.
// Rodar dentro da pasta frontend:  npx tsx testes/utilitarios.teste.ts
import { crc32 } from 'node:zlib'
import { corBarraAchado, corCartaoTipoRadiografia, corTextoAchado, COR_ACHADO_PADRAO_BARRA, COR_ACHADO_PADRAO_TEXTO, COR_CARTAO_TIPO_RADIOGRAFIA_PADRAO, CORES_ACHADO_PRINCIPAL } from '../src/lib/coresAchados'
import { dentesDoQuadrante, quadranteDoDente } from '../src/lib/dentesFdi'
import { DOMINIOS_TROCADOS, sugestaoDeEmail } from '../src/lib/emailDigitacao'
import { checarHealthEndpoint } from '../src/lib/healthCheck'
import { casaRota, paginaInicial, ROTAS_LARGURA_LIMITADA, ROTAS_SEM_TRILHA, SEGMENTOS } from '../src/lib/navegacao'
import { regiaoDe } from '../src/lib/regiaoGeografica'
import { errouServidor, lerComRepeticao } from '../src/lib/repetir'
import { CORES_ESTRUTURA, TODOS_OS_DENTES, alterarSegmentacao, criarSegmentacao, listarSegmentacoes, proximaCor, tamanhoDaMascara } from '../src/lib/segmentacoes'
import { avaliarDocker, avaliarOhif } from '../src/lib/servicosSistema'
import { criarZip } from '../src/lib/zip'
import { caso, lerDoRepositorio, terminarAssincrono } from './apoio/repositorio'

// ---------------- dentes FDI
caso('quadrante 3: dentes 31 a 38', dentesDoQuadrante(3).join() === '31,32,33,34,35,36,37,38')
caso('quadrante do dente pelo primeiro digito', quadranteDoDente(46) === 4 && quadranteDoDente(11) === 1)
caso('dente deciduo ou invalido nao tem quadrante permanente', quadranteDoDente(55) === null && quadranteDoDente(5) === null)
caso('todos os dentes permanentes (32) na ordem dos quadrantes', TODOS_OS_DENTES.length === 32 && TODOS_OS_DENTES[0] === 11 && TODOS_OS_DENTES[31] === 48)

// ---------------- regiao do globo (longitude central)
caso('limites das regioes do globo', [
  [-180, 'regiaoPacifico'], [-171, 'regiaoPacifico'], [-170, 'regiaoAmericas'], [-48, 'regiaoAmericas'],
  [-30, 'regiaoAtlantico'], [-10, 'regiaoEuropaAfrica'], [59.9, 'regiaoEuropaAfrica'], [60, 'regiaoAsia'],
  [149, 'regiaoAsia'], [150, 'regiaoPacifico'], [180, 'regiaoPacifico'],
].every(([lon, r]) => regiaoDe(lon as number) === r))

// ---------------- navegacao
caso('pagina inicial do administrador e o painel', paginaInicial('administrador') === '/dashboard')
caso('pagina inicial dos outros perfis (ou sem perfil) e o banco de imagens', paginaInicial('estudante') === '/banco-imagens' && paginaInicial(null) === '/banco-imagens')
caso('rota e sub-rota casam com a lista', casaRota('/usuarios', ROTAS_LARGURA_LIMITADA) && casaRota('/usuarios/12', ROTAS_LARGURA_LIMITADA))
caso('prefixo parecido nao casa (/usuariosx)', !casaRota('/usuariosx', ROTAS_LARGURA_LIMITADA) && casaRota('/curadoria', ROTAS_SEM_TRILHA))
const mensagens = ['pt', 'en'].map((l) => JSON.parse(lerDoRepositorio(`frontend/messages/${l}.json`)) as { Navegacao: { segmentos: Record<string, string> } })
for (const [i, idioma] of ['pt', 'en'].entries()) {
  const faltando = Object.values(SEGMENTOS).filter((chave) => !mensagens[i].Navegacao.segmentos[chave])
  caso(`toda parte da trilha tem texto em ${idioma}${faltando.length ? ' (faltam: ' + faltando.join(', ') + ')' : ''}`, faltando.length === 0)
}

// ---------------- e-mail digitado errado
caso('sugere o dominio certo', sugestaoDeEmail('gabi@hotmai.com') === 'gabi@hotmail.com')
caso('dominio com maiusculas e espacos', sugestaoDeEmail('  Ana@GMIAL.com ') === 'Ana@gmail.com')
caso('dominio correto ou desconhecido: sem sugestao', sugestaoDeEmail('ana@gmail.com') === null && sugestaoDeEmail('ana@exemplo.org') === null)
caso('texto sem @ ou vazio: sem sugestao', sugestaoDeEmail('ana') === null && sugestaoDeEmail('') === null && sugestaoDeEmail(null) === null)
caso('nenhuma correcao aponta para outro erro da lista', Object.values(DOMINIOS_TROCADOS).every((certo) => !(certo in DOMINIOS_TROCADOS)))

// ---------------- cores dos achados (cartoes, textos, barras)
caso('texto e barra da carie', corTextoAchado('carie') === CORES_ACHADO_PRINCIPAL.carie.texto && corBarraAchado('carie') === 'bg-red-500')
caso('achado vazio ou sem cor propria usa o padrao', corTextoAchado(null) === COR_ACHADO_PADRAO_TEXTO && corTextoAchado('outro') === COR_ACHADO_PADRAO_TEXTO && corBarraAchado('') === COR_ACHADO_PADRAO_BARRA && corBarraAchado('outro') === COR_ACHADO_PADRAO_BARRA)
caso('cartao por tipo de radiografia e padrao', corCartaoTipoRadiografia('oclusal').includes('indigo') && corCartaoTipoRadiografia(undefined) === COR_CARTAO_TIPO_RADIOGRAFIA_PADRAO && corCartaoTipoRadiografia('tomografia') === COR_CARTAO_TIPO_RADIOGRAFIA_PADRAO)

// ---------------- pintura: cores e tamanho da mascara
caso('primeira cor livre', proximaCor([]) === CORES_ESTRUTURA[0] && proximaCor([CORES_ESTRUTURA[0]]) === CORES_ESTRUTURA[1])
caso('com todas as cores usadas, repete pela quantidade', proximaCor([...CORES_ESTRUTURA, 'x']) === CORES_ESTRUTURA[1])
caso('mascara de imagem pequena fica do mesmo tamanho', JSON.stringify(tamanhoDaMascara(800, 600)) === JSON.stringify({ largura: 800, altura: 600 }))
caso('mascara de imagem grande limitada a 1024 no lado maior', JSON.stringify(tamanhoDaMascara(3000, 1500)) === JSON.stringify({ largura: 1024, altura: 512 }))
caso('mascara nunca menor que 8 px', JSON.stringify(tamanhoDaMascara(4000, 10)) === JSON.stringify({ largura: 1024, altura: 8 }))

// ---------------- estado dos servicos
caso('Docker: todos online = online', avaliarDocker('online', 'online') === 'online')
caso('Docker: algum online = instavel', avaliarDocker('online', 'offline') === 'instavel')
caso('Docker: nenhum online = offline', avaliarDocker('erro', 'offline') === 'offline')

// ---------------- gerador de ZIP (formato PKWARE, sem compressao)
async function testarZip() {
  const texto = new TextEncoder().encode('123456789')
  const zip = new Uint8Array(await criarZip([{ nome: 'a.txt', dados: texto }, { nome: 'ç.txt', dados: new Uint8Array([1, 2, 3]) }]).arrayBuffer())
  const dv = new DataView(zip.buffer)
  caso('ZIP comeca com cabecalho local (PK\\3\\4)', dv.getUint32(0, true) === 0x04034b50)
  caso('CRC do 1o arquivo = CRC32 de referencia (0xCBF43926)', dv.getUint32(14, true) === 0xcbf43926 && crc32(texto) === 0xcbf43926)
  caso('modo "store": tamanho guardado = tamanho original', dv.getUint32(18, true) === 9 && dv.getUint32(22, true) === 9)
  const fim = zip.length - 22
  caso('ZIP termina com o fim do diretorio central (PK\\5\\6) e 2 arquivos', dv.getUint32(fim, true) === 0x06054b50 && dv.getUint16(fim + 10, true) === 2)
  const inicioCentral = dv.getUint32(fim + 16, true)
  caso('diretorio central no lugar indicado, com nome em UTF-8', dv.getUint32(inicioCentral, true) === 0x02014b50 && (dv.getUint16(inicioCentral + 8, true) & 0x0800) !== 0)
  const segundo = 30 + 'a.txt'.length + 9
  caso('2o arquivo comeca logo depois do 1o, com o CRC certo', dv.getUint32(segundo, true) === 0x04034b50 && dv.getUint32(segundo + 14, true) === crc32(new Uint8Array([1, 2, 3])))
}

// ---------------- chamadas a API com um "servidor de mentira"
type Resposta = Response | Error
function servidor(...respostas: Resposta[]) {
  const pedidos: { url: string; init?: RequestInit }[] = []
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    pedidos.push({ url: String(url), init })
    const r = respostas.shift()
    if (!r || r instanceof Error) throw r ?? new Error('sem resposta')
    return r
  }) as typeof fetch
  return pedidos
}
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

async function testarApi() {
  const fetchOriginal = globalThis.fetch
  const esperaOriginal = globalThis.setTimeout
  try {
    // leitura com repeticao (sem esperar de verdade os 0,8 s e 2 s)
    const esperas: number[] = []
    globalThis.setTimeout = ((fn: () => void, ms?: number) => { esperas.push(ms ?? 0); fn(); return 0 }) as unknown as typeof setTimeout
    let pedidos = servidor(new Response('', { status: 503 }), new Response('', { status: 502 }), json({ ok: 1 }))
    let r = await lerComRepeticao('http://api/x', { method: 'POST' })
    caso('repeticao: servidor ocupado 2 vezes, na 3a responde', r.status === 200 && pedidos.length === 3 && esperas.join() === '800,2000')
    caso('repeticao: sempre GET, mesmo se pedirem outro metodo', pedidos.every((p) => p.init?.method === 'GET'))
    pedidos = servidor(new Response('', { status: 404 }))
    r = await lerComRepeticao('http://api/x')
    caso('repeticao: erro que nao e passageiro (404) volta na hora', r.status === 404 && pedidos.length === 1)
    servidor(new Response('', { status: 504 }), new Response('', { status: 504 }), new Response('', { status: 504 }))
    caso('repeticao: depois de 3 tentativas devolve o ultimo erro', (await lerComRepeticao('http://api/x')).status === 504)
    servidor(new Error('rede'), new Error('rede'), new Error('rede final'))
    let erro = ''
    await lerComRepeticao('http://api/x').catch((e: Error) => { erro = e.message })
    caso('repeticao: sem conexao nas 3 vezes, o erro aparece', erro === 'rede final')
    caso('erro do servidor e 500 ou mais', errouServidor(500) && !errouServidor(404))
    globalThis.setTimeout = esperaOriginal

    // pintura: mensagens da API
    servidor(json({ itens: [{ id: 1 }] }))
    caso('listar estruturas devolve os itens', (await listarSegmentacoes(3)).length === 1)
    servidor(json({ detail: 'Ficha bloqueada.' }, 409))
    erro = ''
    await criarSegmentacao(3, { nome: 'Dente', dente: 36, cor: '#fff', mascara: 'data:' }).catch((e: Error) => { erro = e.message })
    caso('erro com explicacao do servidor e mostrado', erro === 'Ficha bloqueada.')
    servidor(new Response('nao e json', { status: 500 }))
    erro = ''
    await alterarSegmentacao(9, { nome: 'x' }).catch((e: Error) => { erro = e.message })
    caso('erro sem explicacao vira a mensagem padrao', erro === 'Não foi possível salvar a pintura.')
    pedidos = servidor(json({ id: 9 }))
    await alterarSegmentacao(9, { cor: '#000' })
    caso('alterar manda PATCH com o corpo em JSON', pedidos[0].init?.method === 'PATCH' && pedidos[0].init?.body === '{"cor":"#000"}')

    // verificacao de servicos (painel de integracoes)
    servidor(json({ status: 'ok' }))
    caso('health "ok" = online', (await checarHealthEndpoint('http://api/health', 'db')).status === 'online')
    servidor(json({ status: 'erro', db: 'sem banco' }))
    const e1 = await checarHealthEndpoint('http://api/health', 'db')
    caso('health "erro" mostra o detalhe do backend', e1.status === 'erro' && e1.descricao.includes('sem banco'))
    servidor(new Response('', { status: 503 }))
    caso('health HTTP 503 = offline com o codigo', (await checarHealthEndpoint('http://api/health', 'db')).descricao.includes('503'))
    servidor(json({ outra: 1 }))
    caso('health em formato estranho = offline', (await checarHealthEndpoint('http://api/health', 'db')).status === 'offline')
    servidor(new Error('rede'))
    const traduzido = await checarHealthEndpoint('http://api/health', 'db', (chave) => `[${chave}]`)
    caso('health sem rede usa o texto traduzido', traduzido.status === 'offline' && traduzido.descricao === '[falhaRede]')
    caso('OHIF: o servidor diz online', (await avaliarOhif({ ohif: { status: 'online' } } as never)).motivo === 'ohifServidorOk')
    const off = await avaliarOhif({ ohif: { status: 'offline', codigo: 502 } } as never)
    caso('OHIF: o servidor diz offline (com o codigo)', off.status === 'offline' && off.codigo === 502)
    const urlAntiga = process.env.NEXT_PUBLIC_OHIF_URL
    delete process.env.NEXT_PUBLIC_OHIF_URL
    caso('OHIF sem endereco nenhum = aguardando configuracao', (await avaliarOhif(null)).status === 'aguardando')
    if (urlAntiga !== undefined) process.env.NEXT_PUBLIC_OHIF_URL = urlAntiga
  } finally {
    globalThis.fetch = fetchOriginal
    globalThis.setTimeout = esperaOriginal
  }
}

terminarAssincrono(testarZip().then(testarApi))
