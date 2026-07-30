'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import Logo from '../../components/Logo'
import RadiografiaIlustrativa from '../../components/RadiografiaIlustrativa'

// Valores reais do enum IntencaoPerfil no backend - so a preferencia do
// solicitante, o perfil de fato concedido e decidido pelo admin na
// aprovacao (pode ser diferente do que foi pedido aqui).
const OPCOES_INTENCAO_PERFIL = [
  { value: 'curador', label: 'Curador' },
  { value: 'professor', label: 'Professor' },
  { value: 'estudante', label: 'Estudante' },
  { value: 'pesquisador', label: 'Pesquisador' },
] as const

export default function SolicitarAcessoPage() {
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [perfilSolicitado, setPerfilSolicitado] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (carregando) return

    const formData = new FormData(event.currentTarget)
    const nome = String(formData.get('nome') ?? '').trim()
    const email = String(formData.get('email') ?? '').trim()
    const senha = String(formData.get('senha') ?? '')
    const confirmarSenha = String(formData.get('confirmar_senha') ?? '')
    const instituicao = String(formData.get('instituicao') ?? '').trim()
    const motivo = String(formData.get('motivo') ?? '').trim()

    if (!nome || !email || !senha) {
      setErro('Preencha nome, e-mail e senha.')
      return
    }
    if (senha.length < 8) {
      setErro('A senha deve ter ao menos 8 caracteres.')
      return
    }
    if (senha !== confirmarSenha) {
      setErro('As senhas não coincidem.')
      return
    }
    if (!perfilSolicitado) {
      setErro('Selecione o tipo de acesso que você está solicitando.')
      return
    }

    setErro('')
    setCarregando(true)

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/request-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome,
          email,
          senha,
          instituicao: instituicao || null,
          perfil_solicitado: perfilSolicitado,
          motivo: motivo || null,
        }),
      })

      if (!response.ok) {
        const dados = await response.json().catch(() => null)
        setErro(dados?.detail ?? 'Não foi possível enviar sua solicitação. Tente novamente.')
        return
      }

      setEnviado(true)
    } catch {
      setErro('Não foi possível enviar sua solicitação. Tente novamente mais tarde.')
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

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-7 shadow-2xl backdrop-blur-xl">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold tracking-tight text-white">Solicitar acesso</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
            Preencha seus dados. Um administrador vai revisar seu pedido antes da liberação.
          </p>
        </div>

        {enviado ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">
              Solicitação recebida. Um administrador vai revisar seu pedido em breve e você será avisado por e-mail.
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
              <label htmlFor="nome" className="mb-1.5 block text-sm font-medium text-slate-300">
                Nome completo
              </label>
              <input
                id="nome"
                name="nome"
                type="text"
                autoFocus
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 px-3 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/30"
                placeholder="Seu nome completo"
              />
            </div>

            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-300">
                E-mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 px-3 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/30"
                placeholder="seu.email@exemplo.com"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="senha" className="mb-1.5 block text-sm font-medium text-slate-300">
                  Senha
                </label>
                <input
                  id="senha"
                  name="senha"
                  type="password"
                  className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 px-3 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/30"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label htmlFor="confirmar_senha" className="mb-1.5 block text-sm font-medium text-slate-300">
                  Confirmar
                </label>
                <input
                  id="confirmar_senha"
                  name="confirmar_senha"
                  type="password"
                  className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 px-3 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/30"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div>
              <label htmlFor="instituicao" className="mb-1.5 block text-sm font-medium text-slate-300">
                Instituição (opcional)
              </label>
              <input
                id="instituicao"
                name="instituicao"
                type="text"
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 px-3 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/30"
                placeholder="Universidade, clínica, hospital..."
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">
                Tipo de acesso <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {OPCOES_INTENCAO_PERFIL.map((opcao) => (
                  <button
                    key={opcao.value}
                    type="button"
                    onClick={() => setPerfilSolicitado(opcao.value)}
                    className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                      perfilSolicitado === opcao.value
                        ? 'border-brand bg-brand text-white'
                        : 'border-white/10 bg-white/5 text-slate-300 hover:border-brand/50'
                    }`}
                  >
                    {opcao.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                É uma preferência - o administrador decide o perfil liberado na aprovação.
              </p>
            </div>

            <div>
              <label htmlFor="motivo" className="mb-1.5 block text-sm font-medium text-slate-300">
                Motivo do acesso (opcional)
              </label>
              <textarea
                id="motivo"
                name="motivo"
                rows={2}
                className="w-full resize-none rounded-lg border border-white/10 bg-white/5 py-2.5 px-3 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/30"
                placeholder="Conte brevemente como pretende usar a plataforma"
              />
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
              {carregando ? 'Enviando...' : 'Enviar solicitação'}
            </button>

            <div className="text-center">
              <Link href="/login" className="text-sm text-brand-300 transition-colors hover:text-brand-300">
                Já tenho conta — voltar para o login
              </Link>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}
