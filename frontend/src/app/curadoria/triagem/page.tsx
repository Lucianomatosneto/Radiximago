'use client'

// TRIAGEM DA MODALIDADE (pedido do Luciano, 23/11/2026).
//
// O sistema so reconhece sozinho tomografia e panoramica (etiqueta DICOM ou
// imagem bem larga); periapical, interproximal e oclusal tem a mesma
// etiqueta e chegam como "intraoral". Nesta tela o curador (ou o
// administrador) ve as miniaturas da fila, seleciona varias e diz o tipo de
// uma vez (POST /curation/triagem). Quem decide e um profissional; fica na
// auditoria (triagem_modalidade) e vira o tipo inicial da ficha.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import Sidebar from '../../../components/Sidebar'
import Topbar from '../../../components/Topbar'
import AvisoSemConexao from '../../../components/AvisoSemConexao'
import MiniaturaFila from '../../../components/MiniaturaFila'
import { ORDEM_MODALIDADES } from '../../../components/curadoria/EscolhaModalidade'
import { TIPOS_EXAME } from '../../../components/envios/TipoExameEnvio'
import { useVerificarSessao } from '../../../lib/useVerificarSessao'
import { fetchOuNulo } from '../../../lib/fetchSeguro'

const API = process.env.NEXT_PUBLIC_API_URL
const PERFIS_PERMITIDOS = ['curador', 'administrador']
const POR_PAGINA = 60

interface Item {
  orthanc_reference_id: number
  tipo_preliminar: string | null
}

async function lerErro(r: Response, padrao: string): Promise<string> {
  try {
    const corpo = await r.json()
    if (typeof corpo?.detail === 'string') return corpo.detail
  } catch {
    // sem corpo legivel
  }
  return padrao
}

