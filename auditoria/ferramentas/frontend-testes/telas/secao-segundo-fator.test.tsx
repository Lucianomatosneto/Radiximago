// @vitest-environment jsdom
//
// COMPONENTE "Login em duas etapas" em Meu perfil (Fase 3b):
// frontend/src/components/segundoFator/SecaoSegundoFator.tsx.
// Ligar (QR code + codigo -> codigos de recuperacao), gerar novos codigos,
// desligar (senha + codigo; nao aparece quando o perfil exige), e os erros
// (codigo errado limpa o campo, erro geral, sem conexao). Dados inventados;
// nenhuma senha ou segredo real.
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import SecaoSegundoFator from '../../../../frontend/src/components/segundoFator/SecaoSegundoFator'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const DESLIGADO = { ativo: false, obrigatorio: false, codigos_recuperacao_restantes: 0 }
const LIGADO = { ativo: true, obrigatorio: false, codigos_recuperacao_restantes: 8 }
function abrir(situacao: object | Rota, extra: Record<string, Rota> = {}) {
  let atual = situacao
  const servidor = servidorFalso({
    // "situacao" pode ser a situacao em si ou uma resposta pronta (status/erro)
    'GET /auth/mfa': () => (atual === 'SEM_CONEXAO' || 'status' in (atual as object) ? atual : { corpo: atual }) as never,
    ...extra,
  })
  montarTela(<SecaoSegundoFator />)
  return { servidor, mudar: (nova: object) => (atual = nova) }
}
const codigo = () => screen.getByLabelText('Código')

afterEach(() => cleanup())

