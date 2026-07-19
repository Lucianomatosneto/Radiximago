'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
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
      router.push('/dashboard')
    } catch {
      setErro('Não foi possível entrar. Tente novamente mais tarde.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 px-4">
      <div className="w-full max-w-md rounded-xl border border-teal-900/40 bg-slate-900/80 p-8 shadow-2xl backdrop-blur">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-wide text-teal-300">RADIX IMAGO</h1>
          <p className="mt-2 text-sm text-slate-400">
            Base inteligente de imagens para ensino e pesquisa em saúde
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-300">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              placeholder="seu.email@exemplo.com"
            />
          </div>

          <div>
            <label htmlFor="senha" className="mb-1 block text-sm font-medium text-slate-300">
              Senha
            </label>
            <input
              id="senha"
              name="senha"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              placeholder="••••••••"
            />
          </div>

          {erro && (
            <p className="text-sm text-red-400" role="alert">
              {erro}
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-md bg-teal-600 py-2 font-medium text-white transition-colors hover:bg-teal-500"
          >
            {carregando ? 'Entrando...' : 'Entrar'}
          </button>

          <div className="text-center">
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="text-sm text-teal-400 hover:text-teal-300"
            >
              Esqueci minha senha
            </a>
          </div>
        </form>

        <p className="mt-8 text-center text-xs text-slate-500">
          Acesso restrito a usuários autorizados
        </p>
      </div>
    </main>
  )
}
