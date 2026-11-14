// @vitest-environment jsdom
//
// COMPONENTE "Coluna da ficha" da Curadoria (Fase 2, 13/11/2026):
// frontend/src/components/curadoria/ColunaFichaCuradoria.tsx e as partes de
// verdade que ele monta: PainelDadosSobrepostos (dados da imagem),
// PainelAchadosFicha (achado de cada marcacao) e PainelErrosTecnicosFicha.
// Confere o HOLOFOTE (o item aceso anda com Tab/↑/↓, ←/→ trocam a opcao,
// Enter confirma), os cliques e o que vai para a ficha.
// Fica de fora: "Informacoes adicionais"/anexos (envio de arquivos - outro componente).
import { useState } from 'react'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ColunaFichaCuradoria from '../../../../frontend/src/components/curadoria/ColunaFichaCuradoria'
import { FORM_VAZIO, type FormularioFicha } from '../../../../frontend/src/components/curadoria/FichaCuradoriaForm'
import type { EtapaFicha, SecaoFicha } from '../../../../frontend/src/lib/secoesCuradoria'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

vi.mock('../../../../frontend/src/components/anexos/AnexosCuradoria', async (original) => ({
  ...(await original<object>()),
  InformacoesAdicionaisFicha: () => null,
}))

// o "dono" da ficha (como a tela da Curadoria): guarda o formulario e o item aceso
const estado: { form: FormularioFicha; etapa: EtapaFicha } = { form: FORM_VAZIO, etapa: 'anonimizacao' }
const abrirMarcacao = vi.fn()
function Dono({ inicial, teclasAtivas = true, erro = '', salvo = false }: { inicial: Partial<FormularioFicha>; teclasAtivas?: boolean; erro?: string; salvo?: boolean }) {
  const [form, setForm] = useState<FormularioFicha>({ ...FORM_VAZIO, ...inicial })
  const [etapa, setEtapa] = useState<EtapaFicha>('anonimizacao')
  const [revisadas, setRevisadas] = useState<SecaoFicha[]>([])
  estado.form = form
  estado.etapa = etapa
  return (
    <ColunaFichaCuradoria
      form={form}
      onChange={setForm}
      curationId={1}
      erro={erro}
      rascunhoSalvo={salvo}
      etapaAtiva={etapa}
      onEtapa={setEtapa}
      marcacaoAberta={false}
      onAlternarMarcacao={abrirMarcacao}
      teclasAtivas={teclasAtivas}
      revisadas={revisadas}
      onNadaRegistrar={(s) => setRevisadas((r) => (r.includes(s) ? r.filter((x) => x !== s) : [...r, s]))}
      topo={<p>painel da voz</p>}
      acoesFinais={<button type="button">✓ Aprovar</button>}
    />
  )
}

const VOCABULARIO = { termos: [{ id: 5, termo: 'Nódulo pulpar', categoria: 'achado', ativo: true, nas_curadorias: true, sinonimos: [{ id: 1, sinonimo: 'pedra pulpar' }] }] }
function abrir(inicial: Partial<FormularioFicha> = {}, extra: Record<string, Rota> = {}, props: { teclasAtivas?: boolean; erro?: string; salvo?: boolean } = {}) {
  const servidor = servidorFalso({ 'GET /vocabulario': { corpo: VOCABULARIO }, ...extra })
  montarTela(<Dono inicial={inicial} {...props} />)
  return servidor
}
const item = (etapa: string) => document.querySelector(`[data-etapa="${etapa}"]`) as HTMLElement
const aceso = () => document.querySelector('[aria-current="step"]')?.getAttribute('data-etapa')
const tecla = (key: string, extra: object = {}) => fireEvent.keyDown(document, { key, ...extra })
const MARCACOES = [
  { id: 'm1', tipo: 'circulo', x: 0.4, y: 0.5, raio: 0.1 },
  { id: 'm2', tipo: 'seta', x1: 0.1, y1: 0.1, x2: 0.3, y2: 0.3 },
] as FormularioFicha['marcacoes']

