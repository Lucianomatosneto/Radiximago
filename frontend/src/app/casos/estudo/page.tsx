'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import Sidebar from '../../../components/Sidebar'
import Topbar from '../../../components/Topbar'
import AvisoNaoDiagnostico from '../../../components/casos/AvisoNaoDiagnostico'
import MarcadorAchado from '../../../components/curadoria/MarcadorAchado'
import { obterSessaoAtual } from '../../../lib/sessao'
import { PERFIS_EQUIPE, apiJson, urlFoto, type AnotacaoCaso, type DetalheCaso } from '../../../lib/casos'
import type { Marcacao } from '../../../lib/marcacoes'

// VER ESTUDOS (Etapa 3): abre as imagens marcadas nas caixas de selecao
// (de uma ou de varias pastas) para o professor/curador marcar e anotar.
// Passa as imagens pela seta da tela ou pelas setas ← → do teclado.
// Salvar cria uma VERSAO NOVA das anotacoes de cada pasta alterada (a
// anterior fica no historico) - e assim tambem se "edita depois do envio".
// Endereco: /casos/estudo?sel=<pasta>-<imagem>,...&inicio=<n>

type Anotacoes = Record<string, AnotacaoCaso>

function Estudo() {
  const router = useRouter()
  const busca = useSearchParams()
  const t = useTranslations('Casos')
  const selecao = useMemo(
    () => (busca.get('sel') || '').split(',').map((par) => par.split('-').map(Number)).filter(([c, i]) => c > 0 && i > 0) as [number, number][],
    [busca]
  )
  const [casos, setCasos] = useState<Record<number, DetalheCaso>>({})
  const [anotacoes, setAnotacoes] = useState<Record<number, Anotacoes>>({})
  const [comentarios, setComentarios] = useState<Record<number, string>>({})
  const [alterados, setAlterados] = useState<Set<number>>(new Set())
  const [indice, setIndice] = useState(Math.max(0, Number(busca.get('inicio') || 0)))
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState('')

  useEffect(() => {
    obterSessaoAtual().then(async (s) => {
      if (!s) return router.push('/login')
      if (!PERFIS_EQUIPE.includes(s.perfil)) return router.push('/acesso-negado')
      const ids = Array.from(new Set(selecao.map(([c]) => c)))
      try {
        const lista = await Promise.all(ids.map((id) => apiJson<DetalheCaso>(`/casos/${id}`)))
        const mapa: Record<number, DetalheCaso> = {}
        const anot: Record<number, Anotacoes> = {}
        const coment: Record<number, string> = {}
        for (const c of lista) {
          mapa[c.id] = c
          anot[c.id] = JSON.parse(JSON.stringify(c.revisao?.anotacoes ?? {}))
          coment[c.id] = c.revisao?.comentario ?? ''
        }
        setCasos(mapa)
        setAnotacoes(anot)
        setComentarios(coment)
      } catch (e) {
        setErro((e as Error).message)
      }
    })
  }, [router, selecao])

  // na ordem das pastas e, dentro de cada pasta, na ordem das fotos (nao na ordem em que foram marcadas)
  const ordemPasta = Array.from(new Set(selecao.map(([c]) => c)))
  const posicao = (c: number, i: number) => casos[c]?.imagens.findIndex((img) => img.id === i) ?? -1
  const itens = selecao
    .filter(([c, i]) => posicao(c, i) >= 0)
    .sort((a, b) => ordemPasta.indexOf(a[0]) - ordemPasta.indexOf(b[0]) || posicao(a[0], a[1]) - posicao(b[0], b[1]))
  const [casoId, imagemId] = itens[Math.min(indice, Math.max(itens.length - 1, 0))] ?? [0, 0]
  const caso = casos[casoId]
  const imagem = caso?.imagens.find((i) => i.id === imagemId)
  const atual = anotacoes[casoId]?.[String(imagemId)] ?? { texto: '', marcacoes: [] }

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement
      if (alvo && ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName)) return
      if (e.key === 'ArrowRight') setIndice((i) => Math.min(i + 1, itens.length - 1))
      if (e.key === 'ArrowLeft') setIndice((i) => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [itens.length])

  function mudar(parcial: Partial<AnotacaoCaso>) {
    setSalvo('')
    setAnotacoes((a) => ({ ...a, [casoId]: { ...a[casoId], [String(imagemId)]: { ...atual, ...parcial } } }))
    setAlterados((s) => new Set(s).add(casoId))
  }

  async function salvar() {
    setErro('')
    setSalvando(true)
    try {
      for (const id of Array.from(alterados)) {
        await apiJson(`/casos/${id}/revisoes`, {
          method: 'POST',
          body: JSON.stringify({ comentario: comentarios[id] || null, anotacoes: anotacoes[id] }),
        })
      }
      setAlterados(new Set())
      setSalvo(t('estudo.salvo'))
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  if (!caso && !erro) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-base">
        <p className="text-sm text-slate-400">{t('carregando')}</p>
      </main>
    )
  }

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar recolhivel />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 space-y-3 p-3 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <button type="button" onClick={() => router.back()} className="text-sm text-slate-500 hover:text-brand">← {t('voltar')}</button>
              <h1 className="titulo-pagina">{t('estudo.titulo')}</h1>
            </div>
            <div className="flex items-center gap-2">
              {alterados.size > 0 && <span className="text-xs text-amber-600 dark:text-amber-300">{t('estudo.naoSalvo')}</span>}
              {salvo && <span className="text-xs text-emerald-600 dark:text-emerald-300" role="status">{salvo}</span>}
              <button type="button" onClick={salvar} disabled={salvando || alterados.size === 0} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                {salvando ? t('estudo.salvando') : t('estudo.salvarEnviar')}
              </button>
            </div>
          </div>
          <AvisoNaoDiagnostico />
          {erro && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300" role="alert">{erro}</p>}

          {caso && imagem && (
            <div className="grid gap-3 xl:grid-cols-[1fr_360px]">
              <section className="space-y-2 rounded-2xl border border-base-border bg-base-surface p-3">
                <div className="flex items-center justify-between gap-2">
                  <button type="button" onClick={() => setIndice((i) => Math.max(i - 1, 0))} disabled={indice === 0} className="rounded-lg border border-base-border px-3 py-1.5 text-sm disabled:opacity-30" aria-label={t('anterior')}><ChevronLeft aria-hidden="true" className="h-4 w-4" /></button>
                  <span className="text-sm text-ink">{t('imagemDe', { n: indice + 1, total: itens.length })}</span>
                  <button type="button" onClick={() => setIndice((i) => Math.min(i + 1, itens.length - 1))} disabled={indice >= itens.length - 1} className="rounded-lg border border-base-border px-3 py-1.5 text-sm disabled:opacity-30" aria-label={t('proxima')}><ChevronRight aria-hidden="true" className="h-4 w-4" /></button>
                </div>
                <div className="h-[62vh] min-h-[320px]">
                  <MarcadorAchado
                    key={`${casoId}-${imagemId}`}
                    urlImagem={urlFoto(casoId, imagemId)}
                    semRecorte
                    marcacoes={atual.marcacoes as Marcacao[]}
                    onMarcar={(m) => mudar({ marcacoes: m })}
                  />
                </div>
                <p className="text-center text-[11px] text-slate-500">{t('dicaTeclado')}</p>
              </section>
              <aside className="space-y-3">
                <section className="space-y-1 rounded-2xl border border-base-border bg-base-surface p-3 text-sm">
                  <h2 className="font-semibold text-ink">{caso.paciente.nome}</h2>
                  <p className="text-slate-500">{t('pasta', { id: caso.id })} · {t('alunoX', { aluno: caso.aluno ?? '' })} · {t(`modalidades.${caso.modalidade}`)}</p>
                  <p className="whitespace-pre-wrap text-ink">{caso.descricao}</p>
                  <div className="rounded-lg border border-base-border p-2">
                    <div className="text-xs font-semibold text-slate-500">ⓘ {t('doAluno')}</div>
                    {imagem.dentes.length > 0 && <div className="text-ink">{t('dentes')}: {imagem.dentes.join(', ')}</div>}
                    <div className="whitespace-pre-wrap text-ink">{imagem.observacao || '—'}</div>
                  </div>
                </section>
                <section className="space-y-2 rounded-2xl border border-violet-400/40 bg-base-surface p-3">
                  <label htmlFor="anot-img" className="block text-sm font-semibold text-ink">{t('estudo.anotacaoImagem')}</label>
                  <textarea id="anot-img" rows={5} maxLength={8000} value={atual.texto ?? ''} onChange={(e) => mudar({ texto: e.target.value })} className="w-full rounded-lg border border-base-border bg-base-surface2 px-2.5 py-1.5 text-sm text-ink" placeholder={t('estudo.anotacaoExemplo')} />
                  <label htmlFor="anot-geral" className="block text-sm font-semibold text-ink">{t('comentarioGeral')}</label>
                  <textarea id="anot-geral" rows={3} maxLength={8000} value={comentarios[casoId] ?? ''} onChange={(e) => { setComentarios({ ...comentarios, [casoId]: e.target.value }); setAlterados((s) => new Set(s).add(casoId)); setSalvo('') }} className="w-full rounded-lg border border-base-border bg-base-surface2 px-2.5 py-1.5 text-sm text-ink" />
                  <p className="text-[11px] text-slate-500">{t('estudo.ajudaVersao', { versao: (caso.revisao?.versao ?? 0) + 1 })}</p>
                </section>
              </aside>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default function EstudoPage() {
  return (
    <Suspense fallback={null}>
      <Estudo />
    </Suspense>
  )
}
