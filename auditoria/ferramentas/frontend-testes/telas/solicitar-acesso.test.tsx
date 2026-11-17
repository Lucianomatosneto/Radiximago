// @vitest-environment jsdom
//
// TELA "Solicitar acesso" (frontend/src/app/solicitar-acesso/page.tsx).
// PR 3a (14/11/2026): o titulo "Tipo de acesso" e um rotulo sem campo (os
// perfis sao botoes). O leitor de tela precisa anunciar os botoes como um
// GRUPO com esse nome. Dados inventados.
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SolicitarAcessoPage from '../../../../frontend/src/app/solicitar-acesso/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/solicitar-acesso' }))

afterEach(() => cleanup())

describe('PR 3a: perfis da solicitacao como grupo com nome', () => {
  it('os 4 perfis ficam num grupo chamado "Tipo de acesso"', () => {
    servidorFalso({})
    montarTela(<SolicitarAcessoPage />)
    const grupo = screen.getByRole('group', { name: /Tipo de acesso/ })
    expect(within(grupo).getAllByRole('button').map((b) => b.textContent)).toEqual(['Curador', 'Professor', 'Estudante', 'Pesquisador'])
    // nao sobra rotulo solto (sem campo ligado) na tela
    const soltos = [...document.querySelectorAll('label')].filter((l) => !l.htmlFor && !l.querySelector('input,select,textarea'))
    expect(soltos.map((l) => l.textContent)).toEqual([])
  })
})

// Fase 3c (14/11/2026): o pedido de acesso completo. Confere as validacoes
// antes de enviar, o que vai ao servidor (sem espacos; opcionais vazios
// viram null), cada erro conhecido traduzido, erro desconhecido, sem
// conexao e o botao travado durante o envio. Dados inventados.
describe('Fase 3c: pedir acesso', () => {
  type Usuario = ReturnType<typeof userEvent.setup>
  async function preencher(usuario: Usuario, campos: Partial<Record<'nome' | 'email' | 'senha' | 'confirmar' | 'instituicao' | 'motivo', string>>, perfil?: string) {
    const rotulos = { nome: 'Nome completo', email: 'E-mail', senha: 'Senha', confirmar: 'Confirmar', instituicao: 'Instituição (opcional)', motivo: 'Motivo do acesso (opcional)' }
    for (const [campo, valor] of Object.entries(campos)) {
      if (valor) await usuario.type(screen.getByLabelText(rotulos[campo as keyof typeof rotulos]), valor)
    }
    if (perfil) await usuario.click(screen.getByRole('button', { name: perfil }))
    await usuario.click(screen.getByRole('button', { name: 'Enviar solicitação' }))
  }
  const COMPLETO = { nome: '  Ana Teste ', email: ' ana@exemplo.test ', senha: 'uma frase de teste', confirmar: 'uma frase de teste' }

  it.each([
    ['sem nome', { ...COMPLETO, nome: '' }, 'Estudante', 'Preencha nome, e-mail e senha.'],
    ['nome so com espacos', { ...COMPLETO, nome: '   ' }, 'Estudante', 'Preencha nome, e-mail e senha.'],
    ['sem senha', { ...COMPLETO, senha: '', confirmar: '' }, 'Estudante', 'Preencha nome, e-mail e senha.'],
    ['senha curta', { ...COMPLETO, senha: 'curta12', confirmar: 'curta12' }, 'Estudante', 'A senha deve ter ao menos 8 caracteres.'],
    ['senhas diferentes', { ...COMPLETO, confirmar: 'outra frase qualquer' }, 'Estudante', 'As senhas não coincidem.'],
    ['sem tipo de acesso', COMPLETO, undefined, 'Selecione o tipo de acesso que você está solicitando.'],
  ])('%s: avisa e nao envia', async (_n, campos, perfil, mensagem) => {
    const usuario = userEvent.setup()
    const servidor = servidorFalso({})
    montarTela(<SolicitarAcessoPage />)
    await preencher(usuario, campos, perfil)
    expect(screen.getByRole('alert').textContent).toBe(mensagem)
    expect(servidor.pedidos).toEqual([])
  })

  it('envia sem espacos nas pontas; opcionais vazios vao como null; mostra o proximo passo', async () => {
    const usuario = userEvent.setup()
    const servidor = servidorFalso({ 'POST /auth/request-access': { status: 201, corpo: {} } })
    montarTela(<SolicitarAcessoPage />)
    await preencher(usuario, COMPLETO, 'Professor')
    expect(await screen.findByText(/Enviamos um link de confirmação/)).toBeTruthy()
    expect(servidor.pedidos).toEqual([
      {
        metodo: 'POST',
        caminho: '/auth/request-access',
        corpo: { nome: 'Ana Teste', email: 'ana@exemplo.test', senha: 'uma frase de teste', instituicao: null, perfil_solicitado: 'professor', motivo: null },
      },
    ])
    expect(screen.getByRole('link', { name: 'Voltar para o login' }).getAttribute('href')).toBe('/login')
  })

  it('instituicao e motivo preenchidos vao junto (sem espacos); o ultimo perfil clicado vale', async () => {
    const usuario = userEvent.setup()
    const servidor = servidorFalso({ 'POST /auth/request-access': { status: 201, corpo: {} } })
    montarTela(<SolicitarAcessoPage />)
    await usuario.click(screen.getByRole('button', { name: 'Curador' }))
    await preencher(usuario, { ...COMPLETO, instituicao: ' Clínica Teste ', motivo: ' Estudo de casos ' }, 'Pesquisador')
    await screen.findByText(/Enviamos um link de confirmação/)
    expect(servidor.pedidos[0].corpo).toMatchObject({ instituicao: 'Clínica Teste', motivo: 'Estudo de casos', perfil_solicitado: 'pesquisador' })
  })

  it.each([
    ['A senha deve ter ao menos 8 caracteres.', 'A senha deve ter ao menos 8 caracteres.'],
    ['Essa senha é muito comum ou fácil de adivinhar. Escolha outra (dica: uma frase curta).', 'Essa senha é muito comum ou fácil de adivinhar. Escolha outra (dica: uma frase curta).'],
    [
      'A senha pode ter no máximo 64 caracteres (letras acentuadas e símbolos especiais ocupam mais espaço).',
      'A senha pode ter no máximo 64 caracteres (letras acentuadas e símbolos especiais ocupam mais espaço).',
    ],
    [
      'Não foi possível enviar o e-mail de confirmação agora. Tente de novo em alguns minutos; se continuar, avise o administrador.',
      'Seus dados foram recebidos, mas não conseguimos enviar o e-mail de confirmação agora. Tente de novo em alguns minutos; se continuar, avise o administrador do sistema.',
    ],
    ['Texto que a tela nao conhece', 'Não foi possível enviar sua solicitação. Tente novamente.'],
  ])('servidor recusa ("%s"): mensagem traduzida e o formulario continua', async (detalhe, mensagem) => {
    const usuario = userEvent.setup()
    servidorFalso({ 'POST /auth/request-access': { status: 400, corpo: { detail: detalhe } } })
    montarTela(<SolicitarAcessoPage />)
    await preencher(usuario, COMPLETO, 'Estudante')
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
    expect(screen.getByRole('button', { name: 'Enviar solicitação' })).toBeTruthy()
  })

  it.each([
    ['resposta sem texto', { status: 500, corpo: 'x' } as Rota, 'Não foi possível enviar sua solicitação. Tente novamente.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Não foi possível enviar sua solicitação. Tente novamente mais tarde.'],
  ])('%s: mensagem geral', async (_n, rota, mensagem) => {
    const usuario = userEvent.setup()
    servidorFalso({ 'POST /auth/request-access': rota })
    montarTela(<SolicitarAcessoPage />)
    await preencher(usuario, COMPLETO, 'Estudante')
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
  })

  it('durante o envio: "Enviando..." e botao travado (sem pedido duplo)', async () => {
    const usuario = userEvent.setup()
    let liberar: () => void = () => {}
    const espera = new Promise<void>((r) => (liberar = r))
    const servidor = servidorFalso({ 'POST /auth/request-access': { status: 201, corpo: {} } })
    const fetchBase = globalThis.fetch
    vi.stubGlobal('fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
      await espera
      return fetchBase(url, init)
    })
    montarTela(<SolicitarAcessoPage />)
    await preencher(usuario, COMPLETO, 'Estudante')
    const botao = screen.getByRole('button', { name: 'Enviando...' }) as HTMLButtonElement
    expect(botao.disabled).toBe(true)
    fireEvent.submit(botao.closest('form') as HTMLFormElement)
    await act(async () => liberar())
    await screen.findByText(/Enviamos um link de confirmação/)
    expect(servidor.pedidos).toHaveLength(1)
  })
})

