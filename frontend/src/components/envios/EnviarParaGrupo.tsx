'use client'

// "ENVIAR PARA UM GRUPO" NA GRADE DE IMAGENS (pedido do video, 22/11/2026).
// Antes, Grupos mandava usar "Preparar aula", que ficava escondido na tela de
// uma imagem. Agora, com imagens selecionadas (Banco de imagens):
// - so quem cria grupos (professor, pesquisador, curador, administrador);
// - escolhe um ou mais grupos SEUS, um recado e se podem comentar;
// - uma chamada por imagem e por grupo: POST /grupos/{id}/envios, com as
//   marcacoes oficiais da ficha ("ja enviada" nao conta como erro);
// - cria um grupo novo ali mesmo (quem for escolhido recebe CONVITE, como na
//   tela Grupos), que ja fica escolhido;
// - com UMA imagem, atalho para "Preparar aula" (marcacoes so do envio).
// Quem decide de verdade e o servidor (dono do grupo, ficha aprovada).

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Users } from 'lucide-react'
import SeletorPessoasGrupos, { type Pessoa } from './SeletorPessoasGrupos'
import { useSessaoAtual } from '../../lib/useVerificarSessao'
import { fetchOuNulo } from '../../lib/fetchSeguro'

const API = process.env.NEXT_PUBLIC_API_URL
const PERFIS = ['professor', 'pesquisador', 'curador', 'administrador']
const RECADO_MAX = 1000
type Grupo = { id: number; nome: string }

