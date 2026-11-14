// @vitest-environment jsdom
//
// COMPONENTE "Etiqueta das marcacoes" - o "i" de cada imagem no visualizador
// (Fase 2, 13/11/2026): frontend/src/components/visualizador/EtiquetaMarcacoes.tsx.
// Confere os 4 jeitos de abrir a descricao da curadoria (quadro ao lado,
// flutuante ao passar o mouse, sobre a propria imagem e janela ao lado do
// cartao), ampliar/restaurar, arrastar e redimensionar, e as linhas
// "Marcação N" ligadas a imagem (destacar e isolar).
// Simulados: as notas pessoais, o compartilhar e as anotacoes recebidas
// (componentes proprios); o navegador simulado nao mede tela, entao as
// medidas sao fixadas (getBoundingClientRect).
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EtiquetaMarcacoes from '../../../../frontend/src/components/visualizador/EtiquetaMarcacoes'
import { montarTela } from './apoio/montar'

vi.mock('../../../../frontend/src/components/visualizador/NotasVisualizador', () => ({
  default: ({ onAbrir }: { onAbrir?: () => void }) => <button type="button" onClick={onAbrir}>minhas notas</button>,
}))
vi.mock('../../../../frontend/src/components/compartilhar/CompartilharImagem', () => ({
  default: ({ onAbrir }: { onAbrir?: () => void }) => <button type="button" onClick={onAbrir}>compartilhar</button>,
}))
vi.mock('../../../../frontend/src/components/compartilhar/AnotacoesCompartilhadas', () => ({
  default: () => <p>recado de quem compartilhou</p>,
}))

