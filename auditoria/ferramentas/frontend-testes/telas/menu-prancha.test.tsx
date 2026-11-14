// @vitest-environment jsdom
//
// COMPONENTE "Prancha com informacoes" (Fase 2, 13/11/2026):
// frontend/src/components/impressao/MenuPrancha.tsx - a folha A4 com as
// imagens a esquerda e os dados a direita, para baixar (PDF, PNG, ZIP),
// imprimir ou enviar por e-mail (para mim ou link para outras pessoas).
// Confere o pedido enviado ao servidor (imagens, numeros, por folha, campos),
// os limites (30 por prancha, 15 por e-mail), o arquivo baixado e os erros.
// O navegador simulado nao baixa nem imprime de verdade: o "clique" no link
// de download e a janela de impressao sao apenas observados.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MenuPrancha, { BotaoComPrancha, DialogoPrancha } from '../../../../frontend/src/components/impressao/MenuPrancha'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const itens = (n: number, base = 100) => Array.from({ length: n }, (_, i) => ({ curation_id: base + i, numero: i + 1 }))
const GRUPOS = [
  { chave: 'todas', rotulo: 'Todas as encontradas', itens: itens(3) },
  { chave: 'selecionadas', rotulo: 'Selecionadas', itens: itens(2, 200) },
]
const EU = { id: 1, nome: 'Pessoa Teste', perfil: 'estudante', email: 'eu@exemplo.test', email_sugerido: null }

const baixados: string[] = []
beforeEach(() => {
  baixados.length = 0
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    baixados.push(this.download)
  })
  URL.createObjectURL = vi.fn(() => 'blob:teste')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function abrirDialogo(extra: Record<string, Rota> = {}, grupos = GRUPOS) {
  const servidor = servidorFalso({ 'GET /auth/me': { corpo: { id: 1, perfil: 'estudante' } }, ...extra })
  const fechar = vi.fn()
  montarTela(<DialogoPrancha grupos={grupos} onFechar={fechar} />)
  return { servidor, fechar, janela: screen.getByRole('dialog', { name: 'Prancha com informações' }) }
}

