// Mostra os textos dos Termos de Uso e da Politica de Privacidade (escritos
// em Markdown simples no servidor: app/termos_texto/*.md). Leitor proprio e
// pequeno, sem biblioteca nova: titulos (#, ##), paragrafos, listas (- e 1.),
// tabelas (| a | b |), **negrito** e *italico*. Nada de HTML vindo do texto:
// tudo vira elemento React (sem risco de codigo escondido).

import type { ReactNode } from 'react'

function enfeitar(texto: string, chave: string): ReactNode[] {
  const partes: ReactNode[] = []
  const regra = /(\*\*[^*]+\*\*|\*[^*]+\*)/g
  let ultimo = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = regra.exec(texto))) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index))
    const trecho = m[0]
    partes.push(
      trecho.startsWith('**') ? (
        <strong key={`${chave}-${i++}`} className="font-semibold text-ink">{trecho.slice(2, -2)}</strong>
      ) : (
        <em key={`${chave}-${i++}`}>{trecho.slice(1, -1)}</em>
      )
    )
    ultimo = m.index + trecho.length
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo))
  return partes
}

const celulas = (linha: string) => linha.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())

/**
 * Titulo em Markdown: "#", "##" ou "###" seguido de espaco. Devolve o nivel e
 * o texto, ou null. Antes era a regex /^(#{1,3})\s+(.*)$/ (SonarCloud S8786);
 * agora le os "#" um a um, com o mesmo resultado.
 */
export function lerTitulo(linha: string): { nivel: number; texto: string } | null {
  let n = 0
  while (n < linha.length && linha[n] === '#') n++
  if (n < 1 || n > 3) return null
  const resto = linha.slice(n)
  if (!/^\s/.test(resto)) return null
  return { nivel: n, texto: resto.trimStart() }
}

export function idTitulo(texto: string) {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default function TextoTermos({ markdown, prefixo = '' }: { markdown: string; prefixo?: string }) {
  const linhas = markdown.replace(/\r/g, '').split('\n')
  const blocos: ReactNode[] = []
  let i = 0
  let n = 0
  while (i < linhas.length) {
    const linha = linhas[i]
    const k = `${prefixo}${n++}`
    if (!linha.trim()) {
      i++
      continue
    }
    const titulo = lerTitulo(linha)
    if (titulo) {
      const { nivel, texto } = titulo
      const id = `${prefixo}${idTitulo(texto)}`
      blocos.push(
        nivel === 1 ? (
          <h2 key={k} id={id} className="mb-3 mt-2 scroll-mt-24 text-xl font-semibold text-ink sm:text-2xl">{texto}</h2>
        ) : nivel === 2 ? (
          <h3 key={k} id={id} className="mb-2 mt-6 scroll-mt-24 text-base font-semibold text-ink sm:text-lg">{texto}</h3>
        ) : (
          <h4 key={k} id={id} className="mb-1 mt-4 text-sm font-semibold text-ink">{texto}</h4>
        )
      )
      i++
      continue
    }
    if (linha.trim().startsWith('|')) {
      const tabela: string[] = []
      while (i < linhas.length && linhas[i].trim().startsWith('|')) tabela.push(linhas[i++])
      const [cab, , ...corpo] = tabela
      blocos.push(
        <div key={k} className="my-3 overflow-x-auto rounded-lg border border-base-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5">
              <tr>{celulas(cab).map((c, j) => <th key={j} className="px-3 py-2 font-semibold text-ink">{enfeitar(c, `${k}h${j}`)}</th>)}</tr>
            </thead>
            <tbody>
              {corpo.map((l, r) => (
                <tr key={r} className="border-t border-base-border align-top">
                  {celulas(l).map((c, j) => <td key={j} className="px-3 py-2 text-ink-2">{enfeitar(c, `${k}${r}-${j}`)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }
    if (/^\s*-\s+/.test(linha) || /^\d+\.\s/.test(linha)) {
      const numerada = /^\d+\.\s/.test(linha)
      const itens: string[] = []
      while (i < linhas.length && (numerada ? /^\d+\.\s/.test(linhas[i]) : /^\s*-\s+/.test(linhas[i]))) {
        itens.push(linhas[i].replace(numerada ? /^\d+\.\s+/ : /^\s*-\s+/, ''))
        i++
      }
      const Lista = numerada ? 'ol' : 'ul'
      blocos.push(
        <Lista key={k} className={`my-2 space-y-1 pl-6 text-sm leading-relaxed text-ink-2 ${numerada ? 'list-decimal' : 'list-disc'}`}>
          {itens.map((t, j) => <li key={j}>{enfeitar(t, `${k}-${j}`)}</li>)}
        </Lista>
      )
      continue
    }
    // paragrafo: junta linhas seguidas
    const corpo: string[] = []
    while (i < linhas.length && linhas[i].trim() && !/^(#{1,3})\s|^\s*-\s|^\||^\d+\.\s/.test(linhas[i])) corpo.push(linhas[i++].trim())
    if (!corpo.length) {
      i++
      continue
    }
    blocos.push(<p key={k} className="my-2 text-sm leading-relaxed text-ink-2">{enfeitar(corpo.join(' '), k)}</p>)
  }
  return <div className="texto-termos">{blocos}</div>
}
