'use client'

// GRUPOS - "MODO AULA" (17/11/2026, Etapa 3). O dono prepara uma imagem
// APROVADA para um dos seus grupos, com a mesma ferramenta de marcacao da
// Curadoria (oval, retangulo, seta):
// - as marcacoes comecam com as OFICIAIS da ficha; ele acrescenta, muda ou apaga;
// - escolhe quais alteracoes da ficha quer destacar;
// - escreve uma mensagem e decide se os participantes podem comentar.
// Tudo isso vale SO para este envio: a ficha oficial nao muda (D3).
// Endereco: /grupos/aula?imagem=<numero da ficha> (atalho na tela da imagem).
// Quem decide de verdade e o servidor; a tela so mostra.

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { GraduationCap } from 'lucide-react'
import Sidebar from '../../../components/Sidebar'
import Topbar from '../../../components/Topbar'
import MarcadorAchado from '../../../components/curadoria/MarcadorAchado'
import { useVerificarSessao } from '../../../lib/useVerificarSessao'
import AvisoSemConexao from '../../../components/AvisoSemConexao'
import { fetchOuNulo } from '../../../lib/fetchSeguro'
import type { Marcacao } from '../../../lib/marcacoes'

const API = process.env.NEXT_PUBLIC_API_URL
const PERFIS = ['professor', 'pesquisador', 'curador', 'administrador']
const MENSAGEM_MAX = 1000

type Base = { curation_id: number; tipo_radiografia: string | null; descricao_didatica: string | null; marcacoes: Marcacao[]; alteracoes_observadas: string[] }
type GrupoResumo = { id: number; nome: string }

async function lerErro(r: Response, padrao: string) {
  try {
    const d = await r.json()
    if (typeof d?.detail === 'string') return d.detail
  } catch {
    // sem corpo
  }
  return padrao
}

