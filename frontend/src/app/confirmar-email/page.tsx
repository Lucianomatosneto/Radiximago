'use client'

import { Suspense, useState, FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Logo from '../../components/Logo'

// ETAPA 2 do cadastro: a pessoa chega aqui pelo link recebido por e-mail e
// digita a MESMA senha que definiu no formulario de "Solicitar acesso".
// So depois disso o pedido aparece para o administrador analisar.
//
// A confirmacao exige um clique (POST) de proposito, em vez de acontecer
// sozinha ao abrir o link: alguns servicos de e-mail "abrem" os links para
// procurar virus, e isso nao pode confirmar nada sem a pessoa.

type Situacao = 'formulario' | 'confirmado' | 'linkInvalido'

// Mensagens conhecidas do backend (auth.py: confirm-email) traduzidas aqui.
function interpretarErro(detalhe: string | undefined): { chave: string; fimDoLink: boolean } {
  switch (detalhe) {
    case 'Senha incorreta.':
      return { chave: 'erroSenhaIncorreta', fimDoLink: false }
    case 'Link de confirmação expirado. Faça a solicitação novamente.':
      return { chave: 'erroLinkExpirado', fimDoLink: true }
    case 'Link bloqueado por excesso de tentativas. Faça a solicitação novamente.':
      return { chave: 'erroLinkBloqueado', fimDoLink: true }
    case 'Link de confirmação inválido ou já utilizado.':
      return { chave: 'erroLinkInvalido', fimDoLink: true }
    default:
      return { chave: 'erroGenerico', fimDoLink: false }
  }
}

function ConfirmarEmailForm() {
  const t = useTranslations('ConfirmarEmail')
  const token = useSearchParams().get('token') ?? ''

  const [situacao, setSituacao] = useState<Situacao>(token ? 'formulario' : 'linkInvalido')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (carregando) return
    const senha = String(new FormData(event.currentTarget).get('senha') ?? '')
    if (!senha) {
      setErro(t('erroSenhaObrigatoria'))
      return
    }

    setErro('')
    setCarregando(true)
    try {
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/confirm-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, senha }),
      })
      if (resposta.ok) {
        setSituacao('confirmado')
        return
      }
      const dados = await resposta.json().catch(() => null)
      const { chave, fimDoLink } = interpretarErro(dados?.detail)
      setErro(t(chave as Parameters<typeof t>[0]))
      if (fimDoLink) setSituacao('linkInvalido')
    } catch {
      setErro(t('erroGenerico'))
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="relative z-10 w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-7 shadow-2xl backdrop-blur-xl">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold tracking-tight text-white">{t('titulo')}</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{t('subtitulo')}</p>
      </div>

      {situacao === 'confirmado' ? (
        <div className="space-y-5">
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300" role="status">
            {t('sucessoMensagem')}
          </div>
          <Link
            href="/login"
            className="block w-full rounded-lg bg-gradient-to-r from-blue-500 to-cyan-400 py-2.5 text-center text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:brightness-110"
          >
            {t('irParaLogin')}
          </Link>
        </div>
      ) : situacao === 'linkInvalido' ? (
        <div className="space-y-5">
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300" role="alert">
            {erro || t('erroLinkInvalido')}
          </div>
          <Link
            href="/solicitar-acesso"
            className="block w-full rounded-lg bg-gradient-to-r from-blue-500 to-cyan-400 py-2.5 text-center text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:brightness-110"
          >
            {t('solicitarNovamente')}
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="senha" className="mb-1.5 block text-sm font-medium text-slate-300">
              {t('senha')}
            </label>
            <input
              id="senha"
              name="senha"
              type="password"
              autoComplete="current-password"
              autoFocus
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/30"
              placeholder="••••••••"
            />
            <p className="mt-1.5 text-xs text-slate-400">{t('ajudaSenha')}</p>
          </div>

          {erro && (
            <p className="text-sm text-red-400" role="alert">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={carregando}
            className="w-full rounded-lg bg-gradient-to-r from-blue-500 to-cyan-400 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:brightness-110 disabled:opacity-60"
          >
            {carregando ? t('confirmando') : t('confirmar')}
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

export default function ConfirmarEmailPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="fixed left-6 top-6 z-10">
        <Logo variante="login" />
      </div>
      <Suspense fallback={null}>
        <ConfirmarEmailForm />
      </Suspense>
    </main>
  )
}
