'use client'

import { useCallback, useRef, useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import Logo from '../../components/Logo'
import SeletorIdioma from '../../components/SeletorIdioma'
import { regiaoDe } from '../../lib/regiaoGeografica'
import CenaLogin from '../../components/login/CenaLogin'
import type { ControleCena } from '../../components/login/motorCenaLogin'

// Tela de entrada do RÁDIX IMAGO - layout "Monolito" (aprovado em 07/10/2026):
// titulo grande e formulario minimalista a esquerda; a direita, globo
// branco-gelo girando sobre o fundo "noite ate turquesa", com 7 imagens
// ilustrativas (geradas por IA, sem dados de pacientes) correndo em duas
// faixas retas. Uma etiqueta embaixo do globo mostra a area da imagem em
// destaque, e uma leitura no canto mostra o hemisferio voltado para a frente.

// Area de cada imagem (mesma ordem de CenaLogin) e a cor da etiqueta,
// alinhada a paleta dos cartoes do Banco de imagens.
const AREAS = [
  { chave: 'areaRadiologia', cor: '#14B8A6' },
  { chave: 'areaRadiologia', cor: '#3B82F6' },
  { chave: 'areaAnatomia', cor: '#EF4444' },
  { chave: 'areaOdontologia', cor: '#F97316' },
  { chave: 'areaBiologia', cor: '#A855F7' },
  { chave: 'areaFlora', cor: '#22C55E' },
  { chave: 'areaFauna', cor: '#EAB308' },
] as const

const ICONES_FERRAMENTA = {
  pausar: <><rect x="7" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" /><rect x="13.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" /></>,
  retomar: <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor" stroke="none" />,
  avancar: <><path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v4h-4" /></>,
  aproximar: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5M11 8.5v5M8.5 11h5" /></>,
  afastar: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5M8.5 11h5" /></>,
  redefinir: <><path d="M4 12a8 8 0 1 0 2.34-5.66" /><path d="M4 4v4h4" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /></>,
}

const FUNDO =
  'radial-gradient(70% 45% at 50% 100%, rgba(45,212,191,.45), transparent 70%),' +
  'linear-gradient(180deg, #000 0%, #000 38%, #032826 70%, #0B5E58 100%)'

function Icone({ tipo }: { tipo: 'escudo' | 'pessoa' | 'rota' }) {
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-teal-300/40 bg-teal-400/10 text-teal-300">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {tipo === 'escudo' && (<><path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6z" /><path d="m9 12 2 2 4-4" /></>)}
        {tipo === 'pessoa' && (<><circle cx="12" cy="8" r="4" /><path d="M5 21c.8-3.5 3.6-6 7-6s6.2 2.5 7 6" /></>)}
        {tipo === 'rota' && (<><circle cx="6" cy="18" r="2.2" /><circle cx="18" cy="6" r="2.2" /><path d="M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8" /></>)}
      </svg>
    </span>
  )
}

