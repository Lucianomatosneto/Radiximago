// @vitest-environment jsdom
//
// TOMOGRAFIA CURADA PARA QUEM ESTUDA (pedido do Luciano, 24/11/2026:
// "Lesões marcadas" e "Régua e ângulo"). Na tela da imagem aprovada
// (/visualizar/[id]), abaixo do visualizador:
// - so aparece se a imagem for tomografia (a geometria responde; 422 = nao);
// - lista "Lesões deste exame" (marcacoes com plano + corte); abre na
//   primeira lesao; cada uma leva ao corte dela;
// - o corte vem de GET /search/{id}/tomografia/plano.png, com as marcacoes
//   DAQUELE corte desenhadas por cima; planos, barra, roda e setas passam
//   os cortes; miniatura localizadora;
// - regua (mm) e angulo (graus), como na curadoria; aviso de medida duvidosa.
// frontend/src/components/detalhe/LeituraTomografia.tsx
import type { ReactNode } from 'react'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LeituraTomografia from '../../../../frontend/src/components/detalhe/LeituraTomografia'
import type { Marcacao } from '../../../../frontend/src/lib/marcacoes'
import { montarTela, servidorFalso } from './apoio/montar'

vi.mock('../../../../frontend/src/components/detalhe/CamadaMarcacoes', () => ({
  default: (p: { marcacoes: Marcacao[]; corteAberto?: boolean; children?: ReactNode }) => (
    <div data-testid="camada" data-corte-aberto={String(!!p.corteAberto)}>
      {p.marcacoes.length} marcações neste corte
    </div>
  ),
}))

const GEOMETRIA = { cortes: 200, linhas: 400, colunas: 500, espacamento_mm: [0.3, 0.3, 0.3] }
const LESAO_1: Marcacao = { id: 'm1', tipo: 'oval', x: 0.4, y: 0.2, largura: 0.2, altura: 0.2, plano: 'sagital', corte: 120, achado: 'lesao_periapical' }
const LESAO_2: Marcacao = { id: 'm2', tipo: 'seta', x1: 0.1, y1: 0.1, x2: 0.3, y2: 0.3, plano: 'axial', corte: 50 }
const RX: Marcacao = { id: 'r', tipo: 'oval', x: 0.1, y: 0.1, largura: 0.1, altura: 0.1 }

async function abrir(marcacoes: Marcacao[] = [LESAO_1, LESAO_2, RX], geometria: object = GEOMETRIA) {
  servidorFalso({ 'GET /search/7/tomografia/geometria': { corpo: geometria } })
  const tela = montarTela(<LeituraTomografia curationId={7} marcacoes={marcacoes} />)
  await screen.findByRole('img', { name: /Corte da tomografia/ })
  return tela
}
const corte = () => screen.getByRole('img', { name: /Corte da tomografia/ }).getAttribute('src') ?? ''
const caixa100 = (el: Element) => {
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

describe('quando aparece', () => {
  it('imagem que nao e tomografia (422): nada aparece', async () => {
    servidorFalso({ 'GET /search/7/tomografia/geometria': { status: 422, corpo: { detail: 'nao e tomografia' } } })
    const { container } = montarTela(<LeituraTomografia curationId={7} marcacoes={[RX]} />)
    await new Promise((r) => setTimeout(r, 20))
    expect(container.textContent).toBe('')
  })

  it('tomografia: titulo, lista das lesoes (so as com corte) e abre na primeira', async () => {
    await abrir()
    expect(screen.getByRole('heading', { name: 'Lesões deste exame' })).toBeTruthy()
    const lista = screen.getByRole('list', { name: 'Lesões deste exame' })
    expect(within(lista).getAllByRole('listitem')).toHaveLength(2)
    expect(within(lista).getByText(/Sagital · corte 121/)).toBeTruthy()
    expect(within(lista).getByText(/Lesão periapical/)).toBeTruthy()
    expect(corte()).toContain('/search/7/tomografia/plano.png?plano=sagital&indice=120')
    expect(screen.getByText('1 marcações neste corte')).toBeTruthy()
    expect(screen.getByTestId('camada').getAttribute('data-corte-aberto')).toBe('true')
  })

  it('sem lesoes marcadas: abre o axial do meio e avisa', async () => {
    await abrir([])
    expect(corte()).toContain('plano=axial&indice=100')
    expect(screen.getByText('O curador não marcou lesões nos cortes deste exame.')).toBeTruthy()
  })
})

describe('passar os cortes', () => {
  it('clicar numa lesao leva ao corte dela', async () => {
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: /Lesão 2/ }))
    expect(corte()).toContain('plano=axial&indice=50')
    expect(screen.getByRole('button', { name: /Lesão 2/ }).getAttribute('aria-current')).toBe('true')
  })

  it('planos, roda, setas, PageUp e atalhos; as marcacoes acompanham o corte', async () => {
    await abrir()
    const area = screen.getByTestId('area-leitura-tomografia')
    fireEvent.wheel(area, { deltaY: -100 })
    expect(corte()).toContain('indice=121')
    expect(screen.getByText('0 marcações neste corte')).toBeTruthy()
    fireEvent.keyDown(area, { key: 'ArrowDown' })
    expect(corte()).toContain('indice=120')
    fireEvent.keyDown(area, { key: 'PageUp' })
    expect(corte()).toContain('indice=130')
    fireEvent.click(screen.getByRole('button', { name: 'Coronal' }))
    expect(corte()).toContain('plano=coronal&indice=200')
    fireEvent.keyDown(area, { key: 'a' })
    expect(corte()).toContain('plano=axial&indice=100')
  })

  it('miniatura localizadora pela rota da pesquisa', async () => {
    await abrir()
    const mini = screen.getByRole('img', { name: /Localizador/ })
    expect(mini.getAttribute('src')).toContain('/search/7/tomografia/plano.png?plano=axial&indice=100')
  })
})

