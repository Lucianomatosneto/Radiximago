'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

// ESTADO VAZIO reutilizavel (01/11/2026): icone, titulo, explicacao do que
// vai aparecer ali e um proximo passo (link e/ou bloco "como funciona").
// `rodape` recebe, por exemplo, o aviso de seguranca em versao compacta.
export default function EstadoVazio({
  icone: Icone,
  titulo,
  texto,
  acao,
  comoFunciona,
  rodape,
}: {
  icone: LucideIcon
  titulo: string
  texto: string
  acao?: { href: string; rotulo: string }
  comoFunciona?: { titulo: string; passos: string[] }
  rodape?: ReactNode
}) {
  return (
    <section className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-2xl border border-dashed border-base-border bg-base-surface/70 px-5 py-10 text-center" aria-live="polite">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 text-brand">
        <Icone aria-hidden="true" className="h-7 w-7" />
      </span>
      <h2 className="text-lg font-semibold text-ink">{titulo}</h2>
      <p className="max-w-md text-[15px] leading-relaxed text-slate-500">{texto}</p>
      {acao && (
        <Link href={acao.href} className="mt-1 inline-flex min-h-[44px] items-center rounded-lg bg-brand px-4 text-sm font-semibold text-white">
          {acao.rotulo}
        </Link>
      )}
      {comoFunciona && (
        <details className="w-full max-w-md text-left">
          <summary className="flex min-h-[44px] cursor-pointer items-center justify-center text-sm font-medium text-brand underline-offset-2 hover:underline">
            {comoFunciona.titulo}
          </summary>
          <ol className="mt-2 list-decimal space-y-1 pl-6 text-sm text-slate-500">
            {comoFunciona.passos.map((p) => <li key={p}>{p}</li>)}
          </ol>
        </details>
      )}
      {rodape && <div className="mt-2 w-full max-w-md text-left">{rodape}</div>}
    </section>
  )
}
