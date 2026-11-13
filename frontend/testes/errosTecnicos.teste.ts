// Formas de busca dos erros tecnicos (lib/errosTecnicos.ts), 13/11/2026.
// Cada "forma" e como o curador pode falar: minuscula, sem acento e sem digitos.
// O teste foi criado depois que a forma 'ring-3 artifact' (erro de digitacao
// de 'ring artifact') passou despercebida.
// Rodar dentro da pasta frontend:  npx tsx testes/errosTecnicos.teste.ts
import { ERROS_TECNICOS, errosParaTipo } from '../src/lib/errosTecnicos'
import { caso, terminar } from './apoio/repositorio'

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

const formas = ERROS_TECNICOS.flatMap((e) => e.formas.map((f) => ({ valor: e.valor, forma: f })))

caso('todo erro tem ao menos uma forma de busca', ERROS_TECNICOS.every((e) => e.formas.length > 0))
caso('formas em minuscula', formas.every(({ forma }) => forma === forma.toLowerCase()))
caso('formas sem acento', formas.every(({ forma }) => forma === semAcento(forma)))
caso('formas sem digitos (pega erros como "ring-3 artifact")', formas.every(({ forma }) => !/\d/.test(forma)))
caso('formas sem espacos sobrando', formas.every(({ forma }) => forma === forma.trim() && !/\s{2,}/.test(forma)))

const anel = ERROS_TECNICOS.find((e) => e.valor === 'tc_artefato_anel')
caso('artefato em anel: aceita "ring artifact"', !!anel && anel.formas.includes('ring artifact'))
caso('artefato em anel: nao tem a forma errada "ring-3 artifact"', !!anel && !anel.formas.includes('ring-3 artifact'))
caso('artefato em anel so aparece na tomografia', errosParaTipo('tomografia').some((e) => e.valor === 'tc_artefato_anel') && !errosParaTipo('panoramica').some((e) => e.valor === 'tc_artefato_anel'))

terminar()
