'use client'

// GRUPOS DE ENVIO (etapa C, 08/11/2026; entrada consentida, 17/11/2026):
// professor, pesquisador, curador e administrador montam os proprios grupos
// (por exemplo, uma turma) para enviar imagens de uma vez.
// Ninguem entra direto (decisao D1 do Luciano): quem o dono escolhe recebe
// CONVITE e so entra depois de aceitar; o estudante PEDE e so entra depois
// que o dono AUTORIZA. O dono ve todos os participantes; eles nao veem uns
// aos outros. Quem decide de verdade e o servidor; a tela so mostra.

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Users } from 'lucide-react'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import SeletorPessoasGrupos, { type Pessoa } from '../../components/envios/SeletorPessoasGrupos'
import { useConfirmacao } from '../../components/useConfirmacao'
import { useVerificarSessao } from '../../lib/useVerificarSessao'
import AvisoSemConexao from '../../components/AvisoSemConexao'
import { fetchOuNulo } from '../../lib/fetchSeguro'

const API = process.env.NEXT_PUBLIC_API_URL
const PERFIS = ['professor', 'pesquisador', 'curador', 'administrador']
type Membro = Pessoa & { origem?: string; entrou_em?: string | null }
type Entrada = { id: number; pessoa: Pessoa; criado_em?: string | null }
type Grupo = { id: number; nome: string; aceita_pedidos?: boolean; membros: Membro[]; convites?: Entrada[]; pedidos?: Entrada[] }

async function lerErro(r: Response, padrao: string) {
  try {
    const d = await r.json()
    if (typeof d?.detail === 'string') return d.detail
  } catch {
    // sem corpo
  }
  return padrao
}

// o menu reconta os pedidos esperando resposta
const avisarMenu = () => window.dispatchEvent(new Event('radix-grupos-mudou'))