beforeEach(() => vi.clearAllMocks())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('holofote pelo teclado', () => {
  it('comeca em "Anonimização"; Enter valida e passa para "Tipo"', () => {
    abrir()
    expect(aceso()).toBe('anonimizacao')
    tecla('Enter')
    expect(estado.form.anonimizacao_validada).toBe(true)
    expect(aceso()).toBe('tipo')
  })

  it('←/→ trocam o tipo; Enter confirma e vai para a idade; um numero ja escreve a idade; Enter na idade passa adiante', () => {
    abrir()
    tecla('Tab')
    expect(aceso()).toBe('tipo')
    tecla('ArrowRight')
    expect(estado.form.tipo_radiografia).toBe('interproximal')
    tecla('ArrowLeft')
    tecla('ArrowLeft')
    expect(estado.form.tipo_radiografia).toBe('tomografia') // volta pelo fim
    tecla('Enter')
    expect(aceso()).toBe('idade')
    tecla('4')
    expect(estado.form.idade_min).toBe('4')
    const caixa = screen.getByRole('spinbutton', { name: 'Idade' })
    expect(document.activeElement).toBe(caixa)
    fireEvent.keyDown(caixa, { key: 'Enter' })
    expect(aceso()).toBe('genero')
    tecla('ArrowRight')
    expect(estado.form.genero).toBe('masculino')
  })

  it('Tab/↓ avancam, Shift+Tab/↑ voltam; com as teclas desligadas (janela aberta) nada muda', () => {
    abrir()
    tecla('ArrowDown')
    tecla('Tab')
    expect(aceso()).toBe('idade')
    tecla('Tab', { shiftKey: true })
    tecla('ArrowUp')
    expect(aceso()).toBe('anonimizacao')
    tecla('ArrowUp') // no primeiro, nao volta alem
    expect(aceso()).toBe('anonimizacao')
    cleanup()
    abrir({}, {}, { teclasAtivas: false })
    tecla('Tab')
    tecla('Enter')
    expect(aceso()).toBe('anonimizacao')
    expect(estado.form.anonimizacao_validada).toBe(false)
  })

  it('dentes: ←/→ andam pelo odontograma e Enter marca/desmarca o dente do cursor, sem sair do item', () => {
    abrir()
    for (let i = 0; i < 4; i++) tecla('Tab')
    expect(aceso()).toBe('dentes')
    tecla('ArrowRight') // 18 -> 17
    tecla('Enter')
    expect(estado.form.dentes).toEqual([17])
    tecla('Enter')
    expect(estado.form.dentes).toEqual([])
    expect(aceso()).toBe('dentes')
    tecla('ArrowLeft')
    tecla('ArrowLeft') // 18 -> ultimo (38)
    tecla('Enter')
    expect(estado.form.dentes).toEqual([38])
  })

  it('chegando em "Descrição" pelo teclado, a caixa de texto ja fica pronta para escrever', async () => {
    abrir({ anonimizacao_validada: true })
    for (let i = 0; i < 9; i++) tecla('Tab')
    expect(aceso()).toBe('descricao')
    const descricao = screen.getByRole('textbox', { name: 'Descrição didática' })
    await waitFor(() => expect(document.activeElement).toBe(descricao))
  })
})