describe('botao e janela', () => {
  it('sem imagens o botao fica travado; com imagens abre a janela, que fecha no ✕ e no Esc', async () => {
    const usuario = userEvent.setup()
    servidorFalso({})
    montarTela(<MenuPrancha grupos={[{ chave: 'x', rotulo: 'x', itens: [] }]} />)
    expect((screen.getByRole('button', { name: /Prancha/ }) as HTMLButtonElement).disabled).toBe(true)
    cleanup()
    montarTela(<MenuPrancha grupos={GRUPOS} soIcone />)
    await usuario.click(screen.getByRole('button', { name: 'Prancha' }))
    expect(screen.getByRole('dialog', { name: 'Prancha com informações' })).toBeTruthy()
    await usuario.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await usuario.click(screen.getByRole('button', { name: 'Prancha' }))
    await usuario.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('comeca nas selecionadas; trocar o grupo e as imagens por folha muda o resumo', async () => {
    const usuario = userEvent.setup()
    const { janela } = abrirDialogo()
    expect((within(janela).getByRole('radio', { name: 'Selecionadas (2)' }) as HTMLInputElement).checked).toBe(true)
    expect(within(janela).getByText('2 imagens em 1 folha A4')).toBeTruthy()
    await usuario.click(within(janela).getByRole('radio', { name: 'Todas as encontradas (3)' }))
    await usuario.click(within(janela).getByRole('button', { name: /1 por folha/ }))
    expect(within(janela).getByText('3 imagens em 3 folhas A4')).toBeTruthy()
    expect(within(janela).getByRole('button', { name: /1 por folha/ }).getAttribute('aria-pressed')).toBe('true')
  })
})

describe('baixar e imprimir', () => {
  it('PDF: envia imagens, numeros, por folha e campos; baixa com o nome que o servidor deu', async () => {
    const usuario = userEvent.setup()
    const { servidor, janela } = abrirDialogo({
      'POST /prancha/arquivo': { corpo: {}, cabecalhos: { 'content-disposition': "attachment; filename*=UTF-8''prancha%20aula.pdf" } },
    })
    await usuario.click(within(janela).getByRole('checkbox', { name: 'Descrição' })) // tira a descricao
    await usuario.click(within(janela).getByRole('checkbox', { name: 'Marcações do curador desenhadas na imagem' }))
    await usuario.click(within(janela).getByRole('button', { name: /PDF/ }))
    expect(await within(janela).findByText('Prancha baixada.')).toBeTruthy()
    expect(servidor.alteracoes()[0].corpo).toEqual({
      curation_ids: [200, 201],
      numeros: [1, 2],
      por_folha: 2,
      com_informacoes: true,
      campos: ['tipo', 'regiao', 'achados', 'marcadores'],
      com_marcacoes: false,
      formato: 'pdf',
    })
    expect(baixados).toEqual(['prancha aula.pdf'])
  })

  it('PNG sem dados ao lado: avisa que a imagem ocupa a largura toda; nome padrao quando o servidor nao manda', async () => {
    const usuario = userEvent.setup()
    const { servidor, janela } = abrirDialogo({ 'POST /prancha/arquivo': { corpo: {} } })
    for (const c of ['Tipo e qualidade', 'Região (dentes)', 'Achados', 'Descrição', 'Lista de marcadores']) {
      await usuario.click(within(janela).getByRole('checkbox', { name: c }))
    }
    expect(within(janela).getByText('Sem dados: a imagem ocupa a largura toda.')).toBeTruthy()
    await usuario.click(within(janela).getByRole('button', { name: /PNG/ }))
    await within(janela).findByText('Prancha baixada.')
    expect(servidor.alteracoes()[0].corpo).toMatchObject({ com_informacoes: false, campos: [], formato: 'png' })
    expect(baixados).toEqual(['radix-imago-prancha-2-imagens.png'])
  })

  it('imprimir: abre a impressao numa moldura escondida e avisa', async () => {
    const usuario = userEvent.setup()
    const { janela } = abrirDialogo({ 'POST /prancha/arquivo': { corpo: {} } })
    await usuario.click(within(janela).getByRole('button', { name: /Imprimir/ }))
    expect(await within(janela).findByText(/Janela de impressão aberta/)).toBeTruthy()
    expect(document.querySelector('iframe')?.getAttribute('src')).toBe('blob:teste')
  })

  it.each([
    ['recusa com motivo', { status: 400, corpo: { detail: 'Imagem sem permissão.' } }, 'Imagem sem permissão.'],
    ['sem conexao', 'SEM_CONEXAO' as const, 'Não foi possível gerar a prancha. Tente de novo.'],
  ])('erro ao gerar (%s): avisa e os botoes voltam', async (_caso, resposta, mensagem) => {
    const usuario = userEvent.setup()
    const { janela } = abrirDialogo({ 'POST /prancha/arquivo': resposta })
    await usuario.click(within(janela).getByRole('button', { name: /PDF/ }))
    expect((await within(janela).findByRole('alert')).textContent).toBe(mensagem)
    expect((within(janela).getByRole('button', { name: /PDF/ }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('ZIP: baixa cada imagem e junta um .txt com os dados; avisa as que falharam', async () => {
    const usuario = userEvent.setup()
    const { servidor, janela } = abrirDialogo({
      'GET /search/200/preview': { corpo: {} },
      'GET /search/201/preview': { status: 404 },
    })
    await usuario.click(within(janela).getByRole('button', { name: /ZIP/ }))
    expect(await within(janela).findByText('ZIP salvo, mas 1 imagem(ns) não puderam ser baixadas.')).toBeTruthy()
    expect(servidor.pedidos.filter((p) => p.caminho.includes('/preview')).map((p) => p.caminho).sort()).toEqual(['/search/200/preview', '/search/201/preview'])
    expect(baixados[0]).toMatch(/^radix-imago-2-imagens-\d{4}-\d{2}-\d{2}\.zip$/)
  })

  it('mais de 30 imagens: avisa o limite e trava PDF/PNG/imprimir/e-mail (o ZIP continua)', () => {
    const { janela } = abrirDialogo({}, [{ chave: 'todas', rotulo: 'Todas', itens: itens(31) }])
    expect(within(janela).getByText('Escolha no máximo 30 imagens por prancha.')).toBeTruthy()
    for (const nome of [/PDF/, /PNG/, /Imprimir/, /E-mail/]) expect((within(janela).getByRole('button', { name: nome }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(janela).getByRole('button', { name: /ZIP/ }) as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('enviar por e-mail', () => {
  it('para mim: confirma mostrando o e-mail e envia o PDF; a confirmacao fecha', async () => {
    const usuario = userEvent.setup()
    const { servidor, janela } = abrirDialogo({
      'GET /prancha/destinatarios': { corpo: { proprio: EU, outros: [] } },
      'POST /prancha/email': { corpo: { mensagem: 'Prancha enviada para eu@exemplo.test.' } },
    })
    await usuario.click(within(janela).getByRole('button', { name: /E-mail/ }))
    const confirmar = await within(janela).findByRole('group', { name: 'Confirmar o envio por e-mail' })
    expect(confirmar.textContent).toContain('eu@exemplo.test')
    expect(confirmar.textContent).toContain('Anexo: 1 PDF com 2 imagem(ns) em 1 folha(s).')
    await usuario.click(within(confirmar).getByRole('button', { name: 'Confirmar envio' }))
    expect(await within(janela).findByText('Prancha enviada para eu@exemplo.test.')).toBeTruthy()
    expect(servidor.alteracoes()[0]).toMatchObject({ caminho: '/prancha/email', corpo: { curation_ids: [200, 201], formato: 'pdf' } })
    expect(within(janela).queryByRole('group', { name: 'Confirmar o envio por e-mail' })).toBeNull()
  })

  it('e-mail com cara de erro de digitacao: alerta antes de enviar; mais de 15 imagens nao vai', async () => {
    const usuario = userEvent.setup()
    const { janela } = abrirDialogo(
      { 'GET /prancha/destinatarios': { corpo: { proprio: { ...EU, email: 'eu@hotmai.com' }, outros: [] } } },
      [{ chave: 'todas', rotulo: 'Todas', itens: itens(16) }]
    )
    expect(within(janela).getByText('Por e-mail, até 15 imagens por prancha.')).toBeTruthy()
    await usuario.click(within(janela).getByRole('button', { name: /E-mail/ }))
    const confirmar = await within(janela).findByRole('group', { name: 'Confirmar o envio por e-mail' })
    expect(within(confirmar).getByRole('alert').textContent).toMatch(/hotmail\.com/)
    expect((within(confirmar).getByRole('button', { name: 'Confirmar envio' }) as HTMLButtonElement).disabled).toBe(true)
    await usuario.click(within(confirmar).getByRole('button', { name: 'Cancelar' }))
    expect(within(janela).queryByRole('group', { name: 'Confirmar o envio por e-mail' })).toBeNull()
  })

  it('para outras pessoas: escolher quem recebe (busca), recado, e envia o link', async () => {
    const usuario = userEvent.setup()
    const { servidor, janela } = abrirDialogo({
      'GET /prancha/destinatarios': { corpo: { proprio: EU, outros: [] } },
      'GET /prancha/pessoas?*': { corpo: { pessoas: [{ id: 33, nome: 'Colega Teste', perfil: 'estudante', email: 'colega@exemplo.test' }] } },
      'POST /prancha/enviar': { corpo: { mensagem: 'Link enviado para 1 pessoa.' } },
    })
    await usuario.click(within(janela).getByRole('button', { name: /E-mail/ }))
    await usuario.click(await within(janela).findByRole('radio', { name: 'Para outras pessoas (link com login)' }))
    const enviar = within(janela).getByRole('button', { name: 'Enviar link' }) as HTMLButtonElement
    expect(enviar.disabled).toBe(true) // ninguem escolhido
    await usuario.type(within(janela).getByRole('textbox', { name: /Pessoas/ }), 'Col')
    await usuario.click(await within(janela).findByRole('button', { name: /Colega Teste/ }))
    await usuario.type(within(janela).getByRole('textbox', { name: /Recado/ }), ' Para a aula. ')
    await usuario.click(enviar)
    expect(await within(janela).findByText('Link enviado para 1 pessoa.')).toBeTruthy()
    expect(servidor.alteracoes()[0]).toMatchObject({ caminho: '/prancha/enviar', corpo: { pessoas: [33], grupos: [], recado: 'Para a aula.' } })
  })

  it.each([
    ['destinatarios nao carregam', { 'GET /prancha/destinatarios': { status: 500, corpo: { detail: 'Serviço de e-mail desligado.' } } }, 'Serviço de e-mail desligado.'],
    ['envio recusado', { 'GET /prancha/destinatarios': { corpo: { proprio: EU, outros: [] } }, 'POST /prancha/email': { status: 429, corpo: { detail: 'Limite de envios.' } } }, 'Limite de envios.'],
  ])('erro (%s): mostra o motivo', async (_caso, rotas, mensagem) => {
    const usuario = userEvent.setup()
    const { janela } = abrirDialogo(rotas as Record<string, Rota>)
    await usuario.click(within(janela).getByRole('button', { name: /E-mail/ }))
    const botao = within(janela).queryByRole('button', { name: 'Confirmar envio' })
    if (botao) await usuario.click(await within(janela).findByRole('button', { name: 'Confirmar envio' }))
    await waitFor(() => expect(within(janela).getByRole('alert').textContent).toBe(mensagem))
  })
})

describe('menu "Enviar por e-mail" com a prancha (BotaoComPrancha)', () => {
  it('abre o menu; "a acao de sempre" e a prancha; clicar fora fecha', async () => {
    const usuario = userEvent.setup()
    servidorFalso({})
    const acao = vi.fn()
    montarTela(
      <div>
        <p>fora</p>
        <BotaoComPrancha rotulo="✉ E-mail" rotuloAcao="Enviar esta imagem" onAcao={acao} modo="email" grupos={GRUPOS} className="" />
      </div>
    )
    await usuario.click(screen.getByRole('button', { name: /✉ E-mail/ }))
    await usuario.click(screen.getByRole('button', { name: 'Enviar esta imagem' }))
    expect(acao).toHaveBeenCalledTimes(1)
    await usuario.click(screen.getByRole('button', { name: /✉ E-mail/ }))
    await usuario.click(screen.getByRole('button', { name: /Enviar prancha por e-mail/ }))
    expect(screen.getByRole('dialog', { name: 'Prancha com informações' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /PDF/ })).toBeNull() // modo e-mail: so o e-mail
    await usuario.click(screen.getByRole('button', { name: 'Fechar' }))
    await usuario.click(screen.getByRole('button', { name: /✉ E-mail/ }))
    await usuario.click(screen.getByText('fora'))
    expect(screen.queryByRole('button', { name: 'Enviar esta imagem' })).toBeNull()
  })
})