export default function AulaGrupoPage() {
  const router = useRouter()
  const t = useTranslations('AulaGrupo')
  const tComum = useTranslations('Comum')
  const tAlteracao = useTranslations('AlteracoesObservadas.itens')
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'sem_imagem'>('carregando')
  const [base, setBase] = useState<Base | null>(null)
  const [grupos, setGrupos] = useState<GrupoResumo[]>([])
  const [grupoId, setGrupoId] = useState('')
  const [marcacoes, setMarcacoes] = useState<Marcacao[]>([])
  const [versaoMarcador, setVersaoMarcador] = useState(0)
  const [destaques, setDestaques] = useState<string[]>([])
  const [mensagem, setMensagem] = useState('')
  const [permiteComentar, setPermiteComentar] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [enviado, setEnviado] = useState(false)

  async function carregar(imagem: number) {
    const [rBase, rGrupos] = await Promise.all([
      fetchOuNulo(`${API}/grupos/aula/imagem/${imagem}`, { credentials: 'include' }),
      fetchOuNulo(`${API}/grupos`, { credentials: 'include' }),
    ])
    if (!rBase?.ok) {
      setEstado('sem_imagem')
      return
    }
    const dados = (await rBase.json()) as Base
    setBase(dados)
    setMarcacoes(dados.marcacoes ?? [])
    let lista: GrupoResumo[] = []
    try {
      lista = rGrupos?.ok ? ((await rGrupos.json()).grupos ?? []) : []
    } catch {
      lista = []
    }
    setGrupos(lista)
    setGrupoId(lista.length === 1 ? String(lista[0].id) : '')
    setEstado('pronto')
  }

  // sessao (Fase 3e): 401 -> login; sem conexao -> aviso + Tentar de novo
  const { semConexao, verificando, tentarDeNovo } = useVerificarSessao((s) => {
    if (!PERFIS.includes(s.perfil)) {
      router.push('/acesso-negado?de=/grupos')
      return
    }
    const imagem = Number(new URLSearchParams(window.location.search).get('imagem'))
    if (!Number.isInteger(imagem) || imagem <= 0) {
      setEstado('sem_imagem')
      return
    }
    void carregar(imagem)
  })

  function voltarAsOficiais() {
    setMarcacoes(base?.marcacoes ?? [])
    setVersaoMarcador((v) => v + 1)
  }

  function alternarDestaque(valor: string) {
    setDestaques((atual) => (atual.includes(valor) ? atual.filter((v) => v !== valor) : [...atual, valor]))
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!base || enviando) return
    setErro('')
    if (!grupoId) {
      setErro(t('escolhaGrupo'))
      return
    }
    setEnviando(true)
    const r = await fetchOuNulo(`${API}/grupos/${grupoId}/envios`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ curation_id: base.curation_id, mensagem, permite_comentar: permiteComentar, marcacoes, destaques }),
    })
    setEnviando(false)
    if (!r) {
      setErro(tComum('semConexao'))
      return
    }
    if (!r.ok) {
      setErro(await lerErro(r, t('erro')))
      return
    }
    setEnviado(true)
  }

  // o rotulo legivel da alteracao; sem traducao, o proprio valor
  const rotulo = (valor: string) => (tAlteracao.has(valor) ? tAlteracao(valor) : valor)

  if (semConexao) return <AvisoSemConexao aoTentar={tentarDeNovo} ocupado={verificando} />
  if (estado === 'carregando') {
    return <main className="flex min-h-screen items-center justify-center bg-base"><p className="text-sm text-slate-400">{t('carregando')}</p></main>
  }

  const nomeGrupo = grupos.find((g) => String(g.id) === grupoId)?.nome ?? ''

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-w-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
          <div>
            <h1 className="titulo-pagina tela-entra flex items-center gap-2"><GraduationCap aria-hidden="true" className="h-6 w-6" /> {t('titulo')}</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">{t('subtitulo')}</p>
          </div>

          {estado === 'sem_imagem' || !base ? (
            <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{t('semImagem')}</p>
          ) : enviado ? (
            <div role="status" className="space-y-2 rounded-lg bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-300">
              <p>{t('enviado', { grupo: nomeGrupo })}</p>
              <Link href="/grupos" className="font-medium underline">{t('verGrupos')}</Link>
            </div>
          ) : grupos.length === 0 ? (
            <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-ink">
              {t('semGrupos')} <Link href="/grupos" className="font-medium underline">{t('criarGrupo')}</Link>
            </p>
          ) : (
            <form method="post" onSubmit={enviar} className="grid max-w-6xl grid-cols-1 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <section aria-label={t('marcacoes')} className="space-y-2">
                <p className="rounded-lg border border-amber-400/60 bg-amber-500/10 p-2 text-xs text-ink">{t('avisoFicha')}</p>
                <div className="h-[28rem] overflow-hidden rounded-xl border border-base-border bg-black">
                  <MarcadorAchado
                    key={versaoMarcador}
                    urlImagem={`${API}/search/${base.curation_id}/preview`}
                    marcacoes={marcacoes}
                    onMarcar={setMarcacoes}
                  />
                </div>
                <button type="button" onClick={voltarAsOficiais} className="text-xs text-brand underline">{t('voltarOficiais')}</button>
              </section>

              <div className="space-y-4">
                <div>
                  <label htmlFor="grupo-aula" className="mb-1 block text-sm font-medium text-ink">{t('grupo')}</label>
                  <select id="grupo-aula" value={grupoId} onChange={(e) => setGrupoId(e.target.value)}
                          className="w-full rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-ink">
                    <option value="">{t('escolha')}</option>
                    {grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
                  </select>
                </div>

                <fieldset className="space-y-1">
                  <legend className="text-sm font-medium text-ink">{t('destaques')}</legend>
                  {base.alteracoes_observadas.length === 0 ? (
                    <p className="text-xs text-ink-3">{t('semAlteracoes')}</p>
                  ) : (
                    <>
                      <p className="text-xs text-ink-3">{t('destaquesAjuda')}</p>
                      {base.alteracoes_observadas.map((valor) => (
                        <label key={valor} className="flex items-center gap-2 text-sm text-ink-2">
                          <input type="checkbox" checked={destaques.includes(valor)} onChange={() => alternarDestaque(valor)} />
                          {rotulo(valor)}
                        </label>
                      ))}
                    </>
                  )}
                </fieldset>

                <div>
                  <label htmlFor="mensagem-aula" className="mb-1 block text-sm font-medium text-ink">{t('mensagem')}</label>
                  <textarea id="mensagem-aula" value={mensagem} onChange={(e) => setMensagem(e.target.value)} maxLength={MENSAGEM_MAX} rows={4}
                            placeholder={t('mensagemExemplo')}
                            className="w-full rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-ink" />
                </div>

                <label className="flex items-start gap-2 text-sm text-ink">
                  <input type="checkbox" checked={permiteComentar} onChange={(e) => setPermiteComentar(e.target.checked)} className="mt-1" />
                  {t('permiteComentar')}
                </label>

                {erro && <p role="alert" className="rounded-lg bg-red-500/10 p-2 text-sm text-red-700 dark:text-red-300">{erro}</p>}
                <button type="submit" disabled={enviando} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60">
                  {enviando ? t('enviando') : t('enviar')}
                </button>
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
  )
}
