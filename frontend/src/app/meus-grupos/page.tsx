'use client'

// MEUS GRUPOS (17/11/2026, Etapa 2 dos grupos ampliados). Para todos os perfis:
// - convites recebidos: aceitar ou recusar (so entra quem aceita - D1);
// - grupos de que participo: sem a lista dos colegas (D2); sair quando quiser;
// - SO ESTUDANTES (D7): procurar grupo pelo nome (pelo menos 3 letras; mostra
//   so o nome do grupo e quem o criou) e pedir para entrar; ver e desistir
//   dos pedidos que ainda esperam o dono.
// Quem decide de verdade e o servidor; a tela so mostra. Nada e guardado no
// navegador.

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { UserPlus } from 'lucide-react'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import { useConfirmacao } from '../../components/useConfirmacao'
import { useVerificarSessao } from '../../lib/useVerificarSessao'
import AvisoSemConexao from '../../components/AvisoSemConexao'
import ImagensGrupoParticipante from '../../components/envios/ImagensGrupoParticipante'
import { fetchOuNulo } from '../../lib/fetchSeguro'

const API = process.env.NEXT_PUBLIC_API_URL
const MINIMO_LETRAS = 3

type Convite = { id: number; grupo: { id: number; nome: string }; convidado_por: string }
type Pedido = { id: number; grupo: { id: number; nome: string }; criador: string }
type Participacao = { id: number; nome: string; criador: string; entrou_em: string | null }
type Achado = { id: number; nome: string; criador: string; situacao: 'participa' | 'pedido_pendente' | 'convite_pendente' | null }

async function lerErro(r: Response, padrao: string) {
  try {
    const d = await r.json()
    if (typeof d?.detail === 'string') return d.detail
  } catch {
    // sem corpo
  }
  return padrao
}

async function lerLista<T>(caminho: string, campo: string): Promise<T[]> {
  // sem rede ou erro do servidor: lista vazia
  const r = await fetchOuNulo(`${API}${caminho}`, { credentials: 'include' })
  if (!r?.ok) return []
  try {
    return ((await r.json())[campo] as T[]) ?? []
  } catch {
    return []
  }
}

// o menu reconta os convites esperando resposta
const avisarMenu = () => window.dispatchEvent(new Event('radix-grupos-mudou'))