const ITEM = {
  numero: 3,
  tipo_radiografia: 'periapical',
  descricao_didatica: 'Lesão periapical no 36 (texto de teste).',
  marcacoes: [
    { id: 'a', tipo: 'circulo', x: 0.5, y: 0.5, raio: 0.1, achado: 'lesao_periapical' },
    { id: 'b', tipo: 'seta', x1: 0.1, y1: 0.1, x2: 0.2, y2: 0.2 },
  ],
} as Parameters<typeof EtiquetaMarcacoes>[0]['item']
const RET = { left: 10, top: 20, width: 300, height: 200 }
const botaoI = () => screen.getByRole('button', { name: /Ver a descrição da curadoria/ })

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 50, right: 420, bottom: 450, width: 320, height: 400, x: 100, y: 50, toJSON: () => ({}) } as DOMRect)
  HTMLElement.prototype.setPointerCapture = vi.fn()
  HTMLElement.prototype.releasePointerCapture = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('quadro ao lado do "i" (padrao)', () => {
  it('o "i" diz quantas marcacoes ha; clique abre a descricao e outro clique fecha', async () => {
    const usuario = userEvent.setup()
    montarTela(<EtiquetaMarcacoes item={ITEM} />)
    expect(botaoI().getAttribute('aria-label')).toBe('Ver a descrição da curadoria (2 marcações)')
    expect(botaoI().textContent).toBe('2')
    await usuario.click(botaoI())
    const quadro = screen.getByRole('tooltip')
    expect(within(quadro).getByText('Curadoria da imagem #3')).toBeTruthy()
    expect(quadro.textContent).toContain('Lesão periapical no 36 (texto de teste).')
    expect(quadro.textContent).toContain('Marcação 1')
    expect(botaoI().getAttribute('aria-expanded')).toBe('true')
    await usuario.click(botaoI())
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('sem descricao e sem contagem: avisa que ainda nao ha descricao', async () => {
    const usuario = userEvent.setup()
    montarTela(<EtiquetaMarcacoes item={{}} mostrarContagem={false} />)
    expect(botaoI().textContent).toBe('')
    await usuario.click(botaoI())
    expect(screen.getByText('Curadoria desta imagem')).toBeTruthy()
    expect(screen.getByText('Esta imagem ainda não tem descrição da curadoria.')).toBeTruthy()
  })

  it('linha "Marcação N": mouse em cima destaca, clique e Enter isolam a marcacao na imagem', async () => {
    const usuario = userEvent.setup()
    const foco = vi.fn()
    const isolar = vi.fn()
    montarTela(<EtiquetaMarcacoes item={ITEM} onFocoMarcacao={foco} onIsolarMarcacao={isolar} />)
    await usuario.click(botaoI())
    const [linha1, linha2] = within(screen.getByRole('tooltip')).getAllByRole('button')
    await usuario.hover(linha2)
    expect(foco).toHaveBeenLastCalledWith(1)
    await usuario.unhover(linha2)
    expect(foco).toHaveBeenLastCalledWith(null)
    await usuario.click(linha1)
    expect(isolar).toHaveBeenLastCalledWith(0)
    fireEvent.keyDown(linha2, { key: 'Enter' })
    expect(isolar).toHaveBeenLastCalledWith(1)
    fireEvent.keyDown(linha2, { key: 'a' }) // outra tecla nao isola
    expect(isolar).toHaveBeenCalledTimes(2)
  })

  it('arrastar a barra move o quadro; clique duplo devolve; a alca redimensiona dentro dos limites', () => {
    montarTela(<EtiquetaMarcacoes item={ITEM} />)
    fireEvent.click(botaoI())
    const quadro = screen.getByRole('tooltip')
    const barra = within(quadro).getByLabelText(/Arraste para mover o quadro/)
    fireEvent.pointerDown(barra, { button: 0, clientX: 200, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(barra, { clientX: 150, clientY: 130, pointerId: 1 })
    fireEvent.pointerUp(barra, { pointerId: 1 })
    expect(quadro.style.transform).toBe('translate(-50px, 30px)')
    fireEvent.pointerMove(barra, { clientX: 0, clientY: 0, pointerId: 1 }) // ja soltou: nao mexe
    expect(quadro.style.transform).toBe('translate(-50px, 30px)')
    fireEvent.doubleClick(barra)
    expect(quadro.style.transform).toBe('translate(0px, 0px)')

    const alca = within(quadro).getByLabelText(/Arraste para aumentar ou diminuir o quadro/)
    fireEvent.pointerDown(alca, { button: 0, clientX: 100, clientY: 450, pointerId: 2 })
    fireEvent.pointerMove(alca, { clientX: 60, clientY: 500, pointerId: 2 }) // puxa para a esquerda e para baixo
    fireEvent.pointerUp(alca, { pointerId: 2 })
    expect(quadro.style.width).toBe('360px')
    expect(quadro.style.height).toBe('450px')
    fireEvent.pointerDown(alca, { button: 0, clientX: 100, clientY: 450, pointerId: 3 })
    fireEvent.pointerMove(alca, { clientX: 5000, clientY: -5000, pointerId: 3 }) // muito pequeno: para no minimo
    expect(quadro.style.width).toBe('288px')
    expect(quadro.style.height).toBe('160px')
  })

  it('com o id da imagem: notas pessoais e compartilhar aparecem; recado de quem compartilhou tambem', async () => {
    const usuario = userEvent.setup()
    montarTela(<EtiquetaMarcacoes item={ITEM} curationId={9} compartilhamento={{} as never} />)
    await usuario.click(botaoI())
    expect(screen.getByRole('button', { name: 'minhas notas' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'compartilhar' })).toBeTruthy()
    expect(screen.getByText('recado de quem compartilhou')).toBeTruthy()
  })
})

describe('flutuante (grade): abre ao passar o mouse', () => {
  it('mouse em cima abre um quadro posicionado perto do "i"; sair fecha; clique fixa', async () => {
    const usuario = userEvent.setup()
    montarTela(<EtiquetaMarcacoes item={ITEM} flutuante curationId={9} />)
    await usuario.hover(botaoI())
    const quadro = await screen.findByRole('tooltip')
    expect(quadro.textContent).toContain('Curadoria da imagem #3')
    expect(screen.queryByRole('button', { name: 'compartilhar' })).toBeNull() // na grade, so a descricao
    await usuario.unhover(botaoI())
    expect(screen.queryByRole('tooltip')).toBeNull()
    await usuario.click(botaoI())
    await usuario.unhover(botaoI())
    expect(screen.getByRole('tooltip')).toBeTruthy()
  })
})

describe('sobre a propria imagem (visualizador) e ampliado', () => {
  it('abre do tamanho da imagem; "Ampliar" pede a metade da tela; ✕ fecha', async () => {
    const usuario = userEvent.setup()
    const ampliar = vi.fn()
    montarTela(<EtiquetaMarcacoes item={ITEM} areaPropria={() => RET} areaAmpliada={() => RET} onAmpliar={ampliar} />)
    await usuario.click(botaoI())
    const quadro = await screen.findByRole('dialog', { name: 'Curadoria da imagem #3' })
    expect([quadro.style.left, quadro.style.top, quadro.style.width, quadro.style.height]).toEqual(['10px', '20px', '300px', '200px'])
    await usuario.click(within(quadro).getByRole('button', { name: /Ampliar o quadro/ }))
    expect(ampliar).toHaveBeenCalledWith(true)
    await usuario.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Clique para fechar as informações da imagem' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('ampliado: quadro na metade da tela; "Voltar ao tamanho normal" e o "i" desfazem', async () => {
    const usuario = userEvent.setup()
    const ampliar = vi.fn()
    montarTela(<EtiquetaMarcacoes item={ITEM} ampliado areaAmpliada={() => RET} onAmpliar={ampliar} />)
    const quadro = await screen.findByRole('dialog', { name: 'Curadoria da imagem #3' })
    expect(within(quadro).getByText(/Quadro ampliado/)).toBeTruthy()
    await usuario.click(within(quadro).getByRole('button', { name: 'Voltar ao tamanho normal' }))
    expect(ampliar).toHaveBeenLastCalledWith(false)
    await usuario.click(botaoI())
    expect(ampliar).toHaveBeenLastCalledWith(false)
  })
})

describe('janela ao lado do cartao (Minhas imagens)', () => {
  it('abre ao lado, arrasta pela barra, alterna o tamanho e fecha com clique fora', async () => {
    const usuario = userEvent.setup()
    montarTela(
      <div>
        <p>fora</p>
        <div data-cartao-imagem>
          <EtiquetaMarcacoes item={ITEM} janela curationId={9} />
        </div>
      </div>
    )
    await usuario.click(botaoI())
    const janela = await screen.findByRole('dialog', { name: 'Curadoria da imagem #3' })
    expect(within(janela).getByRole('button', { name: 'compartilhar' })).toBeTruthy()
    const grande = within(janela).getByRole('button', { name: /Ampliar o quadro/ })
    await usuario.click(grande)
    expect(within(janela).getByRole('button', { name: 'Voltar ao tamanho normal' }).getAttribute('aria-pressed')).toBe('true')
    const barra = within(janela).getByLabelText(/Arraste para mover o quadro/)
    fireEvent.pointerDown(barra, { button: 0, clientX: 10, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(barra, { clientX: 30, clientY: 25, pointerId: 1 })
    fireEvent.pointerUp(barra, { clientX: 30, clientY: 25, pointerId: 1 })
    expect(screen.getByRole('dialog')).toBeTruthy() // arrastar nao fecha
    fireEvent.pointerDown(screen.getByText('fora'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
