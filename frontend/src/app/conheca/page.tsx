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

function IconeVoz() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-6 w-6">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
    </svg>
  )
}

function IconeAnotacoes() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-6 w-6">
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16v4z" strokeLinejoin="round" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  )
}

function IconeCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
      <path d="m5 12 4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
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
  { chave: 'curadoria', icone: <IconeCuradoria />, span: 'md:col-span-3 md:row-span-2' },
  { chave: 'voz', icone: <IconeVoz />, span: 'md:col-span-3', destaque: true },
  { chave: 'pesquisa', icone: <IconePesquisa />, span: 'md:col-span-3' },
  { chave: 'anonimizacao', icone: <IconeAnonimizacao />, span: 'md:col-span-2' },
  { chave: 'anotacoes', icone: <IconeAnotacoes />, span: 'md:col-span-2' },
  { chave: 'segundaOpiniao', icone: <IconeSegundaOpiniao />, span: 'md:col-span-2' },
  { chave: 'banco', icone: <IconeBanco />, span: 'md:col-span-3' },
  { chave: 'auditoria', icone: <IconeAuditoria />, span: 'md:col-span-3' },
]

const CONFIANCA = ['piloto', 'lgpd', 'anonimizado', 'auditoria', 'local'] as const
const AREAS_EXPANSAO = [
  { chave: 'radiologia', cor: '#3B82F6' },
  { chave: 'anatomia', cor: '#EF4444' },
  { chave: 'biologia', cor: '#A855F7' },
  { chave: 'vida', cor: '#22C55E' },
] as const
const PILARES = ['tipos', 'perfis', 'anonimo', 'rastreio'] as const
const PASSOS = ['envio', 'anonimizacao', 'curadoria', 'ensino'] as const
const PUBLICO = [
  { chave: 'estudante', emoji: '🎓' },
  { chave: 'professor', emoji: '📘' },
  { chave: 'curador', emoji: '🛡️' },
  { chave: 'pesquisador', emoji: '🔬' },
] as const
const SEGURANCA = ['anonimizacao', 'perfis', 'auditoria', 'voz', 'privadas', 'naoDiagnostico'] as const