describe('cliques', () => {
  it('clicar num item apagado so o acende (o valor nao muda); no item aceso, escolher ja passa adiante', async () => {
    const usuario = userEvent.setup()
    abrir()
    fireEvent.mouseDown(item('tipo'))
    expect(aceso()).toBe('tipo')
    expect(estado.form.tipo_radiografia).toBe('periapical')
    await usuario.click(within(item('tipo')).getByRole('button', { name: /Oclusal/ }))
    expect(estado.form.tipo_radiografia).toBe('oclusal')
    expect(aceso()).toBe('idade')
  })

  it('trocar para panoramica tira o erro tecnico que nao vale para ela (corte de cone)', async () => {
    const usuario = userEvent.setup()
    abrir({ erros_tecnicos: ['corte_cone', 'distorcao'] })
    fireEvent.mouseDown(item('tipo'))
    await usuario.click(within(item('tipo')).getByRole('button', { name: /Panorâmica/ }))
    expect(estado.form.erros_tecnicos).toEqual(['distorcao'])
  })

  it('odontograma: clicar marca e desmarca o dente', async () => {
    const usuario = userEvent.setup()
    abrir()
    fireEvent.mouseDown(item('dentes'))
    const d36 = within(item('dentes')).getByRole('button', { name: '36' })
    await usuario.click(d36)
    expect(d36.getAttribute('aria-pressed')).toBe('true')
    expect(estado.form.dentes).toEqual([36])
    await usuario.click(d36)
    expect(estado.form.dentes).toEqual([])
  })

  it('"Abrir marcação" avisa a tela', async () => {
    const usuario = userEvent.setup()
    abrir()
    await usuario.click(screen.getByRole('button', { name: /Abrir marcação/ }))
    expect(abrirMarcacao).toHaveBeenCalledTimes(1)
  })

  it('mostra o painel da voz em cima, as acoes no fim, o erro e o "rascunho salvo"', () => {
    abrir({}, {}, { erro: 'Não foi possível salvar o rascunho.', salvo: true })
    expect(screen.getByText('painel da voz')).toBeTruthy()
    expect(screen.getByRole('button', { name: '✓ Aprovar' })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe('Não foi possível salvar o rascunho.')
    expect(screen.getByText(/Rascunho salvo/i)).toBeTruthy()
  })
})

describe('achados das marcacoes', () => {
  it('sem marcacao: "Imagem sem alterações (normal)" marca e desmarca', async () => {
    const usuario = userEvent.setup()
    abrir()
    fireEvent.mouseDown(document.querySelector('[data-secao="achados"]') as HTMLElement)
    const normal = screen.getByRole('button', { name: /Imagem sem alterações \(normal\)/ })
    await usuario.click(normal)
    expect(estado.form.sem_alteracoes).toBe(true)
    expect(normal.getAttribute('aria-pressed')).toBe('true')
    await usuario.click(normal)
    expect(estado.form.sem_alteracoes).toBe(false)
  })

  it('cada marcacao recebe um achado: digitar as iniciais e escolher (ate pelo sinonimo do vocabulario)', async () => {
    const usuario = userEvent.setup()
    abrir({ marcacoes: MARCACOES })
    fireEvent.mouseDown(document.querySelector('[data-secao="achados"]') as HTMLElement)
    const primeira = screen.getByPlaceholderText(/achado da marcação 1/)
    await usuario.click(primeira)
    await usuario.type(primeira, 'periap')
    await usuario.click(within(screen.getByRole('listbox')).getByRole('button', { name: 'Lesão periapical' }))
    expect(estado.form.achados).toEqual([expect.objectContaining({ tipo: 'lesao_periapical', marcacoes: ['m1'] })])
    expect(estado.form.alteracoes_observadas).toContain('lesao_periapical')

    const segunda = screen.getByPlaceholderText(/achado da marcação 2/)
    await usuario.click(segunda)
    await usuario.type(segunda, 'pedra')
    await usuario.keyboard('{Enter}')
    expect(estado.form.achados.find((a) => a.marcacoes.includes('m2'))).toEqual(expect.objectContaining({ tipo: 'outro', termo_id: 5, rotulo: 'Nódulo pulpar' }))
    expect(estado.form.termos).toContain(5)
  })

  it('o achado escolhido ganha dente e regiao', async () => {
    const usuario = userEvent.setup()
    abrir({ marcacoes: MARCACOES.slice(0, 1), achados: [{ tipo: 'lesao_periapical', dentes: [], regiao: '', marcacoes: ['m1'] }] })
    fireEvent.mouseDown(document.querySelector('[data-secao="achados"]') as HTMLElement)
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Adicionar dente' }), '36')
    expect(estado.form.achados[0].dentes).toEqual([36])
    expect(estado.form.dentes).toContain(36)
    await usuario.click(screen.getByRole('button', { name: 'Remover dente 36' }))
    expect(estado.form.achados[0].dentes).toEqual([])
    const regiao = screen.getByRole('combobox', { name: 'Região' }) as HTMLSelectElement
    await usuario.selectOptions(regiao, regiao.options[2].value)
    expect(estado.form.achados[0].regiao).toBe(regiao.options[2].value)
  })

  it('"Outros": acrescenta um termo novo ao vocabulario e liga a marcacao', async () => {
    const usuario = userEvent.setup()
    const servidor = abrir({ marcacoes: MARCACOES.slice(0, 1) }, {
      'POST /vocabulario/termos': { status: 201, corpo: { id: 9, termo: 'Pérola de esmalte', categoria: 'achado' } },
    })
    fireEvent.mouseDown(document.querySelector('[data-secao="achados"]') as HTMLElement)
    const campo = screen.getByPlaceholderText(/achado da marcação 1/)
    await usuario.click(campo)
    await usuario.type(campo, 'Pérola de esmalte')
    await usuario.click(screen.getByRole('button', { name: /Outros: acrescentar “Pérola de esmalte”/ }))
    expect((screen.getByRole('textbox', { name: 'Nome do termo' }) as HTMLInputElement).value).toBe('Pérola de esmalte')
    await usuario.click(screen.getByRole('checkbox', { name: 'Aparecer como opção na Pesquisa avançada' }))
    await usuario.click(screen.getByRole('button', { name: 'Acrescentar' }))
    await waitFor(() => expect(estado.form.achados[0]).toEqual(expect.objectContaining({ termo_id: 9, rotulo: 'Pérola de esmalte' })))
    expect(servidor.alteracoes()[0].corpo).toEqual({ termo: 'Pérola de esmalte', categoria: 'achado', na_busca: false, nas_curadorias: true })
    expect(screen.queryByRole('textbox', { name: 'Nome do termo' })).toBeNull()
  })

  it.each([
    ['recusa com motivo', { status: 409, corpo: { detail: 'Termo já existe.' } }, 'Termo já existe.'],
    ['sem conexao', 'SEM_CONEXAO' as const, 'Não foi possível acrescentar o termo. Tente de novo.'],
  ])('"Outros" com erro (%s): avisa e o formulario continua aberto', async (_caso, resposta, mensagem) => {
    const usuario = userEvent.setup()
    abrir({ marcacoes: MARCACOES.slice(0, 1) }, { 'POST /vocabulario/termos': resposta })
    fireEvent.mouseDown(document.querySelector('[data-secao="achados"]') as HTMLElement)
    const campo = screen.getByPlaceholderText(/achado da marcação 1/)
    await usuario.click(campo)
    await usuario.type(campo, 'xx')
    await usuario.keyboard('{ArrowDown}{Enter}') // "Outros" e a ultima opcao
    await usuario.click(screen.getByRole('button', { name: 'Acrescentar' }))
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
    expect(screen.getByRole('textbox', { name: 'Nome do termo' })).toBeTruthy()
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('textbox', { name: 'Nome do termo' })).toBeNull()
  })

  it('fichas antigas: achado sem marcacao, termo sem marcacao e texto livre continuam visiveis e editaveis', async () => {
    const usuario = userEvent.setup()
    abrir({
      achados: [{ tipo: 'carie_dentina', dentes: [16], regiao: '', marcacoes: [] }],
      termos: [5],
      achados_detalhe: 'Texto antigo do achado.',
    })
    fireEvent.mouseDown(document.querySelector('[data-secao="achados"]') as HTMLElement)
    expect(await screen.findByText('Cárie em dentina')).toBeTruthy()
    expect(await screen.findByText('Nódulo pulpar')).toBeTruthy()
    expect((screen.getByDisplayValue('Texto antigo do achado.') as HTMLTextAreaElement).tagName).toBe('TEXTAREA')
    await usuario.click(screen.getByRole('button', { name: 'Tirar Nódulo pulpar' }))
    expect(estado.form.termos).toEqual([])
    await usuario.click(screen.getByRole('button', { name: 'Remover achado' }))
    expect(estado.form.achados).toEqual([])
  })
})

