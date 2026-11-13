// "Termo pendente" (403 do servidor enquanto a pessoa LOGADA ainda nao aceitou
// o termo de ciencia ou os Termos de Uso) nao pode ser tratado como "sem
// login". Defeito achado pelo teste no navegador com login (13/11/2026): o
// Painel do administrador mandava para o login logo depois de entrar.
// Rodar dentro da pasta frontend:  npx tsx testes/termoPendente.teste.ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { CODIGOS_TERMO_PENDENTE, termoPendente } from '../src/lib/sessao'

let falhas = 0
const caso = (nome: string, ok: boolean) => {
  if (!ok) falhas++
  console.log(ok ? 'OK  ' : 'FALHA', nome)
}
const json = (corpo: unknown, status: number) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

function lerDoBackend(arquivo: string): string {
  // funciona a partir de frontend/ (npx tsx) e da pasta do Vitest da auditoria
  let pasta = process.cwd()
  for (let i = 0; i < 8; i++) {
    const caminho = path.join(pasta, 'backend', 'app', 'modules', arquivo)
    try {
      return readFileSync(caminho, 'utf8')
    } catch {
      pasta = path.dirname(pasta)
    }
  }
  throw new Error(`backend/app/modules/${arquivo} nao encontrado`)
}

async function main() {
  caso('403 de termo de ciencia pendente e reconhecido', await termoPendente(json({ detail: 'termo_ciencia_pendente' }, 403)))
  caso('403 de Termos de Uso pendentes e reconhecido', await termoPendente(json({ detail: 'termos_uso_pendentes' }, 403)))
  caso('outro 403 (sem permissao) nao e termo pendente', !(await termoPendente(json({ detail: 'Acesso negado' }, 403))))
  caso('401 nunca e termo pendente', !(await termoPendente(json({ detail: 'termo_ciencia_pendente' }, 401))))
  caso('403 sem corpo legivel nao e termo pendente', !(await termoPendente(new Response('x', { status: 403 }))))
  const resposta = json({ detail: 'termos_uso_pendentes' }, 403)
  await termoPendente(resposta)
  caso('a conferencia nao consome a resposta (quem chamou ainda pode ler)', (await resposta.json()).detail === 'termos_uso_pendentes')
  // os codigos sao os mesmos que o backend manda
  caso('codigo do termo de ciencia = backend', lerDoBackend('termo_ciencia.py').includes(`CODIGO_PENDENTE = "${CODIGOS_TERMO_PENDENTE[0]}"`))
  caso('codigo dos Termos de Uso = backend', lerDoBackend('termos_uso.py').includes(`CODIGO_PENDENTE = "${CODIGOS_TERMO_PENDENTE[1]}"`))
}

main()
  .then(() => {
    if (falhas) process.exit(1)
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
