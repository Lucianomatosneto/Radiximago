// TRADUCOES DAS ANOTACOES (PR 3a, 14/11/2026).
//
// Defeito encontrado na Fase 2: a chave "Visualizador.anotacoes.salvando"
// nao existia em pt nem em en. Enquanto a anotacao salvava, o botao mostrava
// o NOME da chave em vez de "Salvando...".
//
// Este teste le o arquivo do componente (AnotacoesImagem.tsx), junta TODAS
// as chaves que ele pede ao tradutor e confere que cada uma existe nos dois
// idiomas. Assim, uma chave nova esquecida em um idioma tambem e percebida.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import pt from '../../../../frontend/messages/pt.json'
import en from '../../../../frontend/messages/en.json'

const ARQUIVO = path.resolve(__dirname, '../../../../frontend/src/components/detalhe/AnotacoesImagem.tsx')
const fonte = readFileSync(ARQUIVO, 'utf8')

/** chaves pedidas no componente: t('x') e t(`cores.${c.chave}`) com as cores da lista */
function chavesUsadas(): { espaco: string; chaves: string[] } {
  const espaco = /useTranslations\('([^']+)'\)/.exec(fonte)?.[1] ?? ''
  const fixas = [...fonte.matchAll(/\bt\('([^']+)'/g)].map((m) => m[1])
  const cores = [...fonte.matchAll(/chave: '([^']+)'/g)].map((m) => `cores.${m[1]}`)
  return { espaco, chaves: [...new Set([...fixas, ...cores])].sort() }
}

function existe(mensagens: unknown, caminho: string): boolean {
  let atual: unknown = mensagens
  for (const parte of caminho.split('.')) {
    if (!atual || typeof atual !== 'object' || !(parte in atual)) return false
    atual = (atual as Record<string, unknown>)[parte]
  }
  return typeof atual === 'string' && atual.length > 0
}

describe('traducoes usadas pelas anotacoes da imagem', () => {
  const { espaco, chaves } = chavesUsadas()

  it('o componente usa o grupo "Visualizador.anotacoes" e as chaves foram encontradas', () => {
    expect(espaco).toBe('Visualizador.anotacoes')
    expect(chaves).toContain('salvando')
    expect(chaves).toContain('cores.amarelo')
    expect(chaves.length).toBeGreaterThan(20)
  })

  it.each([
    ['portugues', pt],
    ['ingles', en],
  ])('toda chave existe em %s', (_idioma, mensagens) => {
    const faltando = chaves.filter((c) => !existe(mensagens, `${espaco}.${c}`))
    expect(faltando).toEqual([])
  })

  it('"Salvando" segue o padrao das outras telas (reticencias)', () => {
    expect(pt.Visualizador.anotacoes.salvando).toBe('Salvando...')
    expect(en.Visualizador.anotacoes.salvando).toBe('Saving...')
  })
})