export default function EnviarParaGrupo({ curationIds, soIcone = false }: { curationIds: number[]; soIcone?: boolean }) {
  const t = useTranslations('EnviarParaGrupo')
  const tComum = useTranslations('Comum')
  const sessao = useSessaoAtual()
  const [aberto, setAberto] = useState(false)
  const [grupos, setGrupos] = useState<Grupo[] | null>(null)
  const [escolhidos, setEscolhidos] = useState<number[]>([])
  const [recado, setRecado] = useState('')
  const [comentar, setComentar] = useState(false)
  const [criando, setCriando] = useState(false)
  const [nomeNovo, setNomeNovo] = useState('')
  const [convidar, setConvidar] = useState<Pessoa[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')

  if (!sessao || !PERFIS.includes(sessao.perfil)) return null

  async function abrir() {
    const vaiAbrir = !aberto
    setAberto(vaiAbrir)
    setMensagem('')
    setErro('')
    if (vaiAbrir && grupos === null) {
      const r = await fetchOuNulo(`${API}/grupos`, { credentials: 'include' })
      setGrupos(r && r.ok ? ((await r.json()).grupos ?? []).map((g: Grupo) => ({ id: g.id, nome: g.nome })) : [])
    }
  }

  function alternar(id: number) {
    setEscolhidos((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]))
  }

  async function criarGrupo() {
    setErro('')
    const r = await fetchOuNulo(`${API}/grupos`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: nomeNovo.trim(), membros_ids: convidar.map((p) => p.id) }),
    })
    if (!r) return setErro(tComum('semConexao'))
    if (!r.ok) return setErro(t('erroCriar'))
    const novo: Grupo = await r.json()
    setGrupos((a) => [...(a ?? []), { id: novo.id, nome: novo.nome }])
    setEscolhidos((a) => [...a, novo.id])
    setCriando(false)
    setNomeNovo('')
    setConvidar([])
    window.dispatchEvent(new Event('radix-grupos-mudou'))
  }

  async function enviar() {
    setOcupado(true)
    setErro('')
    setMensagem('')
    let enviadas = 0
    let jaEstavam = 0
    try {
      for (const grupoId of escolhidos) {
        for (const curationId of curationIds) {
          const r = await fetchOuNulo(`${API}/grupos/${grupoId}/envios`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ curation_id: curationId, mensagem: recado.trim() || null, permite_comentar: comentar }),
          })
          if (!r) {
            setErro(tComum('semConexao'))
            return
          }
          if (r.status === 409) jaEstavam += 1
          else if (r.status === 429) {
            setErro(t('erroLimite'))
            return
          } else if (!r.ok) {
            setErro(t('erroEnviar'))
            return
          } else enviadas += 1
        }
      }
      setMensagem(t('resultado', { enviadas, ja: jaEstavam }))
    } finally {
      setOcupado(false)
    }
  }

  const n = curationIds.length
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void abrir()}
        aria-expanded={aberto}
        title={t('botao')}
        className="flex h-8 items-center gap-1.5 rounded-lg border border-brand/60 bg-brand/15 px-3 text-xs font-semibold text-brand transition hover:bg-brand/25"
      >
        <Users aria-hidden="true" className="h-4 w-4" />
        {soIcone ? <span className="sr-only">{t('botao')}</span> : t('botao')}
      </button>
      {aberto && (
        <div className="absolute right-0 z-50 mt-1 w-80 space-y-3 rounded-xl border border-base-border bg-base-surface p-3 text-left text-sm text-ink shadow-xl">
          <p className="text-xs text-ink-2">{t('explica', { n })}</p>
          {grupos === null ? (
            <p className="text-xs text-ink-3">{tComum('carregando')}</p>
          ) : grupos.length === 0 && !criando ? (
            <p className="text-xs text-ink-3">{t('semGrupos')}</p>
          ) : (
            <fieldset className="max-h-40 space-y-1 overflow-y-auto">
              <legend className="mb-1 text-xs font-semibold">{t('meusGrupos')}</legend>
              {grupos.map((g) => (
                <label key={g.id} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={escolhidos.includes(g.id)} onChange={() => alternar(g.id)} className="accent-brand" />
                  {g.nome}
                </label>
              ))}
            </fieldset>
          )}

          {criando ? (
            <div className="space-y-2 rounded-lg border border-base-border p-2">
              <input value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)} maxLength={80} aria-label={t('nomeNovo')}
                     placeholder={t('nomeNovo')} className="w-full rounded border border-base-border bg-base-surface2 px-2 py-1 text-xs" />
              <p className="text-[11px] text-ink-3">{t('convidarAjuda')}</p>
              <SeletorPessoasGrupos pessoas={convidar} grupos={[]} aoMudar={(p) => setConvidar(p)} somentePessoas />
              <div className="flex gap-2">
                <button type="button" disabled={!nomeNovo.trim()} onClick={() => void criarGrupo()}
                        className="rounded bg-brand px-3 py-1 text-xs text-white disabled:opacity-50">{t('criar')}</button>
                <button type="button" onClick={() => setCriando(false)} className="text-xs text-ink-3">{t('cancelar')}</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setCriando(true)} className="text-xs font-medium text-brand underline">{t('criarNovo')}</button>
          )}

          <textarea value={recado} onChange={(e) => setRecado(e.target.value)} maxLength={RECADO_MAX} rows={2}
                    aria-label={t('recado')} placeholder={t('recado')}
                    className="w-full rounded border border-base-border bg-base-surface2 px-2 py-1 text-xs" />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={comentar} onChange={(e) => setComentar(e.target.checked)} className="accent-brand" />
            {t('comentar')}
          </label>
          {n === 1 && (
            <Link href={`/grupos/aula?imagem=${curationIds[0]}`} className="block text-xs text-brand underline">
              {t('prepararAula')}
            </Link>
          )}
          {erro && <p role="alert" className="text-xs text-red-600 dark:text-red-300">{erro}</p>}
          {mensagem && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">{mensagem}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={ocupado || !escolhidos.length || !n} onClick={() => void enviar()}
                    className="rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              {t('enviar', { n })}
            </button>
            <button type="button" onClick={() => setAberto(false)} className="text-xs text-ink-3">{t('fechar')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
