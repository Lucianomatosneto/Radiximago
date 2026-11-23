// @vitest-environment jsdom
//
// TOMOGRAFIA COMO UM ITEM SO (Parte B, 18/11/2026):
// - fila (FilaCuradoriaHorizontal): o exame em volume aparece uma vez, com
//   o selo "TC · N" (N = cortes); radiografias sem selo;
// - aviso da ficha (AvisoTextoNaImagem): explica que a ficha vale para o
//   exame inteiro e que a verificacao de texto olhou todos os cortes.
// 23/11/2026 (pedido do Luciano): o aviso "Confira a imagem antes de
// validar" ocupava a altura das caixas da curadoria. Agora ele APARECE AO
// ABRIR o exame, numa janela, e o curador marca que esta CIENTE de que tem
// de conferir se ha dados na imagem; depois disso o aviso some da tela.
// Sem texto achado, nada aparece (nem a faixa azul da tomografia).
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FilaCuradoriaHorizontal, { type ImagemPendente } from '../../../../frontend/src/components/curadoria/FilaCuradoriaHorizontal'
import AvisoTextoNaImagem from '../../../../frontend/src/components/curadoria/AvisoTextoNaImagem'
import { montarTela } from './apoio/montar'

vi.mock('../../../../frontend/src/components/MiniaturaFila', () => ({ default: () => null }))

afterEach(cleanup)

const item = (id: number, extra: Partial<ImagemPendente> = {}): ImagemPendente => ({
  orthanc_reference_id: id, orthanc_id: `oid-${id}`, resource_type: 'instance', dicomweb_url: null, ...extra,
})

function fila(itens: ImagemPendente[]) {
  return montarTela(
    <FilaCuradoriaHorizontal fila={itens} carregando={false} erro="" criandoId={null} onSelecionar={() => {}} />
  )
}

describe('fila de curadoria', () => {
  it('tomografia aparece com o selo de cortes; periapical sem selo', () => {
    fila([item(1, { em_volume: true, cortes: 120 }), item(2)])
    const selos = screen.getAllByText('TC · 120')
    expect(selos).toHaveLength(1)
    expect(selos[0].getAttribute('title')).toBe('Tomografia: 120 cortes, um exame só')
  })

  it('sem a informacao de volume (servidor antigo) nada muda', () => {
    fila([item(1), item(2, { em_volume: false, cortes: 1 })])
    expect(screen.queryByText(/^TC ·/)).toBeNull()
  })
})

describe('aviso da ficha', () => {
  const ciente = () => screen.getByRole('checkbox', { name: /Estou ciente/ }) as HTMLInputElement
  const continuar = () => screen.getByRole('button', { name: 'Continuar' }) as HTMLButtonElement

  it('tomografia tarjada: abre a janela de aviso; so continua depois de marcar "Estou ciente"', () => {
    const { container } = montarTela(<AvisoTextoNaImagem situacao="tarjado" regioes={2} cortes={3} chave={10} />)
    const janela = screen.getByRole('dialog', { name: 'Confira a imagem antes de validar.' })
    expect(janela.textContent).toMatch(/coberto automaticamente com tarja preta \(2 trechos\)/)
    expect(janela.textContent).toMatch(/Verificação feita nos 3 cortes do exame/)
    expect(continuar().disabled).toBe(true)
    fireEvent.click(ciente())
    expect(continuar().disabled).toBe(false)
    fireEvent.click(continuar())
    // depois de ciente, o aviso nao ocupa mais espaco na tela
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(container.textContent).toBe('')
  })

  it('outro exame (outra ficha): a janela aparece de novo', () => {
    function Troca() {
      const [chave, setChave] = useState(10)
      return (
        <>
          <button type="button" onClick={() => setChave(11)}>próxima</button>
          <AvisoTextoNaImagem situacao="nao_verificado" regioes={null} chave={chave} />
        </>
      )
    }
    montarTela(<Troca />)
    fireEvent.click(ciente())
    fireEvent.click(continuar())
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'próxima' }))
    expect(screen.getByRole('dialog').textContent).toMatch(/Não foi possível verificar automaticamente/)
  })

  it('sem texto (radiografia ou tomografia): nada aparece', () => {
    const { container } = montarTela(<AvisoTextoNaImagem situacao="sem_texto" regioes={null} cortes={3} chave={10} />)
    expect(container.textContent).toBe('')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