export default function MeusGruposPage() {
  const t = useTranslations('MeusGrupos')
  const tComum = useTranslations('Comum')
  const locale = useLocale()
  const { pedirConfirmacao, quadroConfirmacao } = useConfirmacao()
  const [pronto, setPronto] = useState(false)
  const [ehEstudante, setEhEstudante] = useState(false)
  const [convites, setConvites] = useState<Convite[]>([])
  const [participo, setParticipo] = useState<Participacao[]>([])
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [busca, setBusca] = useState('')
  const [achados, setAchados] = useState<Achado[] | null>(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  // grupo com as imagens abertas (Etapa 3)
  const [imagensAbertas, setImagensAbertas] = useState<number | null>(null)

  async function carregar(estudante: boolean) {
    const [c, p, e] = await Promise.all([
      lerLista<Convite>('/grupos/convites-recebidos', 'convites'),
      lerLista<Participacao>('/grupos/participo', 'grupos'),
      estudante ? lerLista<Pedido>('/grupos/pedidos-enviados', 'pedidos') : Promise.resolve([]),
    ])
    setConvites(c)
    setParticipo(p)
    setPedidos(e)
  }

  // sessao (Fase 3e): 401 -> login; sem conexao -> aviso + Tentar de novo
  const { semConexao, verificando, tentarDeNovo } = useVerificarSessao((s) => {
    const estudante = s.perfil === 'estudante'
    setEhEstudante(estudante)
    setPronto(true)
    void carregar(estudante)
  })

  async function procurar(e?: React.FormEvent) {
    e?.preventDefault()
    setErro('')
    const termo = busca.trim()
    if (termo.length < MINIMO_LETRAS) {
      setErro(t('minimoLetras'))
      return
    }
    const r = await fetchOuNulo(`${API}/grupos/procurar?nome=${encodeURIComponent(termo)}`, { credentials: 'include' })
    if (!r) {
      setErro(tComum('semConexao'))
      return
    }
    if (!r.ok) {
      setErro(await lerErro(r, t('erro')))
      return
    }
    setAchados((await r.json()).grupos ?? [])
  }

  /** Acao de um botao: chama o servidor, avisa e recarrega as listas. */
  async function agir(caminho: string, metodo: 'POST' | 'DELETE', sucesso: (dados: { situacao?: string }) => string) {
    setErro('')
    setAviso('')
    const r = await fetchOuNulo(`${API}${caminho}`, { method: metodo, credentials: 'include' })
    if (!r) setErro(tComum('semConexao'))
    else if (!r.ok) setErro(await lerErro(r, t('erro')))
    else {
      let dados = {}
      try {
        dados = await r.json()
      } catch {
        // sem corpo
      }
      setAviso(sucesso(dados))
      avisarMenu()
      if (achados) void procurar()
    }
    void carregar(ehEstudante)
  }

  async function sair(g: Participacao) {
    const sim = await pedirConfirmacao({
      titulo: t('sairTitulo', { grupo: g.nome }),
      texto: t('sairTexto'),
      botao: t('sairSim'),
      cancelar: t('cancelar'),
    })
    if (sim) await agir(`/grupos/participo/${g.id}`, 'DELETE', () => t('saiu'))
  }

  const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale === 'en' ? 'en-US' : 'pt-BR') : '')

  if (semConexao) return <AvisoSemConexao aoTentar={tentarDeNovo} ocupado={verificando} />
  if (!pronto) {
    return <main className="flex min-h-screen items-center justify-center bg-base"><p className="text-sm text-slate-400">{t('carregando')}</p></main>
  }

  const caixa = 'max-w-4xl space-y-3 rounded-2xl border border-base-border bg-base-surface p-4'
  const titulo = 'text-base font-semibold text-ink'
  const item = 'flex flex-wrap items-center justify-between gap-2 rounded-lg border border-base-border p-3 text-sm text-ink-2'
  const botao = 'rounded-md border border-base-border px-3 py-1 text-xs text-ink hover:border-brand'

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-w-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
          <div>
            <h1 className="titulo-pagina tela-entra flex items-center gap-2"><UserPlus aria-hidden="true" className="h-6 w-6" /> {t('titulo')}</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">{t('subtitulo')}</p>
          </div>
          {aviso && <p role="status" className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300">{aviso}</p>}
          {erro && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{erro}</p>}

          <section aria-labelledby="titulo-convites" className={caixa}>
            <h2 id="titulo-convites" className={titulo}>{t('convitesTitulo')}</h2>
            {convites.length === 0 ? (
              <p className="text-sm text-ink-3">{t('convitesVazio')}</p>
            ) : (
              <ul className="space-y-2">
                {convites.map((c) => (
                  <li key={c.id} className={item}>
                    <span><strong className="text-ink">{c.grupo.nome}</strong> · {t('conviteDe', { quem: c.convidado_por })}</span>
                    <span className="flex gap-2">
                      <button type="button" className={botao} aria-label={t('aceitarRotulo', { grupo: c.grupo.nome })}
                              onClick={() => agir(`/grupos/convites-recebidos/${c.id}/aceitar`, 'POST', () => t('aceito'))}>{t('aceitar')}</button>
                      <button type="button" className={botao} aria-label={t('recusarRotulo', { grupo: c.grupo.nome })}
                              onClick={() => agir(`/grupos/convites-recebidos/${c.id}/recusar`, 'POST', () => t('recusado'))}>{t('recusar')}</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {ehEstudante && (
            <section aria-labelledby="titulo-procurar" className={caixa}>
              <h2 id="titulo-procurar" className={titulo}>{t('procurarTitulo')}</h2>
              <p className="text-xs text-ink-3">{t('procurarAjuda')}</p>
              <form method="get" onSubmit={procurar} className="flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label htmlFor="busca-grupo" className="mb-1 block text-sm font-medium text-ink">{t('procurarCampo')}</label>
                  <input id="busca-grupo" value={busca} onChange={(e) => setBusca(e.target.value)} maxLength={80}
                         className="w-full rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-ink" />
                </div>
                <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover">{t('procurar')}</button>
              </form>
              {achados && (achados.length === 0 ? (
                <p className="text-sm text-ink-3">{t('nenhumGrupo')}</p>
              ) : (
                <ul aria-label={t('procurarTitulo')} className="space-y-2">
                  {achados.map((g) => (
                    <li key={g.id} className={item}>
                      <span><strong className="text-ink">{g.nome}</strong> · {t('criadoPor', { quem: g.criador })}</span>
                      {g.situacao ? (
                        <span className="text-xs text-ink-3">{t(`situacao_${g.situacao}`)}</span>
                      ) : (
                        <button type="button" className={botao} aria-label={t('pedirEntrarRotulo', { grupo: g.nome })}
                                onClick={() => agir(`/grupos/${g.id}/pedir`, 'POST', (d) => (d.situacao === 'participa' ? t('entrouNaHora') : t('pedidoEnviado')))}>
                          {t('pedirEntrar')}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ))}
            </section>
          )}

          {ehEstudante && pedidos.length > 0 && (
            <section aria-labelledby="titulo-pedidos" className={caixa}>
              <h2 id="titulo-pedidos" className={titulo}>{t('pedidosTitulo')}</h2>
              <ul className="space-y-2">
                {pedidos.map((p) => (
                  <li key={p.id} className={item}>
                    <span><strong className="text-ink">{p.grupo.nome}</strong> · {t('criadoPor', { quem: p.criador })}</span>
                    <button type="button" className={botao} aria-label={t('desistirRotulo', { grupo: p.grupo.nome })}
                            onClick={() => agir(`/grupos/pedidos-enviados/${p.id}`, 'DELETE', () => t('pedidoCancelado'))}>{t('desistir')}</button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="titulo-participo" className={caixa}>
            <h2 id="titulo-participo" className={titulo}>{t('participoTitulo')}</h2>
            {participo.length === 0 ? (
              <p className="text-sm text-ink-3">{t('participoVazio')}</p>
            ) : (
              <ul className="space-y-2">
                {participo.map((g) => (
                  <li key={g.id} className="space-y-2 rounded-lg border border-base-border p-3 text-sm text-ink-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <strong className="text-ink">{g.nome}</strong> · {t('criadoPor', { quem: g.criador })}
                        {g.entrou_em && <span className="ml-1 text-xs text-ink-3">· {t('entrouEm', { data: data(g.entrou_em) })}</span>}
                      </span>
                      <span className="flex gap-2">
                        <button type="button" className={botao} aria-expanded={imagensAbertas === g.id}
                                aria-label={t('verImagensRotulo', { grupo: g.nome })}
                                onClick={() => setImagensAbertas(imagensAbertas === g.id ? null : g.id)}>{t('verImagens')}</button>
                        <button type="button" className={botao} aria-label={t('sairRotulo', { grupo: g.nome })} onClick={() => sair(g)}>{t('sair')}</button>
                      </span>
                    </div>
                    {imagensAbertas === g.id && <ImagensGrupoParticipante grupoId={g.id} />}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      </div>
      {quadroConfirmacao}
    </div>
  )
}
