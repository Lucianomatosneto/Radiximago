// @vitest-environment jsdom
//
// COMPONENTE "Informacoes adicionais e anexos" (Fase 3b):
// frontend/src/components/anexos/AnexosCuradoria.tsx.
// - No editor da Curadoria (InformacoesAdicionaisFicha): ligar a caixa,
//   escrever, anexar imagens (uma ou varias, limite, recusa, sem conexao),
//   remover, ampliar e fechar com Esc.
// - Na imagem curada (BotaoAnexosImagem): o clipe so aparece se houver
//   texto ou anexos; abre a janela, amplia o anexo e fecha.
// Anexos inventados (texto com nome .png); o navegador simulado nao desenha.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BotaoAnexosImagem, InformacoesAdicionaisFicha } from '../../../../frontend/src/components/anexos/AnexosCuradoria'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const anexo = (id: number, nome = `anexo-${id}.png`) => ({ id, nome, tipo: 'image/png', tamanho: 1000, largura: 10, altura: 10 })
const estado = { texto: '' }
function Dono({ inicial = '' }: { inicial?: string }) {
  const [texto, setTexto] = useState(inicial)
  estado.texto = texto
  return <InformacoesAdicionaisFicha curationId={7} texto={texto} onTexto={setTexto} />
}
const LISTA = 'GET /curation/7/anexos'
const ARQUIVO = 'GET /curation/7/anexos/*'
const caixa = () => screen.getByRole('checkbox', { name: /Informações adicionais/ }) as HTMLInputElement
const clipe = () => screen.getByRole('button', { name: 'Anexar imagem' }) as HTMLButtonElement
const entrada = () => document.querySelector('input[type="file"]') as HTMLInputElement
const png = (nome: string) => new File(['imagem de teste'], nome, { type: 'image/png' })