export default function LoginPage() {
  const t = useTranslations('Login')
  const router = useRouter()
  const controleRef = useRef<ControleCena | null>(null)
  const [foco, setFoco] = useState(-1)
  const [longitude, setLongitude] = useState<number | null>(null)
  const [pausado, setPausado] = useState(false)
  const aoMudarFoco = useCallback((i: number) => setFoco(i), [])
  const aoMudarLongitude = useCallback((l: number) => setLongitude(l), [])
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (carregando) return

    const formData = new FormData(event.currentTarget)
    const emailPreenchido = String(formData.get('email') ?? '').trim()
    const senhaPreenchida = String(formData.get('senha') ?? '').trim()

    if (!emailPreenchido || !senhaPreenchida) {
      setErro(t('erroCamposVazios'))
      return
    }

    setErro('')
    setCarregando(true)

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: emailPreenchido, password: senhaPreenchida }),
        // O backend seta um cookie httpOnly com o token na resposta deste
        // login (ver auth.py) - credentials: 'include' e o que faz o
        // navegador aceitar/guardar esse cookie. A sessao inteira passa a
        // viver so nele; nada de token/perfil/nome fica em localStorage.
        credentials: 'include',
      })

      if (response.status === 401 || response.status === 403) {
        setErro(t('erroCredenciais'))
        return
      }

      if (!response.ok) {
        setErro(t('erroGenerico'))
        return
      }

      const dados = await response.json()
      // Admin continua indo pro dashboard com os indicadores; os demais
      // perfis vao direto pro banco de imagens, que passou a ser a tela
      // inicial deles.
      router.push(dados.perfil === 'administrador' ? '/dashboard' : '/banco-imagens')
    } catch {
      setErro(t('erroGenerico'))
    } finally {
      setCarregando(false)
    }
  }

  const sombraTexto = { textShadow: '0 1px 10px rgba(0,0,0,.95)' }
  const campo =
    'w-full border-0 border-b border-slate-600 bg-transparent px-0.5 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-teal-300 focus-visible:outline-none'
  const ferramentas: { id: keyof typeof ICONES_FERRAMENTA; rotulo: string; cor: string; acao: () => void }[] = [
    { id: pausado ? 'retomar' : 'pausar', rotulo: pausado ? t('retomarRotacao') : t('pausarRotacao'), cor: '#60A5FA', acao: () => setPausado(controleRef.current?.alternarPausa() ?? false) },
    { id: 'avancar', rotulo: t('proximaImagem'), cor: '#4ADE80', acao: () => controleRef.current?.avancar() },
    { id: 'aproximar', rotulo: t('aproximar'), cor: '#2DD4BF', acao: () => controleRef.current?.aproximar() },
    { id: 'afastar', rotulo: t('afastar'), cor: '#2DD4BF', acao: () => controleRef.current?.afastar() },
    { id: 'redefinir', rotulo: t('redefinirVista'), cor: '#FACC15', acao: () => controleRef.current?.redefinir() },
  ]
  const area = foco >= 0 ? AREAS[foco] : null

  return (
    <main className="relative isolate min-h-screen overflow-x-hidden text-white" style={{ background: FUNDO }}>
      {/* animacao da etiqueta da area em destaque */}
      <style>{'@keyframes etiquetaEntra{from{opacity:0;transform:translateY(8px) scale(.96)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){.etiqueta-area{animation:none!important}}'}</style>
      <CenaLogin controleRef={controleRef} aoMudarFoco={aoMudarFoco} aoMudarLongitude={aoMudarLongitude} />

      {/* barra superior: marca e idioma */}
      <header className="relative z-20 flex h-12 items-center justify-between border-b border-white/10 bg-black/60 px-4 backdrop-blur-sm lg:fixed lg:inset-x-0 lg:top-0">
        <Logo variante="navbar" className="[&_span]:text-white" />
        <SeletorIdioma />
      </header>

      <div className="relative z-10 flex min-h-screen flex-col px-5 pb-16 pt-6 lg:block lg:p-0">
        {/* coluna esquerda: titulo, acesso e caracteristicas */}
        <section
          aria-label={t('acessoSistema')}
          className="flex flex-col lg:fixed lg:bottom-9 lg:left-0 lg:top-12 lg:w-[640px] lg:justify-center lg:px-[clamp(40px,6vw,96px)]"
        >
          <h1 className="text-4xl font-semibold leading-[1.02] tracking-[-0.035em] lg:text-[clamp(38px,3.6vw,58px)]" style={sombraTexto}>
            {t('tituloDestaque1')}
            <span className="block text-teal-300">{t('tituloDestaque2')}</span>
          </h1>

          <div className="mt-[42vh] lg:hidden" aria-hidden="true" />

          <form onSubmit={handleSubmit} noValidate className="mt-8 flex max-w-[430px] flex-col gap-4 lg:mt-10">
            <div className="flex justify-end text-[13px]">
              <Link href="/solicitar-acesso" className="text-blue-400 hover:text-blue-300 hover:underline" style={sombraTexto}>
                {t('primeiroAcesso')}
              </Link>
            </div>
            <div className="-mt-3">
              <label htmlFor="email" className="block text-[13px] font-medium text-slate-200" style={sombraTexto}>{t('email')}</label>
              <input id="email" name="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={campo} placeholder={t('emailPlaceholder')} />
            </div>
            <div>
              <label htmlFor="senha" className="block text-[13px] font-medium text-slate-200" style={sombraTexto}>{t('senha')}</label>
              <div className="relative">
                <input id="senha" name="senha" type={mostrarSenha ? 'text' : 'password'} autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} className={`${campo} pr-10`} placeholder="••••••••" />
                <button
                  type="button"
                  onClick={() => setMostrarSenha((v) => !v)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"
                  aria-label={mostrarSenha ? t('ocultarSenha') : t('mostrarSenha')}
                >
                  {mostrarSenha ? (
                    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                      <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
                      <path d="M9.9 4.2A9.8 9.8 0 0 1 12 4c5 0 9 5 9 8a12 12 0 0 1-2.2 3M6.1 6.1C3.8 7.6 2.3 10 2.3 12c0 0 4 8 9.7 8a9 9 0 0 0 3.3-.6" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                      <path d="M2.3 12S6 5 12 5s9.7 7 9.7 7-3.7 7-9.7 7-9.7-7-9.7-7Z" stroke="currentColor" strokeWidth={1.8} />
                      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth={1.8} />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div className="flex justify-end text-[13px]">
              <Link href="/esqueci-senha" className="text-blue-400 hover:text-blue-300 hover:underline" style={sombraTexto}>{t('esqueciSenha')}</Link>
            </div>

            {erro && (
              <p className="rounded-md bg-red-950/70 px-3 py-2 text-sm text-red-200" role="alert">{erro}</p>
            )}

            <button
              type="submit"
              disabled={carregando}
              className="group mt-1 flex min-w-[200px] items-center justify-center gap-2 self-start rounded-full bg-blue-600 px-9 py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_26px_-10px_rgba(37,99,235,.95)] transition hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 disabled:opacity-60"
            >
              {carregando ? t('entrando') : t('entrar')}
              {!carregando && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              )}
            </button>
          </form>

          <ul className="mt-10 flex max-w-[460px] flex-wrap gap-x-6 gap-y-2 text-[13.5px] text-slate-200" aria-label={t('apresentacao')} style={sombraTexto}>
            <li className="flex items-center gap-2.5"><Icone tipo="escudo" />{t('caracteristicaAnonimizadas')}</li>
            <li className="flex items-center gap-2.5"><Icone tipo="pessoa" />{t('caracteristicaCuradas')}</li>
            <li className="flex items-center gap-2.5"><Icone tipo="rota" />{t('caracteristicaRastreaveis')}</li>
          </ul>

          <Link
            href="/conheca"
            className="group mt-6 inline-flex items-center gap-2 text-[13.5px] font-medium text-teal-300 transition hover:text-teal-200"
            style={sombraTexto}
          >
            {t('conhecaRadix')}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </section>

        {/* barra de ferramentas do visualizador (canto superior direito) */}
        <div role="toolbar" aria-label={t('ferramentasVisualizador')} className="fixed right-4 top-16 z-20 hidden flex-col gap-1.5 rounded-xl border border-slate-700/70 bg-[#0A0C10]/80 p-1.5 backdrop-blur-md lg:flex">
          {ferramentas.map((f) => (
            <button
              key={f.rotulo}
              type="button"
              title={f.rotulo}
              aria-label={f.rotulo}
              onClick={f.acao}
              className="grid h-9 w-9 place-items-center rounded-lg border transition hover:brightness-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"
              style={{ color: f.cor, borderColor: `${f.cor}73`, background: `linear-gradient(135deg, ${f.cor}38, #0A0C10)` }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[17px] w-[17px]" aria-hidden="true">
                {ICONES_FERRAMENTA[f.id]}
              </svg>
            </button>
          ))}
        </div>

        {/* etiqueta unica: area da imagem em destaque */}
        {area && (
          <div className="pointer-events-none fixed bottom-14 left-[calc(640px+(100%-640px)/2)] z-10 hidden -translate-x-1/2 lg:block" aria-live="polite">
            <span
              key={foco}
              className="etiqueta-area animate-[etiquetaEntra_.45s_cubic-bezier(.2,.8,.2,1)_both] inline-flex items-center gap-3 rounded-full border py-2.5 pl-3 pr-5 text-[17px] font-semibold text-white"
              style={{ borderColor: area.cor, background: `linear-gradient(135deg, ${area.cor}cc, ${area.cor}66)`, boxShadow: `0 0 22px -4px ${area.cor}` }}
            >
              <span className="rounded-full bg-black/25 px-2 py-0.5 font-mono text-[11px] tracking-widest">{String(foco + 1).padStart(2, '0')}</span>
              {t(area.chave)}
            </span>
          </div>
        )}

        {/* hemisferio voltado para a frente */}
        {longitude !== null && (
          <p className="fixed bottom-14 right-6 z-10 hidden text-right font-mono text-xs uppercase leading-relaxed tracking-wider text-slate-300 lg:block" style={sombraTexto}>
            {t('hemisferio')} <b className="font-semibold text-teal-300">{longitude < 0 ? t('ocidental') : t('oriental')}</b>
            <br />
            {t(regiaoDe(longitude))}
          </p>
        )}
      </div>

      {/* rodape: aviso sobre as imagens ilustrativas */}
      <footer className="fixed inset-x-0 bottom-0 z-20 flex h-9 items-center gap-2 border-t border-white/10 bg-black/70 px-4 text-[11.5px] text-slate-400 backdrop-blur-sm">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
          <path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6z" />
        </svg>
        <span className="truncate">{t('avisoIA')}</span>
      </footer>
    </main>
  )
}
