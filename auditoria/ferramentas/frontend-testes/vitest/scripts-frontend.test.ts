// Roda DENTRO do Vitest os testes do proprio frontend (frontend/testes/*.teste.ts,
// os mesmos do workflow "testes-frontend"). Assim a medicao de cobertura
// (npm run cobertura) enxerga as funcoes que esses testes exercitam de verdade.
// Cada script avisa o resultado com process.exit(0 = tudo certo, 1 = falha):
// aqui o process.exit e interceptado e vira um "esperado 0".
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, vi } from 'vitest'

const pasta = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../frontend/testes')

for (const nome of readdirSync(pasta).filter((n) => n.endsWith('.teste.ts')).sort()) {
  it(`frontend/testes/${nome}`, async () => {
    let codigo: number | undefined
    const saida = vi.spyOn(process, 'exit').mockImplementation(((c?: number) => {
      codigo = c ?? 0
    }) as never)
    try {
      await import(path.join(pasta, nome))
    } finally {
      saida.mockRestore()
    }
    expect(codigo ?? 0).toBe(0)
  })
}
