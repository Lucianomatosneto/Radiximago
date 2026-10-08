import Link from 'next/link'
import { useTranslations } from 'next-intl'
import Logo from '../../components/Logo'
import SeletorIdioma from '../../components/SeletorIdioma'
import GaleriaRolante from '../../components/GaleriaRolante'

interface Recurso {
  chave: string
  icone: JSX.Element
  span: string
  destaque?: boolean
}

function IconeCuradoria() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-6 w-6">
      <path d="M9 3v4M15 3v4M4 7h16v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m9 13 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconeAnonimizacao() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-6 w-6">
      <path d="M12 3 4 6.5V11c0 4.8 3.4 9.3 8 10.5 4.6-1.2 8-5.7 8-10.5V6.5L12 3Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconePesquisa() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-6 w-6">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" strokeLinecap="round" />
    </svg>
  )
}

function IconeSegundaOpiniao() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-6 w-6">
      <path d="M21 11.5a8.4 8.4 0 0 1-8.4 8.4c-1.2 0-2.4-.3-3.4-.8L3 20l1-6.2a8.4 8.4 0 1 1 17-2.3Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconeBanco() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-6 w-6">
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" strokeLinecap="round" />
      <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" strokeLinecap="round" />
    </svg>
  )
}

function IconeAuditoria() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-6 w-6">
      <path d="M9 3h6l5 5v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 12h6M9 16h4" strokeLinecap="round" />
    </svg>
  )
}

const RECURSOS: Recurso[] = [
  {
    chave: 'curadoria',
    icone: <IconeCuradoria />,
    span: 'md:col-span-4 md:row-span-2',
  },
  {
    chave: 'anonimizacao',
    icone: <IconeAnonimizacao />,
    span: 'md:col-span-2',
    destaque: true,
  },
  {
    chave: 'pesquisa',
    icone: <IconePesquisa />,
    span: 'md:col-span-2',
  },
  {
    chave: 'segundaOpiniao',
    icone: <IconeSegundaOpiniao />,
    span: 'md:col-span-3',
  },
  {
    chave: 'banco',
    icone: <IconeBanco />,
    span: 'md:col-span-3',
  },
  {
    chave: 'auditoria',
    icone: <IconeAuditoria />,
    span: 'md:col-span-6',
  },
]

// Pagina de apresentacao do RADIX IMAGO (antes era a primeira tela do
// sistema). Agora quem abre o sistema cai direto no login; esta pagina fica
// em /conheca, acessada pelo link "Conheca o Radix Imago" da tela de
// entrada - util para divulgacao, bancas e novos usuarios.
export default function ConhecaPage() {
  const t = useTranslations('Inicio')
  const tLogin = useTranslations('Login')

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8">
      <header className="flex items-center justify-between">
        <Logo variante="navbar" />
        <div className="flex items-center gap-3 text-sm">
          <SeletorIdioma />
          <Link href="/solicitar-acesso" className="text-slate-400 transition-colors hover:text-slate-200">
            {t('solicitarAcesso')}
          </Link>
          <Link
            href="/login"
            className="rounded-lg bg-gradient-to-r from-blue-500 to-cyan-400 px-4 py-2 font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:brightness-110"
          >
            {t('entrar')}
          </Link>
        </div>
      </header>

      {/* chamada principal - mesmo titulo da tela de entrada, em escala maior */}
      <section className="animar-entrada flex flex-col items-center pb-14 pt-16 text-center">
        <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-400/10 px-3.5 py-1 font-mono text-[11px] uppercase tracking-[.22em] text-teal-700 dark:text-teal-300">
          <span className="h-1.5 w-1.5 rounded-full bg-teal-400" aria-hidden="true" />
          PPGINFOS · UFSC
        </p>
        <h1 className="titulo-pagina text-balance !text-[clamp(40px,6.2vw,80px)] !leading-[1.02] !tracking-[-0.035em]">
          {tLogin('tituloDestaque1')}
          <span className="block text-teal-600 dark:text-teal-300">{tLogin('tituloDestaque2')}</span>
        </h1>
        <p className="texto-legivel mt-6 max-w-xl text-balance text-lg leading-relaxed text-ink-2">{t('chamada')}</p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="group inline-flex items-center gap-2 rounded-full bg-blue-600 px-8 py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_26px_-10px_rgba(37,99,235,.95)] transition hover:bg-blue-500"
          >
            {t('entrar')}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
          <Link
            href="/solicitar-acesso"
            className="painel-vidro inline-flex items-center rounded-full px-7 py-3.5 text-[15px] font-semibold text-ink transition hover:border-teal-400/50"
          >
            {t('solicitarAcesso')}
          </Link>
        </div>
      </section>

      {/* imagens ilustrativas da tela de entrada, em duas faixas rolando */}
      <GaleriaRolante />

      <section className="grid grid-cols-1 gap-4 pb-16 pt-10 md:grid-cols-6">
        {RECURSOS.map((recurso) => (
          <div
            key={recurso.chave}
            className={`animar-entrada group relative overflow-hidden rounded-2xl border p-6 backdrop-blur-xl transition-colors ${recurso.span} ${
              recurso.span.includes('row-span-2') ? 'flex flex-col justify-between' : ''
            } ${
              recurso.destaque
                ? 'border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-cyan-400/5 hover:border-blue-400/50'
                : 'border-[rgba(15,23,42,.08)] bg-white/75 hover:border-[rgba(15,23,42,.16)] dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20'
            }`}
          >
            {recurso.span.includes('row-span-2') && (
              // cartao grande: radiografia panoramica ilustrativa (gerada por IA) ao fundo
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/login/rxodonto.webp"
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-55 transition-transform duration-[1200ms] ease-out group-hover:scale-105"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10" />
              </>
            )}
            <div
              className={`relative mb-4 flex items-center justify-center rounded-xl ${
                recurso.span.includes('row-span-2') ? 'h-16 w-16' : 'h-11 w-11'
              } ${
                recurso.destaque
                  ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg shadow-blue-500/30'
                  : 'bg-white/10 text-blue-300'
              }`}
            >
              {recurso.icone}
            </div>
            <div className="relative">
              <h2 className={`text-base font-semibold ${recurso.span.includes('row-span-2') ? 'text-white' : 'text-ink'}`}>{t(`recursos.${recurso.chave}.titulo`)}</h2>
              <p className={`mt-1.5 text-sm leading-relaxed ${recurso.span.includes('row-span-2') ? 'text-white/75' : 'text-slate-400'}`}>
                {t(`recursos.${recurso.chave}.descricao`)}
              </p>
            </div>
          </div>
        ))}
      </section>

      <footer className="flex flex-col items-center gap-3 border-t border-white/10 py-6 text-center text-xs text-slate-500">
        <Logo variante="footer" />
        {t('rodape')}
      </footer>
    </main>
  )
}
