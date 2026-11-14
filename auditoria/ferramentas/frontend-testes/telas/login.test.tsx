// @vitest-environment jsdom
//
// TELA "Login" (frontend/src/app/login/page.tsx) - Fase 3b.
// Confere: campos vazios, e-mail/senha errados, servidor com problema ou
// fora do ar, para onde vai cada perfil (e o "volta" seguro), avisos de
// termos recusados, mostrar a senha, o login em duas etapas (codigo,
// cadastro do aplicativo, codigos de recuperacao, etapa expirada) e os
// botoes da animacao de fundo.
// Simulado: a animacao 3D de fundo (CenaLogin/motorCenaLogin). Aqui ela vira
// uma versao simples que entrega os controles e avisa foco e longitude.
// Dados inventados; nenhuma senha real.
import { act, cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from '../../../../frontend/src/app/login/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/login' }))
vi.mock('../../../../frontend/src/components/Logo', () => ({ default: () => null }))
vi.mock('../../../../frontend/src/components/SeletorIdioma', () => ({ default: () => null }))

const cena = vi.hoisted(() => ({
  controles: { alternarPausa: vi.fn(), avancar: vi.fn(), aproximar: vi.fn(), afastar: vi.fn(), redefinir: vi.fn() },
  aoMudarFoco: (_i: number) => {},
  aoMudarLongitude: (_l: number) => {},
}))
vi.mock('../../../../frontend/src/components/login/CenaLogin', () => ({
  default: (p: { controleRef: { current: unknown }; aoMudarFoco: (i: number) => void; aoMudarLongitude: (l: number) => void }) => {
    p.controleRef.current = cena.controles
    cena.aoMudarFoco = p.aoMudarFoco
    cena.aoMudarLongitude = p.aoMudarLongitude
    return null
  },
}))

const LOGIN = 'POST /auth/login'
function abrir(rotas: Record<string, Rota>, busca = '') {
  window.history.replaceState(null, '', `/login${busca}`)
  const servidor = servidorFalso(rotas)
  montarTela(<LoginPage />)
  return servidor
}
async function entrar(usuario: ReturnType<typeof userEvent.setup>, email = 'aluno@exemplo.test', senha = 'senha-de-teste') {
  if (email) await usuario.type(screen.getByLabelText('E-mail'), email)
  if (senha) await usuario.type(screen.getByLabelText('Senha'), senha)
  await usuario.click(screen.getByRole('button', { name: 'Entrar' }))
}
const alerta = () => screen.findByRole('alert')

beforeEach(() => {
  vi.clearAllMocks()
  cena.controles.alternarPausa.mockReturnValue(true)
})
afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