export default function TriagemPage() {
  const router = useRouter()
  const t = useTranslations('Triagem')
  const tm = useTranslations('ModalidadeFila')
  const tComum = useTranslations('Comum')
  const [grupo, setGrupo] = useState('intraoral')
  const [itens, setItens] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [porTipo, setPorTipo] = useState<Record<string, number>>({})
  const [carregando, setCarregando] = useState(true)
  const [selecionadas, setSelecionadas] = useState<number[]>([])
  const [marcando, setMarcando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [erro, setErro] = useState('')
  const [ampliada, setAmpliada] = useState<number | null>(null)

  const { semConexao, verificando, tentarDeNovo } = useVerificarSessao((sessao) => {
    if (!PERFIS_PERMITIDOS.includes(sessao.perfil)) {
      router.push('/acesso-negado?de=/curadoria/triagem')
      return
    }
    const doEndereco = new URLSearchParams(window.location.search).get('tipo')
    const inicial = doEndereco && ORDEM_MODALIDADES.includes(doEndereco as (typeof ORDEM_MODALIDADES)[number]) ? doEndereco : 'intraoral'
    setGrupo(inicial)
    void carregar(inicial)
  })

  useEffect(() => {
    if (ampliada === null) return
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') setAmpliada(null)
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [ampliada])

  async function carregar(tipo: string, skip = 0) {
    setCarregando(true)
    setErro('')
    const r = await fetchOuNulo(`${API}/curation/pending?skip=${skip}&limit=${POR_PAGINA}&tipo=${encodeURIComponent(tipo)}`, {
      credentials: 'include',
    })
    if (!r || !r.ok) {
      setErro(r ? await lerErro(r, t('erroCarregar')) : tComum('semConexao'))
      setCarregando(false)
      return
    }
    const dados = await r.json()
    setItens((atuais) => (skip ? [...atuais, ...(dados.itens ?? [])] : dados.itens ?? []))
    setTotal(dados.total_pendentes ?? 0)
    setPorTipo(dados.por_tipo ?? {})
    setCarregando(false)
  }

  function trocarGrupo(tipo: string) {
    setGrupo(tipo)
    setSelecionadas([])
    setAviso('')
    window.history.replaceState(null, '', `${window.location.pathname}?tipo=${encodeURIComponent(tipo)}`)
    void carregar(tipo)
  }

  function alternar(id: number) {
    setSelecionadas((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  async function marcar(tipo: string) {
    if (!selecionadas.length) return
    setMarcando(true)
    setErro('')
    setAviso('')
    const ids = [...selecionadas].sort((a, b) => a - b)
    const r = await fetchOuNulo(`${API}/curation/triagem`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orthanc_reference_ids: ids, tipo }),
    })
    setMarcando(false)
    if (!r) {
      setErro(tComum('semConexao'))
      return
    }
    if (!r.ok) {
      setErro(await lerErro(r, t('erroMarcar')))
      return
    }
    const d = await r.json()
    setAviso(t('marcadas', { n: d.alteradas, tipo: tm(tipo) }))
    setSelecionadas([])
    void carregar(grupo)
  }

  if (semConexao) return <AvisoSemConexao aoTentar={tentarDeNovo} ocupado={verificando} />
  if (verificando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-base">
        <p className="text-slate-300">{tComum('carregando')}</p>
      </main>
    )
  }

  // "intraoral" e "nao informado" sempre (sao os grupos a separar); os
  // demais quando houver imagens (para corrigir um tipo, se preciso)
  const grupos = ORDEM_MODALIDADES.filter(
    (m) => m === grupo || m === 'intraoral' || m === 'nao_informado' || (porTipo[m] ?? 0) > 0,
  )

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Topbar />
        <main className="flex-1 space-y-5 overflow-y-auto p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="titulo-pagina tela-entra">
                {t('tituloPrefixo')} <span className="text-teal-600 dark:text-teal-300">{t('tituloDestaque')}</span>
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-400">{t('explica')}</p>
            </div>
            <Link href="/curadoria" className="rounded-lg border border-base-border px-3 py-1.5 text-sm text-ink hover:bg-white/5">
              {t('voltar')}
            </Link>
          </div>

          {/* barra de acoes presa no topo ao rolar */}
          <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 rounded-xl border border-base-border bg-base-surface/95 p-3 backdrop-blur">
            <label className="flex items-center gap-2 text-sm text-ink-2">
              {t('mostrar')}
              <select
                value={grupo}
                onChange={(e) => trocarGrupo(e.target.value)}
                className="rounded-lg border border-base-border bg-base-surface2 px-2 py-1 text-sm text-ink"
              >
                {grupos.map((m) => (
                  <option key={m} value={m}>
                    {tm('opcao', { nome: tm(m), total: porTipo[m] ?? 0 })}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => setSelecionadas(itens.map((i) => i.orthanc_reference_id))} className="text-sm text-teal-300 hover:underline">
              {t('selecionarTodas')}
            </button>
            {selecionadas.length > 0 && (
              <>
                <span className="text-sm font-medium text-ink">{t('selecionadas', { n: selecionadas.length })}</span>
                <button type="button" onClick={() => setSelecionadas([])} className="text-sm text-slate-400 hover:underline">
                  {t('limpar')}
                </button>
              </>
            )}
            <div role="group" aria-label={t('marcarComo')} className="ml-auto flex flex-wrap items-center gap-2">
              <span aria-hidden="true" className="text-xs text-ink-2">
                {t('marcarComoCurto')}
              </span>
              {TIPOS_EXAME.map((tipo) => (
                <button
                  key={tipo}
                  type="button"
                  disabled={!selecionadas.length || marcando}
                  onClick={() => void marcar(tipo)}
                  className="rounded-lg border border-teal-400/50 bg-teal-400/10 px-3 py-1.5 text-sm font-medium text-teal-100 hover:bg-teal-400/20 disabled:opacity-40"
                >
                  {tm(tipo)}
                </button>
              ))}
            </div>
          </div>

          {aviso && (
            <p role="status" className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
              {aviso}
            </p>
          )}
          {erro && (
            <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {erro}
            </p>
          )}

          {!carregando && itens.length === 0 && !erro && <p className="text-sm text-slate-400">{t('vazio')}</p>}

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {itens.map((item) => {
              const id = item.orthanc_reference_id
              const marcada = selecionadas.includes(id)
              return (
                <li key={id} className="relative">
                  <button
                    type="button"
                    aria-pressed={marcada}
                    aria-label={t('imagem', { id })}
                    onClick={() => alternar(id)}
                    className={`block w-full overflow-hidden rounded-xl border-2 bg-black transition ${
                      marcada ? 'border-teal-300 ring-2 ring-teal-300/50' : 'border-base-border hover:border-teal-300/50'
                    }`}
                  >
                    <MiniaturaFila orthancReferenceId={id} alt={t('imagem', { id })} className="aspect-square w-full object-contain" />
                    {marcada && (
                      <span aria-hidden="true" className="absolute left-2 top-2 rounded-full bg-teal-300 px-1.5 text-xs font-bold text-black">
                        ✓
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmpliada(id)}
                    aria-label={t('ampliar', { id })}
                    title={t('ampliar', { id })}
                    className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white hover:bg-black"
                  >
                    ⤢
                  </button>
                </li>
              )
            })}
          </ul>

          {itens.length < total && (
            <button
              type="button"
              disabled={carregando}
              onClick={() => void carregar(grupo, itens.length)}
              className="rounded-lg border border-base-border px-4 py-2 text-sm text-ink hover:bg-white/5"
            >
              {t('carregarMais', { faltam: total - itens.length })}
            </button>
          )}
        </main>
      </div>

      {ampliada !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setAmpliada(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('imagem', { id: ampliada })}
            className="flex max-h-full w-full max-w-4xl flex-col gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <MiniaturaFila orthancReferenceId={ampliada} alt={t('ampliada', { id: ampliada })} className="max-h-[85vh] w-full object-contain" />
            <button type="button" onClick={() => setAmpliada(null)} className="self-end rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20">
              {t('fechar')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