beforeEach(() => {
  estado.texto = ''
  URL.createObjectURL = vi.fn(() => 'blob:anexo')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => cleanup())

describe('editor da curadoria', () => {
  it('sem texto nem anexos: caixa desligada; ligar mostra os avisos e escrever atualiza a ficha', async () => {
    const usuario = userEvent.setup()
    servidorFalso({ [LISTA]: { corpo: { anexos: [], maximo: 10 } } })
    montarTela(<Dono />)
    expect(caixa().checked).toBe(false)
    expect(screen.queryByRole('textbox')).toBeNull()
    await usuario.click(caixa())
    expect(screen.getByText(/NÃO aparece como opção de procura na Busca avançada/)).toBeTruthy()
    expect(screen.getByText(/os anexos não passam pela anonimização automática/)).toBeTruthy()
    await usuario.type(screen.getByRole('textbox', { name: 'Informações adicionais' }), 'Caso de aula')
    expect(estado.texto).toBe('Caso de aula')
    // com conteudo, nao da para desligar
    expect(caixa().disabled).toBe(true)
    expect(caixa().title).toBe('Apague o texto e os anexos para desligar')
  })

  it('ficha que ja tem anexos: abre ligada e mostra cada anexo (miniatura carregada ou ✕ se falhar)', async () => {
    servidorFalso({
      [LISTA]: { corpo: { anexos: [anexo(1), anexo(2)], maximo: 10 } },
      'GET /curation/7/anexos/1/arquivo': { corpo: {} },
      'GET /curation/7/anexos/2/arquivo': { status: 404 },
    })
    montarTela(<Dono />)
    await waitFor(() => expect(caixa().checked).toBe(true))
    expect(screen.getByText('📎 2')).toBeTruthy()
    expect((await screen.findByRole('img', { name: 'anexo-1.png' })).getAttribute('src')).toBe('blob:anexo')
    expect(await screen.findByText('✕')).toBeTruthy()
  })

  it('texto ja escrito: abre ligada mesmo se a lista de anexos falhar', async () => {
    servidorFalso({ [LISTA]: 'SEM_CONEXAO' })
    montarTela(<Dono inicial="Texto antigo" />)
    expect(caixa().checked).toBe(true)
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Texto antigo')
  })

  it('anexar varias imagens manda uma por vez e mostra cada uma', async () => {
    const usuario = userEvent.setup()
    let proximo = 10
    const s = servidorFalso({
      [LISTA]: { corpo: { anexos: [], maximo: 10 } },
      'POST /curation/7/anexos': (p) => ({ status: 201, corpo: anexo(proximo++, String((p.corpo as { arquivo: string }).arquivo).split(':')[1]) }),
      [ARQUIVO]: { corpo: {} },
    })
    montarTela(<Dono />)
    await usuario.click(caixa())
    await usuario.upload(entrada(), [png('a.png'), png('b.png')])
    expect(await screen.findByRole('img', { name: 'b.png' })).toBeTruthy()
    expect(s.alteracoes().map((p) => p.corpo)).toEqual([{ arquivo: 'arquivo:a.png:image/png' }, { arquivo: 'arquivo:b.png:image/png' }])
    expect(entrada().value).toBe('')
  })

  it('recusa do servidor para no arquivo recusado e mostra o motivo com o nome', async () => {
    const usuario = userEvent.setup()
    let n = 0
    const s = servidorFalso({
      [LISTA]: { corpo: { anexos: [], maximo: 10 } },
      'POST /curation/7/anexos': () => (++n === 1 ? { status: 413, corpo: { detail: 'Arquivo maior que 10 MB.' } } : { status: 201, corpo: anexo(3) }),
    })
    montarTela(<Dono />)
    await usuario.click(caixa())
    await usuario.upload(entrada(), [png('grande.png'), png('outro.png')])
    expect((await screen.findByRole('alert')).textContent).toBe('grande.png: Arquivo maior que 10 MB.')
    expect(s.alteracoes()).toHaveLength(1) // o segundo nem foi enviado
  })

  it('recusa sem motivo e sem conexao: mensagens padrao', async () => {
    const usuario = userEvent.setup()
    let resposta: Rota = { status: 500 }
    servidorFalso({ [LISTA]: { corpo: { anexos: [], maximo: 10 } }, 'POST /curation/7/anexos': () => resposta as never })
    montarTela(<Dono />)
    await usuario.click(caixa())
    await usuario.upload(entrada(), png('x.png'))
    expect((await screen.findByRole('alert')).textContent).toBe('x.png: Não foi possível anexar a imagem.')
    resposta = 'SEM_CONEXAO'
    await usuario.upload(entrada(), png('y.png'))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Não foi possível anexar a imagem.'))
    fireEvent.change(entrada(), { target: { files: [] } }) // nada escolhido: nada acontece
  })

  it('no limite de anexos o clipe fica desligado e explica o limite', async () => {
    servidorFalso({ [LISTA]: { corpo: { anexos: [anexo(1), anexo(2)], maximo: 2 } }, [ARQUIVO]: { corpo: {} } })
    montarTela(<Dono />)
    await waitFor(() => expect(clipe().disabled).toBe(true))
    expect(clipe().title).toBe('Limite de 2 anexos por imagem')
  })

  it('remover: tira da lista; se falhar, avisa e mantem', async () => {
    const usuario = userEvent.setup()
    let resposta: Rota = { status: 500 }
    servidorFalso({ [LISTA]: { corpo: { anexos: [anexo(1)], maximo: 10 } }, [ARQUIVO]: { corpo: {} }, 'DELETE /curation/7/anexos/1': () => resposta as never })
    montarTela(<Dono />)
    const remover = await screen.findByRole('button', { name: 'Remover anexo-1.png' })
    await usuario.click(remover)
    expect((await screen.findByRole('alert')).textContent).toBe('Não foi possível remover o anexo.')
    resposta = { status: 204 }
    await usuario.click(remover)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remover anexo-1.png' })).toBeNull())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('clicar no anexo amplia; Esc e clique fecham', async () => {
    const usuario = userEvent.setup()
    servidorFalso({ [LISTA]: { corpo: { anexos: [anexo(1)], maximo: 10 } }, [ARQUIVO]: { corpo: {} } })
    montarTela(<Dono />)
    await usuario.click(await screen.findByRole('img', { name: 'anexo-1.png' }))
    expect(screen.getByRole('dialog', { name: 'anexo-1.png' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    await usuario.click(screen.getByRole('img', { name: 'anexo-1.png' }))
    await usuario.click(screen.getByRole('dialog'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('clipe na imagem curada', () => {
  const ROTA = 'GET /search/9/anexos'

  it.each([
    ['sem texto nem anexos', { corpo: { informacoes_adicionais: '  ', anexos: [] } } as Rota],
    ['erro do servidor', { status: 500 } as Rota],
    ['sem conexao', 'SEM_CONEXAO' as Rota],
  ])('%s: o clipe nao aparece', async (_n, rota) => {
    const s = servidorFalso({ [ROTA]: rota })
    montarTela(<BotaoAnexosImagem curationId={9} />)
    await waitFor(() => expect(s.pedidos.length).toBeGreaterThan(0))
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.queryByRole('button', { name: /Anexos/ })).toBeNull()
  })

  it('com texto e anexos: abre a janela, amplia um anexo, Esc fecha a ampliacao e depois a janela', async () => {
    const usuario = userEvent.setup()
    servidorFalso({
      [ROTA]: { corpo: { informacoes_adicionais: 'Caso usado na aula 3.', anexos: [anexo(4, 'corte.png')] } },
      'GET /search/9/anexos/4/arquivo': { corpo: {} },
    })
    montarTela(<BotaoAnexosImagem curationId={9} />)
    const botao = await screen.findByRole('button', { name: /Anexos/ })
    expect(botao.textContent).toContain('1')
    expect(botao.title).toBe('Ver informações adicionais e anexos desta imagem')
    await usuario.click(botao)
    const janela = screen.getByRole('dialog', { name: 'Informações adicionais' })
    expect(janela.textContent).toContain('Caso usado na aula 3.')
    await usuario.click(await within(janela).findByRole('img', { name: 'corte.png' }))
    expect(screen.getByRole('dialog', { name: 'corte.png' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' }) // fecha so a ampliacao
    expect(screen.queryByRole('dialog', { name: 'corte.png' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Informações adicionais' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('so texto: o clipe aparece sem numero; "×" e clique fora fecham', async () => {
    const usuario = userEvent.setup()
    servidorFalso({ [ROTA]: { corpo: { informacoes_adicionais: 'Só texto.', anexos: [] } } })
    montarTela(<BotaoAnexosImagem curationId={9} />)
    const botao = await screen.findByRole('button', { name: /Anexos/ })
    expect(botao.textContent?.replace(/\s/g, '')).toBe('📎Anexos')
    await usuario.click(botao)
    await usuario.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await usuario.click(botao)
    await usuario.click(screen.getByRole('presentation'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
