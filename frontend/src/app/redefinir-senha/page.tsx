'use client'

import { Suspense, useState, FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Logo from '../../components/Logo'

// Mapa das mensagens conhecidas que o backend devolve pra esse fluxo
// (auth.py: reset-password) - traduzidas aqui em vez de mostrar o texto
// cru vindo da API (que so existe em portugues, ver
// backend/app/modules/auth.py). Qualquer mensagem NAO mapeada cai no
// fallback generico traduzido (erroRedefinirGenerico), nunca no texto
// original em portugues.
function traduzirErroBackend(detalhe: string | undefined, t: ReturnType<typeof useTranslations>): string {
  switch (detalhe) {
    case 'Link de redefinição inválido ou já utilizado.':
      return t('erroLinkInvalido')
    case 'Link de redefinição expirado. Solicite um novo.':
      return t('erroLinkExpirado')
    case 'A nova senha deve ter ao menos 8 caracteres.':
      return t('erroSenhaCurta')
    default:
      return t('erroRedefinirGenerico')
  }
}

function RedefinirSenhaForm() {
  const t = useTranslations('RedefinirSenha')
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [concluido, setConcluido] = useState(false)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (carregando) return

    const formData = new FormData(event.currentTarget)
    const novaSenha = String(formData.get('nova_senha') ?? '')
    const confirmarSenha = String(formData.get('confirmar_senha') ?? '')

    if (!token) {
      setErro(t('erroLinkInvalido'))
      return
    }
    if (novaSenha.length < 8) {
      setErro(t('erroSenhaCurta'))
      return
    }
    if (novaSenha !== confirmarSenha) {
      setErro(t('erroSenhasDiferentes'))
      return
    }

    setErro('')
    setCarregando(true)

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, nova_senha: novaSenha }),
      })

      if (!response.ok) {
        const dados = await response.json().catch(() => null)
        setErro(traduzirErroBackend(dados?.detail, t))
        return
      }

      setConcluido(true)
      setTimeout(() => router.push('/login'), 2500)
    } catch {
      setErro(t('erroRedefinirGenericoTentarNovamente'))
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="relative z-10 w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-7 shadow-2xl backdrop-blur-xl">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold tracking-tight text-white">{t('titulo')}</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
          {t('subtitulo')}
        </p>
      </div>

      {concluido ? (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">
          {t('sucessoMensagem')}
        </div>
      ) : !token ? (
        <div className="space-y-5">
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
            {t('linkInvalidoMensagem')}
          </div>
          <Link
            href="/esqueci-senha"
            className="block w-full rounded-lg bg-gradient-to-r from-blue-500 to-cyan-400 py-2.5 text-center text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:brightness-110 hover:shadow-blue-500/50"
          >
            {t('solicitarNovoLink')}
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="nova_senha" className="mb-1.5 block text-sm font-medium text-slate-300">
              {t('novaSenha')}
            </label>
            <input
              id="nova_senha"
              name="nova_senha"
              type="password"
              autoFocus
              className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 px-3 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/30"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label htmlFor="confirmar_senha" className="mb-1.5 block text-sm font-medium text-slate-300">
              {t('confirmarNovaSenha')}
            </label>
            <input
              id="confirmar_senha"
              name="confirmar_senha"
              type="password"
              className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 px-3 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/30"
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
            disabled={carregando}
            className="w-full rounded-lg bg-gradient-to-r from-blue-500 to-cyan-400 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:brightness-110 hover:shadow-blue-500/50 disabled:opacity-60"
          >
            {carregando ? t('salvando') : t('redefinirSenha')}
          </button>

          <div className="text-center">
            <Link href="/login" className="text-sm text-brand-300 transition-colors hover:text-brand-300">
              {t('voltarLogin')}
            </Link>
          </div>
        </form>
      )}
    </div>
  )
}

export default function RedefinirSenhaPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="fixed left-6 top-6 z-10">
        <Logo variante="login" />
      </div>

      <Suspense fallback={null}>
        <RedefinirSenhaForm />
      </Suspense>
    </main>
  )
}
