// @vitest-environment jsdom
//
// COMPONENTE "Painel do parecer" da Segunda opiniao (Fase 2, 13/11/2026):
// frontend/src/components/segundaOpiniao/PainelParecer.tsx. A tela (Fase 1)
// ja cobre o clique; aqui: o TECLADO do holofote (↑/↓, 1/2/3, Enter,
// Ctrl+Enter), dentes propostos invalidos, texto longo ("ver tudo") e a
// avaliacao geral sugerida a partir das anotacoes.
import { useState } from 'react'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import PainelParecer from '../../../../frontend/src/components/segundaOpiniao/PainelParecer'
import type { AnotacaoRascunho, Classificacao, ItemFicha } from '../../../../frontend/src/components/segundaOpiniao/tipos'
import { montarTela } from './apoio/montar'

const ITENS: ItemFicha[] = [
  { chave: 'tipo_radiografia', rotulo: 'Tipo de radiografia', valor: 'Periapical', tipo: 'valor', grupo: 'dados', opcoes: ['periapical', 'panoramica'] },
  { chave: 'dentes', rotulo: 'Dentes (FDI)', valor: '36', tipo: 'dentes', grupo: 'dados' },
  { chave: 'descricao_didatica', rotulo: 'Descrição didática', valor: 'Texto longo de teste. '.repeat(10), tipo: 'texto', grupo: 'textos' },
]

const estado: { rascunho: Record<string, AnotacaoRascunho>; classificacao: Classificacao | null; etapa: number } = { rascunho: {}, classificacao: null, etapa: 0 }
function Dono({ somenteLeitura = false }: { somenteLeitura?: boolean }) {
  const [rascunho, setRascunho] = useState<Record<string, AnotacaoRascunho>>({})
  const [classificacao, setClassificacao] = useState<Classificacao | null>(null)
  const [parecer, setParecer] = useState('')
  const [etapa, setEtapa] = useState(0)
  Object.assign(estado, { rascunho, classificacao, etapa })
  return (
    <PainelParecer
      itens={ITENS}
      rascunho={rascunho}
      onRascunho={(chave, v) => setRascunho((r) => ({ ...r, [chave]: v }))}
      classificacao={classificacao}
      onClassificacao={setClassificacao}
      parecer={parecer}
      onParecer={setParecer}
      somenteLeitura={somenteLeitura}
      etapa={etapa}
      onEtapa={setEtapa}
    />
  )
}
const tecla = (key: string, extra: object = {}) => fireEvent.keyDown(window, { key, ...extra })
const sugerida = () => within(screen.getByRole('radiogroup', { name: 'Avaliação geral' })).getByText('sugerida').closest('button')?.textContent

afterEach(cleanup)

describe('teclado do holofote', () => {
  it('1 = concordo e passa; 2 = ajustar fica no item ate ter explicacao; Enter so passa com a explicacao', async () => {
    const usuario = userEvent.setup()
    montarTela(<Dono />)
    tecla('1')
    expect(estado.etapa).toBe(1)
    tecla('2')
    expect(estado.rascunho.dentes.avaliacao).toBe('ajustar')
    expect(estado.etapa).toBe(1)
    expect(screen.getByText('Escreva a anotação (ou proponha um valor) para este item.')).toBeTruthy()
    tecla('Enter') // sem explicacao: nao passa
    expect(estado.etapa).toBe(1)
    await usuario.type(screen.getByRole('textbox', { name: /^Dentes propostos \(FDI\)/ }), '36, 99')
    expect(screen.getByText('Use números FDI de 11 a 48, separados por vírgula.')).toBeTruthy()
    expect((screen.getByRole('button', { name: /Próximo item/ }) as HTMLButtonElement).disabled).toBe(true)
    await usuario.clear(screen.getByRole('textbox', { name: /^Dentes propostos \(FDI\)/ }))
    await usuario.type(screen.getByRole('textbox', { name: /^Dentes propostos \(FDI\)/ }), '36, 37')
    ;(document.activeElement as HTMLElement).blur()
    tecla('Enter')
    expect(estado.etapa).toBe(2)
  })

  it('3 = discordo; a avaliacao geral sugerida vira "Discordância importante"; 1/2/3 no fim escolhem a geral', () => {
    montarTela(<Dono />)
    expect(sugerida()).toMatch(/^1Concordo/)
    tecla('3')
    expect(estado.rascunho.tipo_radiografia.avaliacao).toBe('discordo')
    expect(sugerida()).toMatch(/Discordância importante/)
    tecla('ArrowDown')
    tecla('ArrowDown')
    tecla('ArrowDown')
    expect(estado.etapa).toBe(3) // avaliacao geral
    tecla('2')
    expect(estado.classificacao).toBe('discordancia_menor')
    expect(estado.etapa).toBe(4)
    tecla('ArrowUp')
    expect(estado.etapa).toBe(3)
  })

  it('Ctrl+Enter passa adiante mesmo de dentro da caixa de texto', async () => {
    const usuario = userEvent.setup()
    montarTela(<Dono />)
    tecla('2')
    await usuario.type(screen.getByRole('textbox', { name: 'Sua anotação' }), 'Rever.')
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Sua anotação' }), { key: 'Enter', ctrlKey: true })
    expect(estado.etapa).toBe(1)
  })

  it('so leitura (pedido feito por mim): teclas e cliques nao mudam nada', async () => {
    const usuario = userEvent.setup()
    montarTela(<Dono somenteLeitura />)
    tecla('3')
    tecla('ArrowDown')
    expect(estado.rascunho).toEqual({})
    expect(estado.etapa).toBe(0)
    expect(screen.getByText(/Você pediu esta segunda opinião/)).toBeTruthy()
    const concordo = within(screen.getByRole('radiogroup', { name: 'Avaliação geral' })).getAllByRole('radio')[0] as HTMLButtonElement
    expect(concordo.disabled).toBe(true)
    await usuario.click(concordo)
    expect(estado.classificacao).toBeNull()
  })
})

describe('itens', () => {
  it('texto longo: "ver tudo" / "ver menos"', async () => {
    const usuario = userEvent.setup()
    montarTela(<Dono />)
    fireEvent.click(screen.getByText('Descrição didática')) // acende o item
    await usuario.click(screen.getByRole('button', { name: 'ver tudo' }))
    expect(screen.getByRole('button', { name: 'ver menos' })).toBeTruthy()
  })

  it('item de texto: "Ajustar" pede o texto sugerido; clicar num item apagado so o acende', async () => {
    const usuario = userEvent.setup()
    montarTela(<Dono />)
    const descricao = screen.getByRole('radiogroup', { name: 'Avaliar: Descrição didática' })
    await usuario.click(within(descricao).getByRole('radio', { name: 'Ajustar' }))
    expect(estado.etapa).toBe(2) // so acendeu
    expect(estado.rascunho.descricao_didatica).toBeUndefined()
    await usuario.click(within(descricao).getByRole('radio', { name: 'Ajustar' }))
    expect(screen.getByRole('textbox', { name: 'Texto sugerido (será juntado ao do curador)' })).toBeTruthy()
    expect(screen.getByText('1 de 3 com anotação')).toBeTruthy()
    expect(sugerida()).toMatch(/Discordância menor/)
  })
})
