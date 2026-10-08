'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import GradeCategoriasImagens, { useContador, useContagensBanco } from '../../components/GradeCategoriasImagens'
import FundoMapaMundi from '../../components/fundo/FundoMapaMundi'
import { obterSessaoAtual } from '../../lib/sessao'
import { regiaoDe } from '../../lib/regiaoGeografica'

// Banco de imagens: mesma identidade visual da tela de entrada. O globo
// vira um mapa-mundi em pontos que ocupa a tela inteira (deslizando
// devagar, com rotas de luz), e os cartoes de categoria ficam por cima em
// "vidro" translucido. Menu lateral e barra do topo tambem ficam
// translucidos so nesta tela (ver ESTILO_TELA), sem alterar os componentes
// compartilhados.

export default function BancoImagensPage() {
  const router = useRouter()
  const t = useTranslations('BancoImagens')
  const tLogin = useTranslations('Login')
  const tComum = useTranslations('Comum')
  const [carregando, setCarregando] = useState(true)
  const [longitude, setLongitude] = useState<number | null>(null)
  const contagens = useContagensBanco()
  const total = useContador(contagens?.total ?? null, 1200)

  useEffect(() => {
    obterSessaoAtual().then((sessao) => {
      if (!sessao) {
        router.push('/login')
        return
      }
      setCarregando(false)
    })
  }, [router])

  if (carregando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-base">
        <p className="text-slate-300">{tComum('carregando')}</p>
      </main>
    )
  }

  return (
    <div data-fundo-mapa className="relative isolate min-h-screen">
      <FundoMapaMundi aoMudarLongitude={setLongitude} />

      <div className="relative z-10 flex min-h-screen">
        <Sidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />

          <main className="flex-1 px-5 pb-28 pt-8 sm:px-8 lg:px-10">
            {/* cabecalho */}
            <section className="mb-10 flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-2xl">
                <p className="tela-entra mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[.22em] text-teal-700 dark:text-teal-300">
                  <span className="relative flex h-2 w-2" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-60 motion-reduce:animate-none" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-400" />
                  </span>
                  {t('rotuloAcervo')}
                </p>
                <h1 className="tela-entra titulo-gradiente text-4xl font-semibold tracking-tight sm:text-5xl" style={{ animationDelay: '60ms' }}>
                  {t('titulo')}
                </h1>
                <p className="tela-entra texto-legivel mt-3 max-w-xl text-[15px] leading-relaxed text-ink-2" style={{ animationDelay: '120ms' }}>
                  {t('subtitulo')}
                </p>
              </div>

              <div className="tela-entra flex flex-wrap items-stretch gap-3" style={{ animationDelay: '180ms' }}>
                <div className="painel-vidro flex min-w-[210px] flex-col justify-center rounded-2xl px-5 py-3.5">
                  <span className="text-[11px] font-medium uppercase tracking-[.16em] text-ink-3">{t('totalAcervo')}</span>
                  <span className="mt-1 flex items-baseline gap-2">
                    <span className="font-mono text-3xl font-semibold tabular-nums text-ink">{total ?? '—'}</span>
                    <span className="text-xs text-ink-3">{t('imagensAprovadas')}</span>
                  </span>
                </div>
                <Link
                  href="/pesquisa"
                  className="group flex items-center justify-center gap-2.5 self-center rounded-full bg-blue-600 px-7 py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_26px_-10px_rgba(37,99,235,.95)] transition hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="6.5" />
                    <path d="M16 16l4.5 4.5" />
                  </svg>
                  {t('buscaAvancada')}
                  <svg viewBox="0 0 24 24" className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </Link>
              </div>
            </section>

            <GradeCategoriasImagens contagens={contagens} />
          </main>
        </div>
      </div>

      {/* hemisferio voltado para o centro da tela (mesma leitura do globo) */}
      {longitude !== null && (
        <p
          aria-hidden="true"
          className="painel-vidro pointer-events-none fixed bottom-5 right-5 z-20 hidden rounded-xl px-4 py-2.5 text-right font-mono text-[11px] uppercase leading-relaxed tracking-wider text-ink-2 lg:block"
        >
          {tLogin('hemisferio')}{' '}
          <b className="font-semibold text-teal-700 dark:text-teal-300">{longitude < 0 ? tLogin('ocidental') : tLogin('oriental')}</b>
          <br />
          {tLogin(regiaoDe(longitude))} · <span className="tabular-nums">{Math.abs(longitude)}°{longitude < 0 ? 'W' : 'E'}</span>
        </p>
      )}

      <style>{ESTILO_TELA}</style>
    </div>
  )
}

const ESTILO_TELA = `
[data-fundo-mapa] aside{
  position:sticky;top:0;
  background:rgb(var(--color-base) / .42)!important;
  backdrop-filter:blur(5px) saturate(140%);-webkit-backdrop-filter:blur(5px) saturate(140%);
  border-color:rgb(var(--color-base-border) / .6)!important;
}
[data-fundo-mapa] header{
  position:sticky;top:0;z-index:15;
  background:rgb(var(--color-base) / .38)!important;
  backdrop-filter:blur(6px) saturate(140%);-webkit-backdrop-filter:blur(6px) saturate(140%);
  border-color:rgb(var(--color-base-border) / .6)!important;
}
.painel-vidro{
  background:rgba(255,255,255,.62);
  border:1px solid rgba(15,23,42,.08);
  backdrop-filter:blur(14px) saturate(140%);-webkit-backdrop-filter:blur(14px) saturate(140%);
}
.dark .painel-vidro{background:rgba(7,11,16,.55);border-color:rgba(255,255,255,.08)}
.titulo-gradiente{
  background:linear-gradient(100deg,#0f172a 0%,#0f766e 55%,#0d9488 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent;
}
.dark .titulo-gradiente{background-image:linear-gradient(100deg,#ffffff 0%,#ccfbf1 45%,#5eead4 100%)}
.dark .texto-legivel{text-shadow:0 1px 10px rgba(0,0,0,.9)}
.tela-entra{animation:telaEntra .7s cubic-bezier(.2,.8,.2,1) backwards}
@keyframes telaEntra{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.dark .texto-legivel{text-shadow:0 1px 10px rgba(0,0,0,.9)}
.tela-entra{animation:none}}
`
