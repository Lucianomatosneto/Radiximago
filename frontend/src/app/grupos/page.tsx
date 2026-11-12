'use client'

// GRUPOS DE ENVIO (etapa C, 08/11/2026): professor e curador montam os
// proprios grupos (por exemplo, uma turma) para enviar imagens de uma vez.
// Quem esta no grupo nao ve quem mais esta.

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Users } from 'lucide-react'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import SeletorPessoasGrupos, { type Pessoa } from '../../components/envios/SeletorPessoasGrupos'
import { useConfirmacao } from '../../components/useConfirmacao'
import { obterSessaoAtual } from '../../lib/sessao'

const API = process.env.NEXT_PUBLIC_API_URL
const PERFIS = ['professor', 'curador', 'administrador']
type Grupo = { id: number; nome: string; membros: Pessoa[] }

async function lerErro(r: Response, padrao: string) {
  try {
    const d = await r.json()
    if (typeof d?.detail === 'string') return d.detail
  } catch {
    // sem corpo
  }
  return padrao
}

export default function GruposPage() {
  const router = useRouter()
  const t = useTranslations('Grupos')
  const { pedirConfirmacao, quadroConfirmacao } = useConfirmacao()
  const [pronto, setPronto] = useState(false)
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [editando, setEditando] = useState<Grupo | null>(null)
  const [nome, setNome] = useState('')
  const [membros, setMembros] = useState<Pessoa[]>([])
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  async function carregar() {
    const r = await fetch(`${API}/grupos`, { credentials: 'include' })
    setGrupos(r.ok ? (await r.json()).grupos : [])
  }

  useEffect(() => {
    void obterSessaoAtual().then((s) => {
      if (!s) {
        router.push('/login')
        return
      }
      if (!PERFIS.includes(s.perfil)) {
        router.push('/acesso-negado?de=/grupos')
        return
      }
      setPronto(true)
      void carregar()
    })
  }, [router])

  function novo() {
    setEditando({ id: 0, nome: '', membros: [] })
    setNome('')
    setMembros([])
    setErro('')
  }

  function editar(g: Grupo) {
    setEditando(g)
    setNome(g.nome)
    setMembros(g.membros)
    setErro('')
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!editando) return
    setErro('')
    const r = await fetch(`${API}/grupos${editando.id ? `/${editando.id}` : ''}`, {
      method: editando.id ? 'PUT' : 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, membros_ids: membros.map((m) => m.id) }),
    })
    if (!r.ok) {
      setErro(await lerErro(r, t('erro')))
      return
    }
    setAviso(t('salvo'))
    setEditando(null)
    void carregar()
  }

  async function apagar(g: Grupo) {
    const sim = await pedirConfirmacao({
      titulo: t('apagarTitulo', { nome: g.nome }),
      texto: t('apagarTexto'),
      botao: t('apagarSim'),
      cancelar: t('cancelar'),
    })
    if (!sim) return
    const r = await fetch(`${API}/grupos/${g.id}`, { method: 'DELETE', credentials: 'include' })
    if (!r.ok) setErro(await lerErro(r, t('erro')))
    else setAviso(t('apagado'))
    void carregar()
  }

  if (!pronto) {
    return <main className="flex min-h-screen items-center justify-center bg-base"><p className="text-sm text-slate-400">{t('carregando')}</p></main>
  }

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
            <button type="button" onClick={novo} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover">{t('novo')}</button>
          </div>
          {aviso && <p role="status" className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300">{aviso}</p>}

          {editando && (
            <form method="post" onSubmit={salvar} className="max-w-3xl space-y-4 rounded-2xl border border-base-border bg-base-surface p-4">
              <div>
                <label htmlFor="nome-grupo" className="mb-1 block text-sm font-medium text-ink">{t('nome')}</label>
                <input id="nome-grupo" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} required
                       placeholder={t('nomeExemplo')}
                       className="w-full rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-ink" />
              </div>
              <SeletorPessoasGrupos pessoas={membros} grupos={[]} aoMudar={(p) => setMembros(p)} somentePessoas />
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
                <li key={g.id} className="rounded-xl border border-base-border bg-base-surface p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 text-base font-semibold text-ink"><Users aria-hidden="true" className="h-4 w-4" /> {g.nome}</h2>
                    <span className="text-xs text-ink-3">{t('membros', { n: g.membros.length })}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-ink-2">{g.membros.map((m) => m.nome).join(', ') || t('semMembros')}</p>
                  <div className="mt-3 flex gap-3 text-xs">
                    <button type="button" onClick={() => editar(g)} className="text-brand underline">{t('editar')}</button>
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
