// @vitest-environment jsdom
//
// "ENVIAR PARA UM GRUPO" NA GRADE DE IMAGENS (pedido do video, 22/11/2026):
// frontend/src/components/envios/EnviarParaGrupo.tsx. Antes o texto de Grupos
// mandava usar "Preparar aula", que ficava escondido na tela de uma imagem.
// Agora, com imagens selecionadas no Banco de imagens:
// - so quem cria grupos (professor, pesquisador, curador, administrador) ve o botao;
// - escolhe um ou mais grupos seus, escreve um recado e decide se podem comentar;
// - uma chamada por imagem e por grupo (POST /grupos/{id}/envios, com as
//   marcacoes oficiais da ficha); "ja enviada" nao conta como erro;
// - ali mesmo da para criar um grupo novo (convidando pessoas), que ja fica escolhido;
// - com UMA imagem, atalho para "Preparar aula" (marcacoes so do envio).
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EnviarParaGrupo from '../../../../frontend/src/components/envios/EnviarParaGrupo'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

vi.mock('../../../../frontend/src/components/envios/SeletorPessoasGrupos', () => ({
  default: ({ aoMudar }: { aoMudar: (p: { id: number; nome: string }[], g: number[]) => void }) => (
    <button type="button" onClick={() => aoMudar([{ id: 4, nome: 'Ana' }], [])}>
      convidar Ana
    </button>
  ),
}))

const sessao = (perfil: string) => ({ id: 1, nome: 'Pessoa Teste', email: 'p@exemplo.test', perfil, foto_perfil_url: null })
const GRUPOS = { grupos: [{ id: 7, nome: 'Turma A', membros: [] }, { id: 8, nome: 'Grupo B', membros: [] }] }
function abrir(perfil: string, extra: Record<string, Rota> = {}, ids: number[] = [101, 102]) {
  const servidor = servidorFalso({ 'GET /auth/me': { corpo: sessao(perfil) }, 'GET /grupos': { corpo: GRUPOS }, ...extra })
  montarTela(<EnviarParaGrupo curationIds={ids} />)
  return servidor
}

afterEach(() => cleanup())

describe('Enviar para um grupo', () => {
  it('estudante nao ve o botao', async () => {
    const servidor = abrir('estudante')
    await waitFor(() => expect(servidor.pedidos.some((p) => p.caminho === '/auth/me')).toBe(true))
    expect(screen.queryByRole('button', { name: /Enviar para um grupo/ })).toBeNull()
  })

  it('escolhe grupos, recado e comentarios; uma chamada por imagem e grupo; "ja enviada" nao e erro', async () => {
    const usuario = userEvent.setup()
    const servidor = abrir('professor', {
      'POST /grupos/7/envios': { corpo: { id: 1 } },
      'POST /grupos/8/envios': { status: 409, corpo: { detail: 'Essa imagem ja foi enviada a este grupo.' } },
    })
    await usuario.click(await screen.findByRole('button', { name: /Enviar para um grupo/ }))
    await usuario.click(await screen.findByRole('checkbox', { name: 'Turma A' }))
    await usuario.click(screen.getByRole('checkbox', { name: 'Grupo B' }))
    await usuario.type(screen.getByRole('textbox', { name: 'Recado para o grupo (opcional)' }), 'Vejam')
    await usuario.click(screen.getByRole('checkbox', { name: 'Participantes podem comentar' }))
    await usuario.click(screen.getByRole('button', { name: 'Enviar 2 imagens' }))
    await waitFor(() => expect(servidor.alteracoes()).toHaveLength(4))
    expect(servidor.alteracoes()[0]).toEqual({
      metodo: 'POST',
      caminho: '/grupos/7/envios',
      corpo: { curation_id: 101, mensagem: 'Vejam', permite_comentar: true },
    })
    expect(await screen.findByText('Enviadas: 2 · já estavam no grupo: 2.')).toBeTruthy()
  })

  it('sem grupo escolhido nao envia', async () => {
    const usuario = userEvent.setup()
    abrir('curador')
    await usuario.click(await screen.findByRole('button', { name: /Enviar para um grupo/ }))
    await screen.findByRole('checkbox', { name: 'Turma A' })
    expect((screen.getByRole('button', { name: 'Enviar 2 imagens' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('cria um grupo novo ali mesmo (com convites) e ele ja fica escolhido', async () => {
    const usuario = userEvent.setup()
    const servidor = abrir('administrador', { 'POST /grupos': { corpo: { id: 9, nome: 'Turma Nova', membros: [] } } })
    await usuario.click(await screen.findByRole('button', { name: /Enviar para um grupo/ }))
    await usuario.click(await screen.findByRole('button', { name: '+ Criar grupo novo' }))
    await usuario.type(screen.getByRole('textbox', { name: 'Nome do grupo novo' }), 'Turma Nova')
    await usuario.click(screen.getByRole('button', { name: 'convidar Ana' }))
    await usuario.click(screen.getByRole('button', { name: 'Criar grupo' }))
    await waitFor(() =>
      expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: '/grupos', corpo: { nome: 'Turma Nova', membros_ids: [4] } }]),
    )
    const novo = (await screen.findByRole('checkbox', { name: 'Turma Nova' })) as HTMLInputElement
    expect(novo.checked).toBe(true)
  })

  it('com UMA imagem, mostra o atalho "Preparar aula"', async () => {
    abrir('pesquisador', {}, [55])
    fireEvent.click(await screen.findByRole('button', { name: /Enviar para um grupo/ }))
    const atalho = await screen.findByRole('link', { name: /Preparar aula com marcações próprias/ })
    expect(atalho.getAttribute('href')).toBe('/grupos/aula?imagem=55')
  })

  it('sem conexao ao enviar: avisa', async () => {
    const usuario = userEvent.setup()
    abrir('professor', { 'POST /grupos/7/envios': 'SEM_CONEXAO' }, [101])
    await usuario.click(await screen.findByRole('button', { name: /Enviar para um grupo/ }))
    await usuario.click(await screen.findByRole('checkbox', { name: 'Turma A' }))
    await usuario.click(screen.getByRole('button', { name: 'Enviar 1 imagem' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
  })
})
