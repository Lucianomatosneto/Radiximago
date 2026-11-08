'use client'

// Escolha de PESSOAS e GRUPOS para quem a imagem vai (etapa C, 08/11/2026).
// Usado na tela Enviar imagem e em "Imagens enviadas por mim". Os grupos sao
// so os do proprio usuario (tela Grupos); as pessoas vem da busca por nome ou
// e-mail (o e-mail aparece mascarado).

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { obterSessaoAtual } from '../../lib/sessao'

const API = process.env.NEXT_PUBLIC_API_URL
const PERFIS_COM_GRUPOS = ['professor', 'curador', 'administrador']

export type Pessoa = { id: number; nome: string; perfil: string; email: string }
type Grupo = { id: number; nome: string; membros: Pessoa[] }

export default function SeletorPessoasGrupos({
  pessoas,
  grupos,
  aoMudar,
  somentePessoas = false,
  urlBusca = '/grupos/pessoas',
  minimoBusca = 2,
  ocultarSemGrupos = false,
}: {
  pessoas: Pessoa[]
  grupos: number[]
  aoMudar: (pessoas: Pessoa[], grupos: number[]) => void
  /** tela Grupos: so escolhe pessoas (grupo dentro de grupo nao existe) */
  somentePessoas?: boolean
  /** de onde vem a busca de pessoas (prancha: qualquer usuario, /prancha/pessoas) */
  urlBusca?: string
  minimoBusca?: number
  /** quem nao tem grupos nao ve o aviso "crie em Grupos" (ex.: estudante na prancha) */
  ocultarSemGrupos?: boolean
}) {
  const t = useTranslations('EnviarImagem.seletor')
  const [meusGrupos, setMeusGrupos] = useState<Grupo[]>([])
  const [busca, setBusca] = useState('')
  const [achadas, setAchadas] = useState<Pessoa[]>([])

  useEffect(() => {
    if (somentePessoas) return
    // grupos so existem para professor, curador e administrador
    obterSessaoAtual()
      .then((s) => (s && PERFIS_COM_GRUPOS.includes(s.perfil)
        ? fetch(`${API}/grupos`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : { grupos: [] }))
        : { grupos: [] }))
      .then((d) => setMeusGrupos(d.grupos ?? []))
      .catch(() => setMeusGrupos([]))
  }, [somentePessoas])

  useEffect(() => {
    if (busca.trim().length < minimoBusca) {
      setAchadas([])
      return
    }
    const id = setTimeout(() => {
      fetch(`${API}${urlBusca}?busca=${encodeURIComponent(busca.trim())}`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : { pessoas: [] }))
        .then((d) => setAchadas(d.pessoas ?? []))
        .catch(() => setAchadas([]))
    }, 300)
    return () => clearTimeout(id)
  }, [busca, urlBusca, minimoBusca])

  function alternarGrupo(id: number) {
    aoMudar(pessoas, grupos.includes(id) ? grupos.filter((g) => g !== id) : [...grupos, id])
  }

  return (
    <div className="space-y-3" data-teste="seletor-pessoas-grupos">
      {somentePessoas ? null : meusGrupos.length > 0 ? (
        <div>
          <p className="mb-1 text-xs font-medium text-ink-2">{t('grupos')}</p>
          <div className="flex flex-wrap gap-2">
            {meusGrupos.map((g) => (
              <label key={g.id} className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${grupos.includes(g.id) ? 'border-brand bg-brand/10 text-ink' : 'border-base-border text-ink-2'}`}>
                <input type="checkbox" checked={grupos.includes(g.id)} onChange={() => alternarGrupo(g.id)} className="sr-only" />
                {g.nome} <span className="text-ink-3">({g.membros.length})</span>
              </label>
            ))}
          </div>
        </div>
      ) : ocultarSemGrupos ? null : (
        <p className="text-xs text-ink-3">{t('semGrupos')}</p>
      )}
      <div>
        <label htmlFor="busca-pessoa" className="mb-1 block text-xs font-medium text-ink-2">{t('pessoas')}</label>
        <input id="busca-pessoa" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={t('buscar', { n: minimoBusca })}
               className="w-full rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-ink" />
        {achadas.length > 0 && (
          <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-base-border bg-base-surface text-sm">
            {achadas.filter((p) => !pessoas.some((x) => x.id === p.id)).map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => { aoMudar([...pessoas, p], grupos); setBusca('') }}
                        className="flex w-full justify-between gap-2 px-3 py-1.5 text-left hover:bg-base-surface2">
                  <span className="text-ink">{p.nome}</span>
                  <span className="text-xs text-ink-3">{t(`perfis.${p.perfil}`)} · {p.email}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {pessoas.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {pessoas.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-base-surface2 px-2 py-0.5 text-xs text-ink">
                {p.nome}
                <button type="button" onClick={() => aoMudar(pessoas.filter((x) => x.id !== p.id), grupos)}
                        aria-label={t('tirar', { nome: p.nome })} className="text-ink-3 hover:text-rose-500">×</button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
