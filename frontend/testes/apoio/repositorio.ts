// Apoio aos testes que comparam o frontend com o backend (13/11/2026).
// Acha a raiz do repositorio subindo pastas a partir de onde o teste roda
// (frontend/ pelo "npx tsx" ou a pasta do Vitest da auditoria) e le
// arquivos do backend para conferir que as listas copiadas sao iguais.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export function raizDoRepositorio(): string {
  let pasta = process.cwd()
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(pasta, 'backend', 'app')) && existsSync(path.join(pasta, 'frontend', 'src'))) return pasta
    pasta = path.dirname(pasta)
  }
  throw new Error('raiz do repositorio nao encontrada a partir de ' + process.cwd())
}

export function lerDoRepositorio(caminho: string): string {
  return readFileSync(path.join(raizDoRepositorio(), caminho), 'utf8')
}

/** valores "texto" de um enum Python: NOME = "valor" (so dentro da classe pedida) */
export function valoresDoEnumPython(fonte: string, classe: string): string[] {
  const inicio = fonte.indexOf(`class ${classe}(`)
  if (inicio < 0) throw new Error(`classe ${classe} nao encontrada`)
  const resto = fonte.slice(inicio).split('\n').slice(1)
  const valores: string[] = []
  for (const linha of resto) {
    if (/^\S/.test(linha)) break // saiu da classe
    const m = linha.match(/^\s+[A-Z0-9_]+\s*=\s*"([^"]+)"/)
    if (m) valores.push(m[1])
  }
  return valores
}

/** chaves de um dicionario Python de nivel superior: NOME ... = { "chave": ... } */
export function chavesDoDicionarioPython(fonte: string, nome: string): string[] {
  const inicio = fonte.search(new RegExp(`^${nome}\\b[^=\\n]*=\\s*\\{`, 'm'))
  if (inicio < 0) throw new Error(`dicionario ${nome} nao encontrado`)
  const chaves: string[] = []
  for (const linha of fonte.slice(inicio).split('\n').slice(1)) {
    if (/^\}/.test(linha)) break
    const m = linha.match(/^ {4}"([^"]+)"\s*:/)
    if (m) chaves.push(m[1])
  }
  return chaves
}

let falhas = 0
export function caso(nome: string, ok: boolean) {
  if (!ok) falhas++
  console.log(ok ? 'OK  ' : 'FALHA', nome)
}
export function terminar() {
  const n = falhas
  falhas = 0
  process.exit(n ? 1 : 0)
}

/** Fim de teste com partes assincronas (fetch): sai com 1 so se houve falha,
 * como testes/fetchSeguro.teste.ts. Assim, dentro do Vitest da auditoria,
 * o sucesso nao chama process.exit depois que o teste ja terminou. */
export function terminarAssincrono(promessa: Promise<void>) {
  promessa
    .then(() => {
      if (falhas) process.exit(1)
    })
    .catch((erro) => {
      console.error(erro)
      process.exit(1)
    })
}
