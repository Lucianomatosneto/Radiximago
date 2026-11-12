// Depois de "vitest --coverage": o lcov.info sai com os caminhos a partir
// DESTA pasta ("SF:../../../frontend/src/x.ts"). O SonarCloud procura os
// arquivos a partir da raiz do repositorio, entao reescrevemos para
// "SF:frontend/src/x.ts". Nada mais e alterado nos numeros.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.resolve(aqui, '../../..')
const arquivo = path.join(raiz, 'frontend/coverage/lcov.info')
const linhas = readFileSync(arquivo, 'utf8').split('\n')
let trocados = 0
const novas = linhas.map((l) => {
  if (!l.startsWith('SF:')) return l
  const absoluto = path.resolve(aqui, l.slice(3))
  trocados++
  return 'SF:' + path.relative(raiz, absoluto).split(path.sep).join('/')
})
writeFileSync(arquivo, novas.join('\n'))
console.log(`lcov.info: ${trocados} arquivos com caminho a partir da raiz do repositorio`)