// Fase 3d (16/11/2026), item 4: o sucesso nao era anunciado e os botoes de
// perfil nao diziam ao leitor de tela qual estava escolhido.
describe('Fase 3d: acessibilidade do pedido', () => {
  it('botoes de perfil dizem qual esta escolhido (aria-pressed), um de cada vez', async () => {
    const usuario = userEvent.setup()
    servidorFalso({})
    montarTela(<SolicitarAcessoPage />)
    const estado = () => ['Estudante', 'Professor', 'Curador', 'Pesquisador'].map((n) => screen.getByRole('button', { name: n }).getAttribute('aria-pressed'))
    expect(estado()).toEqual(['false', 'false', 'false', 'false'])
    await usuario.click(screen.getByRole('button', { name: 'Professor' }))
    expect(estado()).toEqual(['false', 'true', 'false', 'false'])
    await usuario.click(screen.getByRole('button', { name: 'Curador' }))
    expect(estado()).toEqual(['false', 'false', 'true', 'false'])
  })

  it('pedido enviado: a mensagem de sucesso e anunciada (role="status")', async () => {
    const usuario = userEvent.setup()
    servidorFalso({ 'POST /auth/request-access': { status: 201, corpo: {} } })
    montarTela(<SolicitarAcessoPage />)
    await usuario.type(screen.getByLabelText('Nome completo'), 'Ana Teste')
    await usuario.type(screen.getByLabelText('E-mail'), 'ana@exemplo.test')
    await usuario.type(screen.getByLabelText('Senha'), 'uma frase de teste')
    await usuario.type(screen.getByLabelText('Confirmar'), 'uma frase de teste')
    await usuario.click(screen.getByRole('button', { name: 'Estudante' }))
    await usuario.click(screen.getByRole('button', { name: 'Enviar solicitação' }))
    expect((await screen.findByRole('status')).textContent).toMatch(/Enviamos um link de confirmação/)
  })
})
