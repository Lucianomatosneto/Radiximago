'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Logo from '../../components/Logo'
import RadiografiaIlustrativa from '../../components/RadiografiaIlustrativa'
import SecaoModalidades from '../../components/SecaoModalidades'

export default function LoginPage() {
  const router = useRouter()
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
      setErro('Preencha e-mail e senha.')
      return
    }

    setErro('')
    setCarregando(true)

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: emailPreenchido, password: senhaPreenchida }),
      })

      if (response.status === 401 || response.status === 403) {
        setErro('E-mail ou senha incorretos')
        return
      }

      if (!response.ok) {
        setErro('Não foi possível entrar. Tente novamente mais tarde.')
        return
      }

      const dados = await response.json()
      localStorage.setItem('access_token', dados.access_token)
      localStorage.setItem('perfil', dados.perfil)
      localStorage.setItem('nome', dados.nome)
      if (dados.foto_perfil_url) {
        localStorage.setItem('foto_perfil_url', dados.foto_perfil_url)
      } else {
        localStorage.removeItem('foto_perfil_url')
      }
      // Admin continua indo pro dashboard com os indicadores; os demais
      // perfis vao direto pro banco de imagens, que passou a ser a tela
      // inicial deles.
      router.push(dados.perfil === 'administrador' ? '/dashboard' : '/banco-imagens')
    } catch {
      setErro('Não foi possível entrar. Tente novamente mais tarde.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden px-4 py-10">
      <div className="fixed inset-0 -z-10">
        <RadiografiaIlustrativa />
      </div>

      {/* contorno da pagina: topo/base em azul claro (blue-500 -> cyan-400),
          laterais em azul escuro e 3x mais grossas que o topo/base */}
      <div
        className="pointer-events-none fixed left-3 right-3 top-3 z-10 h-1"
        style={{ backgroundImage: 'linear-gradient(90deg, rgba(59,130,246,0.8), rgba(34,211,238,0.8))' }}
      />
      <div
        className="pointer-events-none fixed left-3 right-3 bottom-3 z-10 h-1"
        style={{ backgroundImage: 'linear-gradient(90deg, rgba(59,130,246,0.8), rgba(34,211,238,0.8))' }}
      />
      <div
        className="pointer-events-none fixed left-3 top-3 bottom-3 z-10 w-3"
        style={{ backgroundColor: 'rgba(30,58,138,0.85)' }}
      />
      <div
        className="pointer-events-none fixed right-3 top-3 bottom-3 z-10 w-3"
        style={{ backgroundColor: 'rgba(30,58,138,0.85)' }}
      />

      {/* logo fixa no canto superior esquerdo, discreta - a imagem de fundo
          e o protagonista visual da tela, nao a marca nem o formulario. */}
      <div className="fixed left-6 top-6 z-10">
        <Logo variante="login" />
      </div>

      <div className="animar-entrada relative z-10 max-w-xl text-center">
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
          Base inteligente de imagens para{' '}
          <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
            ensino e pesquisa em saúde
          </span>
        </h1>
      </div>

      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-7 shadow-2xl backdrop-blur-md">
        <div className="mb-6 text-center">
          <h2 className="text-xl font-bold tracking-tight text-white">Bem-vindo</h2>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-300">
              E-mail
            </label>
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                aria-hidden="true"
              >
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m4 7 8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-10 pr-3 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/30"
                placeholder="seu.email@exemplo.com"
              />
            </div>
          </div>

          <div>
            <label htmlFor="senha" className="mb-1.5 block text-sm font-medium text-slate-300">
              Senha
            </label>
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                aria-hidden="true"
              >
                <rect x="4" y="10" width="16" height="10" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" strokeLinecap="round" />
              </svg>
              <input
                id="senha"
                name="senha"
                type={mostrarSenha ? 'text' : 'password'}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-10 pr-10 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/30"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setMostrarSenha((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-slate-300"
                aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {mostrarSenha ? (
                  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                    <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
                    <path
                      d="M9.9 4.2A9.8 9.8 0 0 1 12 4c5 0 9 5 9 8a12 12 0 0 1-2.2 3M6.1 6.1C3.8 7.6 2.3 10 2.3 12c0 0 4 8 9.7 8a9 9 0 0 0 3.3-.6"
                      stroke="currentColor"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                    />
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

          {erro && (
            <p className="text-sm text-red-400" role="alert">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={carregando}
            className="w-full rounded-lg bg-gradient-to-r from-blue-500 to-cyan-400 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:brightness-110 hover:shadow-blue-500/50 disabled:opacity-60"
          >
            {carregando ? 'Entrando...' : 'Entrar'}
          </button>

          <div className="flex items-center justify-center gap-1 text-center text-sm">
            <Link href="/esqueci-senha" className="text-brand-300 transition-colors hover:text-brand-300">
              Esqueci minha senha
            </Link>
            <span className="text-slate-600">·</span>
            <Link href="/solicitar-acesso" className="text-brand-300 transition-colors hover:text-brand-300">
              Cadastrar
            </Link>
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          Acesso restrito a usuários autorizados
        </p>
      </div>

      <div className="relative z-10 w-full">
        <SecaoModalidades />
      </div>
    </main>
  )
}