describe('entrar com e-mail e senha', () => {
  it('campos vazios: avisa e nao chama o servidor', async () => {
    const usuario = userEvent.setup()
    const servidor = abrir({})
    await entrar(usuario, 'aluno@exemplo.test', '')
    expect((await alerta()).textContent).toBe('Preencha e-mail e senha.')
    expect(servidor.pedidos).toHaveLength(0)
  })

  it('manda e-mail e senha como formulario e leva o estudante ao Banco de imagens', async () => {
    const usuario = userEvent.setup()
    const servidor = abrir({ [LOGIN]: { corpo: { perfil: 'estudante' } } })
    await entrar(usuario, '  aluno@exemplo.test ')
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/banco-imagens'))
    expect(servidor.pedidos).toEqual([
      { metodo: 'POST', caminho: '/auth/login', corpo: { username: 'aluno@exemplo.test', password: 'senha-de-teste' } },
    ])
  })

  it('administrador vai ao Painel', async () => {
    const usuario = userEvent.setup()
    abrir({ [LOGIN]: { corpo: { perfil: 'administrador' } } })
    await entrar(usuario)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/dashboard'))
  })

  it.each([
    ['?volta=/pesquisa?tipo=panoramica', '/pesquisa?tipo=panoramica'],
    ['?volta=//site-estranho.test', '/banco-imagens'], // endereco de fora: ignorado
    ['?volta=https://site-estranho.test', '/banco-imagens'],
  ])('volta depois do login: %s -> %s', async (busca, destino) => {
    const usuario = userEvent.setup()
    abrir({ [LOGIN]: { corpo: { perfil: 'curador' } } }, busca)
    await entrar(usuario)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith(destino))
  })

  it.each([
    ['senha errada (401)', { status: 401 } as Rota, 'E-mail ou senha incorretos'],
    ['conta bloqueada (403)', { status: 403 } as Rota, 'E-mail ou senha incorretos'],
    ['erro do servidor', { status: 500 } as Rota, 'Não foi possível entrar. Tente novamente mais tarde.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Não foi possível entrar. Tente novamente mais tarde.'],
  ])('%s: avisa e nao sai da tela', async (_n, rota, mensagem) => {
    const usuario = userEvent.setup()
    abrir({ [LOGIN]: rota })
    await entrar(usuario)
    expect((await alerta()).textContent).toBe(mensagem)
    expect(roteador.push).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy() // botao volta ao normal
  })

  it('mostrar e ocultar a senha', async () => {
    const usuario = userEvent.setup()
    abrir({})
    const senha = screen.getByLabelText('Senha') as HTMLInputElement
    expect(senha.type).toBe('password')
    await usuario.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    expect(senha.type).toBe('text')
    await usuario.click(screen.getByRole('button', { name: 'Ocultar senha' }))
    expect(senha.type).toBe('password')
  })

  it.each([
    ['?termo=recusado', 'Sem aceitar o termo de ciência, o acesso ao sistema não é liberado.'],
    ['?termos=recusados', 'Sem aceitar os Termos de Uso e a Política de Privacidade, o acesso ao sistema não é liberado.'],
  ])('chegou de %s: explica por que voltou ao login', async (busca, mensagem) => {
    abrir({}, busca)
    expect((await alerta()).textContent).toBe(mensagem)
  })

  it('links: primeiro acesso, esqueci a senha, conheca e termos', () => {
    abrir({})
    expect(screen.getByRole('link', { name: 'Primeiro acesso' }).getAttribute('href')).toBe('/solicitar-acesso')
    expect(screen.getByRole('link', { name: 'Esqueci minha senha' }).getAttribute('href')).toBe('/esqueci-senha')
    expect(screen.getByRole('link', { name: 'Conheça o Rádix Imago' }).getAttribute('href')).toBe('/conheca')
    expect(screen.getByRole('link', { name: 'Termos e privacidade' }).getAttribute('href')).toBe('/termos')
  })
})

