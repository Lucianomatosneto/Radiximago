// @vitest-environment jsdom
//
// TELAS PUBLICAS DE SENHA E CADASTRO (Fase 3c):
// - "Esqueci minha senha"  (frontend/src/app/esqueci-senha/page.tsx)
// - "Redefinir senha"      (frontend/src/app/redefinir-senha/page.tsx)
// - "Confirme seu e-mail"  (frontend/src/app/confirmar-email/page.tsx)
// e o leitor do codigo dos links de e-mail (lib/codigoDoLink.ts).
// Confere: o codigo do link sai da barra de endereco assim que e lido (vale
// "#token=" e o antigo "?token="), link sem codigo, validacoes antes de
// enviar, o que vai ao servidor, cada mensagem de erro conhecida, erro
// desconhecido e sem conexao, e o botao travado durante o envio.
// Dados inventados; nenhuma senha real.
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EsqueciSenhaPage from '../../../../frontend/src/app/esqueci-senha/page'
import RedefinirSenhaPage from '../../../../frontend/src/app/redefinir-senha/page'
import ConfirmarEmailPage from '../../../../frontend/src/app/confirmar-email/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/' }))

const enderecoCom = (caminho: string) => window.history.replaceState(null, '', caminho)
const enderecoAtual = () => window.location.pathname + window.location.search + window.location.hash
/** servidor que so responde quando o teste mandar (para ver a tela "enviando") */
function servidorLento(rota: string, resposta: Rota) {
  let liberar: () => void = () => {}
  const espera = new Promise<void>((r) => (liberar = r))
  const servidor = servidorFalso({ [rota]: resposta })
  const fetchBase = globalThis.fetch
  vi.stubGlobal('fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
    await espera
    return fetchBase(url, init)
  })
  return { servidor, liberar }
}

beforeEach(() => {
  vi.clearAllMocks()
  enderecoCom('/')
})
afterEach(() => cleanup())

describe('Esqueci minha senha', () => {
  const email = () => screen.getByLabelText('E-mail')
  const enviar = () => screen.getByRole('button', { name: 'Enviar instruções' })

  it('sem e-mail (ou so espacos): avisa e nao envia', async () => {
    const usuario = userEvent.setup()
    const servidor = servidorFalso({})
    montarTela(<EsqueciSenhaPage />)
    await usuario.type(email(), '   ')
    await usuario.click(enviar())
    expect(screen.getByRole('alert').textContent).toBe('Informe seu e-mail.')
    expect(servidor.pedidos).toEqual([])
  })

  it('envia o e-mail (sem espacos) e o idioma; mostra a mesma resposta exista ou nao a conta', async () => {
    const usuario = userEvent.setup()
    const servidor = servidorFalso({ 'POST /auth/forgot-password': { corpo: {} } })
    montarTela(<EsqueciSenhaPage />)
    await usuario.type(email(), '  pessoa@exemplo.test ')
    await usuario.click(enviar())
    expect(await screen.findByText(/Se esse e-mail estiver cadastrado/)).toBeTruthy()
    expect(servidor.pedidos).toEqual([{ metodo: 'POST', caminho: '/auth/forgot-password', corpo: { email: 'pessoa@exemplo.test', idioma: 'pt' } }])
    expect(screen.getByRole('link', { name: 'Voltar para o login' }).getAttribute('href')).toBe('/login')
  })

  it.each([
    ['erro do servidor', { status: 500 } as Rota],
    ['sem conexao', 'SEM_CONEXAO' as Rota],
  ])('%s: avisa e o formulario continua', async (_n, rota) => {
    const usuario = userEvent.setup()
    servidorFalso({ 'POST /auth/forgot-password': rota })
    montarTela(<EsqueciSenhaPage />)
    await usuario.type(email(), 'pessoa@exemplo.test')
    await usuario.click(enviar())
    expect((await screen.findByRole('alert')).textContent).toBe('Não foi possível processar o pedido. Tente novamente mais tarde.')
    expect(enviar()).toBeTruthy()
  })

  it('durante o envio: "Enviando..." e botao travado (sem envio duplo)', async () => {
    const usuario = userEvent.setup()
    const { servidor, liberar } = servidorLento('POST /auth/forgot-password', { corpo: {} })
    montarTela(<EsqueciSenhaPage />)
    await usuario.type(email(), 'pessoa@exemplo.test')
    await usuario.click(enviar())
    const botao = screen.getByRole('button', { name: 'Enviando...' }) as HTMLButtonElement
    expect(botao.disabled).toBe(true)
    fireEvent.submit(botao.closest('form') as HTMLFormElement) // Enter de novo
    liberar()
    await screen.findByText(/Se esse e-mail estiver cadastrado/)
    expect(servidor.pedidos).toHaveLength(1)
  })
})

