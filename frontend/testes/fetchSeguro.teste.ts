// Testa a chamada de rede segura: sem conexao devolve null (nao estoura).
// Rodar: npx tsx testes/fetchSeguro.teste.ts
import assert from 'node:assert/strict'
import { fetchOuNulo } from '../src/lib/fetchSeguro'
import { listarSegmentacoes, apagarSegmentacao } from '../src/lib/segmentacoes'

async function main() {
  const original = globalThis.fetch

  // 1) servidor fora do ar: fetch "rejeita"; a funcao devolve null
  globalThis.fetch = (async () => {
    throw new TypeError('Failed to fetch')
  }) as typeof fetch
  assert.equal(await fetchOuNulo('http://x/teste'), null)

  // 2) a camada de pintura mostra mensagem simples, nao a tecnica
  await assert.rejects(listarSegmentacoes(1), /Sem conexão com o servidor/)
  await assert.rejects(apagarSegmentacao(1), /Sem conexão com o servidor/)

  // 3) servidor responde (mesmo com erro 500): devolve a resposta normalmente
  globalThis.fetch = (async () => new Response('{}', { status: 500 })) as typeof fetch
  const r = await fetchOuNulo('http://x/teste')
  assert.ok(r)
  assert.equal(r!.status, 500)

  globalThis.fetch = original
  console.log('fetchSeguro: ok')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
