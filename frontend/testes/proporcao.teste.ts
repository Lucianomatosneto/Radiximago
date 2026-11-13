// Bloco A (SonarCloud S6439, 12/11/2026): com proporcao 0 a tela nao pode
// mostrar um "0" solto. Rodar: npx tsx testes/proporcao.teste.ts
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { proporcaoValida } from '../src/lib/proporcao'

let falhas = 0
const ok = (nome: string, v: boolean) => { if (!v) falhas++; console.log(v ? 'OK  ' : 'FALHA', nome) }

ok('0 nao e valida', proporcaoValida(0) === false)
ok('undefined nao e valida', proporcaoValida(undefined) === false)
ok('null nao e valida', proporcaoValida(null) === false)
ok('false nao e valida', proporcaoValida(false) === false)
ok('NaN nao e valida', proporcaoValida(Number.NaN) === false)
ok('Infinity nao e valida', proporcaoValida(Number.POSITIVE_INFINITY) === false)
ok('negativa nao e valida', proporcaoValida(-1.5) === false)
ok('1,33 e valida', proporcaoValida(4 / 3) === true)
ok('0,75 e valida', proporcaoValida(0.75) === true)

// o mesmo trecho da tela, montado de verdade pelo React
const camada = createElement('div', { 'data-camada': 'sim' })
function tela(mostrando: boolean, proporcao: number | undefined) {
  return renderToStaticMarkup(createElement(Fragment, null, mostrando && proporcaoValida(proporcao) && camada))
}
function telaAntiga(mostrando: boolean, proporcao: number | undefined) {
  return renderToStaticMarkup(createElement(Fragment, null, mostrando && proporcao && camada))
}
ok('jeito antigo mostrava "0" (prova do defeito)', telaAntiga(true, 0) === '0')
ok('com proporcao 0 nada aparece', tela(true, 0) === '')
ok('sem proporcao nada aparece', tela(true, undefined) === '')
ok('marcacoes desligadas: nada aparece', tela(false, 1.5) === '')
ok('com proporcao valida a camada aparece', tela(true, 1.5) === '<div data-camada="sim"></div>')

process.exit(falhas ? 1 : 0)