function Rotulo({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[11px] uppercase tracking-[.22em] text-teal-700 dark:text-teal-300">{children}</p>
}

// Pagina de apresentacao do RADIX IMAGO (/conheca), acessada pelo link
// "Conheca o Radix Imago" da tela de entrada - divulgacao, bancas e novos
// usuarios. Estrutura de pagina de produto (como os principais softwares):
//   1. PRIMEIRA TELA: chamada curta + botoes + selos de confianca + a
//      galeria rolando, tudo visivel sem rolar;
//   2. numeros (so fatos verificaveis do sistema, sem metricas inventadas);
//   3. como funciona (4 etapas); 4. recursos; 5. para quem;
//   6. piloto em Odontologia e expansao prevista para outras areas;
//   7. seguranca e privacidade; 8. chamada final; 9. rodape institucional.
// Imagens da galeria: ilustrativas geradas por IA (sem dados de pacientes).
export default function ConhecaPage() {
  const t = useTranslations('Inicio')
  const tLogin = useTranslations('Login')

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 pt-5">
      <header className="flex items-center justify-between">
        <Logo variante="navbar" />
        <nav className="flex items-center gap-3 text-sm">
          <a href="#como-funciona" className="hidden text-slate-400 transition-colors hover:text-ink md:inline">
            {t('comoFunciona.rotulo')}
          </a>
          <a href="#recursos" className="hidden text-slate-400 transition-colors hover:text-ink md:inline">
            {t('recursosRotulo')}
          </a>
          <a href="#expansao" className="hidden text-slate-400 transition-colors hover:text-ink lg:inline">
            {t('expansao.rotulo')}
          </a>
          <a href="#seguranca" className="hidden text-slate-400 transition-colors hover:text-ink md:inline">
            {t('seguranca.rotulo')}
          </a>
          <SeletorIdioma />
          <Link href="/solicitar-acesso" className="text-slate-400 transition-colors hover:text-ink">
            {t('solicitarAcesso')}
          </Link>
          <Link href="/login" className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:bg-blue-500">
            {t('entrar')}
          </Link>
        </nav>
      </header>

      {/* 1. PRIMEIRA TELA: chamada + galeria rolando, sem precisar rolar */}
      <section className="flex min-h-[calc(100vh-64px)] flex-col justify-center gap-6 py-6">
        <div className="animar-entrada flex flex-col items-center text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-400/10 px-3.5 py-1 font-mono text-[11px] uppercase tracking-[.2em] text-teal-700 dark:text-teal-300">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-400" aria-hidden="true" />
            {t('selo')}
          </p>
          <h1 className="titulo-pagina text-balance !text-[clamp(34px,4.6vw,60px)] !leading-[1.04] !tracking-[-0.035em]">
            {tLogin('tituloDestaque1')}
            <span className="block text-teal-600 dark:text-teal-300">{tLogin('tituloDestaque2')}</span>
          </h1>
          <p className="texto-legivel mt-4 max-w-2xl text-balance text-base leading-relaxed text-ink-2 md:text-lg">{t('chamada')}</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/solicitar-acesso"
              className="group inline-flex items-center gap-2 rounded-full bg-blue-600 px-7 py-3 text-[15px] font-semibold text-white shadow-[0_10px_26px_-10px_rgba(37,99,235,.9)] transition hover:bg-blue-500"
            >
              {t('solicitarAcesso')}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
            <a href="#como-funciona" className="painel-vidro inline-flex items-center rounded-full px-6 py-3 text-[15px] font-semibold text-ink transition hover:border-teal-400/50">
              {t('verComoFunciona')}
            </a>
          </div>
          {/* selos de confianca */}
          <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-ink-3">
            {CONFIANCA.map((c) => (
              <li key={c} className="inline-flex items-center gap-1.5">
                <span className="text-teal-600 dark:text-teal-300">
                  <IconeCheck />
                </span>
                {t(`confianca.${c}`)}
              </li>
            ))}
          </ul>
        </div>

        {/* imagens rolando: ja na primeira tela */}
        <GaleriaRolante compacta />
      </section>

      {/* 2. NUMEROS */}
      <section aria-label={t('pilares.rotulo')} className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-4">
        {PILARES.map((p) => (
          <div key={p} className="painel-vidro !rounded-none !border-0 px-5 py-6">
            <p className="text-4xl font-semibold tracking-tight text-ink">{t(`pilares.itens.${p}.valor`)}</p>
            <p className="mt-1.5 text-sm leading-snug text-ink-3">{t(`pilares.itens.${p}.texto`)}</p>
          </div>
        ))}
      </section>

      {/* 3. COMO FUNCIONA */}
      <section id="como-funciona" className="scroll-mt-6 pt-20">
        <Rotulo>{t('comoFunciona.rotulo')}</Rotulo>
        <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-ink">{t('comoFunciona.titulo')}</h2>
        <ol className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-4">
          {PASSOS.map((passo, i) => (
            <li key={passo} className="painel-vidro relative rounded-2xl p-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/15 font-mono text-sm font-semibold text-teal-700 dark:text-teal-300">
                {i + 1}
              </span>
              <h3 className="mt-3 text-base font-semibold text-ink">{t(`comoFunciona.passos.${passo}.titulo`)}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-3">{t(`comoFunciona.passos.${passo}.texto`)}</p>
              {i < PASSOS.length - 1 && (
                <span className="absolute -right-3 top-1/2 hidden -translate-y-1/2 text-teal-500/60 md:block" aria-hidden="true">
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* 4. RECURSOS */}
      <section id="recursos" className="scroll-mt-6 pt-20">
        <Rotulo>{t('recursosRotulo')}</Rotulo>
        <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-ink">{t('recursosTitulo')}</h2>
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-6">
          {RECURSOS.map((recurso) => {
            const grande = recurso.span.includes('row-span-2')
            return (
              <div
                key={recurso.chave}
                className={`group relative overflow-hidden rounded-2xl border p-6 backdrop-blur-xl transition-colors ${recurso.span} ${
                  grande ? 'flex min-h-[260px] flex-col justify-between' : ''
                } ${
                  recurso.destaque
                    ? 'border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-cyan-400/5 hover:border-blue-400/50'
                    : 'border-[rgba(15,23,42,.08)] bg-white/75 hover:border-[rgba(15,23,42,.16)] dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20'
                }`}
              >
                {grande && (
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
                  className={`relative mb-4 flex items-center justify-center rounded-xl ${grande ? 'h-14 w-14' : 'h-11 w-11'} ${
                    recurso.destaque
                      ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg shadow-blue-500/30'
                      : grande
                        ? 'bg-white/15 text-white'
                        : 'bg-blue-500/10 text-blue-700 dark:bg-white/10 dark:text-blue-300'
                  }`}
                >
                  {recurso.icone}
                </div>
                <div className="relative">
                  <h3 className={`text-base font-semibold ${grande ? 'text-white' : 'text-ink'}`}>{t(`recursos.${recurso.chave}.titulo`)}</h3>
                  <p className={`mt-1.5 text-sm leading-relaxed ${grande ? 'text-white/80' : 'text-ink-3'}`}>
                    {t(`recursos.${recurso.chave}.descricao`)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* 5. PARA QUEM */}
      <section className="pt-20">
        <Rotulo>{t('publico.rotulo')}</Rotulo>
        <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-ink">{t('publico.titulo')}</h2>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PUBLICO.map((p) => (
            <div key={p.chave} className="painel-vidro rounded-2xl p-5">
              <span className="text-2xl" aria-hidden="true">
                {p.emoji}
              </span>
              <h3 className="mt-2 text-base font-semibold text-ink">{t(`publico.itens.${p.chave}.titulo`)}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-3">{t(`publico.itens.${p.chave}.texto`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 6. PILOTO (ODONTOLOGIA) E EXPANSAO PARA OUTRAS AREAS */}
      <section id="expansao" className="scroll-mt-6 pt-20">
        <Rotulo>{t('expansao.rotulo')}</Rotulo>
        <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-ink">{t('expansao.titulo')}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-3">{t('expansao.texto')}</p>
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-[1.1fr_1.6fr]">
          {/* agora: piloto */}
          <div className="relative overflow-hidden rounded-2xl border border-orange-400/40 bg-gradient-to-br from-orange-500/15 to-amber-400/5 p-6">
            <span className="inline-flex items-center gap-2 rounded-full bg-orange-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-500" aria-hidden="true" />
              {t('expansao.agora')}
            </span>
            <h3 className="mt-3 text-2xl font-semibold text-ink">🦷 {t('expansao.piloto.titulo')}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{t('expansao.piloto.texto')}</p>
          </div>
          {/* depois: expansao */}
          <div className="painel-vidro rounded-2xl p-6">
            <span className="inline-flex items-center gap-2 rounded-full bg-teal-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
              {t('expansao.depois')}
            </span>
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {AREAS_EXPANSAO.map((a) => (
                <li key={a.chave} className="flex items-center gap-2.5 rounded-xl border border-dashed border-[rgba(15,23,42,.15)] px-3 py-2.5 text-sm text-ink-2 dark:border-white/15">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: a.cor }} aria-hidden="true" />
                  {t(`expansao.areas.${a.chave}`)}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-ink-3">{t('expansao.nota')}</p>
          </div>
        </div>
      </section>

      {/* 7. SEGURANCA E PRIVACIDADE */}
      <section id="seguranca" className="scroll-mt-6 pt-20">
        <div className="painel-vidro grid grid-cols-1 gap-8 rounded-3xl p-8 md:grid-cols-[1fr_1.4fr] md:p-10">
          <div>
            <Rotulo>{t('seguranca.rotulo')}</Rotulo>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink">{t('seguranca.titulo')}</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-3">{t('seguranca.texto')}</p>
          </div>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {SEGURANCA.map((s) => (
              <li key={s} className="flex items-start gap-2.5 text-sm leading-snug text-ink-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-500/15 text-teal-700 dark:text-teal-300">
                  <IconeCheck />
                </span>
                {t(`seguranca.itens.${s}`)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 8. CHAMADA FINAL */}
      <section className="pb-16 pt-20">
        <div className="relative overflow-hidden rounded-3xl border border-blue-500/30 bg-gradient-to-br from-blue-600/20 via-cyan-500/10 to-teal-500/10 px-8 py-12 text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-ink">{t('ctaFinal.titulo')}</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-ink-2">{t('ctaFinal.texto')}</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/solicitar-acesso" className="rounded-full bg-blue-600 px-7 py-3 text-[15px] font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:bg-blue-500">
              {t('ctaFinal.botao')}
            </Link>
            <Link href="/login" className="painel-vidro rounded-full px-6 py-3 text-[15px] font-semibold text-ink transition hover:border-teal-400/50">
              {t('entrar')}
            </Link>
          </div>
        </div>
      </section>

      {/* 9. RODAPE INSTITUCIONAL */}
      <footer className="flex flex-col items-center gap-3 border-t border-white/10 py-8 text-center text-xs text-slate-500">
        <Logo variante="footer" />
        <p className="max-w-2xl">{t('rodapeInstitucional')}</p>
        <p>{tLogin('avisoIA')}</p>
      </footer>
    </main>
  )
}
