// Ordem do botao de tema. Rodar: npx tsx testes/tema.teste.ts
import { proximaPreferencia } from '../src/lib/tema'
let falhas = 0
const ok = (nome: string, v: boolean) => { if (!v) falhas++; console.log(v ? 'OK  ' : 'FALHA', nome) }
ok('auto (sistema escuro) -> claro', proximaPreferencia('auto', 'dark') === 'light')
ok('claro -> escuro', proximaPreferencia('light', 'dark') === 'dark')
ok('escuro -> auto', proximaPreferencia('dark', 'dark') === 'auto')
ok('auto (sistema claro) -> escuro', proximaPreferencia('auto', 'light') === 'dark')
ok('escuro -> claro (sistema claro)', proximaPreferencia('dark', 'light') === 'light')
ok('claro -> auto (sistema claro)', proximaPreferencia('light', 'light') === 'auto')
process.exit(falhas ? 1 : 0)