describe('situacao', () => {
  it.each([
    ['erro', { status: 500 } as Rota],
    ['sem conexao', 'SEM_CONEXAO' as Rota],
  ])('se a situacao nao carrega (%s), a secao nao aparece', async (_n, rota) => {
    const { servidor } = abrir(rota)
    await waitFor(() => expect(servidor.pedidos).toHaveLength(1))
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('desligado: explica e oferece "Ligar"', async () => {
    abrir(DESLIGADO)
    const secao = await screen.findByRole('region', { name: 'Login em duas etapas' })
    expect(secao.textContent).toContain('Desligado: o login pede só a senha.')
    expect(screen.getByRole('button', { name: 'Ligar' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Desligar' })).toBeNull()
  })

  it('ligado e obrigatorio para o perfil: sem "Desligar"; mostra quantos codigos restam', async () => {
    abrir({ ...LIGADO, obrigatorio: true, codigos_recuperacao_restantes: 1 })
    expect(await screen.findByText('Obrigatório para o seu perfil.')).toBeTruthy()
    expect(screen.getByText('1 código de recuperação disponível')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Desligar' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Gerar novos códigos de recuperação' })).toBeTruthy()
  })
})

describe('ligar', () => {
  it('QR code e chave; codigo certo mostra os codigos de recuperacao, avisa e recarrega', async () => {
    const usuario = userEvent.setup()
    const { servidor, mudar } = abrir(DESLIGADO, {
      'POST /auth/mfa/iniciar': { corpo: { segredo: 'ABCDEFGHIJKLMNOP', qr_code: 'data:image/png;base64,AAAA' } },
      'POST /auth/mfa/confirmar': { corpo: { codigos_recuperacao: ['AAAA-1111', 'BBBB-2222'] } },
    })
    await usuario.click(await screen.findByRole('button', { name: 'Ligar' }))
    expect(screen.getByRole('img', { name: 'QR code para cadastrar o Rádix Imago no aplicativo autenticador' })).toBeTruthy()
    expect(screen.getByText('ABCD EFGH IJKL MNOP')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement).disabled).toBe(true)
    mudar(LIGADO)
    await usuario.type(codigo(), '123456') // o campo aceita so 6 caracteres aqui
    await usuario.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect((await screen.findByRole('status')).textContent).toBe('Login em duas etapas ligado.')
    expect(screen.getByText('AAAA-1111')).toBeTruthy()
    expect(servidor.alteracoes().at(-1)).toEqual({ metodo: 'POST', caminho: '/auth/mfa/confirmar', corpo: { codigo: '123456' } })
    await usuario.click(screen.getByRole('button', { name: 'Já guardei, continuar' }))
    expect(await screen.findByText('Ligado: o login pede o código do aplicativo.')).toBeTruthy()
  })

  it.each([
    ['erro', { status: 500 } as Rota, 'Não foi possível concluir agora. Tente de novo em instantes.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Sem conexão com o servidor. Tente de novo.'],
  ])('falha ao iniciar (%s): avisa sem abrir o formulario', async (_n, rota, mensagem) => {
    const usuario = userEvent.setup()
    abrir(DESLIGADO, { 'POST /auth/mfa/iniciar': rota })
    await usuario.click(await screen.findByRole('button', { name: 'Ligar' }))
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
    expect(screen.queryByLabelText('Código')).toBeNull()
  })

  it('codigo errado: avisa e limpa; "Cancelar" volta ao comeco', async () => {
    const usuario = userEvent.setup()
    abrir(DESLIGADO, {
      'POST /auth/mfa/iniciar': { corpo: { segredo: 'ABCDEFGHIJKLMNOP', qr_code: 'data:image/png;base64,AAAA' } },
      'POST /auth/mfa/confirmar': { status: 401 },
    })
    await usuario.click(await screen.findByRole('button', { name: 'Ligar' }))
    await usuario.type(codigo(), '000000')
    await usuario.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Código inválido ou já usado. Confira o aplicativo e tente de novo.')
    expect((codigo() as HTMLInputElement).value).toBe('')
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByRole('button', { name: 'Ligar' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('com o segundo fator ligado', () => {
  it('desligar pede senha e codigo; desligado, avisa', async () => {
    const usuario = userEvent.setup()
    const { servidor, mudar } = abrir(LIGADO, { 'POST /auth/mfa/desativar': { corpo: {} } })
    await usuario.click(await screen.findByRole('button', { name: 'Desligar' }))
    expect(screen.getByText('Para desligar, digite sua senha e o código atual do aplicativo:')).toBeTruthy()
    await usuario.type(screen.getByLabelText('Senha'), 'senha-de-teste')
    await usuario.type(codigo(), '654321')
    mudar(DESLIGADO)
    await usuario.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect((await screen.findByRole('status')).textContent).toBe('Login em duas etapas desligado.')
    expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: '/auth/mfa/desativar', corpo: { senha: 'senha-de-teste', codigo: '654321' } }])
    expect(await screen.findByRole('button', { name: 'Ligar' })).toBeTruthy()
  })

  it('novos codigos de recuperacao: pede o codigo atual e mostra os novos', async () => {
    const usuario = userEvent.setup()
    const { servidor } = abrir(LIGADO, { 'POST /auth/mfa/novos-codigos': { corpo: { codigos_recuperacao: ['NOVO-0001'] } } })
    await usuario.click(await screen.findByRole('button', { name: 'Gerar novos códigos de recuperação' }))
    expect(screen.getByText('Digite o código atual do aplicativo:')).toBeTruthy()
    await usuario.type(codigo(), '111222')
    await usuario.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByText('NOVO-0001')).toBeTruthy()
    expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: '/auth/mfa/novos-codigos', corpo: { codigo: '111222' } }])
    expect(screen.queryByRole('status')).toBeNull() // gerar codigos nao tem aviso proprio
  })

  it.each([
    ['erro', { status: 500 } as Rota, 'Não foi possível concluir agora. Tente de novo em instantes.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Sem conexão com o servidor. Tente de novo.'],
  ])('falha ao gerar codigos (%s): avisa e mantem o formulario', async (_n, rota, mensagem) => {
    const usuario = userEvent.setup()
    abrir(LIGADO, { 'POST /auth/mfa/novos-codigos': rota })
    await usuario.click(await screen.findByRole('button', { name: 'Gerar novos códigos de recuperação' }))
    await usuario.type(codigo(), '111222')
    await usuario.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
    expect((codigo() as HTMLInputElement).value).toBe('111222')
  })
})
