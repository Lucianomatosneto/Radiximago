// @vitest-environment jsdom
//
// TOMOGRAFIA COMO UM ITEM SO (Parte B, 18/11/2026):
// - fila (FilaCuradoriaHorizontal): o exame em volume aparece uma vez, com
//   o selo "TC · N" (N = cortes); radiografias sem selo;
// - aviso da ficha (AvisoTextoNaImagem): explica que a ficha vale para o
//   exame inteiro e que a verificacao de texto olhou todos os cortes.
import { cleanup, screen } from '@testing-library/react'
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
  it('tomografia sem texto: explica que a ficha vale para o exame inteiro', () => {
    montarTela(<AvisoTextoNaImagem situacao="sem_texto" regioes={null} cortes={3} />)
    expect(screen.getByText('Tomografia com 3 cortes.')).toBeTruthy()
    expect(screen.getByText(/A ficha vale para o exame inteiro/)).toBeTruthy()
  })

  it('tomografia tarjada: o aviso diz que todos os cortes foram verificados', () => {
    montarTela(<AvisoTextoNaImagem situacao="tarjado" regioes={2} cortes={3} />)
    expect(screen.getByRole('alert').textContent).toMatch(/Verificação feita nos 3 cortes do exame/)
  })

  it('radiografia sem texto continua sem aviso', () => {
    const { container } = montarTela(<AvisoTextoNaImagem situacao="sem_texto" regioes={null} />)
    expect(container.textContent).toBe('')
  })
})
