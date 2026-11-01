'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { COR_ETAPA, dataHora, urlFoto, type ResumoCaso } from '../../lib/casos'

// GRADE DE PASTAS DE PACIENTES (Etapa 3 da especificacao) - no estilo do
// resultado da busca avancada, mas so com: caixa de selecao da imagem,
// lupa, ⓘ (ficha + descricao do aluno ao passar o mouse) e setas pequenas
// para passar as imagens da pasta. Lupa: mouse em cima amplia; tirou,
// volta; um clique FIXA a ampliacao (continua enquanto se passam as
// imagens). "Ver estudos" (na tela que usa a grade) abre as marcadas.

export type Selecao = Set<string> // "<pasta>-<imagem>"

export default function GradePastas({
  casos,
  selecao,
  onSelecao,
  mostrarPaciente = true,
}: {
  casos: ResumoCaso[]
  selecao?: Selecao
  onSelecao?: (s: Selecao) => void
  mostrarPaciente?: boolean
}) {
  const t = useTranslations('Casos')
  const [indices, setIndices] = useState<Record<number, number>>({})
  const [lupa, setLupa] = useState<{ caso: number; fixa: boolean } | null>(null)

  const casoLupa = lupa ? casos.find((c) => c.id === lupa.caso) : null
  const imgLupa = casoLupa ? casoLupa.imagens[indices[casoLupa.id] ?? 0] : null

  function passar(caso: ResumoCaso, d: number) {
    const total = caso.imagens.length
    setIndices((s) => ({ ...s, [caso.id]: ((s[caso.id] ?? 0) + d + total) % total }))
  }

  function alternar(chave: string) {
    if (!selecao || !onSelecao) return
    const nova = new Set(selecao)
    if (nova.has(chave)) nova.delete(chave)
    else nova.add(chave)
    onSelecao(nova)
  }

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
        {casos.map((c) => {
          const i = Math.min(indices[c.id] ?? 0, Math.max(c.imagens.length - 1, 0))
          const img = c.imagens[i]
          const chave = img ? `${c.id}-${img.id}` : ''
          return (
            <article key={c.id} data-pasta={c.id} className="group relative flex flex-col overflow-hidden rounded-2xl border border-base-border bg-base-surface shadow-sm">
              <div className="relative aspect-[4/3] bg-black">
                {img && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urlFoto(c.id, img.id, { miniatura: true })} alt={t('imagemDe', { n: i + 1, total: c.imagens.length })} className="h-full w-full object-contain" loading="lazy" />
                )}
                {selecao && img && (
                  <label className="absolute left-2 top-2 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md bg-black/60" title={t('grade.selecionar')}>
                    <input type="checkbox" checked={selecao.has(chave)} onChange={() => alternar(chave)} aria-label={t('grade.selecionarImagem', { n: i + 1, paciente: c.paciente.nome })} className="h-4 w-4" />
                  </label>
                )}
                <div className="absolute right-2 top-2 flex gap-1">
                  <button
                    type="button"
                    onMouseEnter={() => setLupa((l) => (l?.fixa ? l : { caso: c.id, fixa: false }))}
                    onMouseLeave={() => setLupa((l) => (l?.fixa ? l : null))}
                    onClick={() => setLupa((l) => (l?.fixa && l.caso === c.id ? null : { caso: c.id, fixa: true }))}
                    className={`flex h-7 w-7 items-center justify-center rounded-md text-sm ${lupa?.fixa && lupa.caso === c.id ? 'bg-brand text-white' : 'bg-black/60 text-white'}`}
                    aria-label={t('grade.lupa')}
                    aria-pressed={!!(lupa?.fixa && lupa.caso === c.id)}
                  >
                    🔍
                  </button>
                  <span className="relative">
                    <button type="button" className="peer flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-sm font-bold text-white" aria-label={t('grade.informacoes')}>
                      i
                    </button>
                    <div role="tooltip" className="pointer-events-none invisible absolute right-0 top-8 z-40 w-72 space-y-1 rounded-xl border border-base-border bg-base-surface p-3 text-xs text-ink opacity-0 shadow-2xl transition peer-hover:visible peer-hover:opacity-100 peer-focus:visible peer-focus:opacity-100">
                      <p className="font-semibold">{c.paciente.nome}</p>
                      <p>{c.paciente.idade} {t('anos')} · {t(`generos.${c.paciente.genero}`)} · {t(`modalidades.${c.modalidade}`)}</p>
                      <p>{t('alunoX', { aluno: c.aluno ?? '' })} · {dataHora(c.criado_em)}</p>
                      <p className="whitespace-pre-wrap"><span className="text-slate-500">{t('novo.descricao')}: </span>{c.descricao}</p>
                      {img && (img.dentes.length > 0 || img.observacao) && (
                        <p className="whitespace-pre-wrap"><span className="text-slate-500">{t('grade.estaImagem')}: </span>{img.dentes.length ? `${t('dentes')} ${img.dentes.join(', ')}. ` : ''}{img.observacao}</p>
                      )}
                      {c.tratamentos.length > 0 && <p><span className="text-slate-500">{t('tratamentoNecessario')}: </span>{c.tratamentos.map((x) => t(`tratamentos.${x}`)).join(', ')}</p>}
                    </div>
                  </span>
                </div>
                {c.imagens.length > 1 && (
                  <>
                    <button type="button" onClick={() => passar(c, -1)} className="absolute left-1 top-1/2 flex h-7 w-6 -translate-y-1/2 items-center justify-center rounded bg-black/50 text-xs text-white" aria-label={t('anterior')}>◀</button>
                    <button type="button" onClick={() => passar(c, 1)} className="absolute right-1 top-1/2 flex h-7 w-6 -translate-y-1/2 items-center justify-center rounded bg-black/50 text-xs text-white" aria-label={t('proxima')}>▶</button>
                  </>
                )}
                <span className="absolute bottom-1 right-2 rounded bg-black/60 px-1.5 text-[11px] text-white">{i + 1}/{c.imagens.length}</span>
              </div>
              <Link href={`/casos/${c.id}`} className="flex flex-1 flex-col gap-1 p-2.5 hover:bg-base-surface2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-ink">📁 {c.aluno}</span>
                  {c.nova && <span className="rounded-full bg-brand px-1.5 text-[10px] font-semibold text-white">{t('grade.nova')}</span>}
                  {c.corrigida && <span className="rounded-full bg-violet-500 px-1.5 text-[10px] font-semibold text-white">{t('grade.corrigida')}</span>}
                </div>
                {mostrarPaciente && <span className="truncate text-xs text-slate-500">{c.paciente.nome}</span>}
                <span className={`mt-auto w-fit rounded-full border px-2 py-0.5 text-[11px] font-semibold ${COR_ETAPA[c.etapa]}`}>{t(`etapas.${c.etapa}`)}</span>
              </Link>
            </article>
          )
        })}
      </div>

      {casoLupa && imgLupa && (
        <div className={`fixed bottom-4 right-4 z-50 w-[min(92vw,720px)] rounded-2xl border border-base-border bg-black p-2 shadow-2xl ${lupa?.fixa ? '' : 'pointer-events-none'}`} role="dialog" aria-label={t('grade.lupa')}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={urlFoto(casoLupa.id, imgLupa.id)} alt="" className="max-h-[70vh] w-full object-contain" />
          <div className="flex items-center justify-between gap-2 px-1 pt-1 text-xs text-white">
            <span>{casoLupa.aluno} · {(indices[casoLupa.id] ?? 0) + 1}/{casoLupa.imagens.length}</span>
            {lupa?.fixa && (
              <span className="flex gap-1">
                <button type="button" onClick={() => passar(casoLupa, -1)} className="rounded bg-white/20 px-2" aria-label={t('anterior')}>◀</button>
                <button type="button" onClick={() => passar(casoLupa, 1)} className="rounded bg-white/20 px-2" aria-label={t('proxima')}>▶</button>
                <button type="button" onClick={() => setLupa(null)} className="rounded bg-white/20 px-2" aria-label={t('fechar')}>✕</button>
              </span>
            )}
          </div>
        </div>
      )}
    </>
  )
}