describe('medidas', () => {
  it('regua: dois cliques medem em mm (no sagital: 400 linhas x 0,3 = 120 mm de largura)', async () => {
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Régua' }))
    const camada = screen.getByTestId('camada-medida')
    caixa100(camada)
    fireEvent.click(camada, { clientX: 0, clientY: 50 })
    fireEvent.click(camada, { clientX: 50, clientY: 50 })
    expect(within(camada).getByText('60,0 mm')).toBeTruthy()
  })

  it('angulo: tres cliques', async () => {
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Ângulo' }))
    const camada = screen.getByTestId('camada-medida')
    caixa100(camada)
    fireEvent.click(camada, { clientX: 60, clientY: 40 })
    fireEvent.click(camada, { clientX: 40, clientY: 40 })
    fireEvent.click(camada, { clientX: 60, clientY: 40 })
    expect(within(camada).getByText('0,0°')).toBeTruthy()
  })

  it('medida duvidosa (campo de 51 cm): aviso', async () => {
    await abrir([LESAO_2], { cortes: 400, linhas: 512, colunas: 512, espacamento_mm: [1, 1, 1] })
    expect(screen.getByRole('note', { name: 'Medida duvidosa' }).textContent).toMatch(/51 cm/)
  })
})

// MODO DESAFIO (24/11/2026, pedido do Luciano): o estudante passa os cortes
// SEM ver as marcacoes, clica onde acha que esta cada lesao e depois o Radix
// revela a resposta do curador, dizendo quantas encontrou. Fica so na tela.
describe('modo desafio', () => {
  async function desafio() {
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Modo desafio' }))
  }

  it('esconde as marcacoes e a lista; diz quantas lesoes procurar', async () => {
    await desafio()
    expect(screen.queryByTestId('camada')).toBeNull()
    expect(screen.queryByRole('list', { name: 'Lesões deste exame' })).toBeNull()
    expect(screen.getByText('Encontre as 2 lesões marcadas pelo curador: passe os cortes e clique onde está cada uma.')).toBeTruthy()
    // abre no axial do meio (nao entrega a primeira lesao)
    expect(corte()).toContain('plano=axial&indice=100')
  })

  it('palpites, revelar e tentar de novo', async () => {
    await desafio()
    const alvo = screen.getByTestId('camada-desafio')
    caixa100(alvo)
    // lesao 2: seta no axial 50, ponta em (0,3; 0,3)
    fireEvent.change(screen.getByRole('slider', { name: 'Corte' }), { target: { value: '50' } })
    fireEvent.click(alvo, { clientX: 30, clientY: 30 })
    // um palpite longe
    fireEvent.click(alvo, { clientX: 90, clientY: 90 })
    const palpites = screen.getByRole('list', { name: 'Seus palpites' })
    expect(within(palpites).getAllByRole('listitem')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Revelar resposta' }))
    expect(screen.getByRole('status').textContent).toMatch(/Você encontrou 1 de 2 lesões/)
    // a resposta aparece: lista e marcacoes de novo
    const lista = screen.getByRole('list', { name: 'Lesões deste exame' })
    expect(within(lista).getByText(/✓/)).toBeTruthy()
    expect(within(lista).getByText(/✗/)).toBeTruthy()
    expect(screen.getByTestId('camada')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('list', { name: 'Seus palpites' })).toBeNull()
    expect(screen.queryByTestId('camada')).toBeNull()
  })

  it('no maximo lesoes + 2 palpites (nao vale clicar em tudo)', async () => {
    await desafio()
    const alvo = screen.getByTestId('camada-desafio')
    caixa100(alvo)
    for (let i = 0; i < 6; i++) fireEvent.click(alvo, { clientX: 10 + i, clientY: 10 })
    expect(within(screen.getByRole('list', { name: 'Seus palpites' })).getAllByRole('listitem')).toHaveLength(4)
    expect(screen.getByText('Você usou todos os palpites (4). Revele a resposta.')).toBeTruthy()
  })

  it('sair do modo desafio volta a mostrar tudo', async () => {
    await desafio()
    fireEvent.click(screen.getByRole('button', { name: 'Modo desafio' }))
    expect(screen.getByTestId('camada')).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Lesões deste exame' })).toBeTruthy()
  })

  it('sem lesoes marcadas, o modo desafio nao aparece', async () => {
    await abrir([])
    expect(screen.queryByRole('button', { name: 'Modo desafio' })).toBeNull()
  })
})