describe('erro tecnico, textos e "nada a registrar"', () => {
  it('erros tecnicos do tipo do exame: clicar marca/desmarca; ←/→ e Enter tambem', async () => {
    const usuario = userEvent.setup()
    abrir()
    fireEvent.mouseDown(document.querySelector('[data-secao="erro_tecnico"]') as HTMLElement)
    expect(screen.getByText('Erros possíveis para Periapical:')).toBeTruthy()
    await usuario.click(screen.getByRole('button', { name: 'Distorção' }))
    expect(estado.form.erros_tecnicos).toEqual(['distorcao'])
    tecla('Enter') // cursor no 1o (Magnificação)
    expect(estado.form.erros_tecnicos).toEqual(['distorcao', 'magnificacao'])
  })

  it('"Nada a registrar" numa secao opcional vazia fica anotado ("Sem erro técnico")', async () => {
    const usuario = userEvent.setup()
    abrir()
    fireEvent.mouseDown(document.querySelector('[data-secao="erro_tecnico"]') as HTMLElement)
    await usuario.click(screen.getByRole('button', { name: 'Nada a registrar nesta seção' }))
    expect(screen.getByText('Sem erro técnico')).toBeTruthy()
    expect(screen.getByRole('button', { name: '✓ Revisada — nada a registrar' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('descricao e observacoes vao para a ficha', async () => {
    const usuario = userEvent.setup()
    abrir()
    fireEvent.mouseDown(document.querySelector('[data-secao="descricao"]') as HTMLElement)
    await usuario.type(screen.getByRole('textbox', { name: 'Descrição didática' }), 'Imagem de teste.')
    fireEvent.mouseDown(document.querySelector('[data-secao="observacoes"]') as HTMLElement)
    await usuario.type(screen.getByRole('textbox', { name: 'Observações internas' }), 'Só para a equipe.')
    expect(estado.form.descricao_didatica).toBe('Imagem de teste.')
    expect(estado.form.observacoes_internas).toBe('Só para a equipe.')
  })
})