describe('login em duas etapas: codigo do aplicativo', () => {
  async function ateOCodigo(usuario: ReturnType<typeof userEvent.setup>, rotaCodigo: Rota) {
    const servidor = abrir({ [LOGIN]: { corpo: { segundo_fator: 'codigo', desafio: 'desafio-teste' } }, 'POST /auth/login/segundo-fator': rotaCodigo })
    await entrar(usuario)
    expect(await screen.findByText('Login em duas etapas')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement).disabled).toBe(true) // sem codigo
    await usuario.type(screen.getByLabelText('Código'), ' 123456 ')
    await usuario.click(screen.getByRole('button', { name: 'Confirmar' }))
    return servidor
  }

  it('codigo certo: manda o desafio e o codigo e entra', async () => {
    const usuario = userEvent.setup()
    const servidor = await ateOCodigo(usuario, { corpo: { perfil: 'professor' } })
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/banco-imagens'))
    expect(servidor.pedidos.at(-1)).toEqual({ metodo: 'POST', caminho: '/auth/login/segundo-fator', corpo: { desafio: 'desafio-teste', codigo: '123456' } })
  })

  it('codigo errado: avisa e limpa o campo', async () => {
    const usuario = userEvent.setup()
    await ateOCodigo(usuario, { status: 401, corpo: { detail: 'Código inválido' } })
    expect((await alerta()).textContent).toBe('Código inválido ou já usado. Confira o aplicativo e tente de novo.')
    expect((screen.getByLabelText('Código') as HTMLInputElement).value).toBe('')
  })

  it('etapa expirada: volta ao e-mail e senha com o aviso', async () => {
    const usuario = userEvent.setup()
    await ateOCodigo(usuario, { status: 401, corpo: { detail: 'Etapa expirada, entre de novo' } })
    expect((await alerta()).textContent).toBe('Esta etapa expirou. Digite o e-mail e a senha de novo.')
    expect(screen.getByLabelText('E-mail')).toBeTruthy()
  })

  it.each([
    ['erro do servidor', { status: 500 } as Rota],
    ['sem conexao', 'SEM_CONEXAO' as Rota],
  ])('%s ao conferir o codigo: mensagem geral', async (_n, rota) => {
    const usuario = userEvent.setup()
    await ateOCodigo(usuario, rota)
    expect((await alerta()).textContent).toBe('Não foi possível concluir agora. Tente de novo em instantes.')
  })

  it('"Voltar" leva de novo ao e-mail e senha', async () => {
    const usuario = userEvent.setup()
    abrir({ [LOGIN]: { corpo: { segundo_fator: 'codigo', desafio: 'd' } } })
    await entrar(usuario)
    await usuario.click(await screen.findByRole('button', { name: 'Voltar' }))
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('login em duas etapas: primeiro cadastro do aplicativo', () => {
  const CADASTRO = { segundo_fator: 'cadastro', desafio: 'desafio-cad' }

  it('mostra o QR code e a chave; confirmado, mostra os codigos de recuperacao e depois entra', async () => {
    const usuario = userEvent.setup()
    const servidor = abrir({
      [LOGIN]: { corpo: CADASTRO },
      'POST /auth/login/cadastro-mfa/iniciar': { corpo: { segredo: 'ABCDEFGHIJKLMNOP', qr_code: 'data:image/png;base64,AAAA' } },
      'POST /auth/login/cadastro-mfa/confirmar': { corpo: { perfil: 'curador', codigos_recuperacao: ['AAAA-BBBB', 'CCCC-DDDD'], codigos_recuperacao_trocados: true } },
    })
    await entrar(usuario)
    expect(await screen.findByText('Cadastre o login em duas etapas')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'QR code para cadastrar o Rádix Imago no aplicativo autenticador' })).toBeTruthy()
    expect(screen.getByText('ABCD EFGH IJKL MNOP')).toBeTruthy() // a chave aparece em grupos de 4
    expect(servidor.pedidos[1]).toEqual({ metodo: 'POST', caminho: '/auth/login/cadastro-mfa/iniciar', corpo: { desafio: 'desafio-cad' } })
    await usuario.type(screen.getByLabelText('Código'), '654321')
    await usuario.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByText('Guarde seus códigos de recuperação')).toBeTruthy()
    expect(screen.getByText('AAAA-BBBB')).toBeTruthy()
    expect(screen.getByText(/seus códigos de recuperação antigos foram substituídos/)).toBeTruthy()
    expect(roteador.push).not.toHaveBeenCalled()
    await usuario.click(screen.getByRole('button', { name: 'Já guardei, continuar' }))
    expect(roteador.push).toHaveBeenCalledWith('/banco-imagens')
  })

  it.each([
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Sem conexão com o servidor. Tente de novo.'],
    ['etapa expirada', { status: 401 } as Rota, 'Esta etapa expirou. Digite o e-mail e a senha de novo.'],
    ['erro do servidor', { status: 500 } as Rota, 'Não foi possível concluir agora. Tente de novo em instantes.'],
  ])('falha ao iniciar o cadastro (%s): volta ao e-mail e senha com o aviso', async (_n, rota, mensagem) => {
    const usuario = userEvent.setup()
    abrir({ [LOGIN]: { corpo: CADASTRO }, 'POST /auth/login/cadastro-mfa/iniciar': rota })
    await entrar(usuario)
    expect((await alerta()).textContent).toBe(mensagem)
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy()
  })
})

describe('animacao de fundo', () => {
  it('botoes do visualizador comandam a animacao; pausar vira "Retomar"', async () => {
    const usuario = userEvent.setup()
    abrir({})
    const barra = screen.getByRole('toolbar', { name: 'Ferramentas do visualizador' })
    expect(barra).toBeTruthy()
    await usuario.click(screen.getByRole('button', { name: 'Pausar rotação' }))
    expect(cena.controles.alternarPausa).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Retomar rotação' })).toBeTruthy()
    for (const [nome, acao] of [
      ['Próxima imagem', cena.controles.avancar],
      ['Aproximar', cena.controles.aproximar],
      ['Afastar', cena.controles.afastar],
      ['Redefinir vista', cena.controles.redefinir],
    ] as const) {
      await usuario.click(screen.getByRole('button', { name: nome }))
      expect(acao).toHaveBeenCalledTimes(1)
    }
  })

  it('a animacao avisa a area em destaque e o hemisferio voltado para a frente', () => {
    abrir({})
    act(() => {
      cena.aoMudarFoco(2)
      cena.aoMudarLongitude(-45)
    })
    expect(screen.getByText('03').parentElement?.textContent).toBe('03Radiologia médica')
    expect(screen.getByText('Ocidental')).toBeTruthy()
    expect(screen.getByText(/Américas/)).toBeTruthy()
    act(() => cena.aoMudarLongitude(100))
    expect(screen.getByText('Oriental')).toBeTruthy()
    expect(screen.getByText(/Ásia/)).toBeTruthy()
  })
})
