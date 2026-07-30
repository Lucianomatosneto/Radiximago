'use client'

import { useRouter } from 'next/navigation'

interface ErroTecnicoProps {
  onRetry?: () => void
}

export default function ErroTecnico({ onRetry }: ErroTecnicoProps) {
  const router = useRouter()

  return (
    <main className="flex min-h-screen items-center justify-center bg-base p-6">
      <div className="max-w-md text-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="mx-auto mb-4 h-16 w-16 text-red-400"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>

        <h1 className="text-xl font-semibold text-slate-100">Erro técnico</h1>
        <p className="mt-3 text-sm text-slate-400">Não foi possível carregar a imagem.</p>
        <p className="mt-2 text-xs text-slate-500">
          O serviço de imagens está temporariamente indisponível.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Tente novamente mais tarde ou entre em contato com o suporte técnico.
        </p>

        <div className="mt-6 flex justify-center gap-3">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md border border-slate-700 px-5 py-2 text-sm text-slate-200 hover:border-brand hover:text-brand-300"
            >
              Tentar novamente
            </button>
          )}
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="rounded-md bg-brand px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
          >
            Voltar ao início
          </button>
        </div>
      </div>
    </main>
  )
}
