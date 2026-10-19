'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { TOPICOS_AJUDA, type CategoriaAjuda, type IdiomaAjuda, type TopicoAjuda } from '../../lib/ajuda/conteudo'
import { buscarAjuda, topicosDaTela, visiveisPara } from '../../lib/ajuda/busca'

// CENTRAL DE AJUDA - abre pelo botao "Ajuda" do topo da tela.
//
// Um painel na lateral direita com uma caixa de busca: o usuario escreve do
// jeito dele ("como apago uma anotação", "imprimir", "dente 36") e recebe
// os topicos que explicam aquele recurso em passos curtos. Sem busca, o
// painel mostra primeiro a ajuda "Nesta tela" e depois todos os assuntos.
//
// Cada perfil so ve a ajuda das telas que pode usar (o estudante nao recebe
// topicos de curadoria ou de administracao). Tudo roda no navegador: a
// pergunta digitada nao e enviada a nenhum servidor.

const ORDEM_CATEGORIAS: CategoriaAjuda[] = [
  'primeirosPassos',
  'pesquisa',
  'visualizador',
  'minhasImagens',
  'anotacoes',
  'compartilhar',
  'impressao',
  'curadoria',
  'administracao',
  'conta',
]

export default function CentralAjuda({ aberta, onFechar, perfil }: { aberta: boolean; onFechar: () => void; perfil: string | null }) {
  const t = useTranslations('Ajuda')
  const idioma: IdiomaAjuda = useLocale() === 'en' ? 'en' : 'pt'
  const caminho = usePathname()
  const [consulta, setConsulta] = useState('')
  const [expandido, setExpandido] = useState<string | null>(null)
  const campoRef = useRef<HTMLInputElement>(null)

  const visiveis = useMemo(() => visiveisPara(TOPICOS_AJUDA, perfil), [perfil])
  const resultados = useMemo(() => buscarAjuda(visiveis, consulta, idioma), [visiveis, consulta, idioma])
  const daTela = useMemo(() => topicosDaTela(visiveis, caminho), [visiveis, caminho])
  const buscando = consulta.trim().length > 0

  // ao abrir: busca limpa e cursor na caixa de busca
  useEffect(() => {
    if (!aberta) return
    setConsulta('')
    setExpandido(null)
    const id = setTimeout(() => campoRef.current?.focus(), 30)
    return () => clearTimeout(id)
  }, [aberta])

  // Esc: limpa a busca; com a busca vazia, fecha a ajuda
  useEffect(() => {
    if (!aberta) return
    function tecla(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.preventDefault()
      if (campoRef.current && campoRef.current.value) setConsulta('')
      else onFechar()
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [aberta, onFechar])

  // o melhor resultado ja aparece aberto (resposta direta)
  useEffect(() => {
    if (buscando) setExpandido(resultados[0]?.id ?? null)
  }, [buscando, resultados])

  if (!aberta || typeof document === 'undefined') return null

  const cartao = (topico: TopicoAjuda) => {
    const texto = topico[idioma]
    const aberto = expandido === topico.id
    return (
      <li key={topico.id} className={`rounded-lg border transition-colors ${aberto ? 'border-teal-300/50 bg-teal-400/10' : 'border-white/10 bg-white/3 hover:border-teal-300/30'}`}>
        <button
          type="button"
          onClick={() => setExpandido(aberto ? null : topico.id)}
          aria-expanded={aberto}
          className="flex w-full items-start gap-2 px-3 py-2.5 text-left outline-hidden focus-visible:ring-2 focus-visible:ring-amber-300"
        >
          <span className={`mt-0.5 text-xs text-teal-200 transition-transform ${aberto ? 'rotate-90' : ''}`} aria-hidden="true">
            ▶
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">{texto.titulo}</span>
            <span className="mt-0.5 block text-xs leading-snug text-slate-400">{texto.resumo}</span>
          </span>
        </button>
        {aberto && (
          <div className="px-3 pb-3 pl-8">
            <ol className="list-decimal space-y-1.5 pl-4 text-[13px] leading-snug text-slate-200 marker:font-semibold marker:text-teal-300">
              {texto.passos.map((passo, i) => (
                <li key={i}>{passo}</li>
              ))}
            </ol>
            {texto.dica && (
              <p className="mt-2.5 rounded-md border border-amber-300/30 bg-amber-300/10 px-2.5 py-1.5 text-xs leading-snug text-amber-100">
                <span className="font-semibold">💡 {t('dica')}:</span> {texto.dica}
              </p>
            )}
            {topico.link && topico.link !== caminho && (
              <Link
                href={topico.link}
                onClick={onFechar}
                className="mt-2.5 inline-flex items-center gap-1 rounded-md border border-teal-300/40 px-2.5 py-1 text-xs font-semibold text-teal-200 hover:bg-teal-400/15"
              >
                {t('irParaTela')} →
              </Link>
            )}
          </div>
        )}
      </li>
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-400 flex justify-end" role="presentation">
      {/* fundo escurecido: clicar fora fecha */}
      <button type="button" aria-label={t('fechar')} onClick={onFechar} className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-[2px]" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t('titulo')}
        className="relative flex h-full w-full max-w-[460px] flex-col border-l border-teal-300/30 bg-base-surface/95 shadow-2xl backdrop-blur-md"
      >
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-ink">
              <span aria-hidden="true">❓</span> {t('titulo')}
            </h2>
            <p className="text-xs text-slate-400">{t('subtitulo')}</p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label={t('fechar')}
            title={t('fechar')}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-lg leading-none text-slate-300 hover:border-teal-300/50 hover:text-white"
          >
            ×
          </button>
        </header>

        <div className="border-b border-white/10 px-5 py-3">
          <label className="relative block">
            <span className="sr-only">{t('placeholder')}</span>
            <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              ref={campoRef}
              type="search"
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
              placeholder={t('placeholder')}
              className="w-full rounded-lg border border-teal-500/40 bg-black/30 py-2.5 pl-9 pr-3 text-sm text-ink outline-hidden placeholder:text-slate-500 focus:border-teal-300"
            />
          </label>
          <p className="mt-1.5 text-[11px] text-slate-500">{t('exemplos')}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {buscando ? (
            resultados.length > 0 ? (
              <>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-teal-200">
                  {t('resultados', { total: resultados.length })}
                </p>
                <ul className="space-y-2">{resultados.map(cartao)}</ul>
              </>
            ) : (
              <div className="rounded-lg border border-white/10 bg-white/3 p-4 text-sm text-slate-300">
                <p className="font-semibold text-ink">{t('nadaEncontrado')}</p>
                <p className="mt-1 text-xs text-slate-400">{t('nadaEncontradoDica')}</p>
              </div>
            )
          ) : (
            <div className="space-y-5">
              {daTela.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-200">{t('nestaTela')}</h3>
                  <ul className="space-y-2">{daTela.map(cartao)}</ul>
                </section>
              )}
              {ORDEM_CATEGORIAS.map((categoria) => {
                const lista = visiveis.filter((tp) => tp.categoria === categoria && !daTela.includes(tp))
                if (lista.length === 0) return null
                return (
                  <section key={categoria}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-teal-200">{t(`categorias.${categoria}`)}</h3>
                    <ul className="space-y-2">{lista.map(cartao)}</ul>
                  </section>
                )
              })}
            </div>
          )}
        </div>

        <footer className="border-t border-white/10 px-5 py-2.5 text-[11px] text-slate-500">{t('rodape')}</footer>
      </aside>
    </div>,
    document.body
  )
}