describe('Redefinir senha', () => {
  const nova = () => screen.getByLabelText('Nova senha')
  const repetir = () => screen.getByLabelText('Confirmar nova senha')
  const redefinir = () => screen.getByRole('button', { name: 'Redefinir senha' })
  async function preencher(usuario: ReturnType<typeof userEvent.setup>, a: string, b = a) {
    if (a) await usuario.type(nova(), a)
    if (b) await usuario.type(repetir(), b)
    await usuario.click(redefinir())
  }

  it.each([
    ['#token=', '/redefinir-senha#token=codigo-abc'],
    ['?token= (links antigos)', '/redefinir-senha?token=codigo-abc'],
  ])('codigo no link (%s): e lido e apagado da barra de endereco', async (_n, endereco) => {
    enderecoCom(endereco)
    servidorFalso({})
    montarTela(<RedefinirSenhaPage />)
    await screen.findByLabelText('Nova senha')
    expect(enderecoAtual()).toBe('/redefinir-senha')
  })

  it('link sem codigo: avisa e oferece pedir outro link', async () => {
    enderecoCom('/redefinir-senha')
    servidorFalso({})
    montarTela(<RedefinirSenhaPage />)
    expect(await screen.findByText('Este link de redefinição é inválido. Solicite um novo link.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Solicitar novo link' }).getAttribute('href')).toBe('/esqueci-senha')
    expect(screen.queryByLabelText('Nova senha')).toBeNull()
  })

  it.each([
    ['senha curta', 'curta12', 'curta12', 'A nova senha deve ter ao menos 8 caracteres.'],
    ['senhas diferentes', 'frase longa um', 'frase longa dois', 'As senhas não coincidem.'],
  ])('%s: avisa sem enviar', async (_n, a, b, mensagem) => {
    const usuario = userEvent.setup()
    enderecoCom('/redefinir-senha#token=codigo-abc')
    const servidor = servidorFalso({})
    montarTela(<RedefinirSenhaPage />)
    await screen.findByLabelText('Nova senha')
    await preencher(usuario, a, b)
    expect(screen.getByRole('alert').textContent).toBe(mensagem)
    expect(servidor.pedidos).toEqual([])
  })

  it('envia o codigo e a nova senha; avisa e vai ao login em seguida', async () => {
    const usuario = userEvent.setup()
    enderecoCom('/redefinir-senha#token=codigo-abc')
    const servidor = servidorFalso({ 'POST /auth/reset-password': { corpo: {} } })
    montarTela(<RedefinirSenhaPage />)
    await screen.findByLabelText('Nova senha')
    await preencher(usuario, 'uma frase de teste')
    expect(await screen.findByText('Senha redefinida com sucesso. Redirecionando para o login...')).toBeTruthy()
    expect(servidor.pedidos).toEqual([{ metodo: 'POST', caminho: '/auth/reset-password', corpo: { token: 'codigo-abc', nova_senha: 'uma frase de teste' } }])
    expect(roteador.push).not.toHaveBeenCalled() // da tempo de ler o aviso
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'), { timeout: 4000 })
  })

  it.each([
    ['Link de redefinição inválido ou já utilizado.', 'Link de redefinição inválido. Solicite um novo.'],
    ['Link de redefinição expirado. Solicite um novo.', 'Link de redefinição expirado. Solicite um novo.'],
    ['A nova senha deve ter ao menos 8 caracteres.', 'A nova senha deve ter ao menos 8 caracteres.'],
    ['A senha deve ter ao menos 8 caracteres.', 'A nova senha deve ter ao menos 8 caracteres.'],
    ['Essa senha é muito comum ou fácil de adivinhar. Escolha outra (dica: uma frase curta).', 'Essa senha é muito comum ou fácil de adivinhar. Escolha outra (dica: uma frase curta).'],
    [
      'A senha pode ter no máximo 64 caracteres (letras acentuadas e símbolos especiais ocupam mais espaço).',
      'A senha pode ter no máximo 64 caracteres (letras acentuadas e símbolos especiais ocupam mais espaço).',
    ],
    ['Texto novo que a tela nao conhece', 'Não foi possível redefinir a senha. Tente novamente.'],
  ])('servidor recusa ("%s"): mostra a mensagem traduzida', async (detalhe, mensagem) => {
    const usuario = userEvent.setup()
    enderecoCom('/redefinir-senha#token=codigo-abc')
    servidorFalso({ 'POST /auth/reset-password': { status: 400, corpo: { detail: detalhe } } })
    montarTela(<RedefinirSenhaPage />)
    await screen.findByLabelText('Nova senha')
    await preencher(usuario, 'uma frase de teste')
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
  })

  it.each([
    ['resposta sem texto', { status: 500, corpo: 'x' } as Rota, 'Não foi possível redefinir a senha. Tente novamente.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Não foi possível redefinir a senha. Tente novamente mais tarde.'],
  ])('%s: mensagem geral', async (_n, rota, mensagem) => {
    const usuario = userEvent.setup()
    enderecoCom('/redefinir-senha#token=codigo-abc')
    servidorFalso({ 'POST /auth/reset-password': rota })
    montarTela(<RedefinirSenhaPage />)
    await screen.findByLabelText('Nova senha')
    await preencher(usuario, 'uma frase de teste')
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
  })

  it('durante o envio: "Salvando..." e botao travado', async () => {
    const usuario = userEvent.setup()
    enderecoCom('/redefinir-senha#token=codigo-abc')
    const { servidor, liberar } = servidorLento('POST /auth/reset-password', { corpo: {} })
    montarTela(<RedefinirSenhaPage />)
    await screen.findByLabelText('Nova senha')
    await preencher(usuario, 'uma frase de teste')
    const botao = screen.getByRole('button', { name: 'Salvando...' }) as HTMLButtonElement
    expect(botao.disabled).toBe(true)
    fireEvent.submit(botao.closest('form') as HTMLFormElement)
    await act(async () => liberar())
    await screen.findByText(/Senha redefinida/)
    expect(servidor.pedidos).toHaveLength(1)
  })
})