export default function GruposPage() {
  const router = useRouter()
  const t = useTranslations('Grupos')
  const tComum = useTranslations('Comum')
  const { pedirConfirmacao, quadroConfirmacao } = useConfirmacao()
  const [pronto, setPronto] = useState(false)
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [editando, setEditando] = useState<Grupo | null>(null)
  const [nome, setNome] = useState('')
  const [aceitaPedidos, setAceitaPedidos] = useState(true)
  const [convidar, setConvidar] = useState<Pessoa[]>([])
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  async function carregar() {
    // sem rede: lista vazia, como quando o servidor responde erro
    try {
      const r = await fetch(`${API}/grupos`, { credentials: 'include' })
      setGrupos(r.ok ? (await r.json()).grupos : [])
    } catch {
      setGrupos([])
    }
  }

  // sessao (Fase 3e): 401 -> login; sem conexao -> aviso + Tentar de novo
  const { semConexao, verificando, tentarDeNovo } = useVerificarSessao((s) => {
    if (!PERFIS.includes(s.perfil)) {
      router.push('/acesso-negado?de=/grupos')
      return
    }
    setPronto(true)
    void carregar()
  })

  function abrirFormulario(g: Grupo) {
    setEditando(g)
    setNome(g.nome)
    setAceitaPedidos(g.aceita_pedidos ?? true)
    setConvidar([])
    setErro('')
    setAviso('')
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!editando) return
    setErro('')
    // quem ja participa continua; quem foi escolhido agora recebe CONVITE
    const ids = [...editando.membros.map((m) => m.id), ...convidar.map((p) => p.id)]
    const r = await fetchOuNulo(`${API}/grupos${editando.id ? `/${editando.id}` : ''}`, {
      method: editando.id ? 'PUT' : 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, aceita_pedidos: aceitaPedidos, membros_ids: [...new Set(ids)] }),
    })
    if (!r) {
      setErro(tComum('semConexao'))
      return
    }
    if (!r.ok) {
      setErro(await lerErro(r, t('erro')))
      return
    }
    setAviso(t('salvo'))
    setEditando(null)
    void carregar()
  }

  /** Acao de um botao do cartao: chama o servidor, avisa e recarrega. */
  async function agir(caminho: string, metodo: 'POST' | 'DELETE', sucesso: string, padraoErro: string) {
    setErro('')
    setAviso('')
    const r = await fetchOuNulo(`${API}${caminho}`, { method: metodo, credentials: 'include' })
    if (!r) setErro(tComum('semConexao'))
    else if (!r.ok) setErro(await lerErro(r, padraoErro))
    else {
      setAviso(sucesso)
      avisarMenu()
    }
    void carregar()
  }

  async function apagar(g: Grupo) {
    const sim = await pedirConfirmacao({
      titulo: t('apagarTitulo', { nome: g.nome }),
      texto: t('apagarTexto'),
      botao: t('apagarSim'),
      cancelar: t('cancelar'),
    })
    if (sim) await agir(`/grupos/${g.id}`, 'DELETE', t('apagado'), t('erroApagar'))
  }

  async function tirar(g: Grupo, m: Membro) {
    const sim = await pedirConfirmacao({
      titulo: t('tirarTitulo', { nome: m.nome }),
      texto: t('tirarTexto'),
      botao: t('tirarSim'),
      cancelar: t('cancelar'),
    })
    if (sim) await agir(`/grupos/${g.id}/membros/${m.id}`, 'DELETE', t('retirado'), t('erroAcao'))
  }

  if (semConexao) return <AvisoSemConexao aoTentar={tentarDeNovo} ocupado={verificando} />
  if (!pronto) {
    return <main className="flex min-h-screen items-center justify-center bg-base"><p className="text-sm text-slate-400">{t('carregando')}</p></main>
  }

  const botaoPequeno = 'rounded-md border border-base-border px-2 py-0.5 text-xs text-ink hover:border-brand'

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-w-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="titulo-pagina tela-entra">{t('titulo')}</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-400">{t('subtitulo')}</p>
            </div>
            <button type="button" onClick={() => abrirFormulario({ id: 0, nome: '', aceita_pedidos: true, membros: [] })}
                    className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover">{t('novo')}</button>
          </div>
          {aviso && <p role="status" className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300">{aviso}</p>}
          {/* com o formulario fechado, o aviso de erro aparece aqui */}
          {erro && !editando && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{erro}</p>}

          {editando && (
            <form method="post" onSubmit={salvar} className="max-w-3xl space-y-4 rounded-2xl border border-base-border bg-base-surface p-4">
              <div>
                <label htmlFor="nome-grupo" className="mb-1 block text-sm font-medium text-ink">{t('nome')}</label>
                <input id="nome-grupo" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} required
                       placeholder={t('nomeExemplo')}
                       className="w-full rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-ink" />
              </div>
              <label className="flex items-start gap-2 text-sm text-ink">
                <input type="checkbox" checked={aceitaPedidos} onChange={(e) => setAceitaPedidos(e.target.checked)} className="mt-1" />
                {t('aceitaPedidos')}
              </label>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-ink">{t('convidar')}</legend>
                <p className="text-xs text-ink-3">{t('convidarAjuda')}</p>
                <SeletorPessoasGrupos pessoas={convidar} grupos={[]} aoMudar={(p) => setConvidar(p)} somentePessoas />
              </fieldset>
              {erro && <p role="alert" className="rounded-lg bg-red-500/10 p-2 text-sm text-red-700 dark:text-red-300">{erro}</p>}
              <div className="flex gap-2">
                <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">{t('salvar')}</button>
                <button type="button" onClick={() => setEditando(null)} className="rounded-lg border border-base-border px-4 py-2 text-sm text-ink">{t('cancelar')}</button>
              </div>
            </form>
          )}

          {grupos.length === 0 ? (
            <p className="text-sm text-ink-3">{t('vazio')}</p>
          ) : (
            <ul className="grid max-w-5xl grid-cols-1 gap-3 md:grid-cols-2">
              {grupos.map((g) => (
                <li key={g.id} className="space-y-3 rounded-xl border border-base-border bg-base-surface p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 text-base font-semibold text-ink"><Users aria-hidden="true" className="h-4 w-4" /> {g.nome}</h2>
                    <span className="text-xs text-ink-3">{t('membros', { n: g.membros.length })}</span>
                  </div>
                  <p className="text-xs text-ink-3">{g.aceita_pedidos ? t('aparecesNaBusca') : t('foraDaBusca')}</p>

                  {(g.pedidos ?? []).length > 0 && (
                    <section aria-label={t('pedidos')} className="rounded-lg bg-amber-500/10 p-2">
                      <h3 className="text-xs font-semibold text-ink">{t('pedidos')}</h3>
                      <ul className="mt-1 space-y-1">
                        {(g.pedidos ?? []).map((e) => (
                          <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-2">
                            <span>{e.pessoa.nome}</span>
                            <span className="flex gap-2">
                              <button type="button" className={botaoPequeno} aria-label={t('autorizarRotulo', { nome: e.pessoa.nome })}
                                      onClick={() => agir(`/grupos/${g.id}/pedidos/${e.id}/autorizar`, 'POST', t('autorizado'), t('erroAcao'))}>{t('autorizar')}</button>
                              <button type="button" className={botaoPequeno} aria-label={t('recusarRotulo', { nome: e.pessoa.nome })}
                                      onClick={() => agir(`/grupos/${g.id}/pedidos/${e.id}/recusar`, 'POST', t('recusado'), t('erroAcao'))}>{t('recusar')}</button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  <section aria-label={t('participantes')}>
                    <h3 className="text-xs font-semibold text-ink">{t('participantes')}</h3>
                    {g.membros.length === 0 ? (
                      <p className="mt-1 text-xs text-ink-2">{t('semMembros')}</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {g.membros.map((m) => (
                          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-2">
                            <span>
                              {m.nome}
                              {m.origem && <span className="ml-1 text-ink-3">({t(`origem_${m.origem === 'convite' || m.origem === 'pedido' ? m.origem : 'anterior'}`)})</span>}
                            </span>
                            <button type="button" className={botaoPequeno} aria-label={t('tirarRotulo', { nome: m.nome })} onClick={() => tirar(g, m)}>{t('tirar')}</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  {(g.convites ?? []).length > 0 && (
                    <section aria-label={t('convites')}>
                      <h3 className="text-xs font-semibold text-ink">{t('convites')}</h3>
                      <ul className="mt-1 space-y-1">
                        {(g.convites ?? []).map((e) => (
                          <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-2">
                            <span>{e.pessoa.nome}</span>
                            <button type="button" className={botaoPequeno} aria-label={t('cancelarConviteRotulo', { nome: e.pessoa.nome })}
                                    onClick={() => agir(`/grupos/${g.id}/convites/${e.id}`, 'DELETE', t('conviteCancelado'), t('erroAcao'))}>{t('cancelarConvite')}</button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  <div className="flex gap-3 text-xs">
                    <button type="button" onClick={() => abrirFormulario(g)} className="text-brand underline">{t('editar')}</button>
                    <button type="button" onClick={() => apagar(g)} className="text-rose-600 underline dark:text-rose-400">{t('apagar')}</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>
      {quadroConfirmacao}
    </div>
  )
}
