// Gerador de arquivo .ZIP bem simples, sem bibliotecas externas.
// Usa o modo "store" (sem compressao): radiografias em PNG/JPEG ja vem
// comprimidas, entao comprimir de novo quase nao reduz o tamanho - e assim
// o codigo fica pequeno, rapido e facil de auditar.
// Formato: especificacao PKWARE APPNOTE (cabecalho local + diretorio central).

const TABELA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(dados: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < dados.length; i++) c = TABELA_CRC[(c ^ dados[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ArquivoZip {
  nome: string
  dados: Uint8Array
}

export function criarZip(arquivos: ArquivoZip[]): Blob {
  const codificador = new TextEncoder()
  const partes: Uint8Array[] = []
  const central: Uint8Array[] = []
  let deslocamento = 0
  const agora = new Date()
  const hora = (agora.getHours() << 11) | (agora.getMinutes() << 5) | Math.floor(agora.getSeconds() / 2)
  const data = ((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate()

  for (const arq of arquivos) {
    const nome = codificador.encode(arq.nome)
    const crc = crc32(arq.dados)
    const tam = arq.dados.length

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true) // nomes em UTF-8
    local.setUint16(8, 0, true) // store
    local.setUint16(10, hora, true)
    local.setUint16(12, data, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, tam, true)
    local.setUint32(22, tam, true)
    local.setUint16(26, nome.length, true)
    local.setUint16(28, 0, true)
    partes.push(new Uint8Array(local.buffer), nome, arq.dados)

    const cab = new DataView(new ArrayBuffer(46))
    cab.setUint32(0, 0x02014b50, true)
    cab.setUint16(4, 20, true)
    cab.setUint16(6, 20, true)
    cab.setUint16(8, 0x0800, true)
    cab.setUint16(10, 0, true)
    cab.setUint16(12, hora, true)
    cab.setUint16(14, data, true)
    cab.setUint32(16, crc, true)
    cab.setUint32(20, tam, true)
    cab.setUint32(24, tam, true)
    cab.setUint16(28, nome.length, true)
    cab.setUint32(42, deslocamento, true)
    central.push(new Uint8Array(cab.buffer), nome)

    deslocamento += 30 + nome.length + tam
  }

  const tamCentral = central.reduce((s, p) => s + p.length, 0)
  const fim = new DataView(new ArrayBuffer(22))
  fim.setUint32(0, 0x06054b50, true)
  fim.setUint16(8, arquivos.length, true)
  fim.setUint16(10, arquivos.length, true)
  fim.setUint32(12, tamCentral, true)
  fim.setUint32(16, deslocamento, true)

  return new Blob([...partes, ...central, new Uint8Array(fim.buffer)] as BlobPart[], { type: 'application/zip' })
}

type Escritor = { write: (b: Blob) => Promise<void>; close: () => Promise<void> }
type Alca = { createWritable: () => Promise<Escritor> }

/**
 * "Salvar como": onde o navegador permite (Chrome/Edge), abre JA a janela
 * de "Salvar como" para a pessoa escolher a pasta e o nome. Precisa ser
 * chamado logo no clique (o navegador so abre essa janela em resposta a um
 * clique). Devolve:
 *  - a "alca" do arquivo escolhido (o conteudo e gravado depois, quando
 *    estiver pronto);
 *  - null se o navegador nao tem essa janela (usaremos o download normal);
 *  - 'cancelado' se a pessoa fechou a janela sem salvar.
 */
export async function escolherOndeSalvar(
  nomeSugerido: string,
  tipoMime: string,
  descricaoTipo: string
): Promise<Alca | null | 'cancelado'> {
  const janela = window as unknown as { showSaveFilePicker?: (op: unknown) => Promise<Alca> }
  if (!janela.showSaveFilePicker) return null
  try {
    const extensao = '.' + (nomeSugerido.split('.').pop() ?? 'zip')
    return await janela.showSaveFilePicker({
      suggestedName: nomeSugerido,
      types: [{ description: descricaoTipo, accept: { [tipoMime]: [extensao] } }],
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelado'
    return null
  }
}

/** Grava o arquivo no local escolhido ou, sem local, faz o download normal. */
export async function gravarArquivo(blob: Blob, alca: Alca | null, nomeSugerido: string): Promise<void> {
  if (alca) {
    const escrita = await alca.createWritable()
    await escrita.write(blob)
    await escrita.close()
    return
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nomeSugerido
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