describe('Confirme seu e-mail', () => {
  const senha = () => screen.getByLabelText('Senha definida no pedido')
  const confirmar = () => screen.getByRole('button', { name: 'Confirmar e-mail' })
  async function abrirComCodigo(rotas: Record<string, Rota> = {}) {
    enderecoCom('/confirmar-email#token=codigo-xyz')
    const servidor = servidorFalso(rotas)
    montarTela(<ConfirmarEmailPage />)
    await screen.findByLabelText('Senha definida no pedido')
    return servidor
  }

  it('abrir o link nao confirma nada sozinho (precisa da senha); o codigo sai do endereco', async () => {
    const servidor = await abrirComCodigo()
    expect(servidor.pedidos).toEqual([])
    expect(enderecoAtual()).toBe('/confirmar-email')
  })

  it('link sem codigo: "inválido", com caminho para pedir de novo', async () => {
    enderecoCom('/confirmar-email')
    servidorFalso({})
    montarTela(<ConfirmarEmailPage />)
    expect((await screen.findByRole('alert')).textContent).toBe('Este link de confirmação é inválido ou já foi usado.')
    expect(screen.getByRole('link', { name: 'Fazer o pedido novamente' }).getAttribute('href')).toBe('/solicitar-acesso')
  })

  it('sem senha: avisa e nao envia', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrirComCodigo()
    await usuario.click(confirmar())
    expect(screen.getByRole('alert').textContent).toBe('Digite a senha que você definiu no pedido.')
    expect(servidor.pedidos).toEqual([])
  })

  it.each([
    ['ja liberado (estudante)', true, 'E-mail confirmado! Seu acesso já está liberado'],
    ['depende do administrador', false, 'o pedido foi enviado para análise'],
  ])('confirmado, %s: envia codigo e senha e mostra o aviso certo', async (_n, aprovado, trecho) => {
    const usuario = userEvent.setup()
    const servidor = await abrirComCodigo({ 'POST /auth/confirm-email': { corpo: { aprovado } } })
    await usuario.type(senha(), 'senha-de-teste')
    await usuario.click(confirmar())
    expect((await screen.findByRole('status')).textContent).toContain(trecho)
    expect(servidor.pedidos).toEqual([{ metodo: 'POST', caminho: '/auth/confirm-email', corpo: { token: 'codigo-xyz', senha: 'senha-de-teste' } }])
    expect(screen.getByRole('link', { name: 'Ir para o login' }).getAttribute('href')).toBe('/login')
  })

  it('senha incorreta: avisa e deixa tentar de novo', async () => {
    const usuario = userEvent.setup()
    await abrirComCodigo({ 'POST /auth/confirm-email': { status: 401, corpo: { detail: 'Senha incorreta.' } } })
    await usuario.type(senha(), 'errada')
    await usuario.click(confirmar())
    expect((await screen.findByRole('alert')).textContent).toBe('Senha incorreta. Use a mesma senha que você definiu no formulário de pedido.')
    expect(senha()).toBeTruthy()
  })

  it.each([
    ['Link de confirmação expirado. Faça a solicitação novamente.', 'Este link expirou (ele vale por 24 horas). Faça o pedido novamente para receber um link novo.'],
    ['Link bloqueado por excesso de tentativas. Faça a solicitação novamente.', 'Este link foi bloqueado depois de várias senhas incorretas. Faça o pedido novamente.'],
    ['Link de confirmação inválido ou já utilizado.', 'Este link de confirmação é inválido ou já foi usado.'],
  ])('link que acabou ("%s"): tira o formulario e explica', async (detalhe, mensagem) => {
    const usuario = userEvent.setup()
    await abrirComCodigo({ 'POST /auth/confirm-email': { status: 400, corpo: { detail: detalhe } } })
    await usuario.type(senha(), 'senha-de-teste')
    await usuario.click(confirmar())
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
    expect(screen.queryByLabelText('Senha definida no pedido')).toBeNull()
    expect(screen.getByRole('link', { name: 'Fazer o pedido novamente' })).toBeTruthy()
  })

  it.each([
    ['erro desconhecido', { status: 500 } as Rota],
    ['sem conexao', 'SEM_CONEXAO' as Rota],
  ])('%s: mensagem geral e o formulario continua', async (_n, rota) => {
    const usuario = userEvent.setup()
    await abrirComCodigo({ 'POST /auth/confirm-email': rota })
    await usuario.type(senha(), 'senha-de-teste')
    await usuario.click(confirmar())
    expect((await screen.findByRole('alert')).textContent).toBe('Não foi possível confirmar agora. Tente novamente em instantes.')
    expect(senha()).toBeTruthy()
  })

  it('durante o envio: "Confirmando..." e botao travado', async () => {
    const usuario = userEvent.setup()
    enderecoCom('/confirmar-email#token=codigo-xyz')
    const { servidor, liberar } = servidorLento('POST /auth/confirm-email', { corpo: { aprovado: true } })
    montarTela(<ConfirmarEmailPage />)
    await usuario.type(await screen.findByLabelText('Senha definida no pedido'), 'senha-de-teste')
    await usuario.click(confirmar())
    const botao = screen.getByRole('button', { name: 'Confirmando...' }) as HTMLButtonElement
    expect(botao.disabled).toBe(true)
    fireEvent.submit(botao.closest('form') as HTMLFormElement)
    await act(async () => liberar())
    await screen.findByRole('status')
    expect(servidor.pedidos).toHaveLength(1)
  })
})
