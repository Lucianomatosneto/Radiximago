import Link from 'next/link'
import Logo from '../components/Logo'

interface Recurso {
  titulo: string
  descricao: string
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
    titulo: 'Curadoria especializada',
    descricao: 'Fluxo estruturado para revisão e classificação de radiografias por especialistas.',
    icone: <IconeCuradoria />,
    span: 'md:col-span-4 md:row-span-2',
  },
  {
    titulo: 'Anonimização automática',
    descricao: 'Dados pessoais removidos ao ingressar no sistema, conforme a LGPD.',
    icone: <IconeAnonimizacao />,
    span: 'md:col-span-2',
    destaque: true,
  },
  {
    titulo: 'Pesquisa avançada',
    descricao: 'Filtros combinados por achado, região e metadados clínicos.',
    icone: <IconePesquisa />,
    span: 'md:col-span-2',
  },
  {
    titulo: 'Segunda opinião',
    descricao: 'Solicite e registre pareceres colaborativos entre profissionais.',
    icone: <IconeSegundaOpiniao />,
    span: 'md:col-span-3',
  },
  {
    titulo: 'Banco de imagens',
    descricao: 'Acervo organizado para uso em ensino e pesquisa científica.',
    icone: <IconeBanco />,
    span: 'md:col-span-3',
  },
  {
    titulo: 'Auditoria completa',
    descricao: 'Rastreabilidade de cada ação realizada na plataforma.',
    icone: <IconeAuditoria />,
    span: 'md:col-span-6',
  },
]

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8">
      <header className="flex items-center justify-between">
        <Logo variante="navbar" />
        <div className="flex items-center gap-3 text-sm">
          <Link href="/solicitar-acesso" className="text-slate-400 transition-colors hover:text-slate-200">
            Solicitar acesso
          </Link>
          <Link
            href="/login"
            className="rounded-lg bg-gradient-to-r from-blue-500 to-cyan-400 px-4 py-2 font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:brightness-110"
          >
            Entrar
          </Link>
        </div>
      </header>

      <section className="animar-entrada flex flex-1 flex-col items-center justify-center py-16 text-center">
        <Logo variante="hero" />
        <p className="mt-4 max-w-lg text-balance text-base leading-relaxed text-slate-400">
          Base inteligente de imagens para ensino e pesquisa em saúde
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 pb-16 md:grid-cols-6">
        {RECURSOS.map((recurso) => (
          <div
            key={recurso.titulo}
            className={`animar-entrada group rounded-2xl border p-6 backdrop-blur-xl transition-colors ${recurso.span} ${
              recurso.span.includes('row-span-2') ? 'flex flex-col justify-between' : ''
            } ${
              recurso.destaque
                ? 'border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-cyan-400/5 hover:border-blue-400/50'
                : 'border-white/10 bg-white/5 hover:border-white/20'
            }`}
          >
            <div
              className={`mb-4 flex items-center justify-center rounded-xl ${
                recurso.span.includes('row-span-2') ? 'h-16 w-16' : 'h-11 w-11'
              } ${
                recurso.destaque
                  ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg shadow-blue-500/30'
                  : 'bg-white/10 text-blue-300'
              }`}
            >
              {recurso.icone}
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink">{recurso.titulo}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{recurso.descricao}</p>
            </div>
          </div>
        ))}
      </section>

      <footer className="flex flex-col items-center gap-3 border-t border-white/10 py-6 text-center text-xs text-slate-500">
        <Logo variante="footer" />
        Acesso restrito a usuários autorizados
      </footer>
    </main>
  )
}
