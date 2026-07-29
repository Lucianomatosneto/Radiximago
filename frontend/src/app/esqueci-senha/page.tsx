'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import Logo from '../../components/Logo'
import RadiografiaIlustrativa from '../../components/RadiografiaIlustrativa'

export default function EsqueciSenhaPage() {
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (carregando) return

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email') ?? '').trim()

    if (!email) {
      setErro('Informe seu e-mail.')
      return
    }

    setErro('')
    setCarregando(true)

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (!response.ok) {
        setErro('Não foi possível processar o pedido. Tente novamente mais tarde.')
        return
      }

      setEnviado(true)
    } catch {
      setErro('Não foi possível processar o pedido. Tente novamente mais tarde.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="fixed inset-0 -z-10">
        <RadiografiaIlustrativa />
      </div>

      <div className="fixed left-6 top-6 z-10">
        <Logo variante="login" />
      </div>

      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-7 shadow-2xl backdrop-blur-xl">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold tracking-tight text-white">Esqueci minha senha</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
            Informe seu e-mail e enviaremos instruções para redefinir sua senha
          </p>
        </div>

        {enviado ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">
              Se esse e-mail estiver cadastrado, enviamos instruções de redefinição. Confira sua caixa de entrada.
            </div>
            <Link
              href="/login"
              className="block w-full rounded-lg bg-gradient-to-r from-blue-500 to-cyan-400 py-2.5 text-center text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:brightness-110 hover:shadow-blue-500/50"
            >
              Voltar para o login
            </Link>
          </div>
        ) : (
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
                  autoFocus
                  className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-10 pr-3 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  placeholder="seu.email@exemplo.com"
                />
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
              {carregando ? 'Enviando...' : 'Enviar instruções'}
            </button>

            <div className="text-center">
              <Link href="/login" className="text-sm text-blue-400 transition-colors hover:text-blue-300">
                Voltar para o login
              </Link>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}
