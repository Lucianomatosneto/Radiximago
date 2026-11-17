'use client'

import { useTranslations } from 'next-intl'

/**
 * AVISO "SEM CONEXAO" (Fase 3e, 16/11/2026): aparece no lugar da tela quando
 * a sessao nao pode ser conferida (sem internet ou servidor fora). A pessoa
 * continua na mesma tela; o aviso e anunciado ao leitor de tela
 * (role="alert") e o botao confere de novo. Nada restrito e mostrado aqui.
 */
export default function AvisoSemConexao({ aoTentar, ocupado = false }: { aoTentar: () => void; ocupado?: boolean }) {
  const tComum = useTranslations('Comum')
  return (
    <main className="flex min-h-screen items-center justify-center bg-base p-6">
      <div className="max-w-sm space-y-4 text-center">
        <p role="alert" className="text-slate-300">
          {tComum('semConexao')}
        </p>
        <button
          type="button"
          onClick={aoTentar}
          disabled={ocupado}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {tComum('tentarDeNovo')}
        </button>
      </div>
    </main>
  )
}
