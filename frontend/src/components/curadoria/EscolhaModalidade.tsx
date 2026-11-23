'use client'

// ESCOLHER A MODALIDADE QUE VAI CURAR (pedido do Luciano, 23/11/2026; Manual
// do Bloco 6, item 7 - "modalidade preliminar" na fila). Antes, a 1a imagem
// da fila abria sozinha, sem escolha. Agora:
// - PerguntaModalidade: com mais de uma modalidade na fila, a Curadoria
//   pergunta antes de abrir (e criar) qualquer ficha;
// - CaixaModalidade: no alto da tela, troca a modalidade depois.
// A contagem vem do servidor (por_tipo de /curation/pending): tomografia e
// panoramica sao reconhecidas na entrada; periapical, interproximal e
// oclusal so quando quem enviou informou ("intraoral" quando nao informou).

import Link from 'next/link'
import { useTranslations } from 'next-intl'

/** ordem fixa das modalidades na tela */
export const ORDEM_MODALIDADES = [
  'tomografia',
  'panoramica',
  'periapical',
  'interproximal',
  'oclusal',
  'intraoral',
  'nao_informado',
] as const

/** modalidades presentes na fila (contagem > 0), na ordem fixa */
export function modalidadesPresentes(porTipo: Record<string, number>): string[] {
  return ORDEM_MODALIDADES.filter((m) => (porTipo[m] ?? 0) > 0)
}

export function totalDaFila(porTipo: Record<string, number>): number {
  return Object.values(porTipo).reduce((a, b) => a + b, 0)
}

export function PerguntaModalidade({
  porTipo,
  onEscolher,
}: {
  porTipo: Record<string, number>
  /** '' = todas */
  onEscolher: (tipo: string) => void
}) {
  const t = useTranslations('ModalidadeFila')
  const opcoes = [...modalidadesPresentes(porTipo).map((m) => ({ valor: m, total: porTipo[m] })), { valor: '', total: totalDaFila(porTipo) }]
  return (
    <section className="mx-auto mt-6 w-full max-w-3xl rounded-2xl border border-teal-400/40 bg-base-surface p-5 shadow-lg">
      <div role="group" aria-labelledby="pergunta-modalidade">
        <h2 id="pergunta-modalidade" className="text-base font-semibold text-ink">
          {t('pergunta')}
        </h2>
        <p className="mt-1 text-xs text-ink-2">{t('perguntaExplica')}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {opcoes.map(({ valor, total }) => (
            <button
              key={valor || 'todas'}
              type="button"
              onClick={() => onEscolher(valor)}
              className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-3 text-left text-sm font-medium transition hover:border-teal-300 hover:bg-teal-400/10 ${
                valor ? 'border-base-border text-ink' : 'border-teal-400/50 text-teal-100'
              }`}
            >
              <span>{t(valor || 'todas')}</span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs tabular-nums">{total}</span>
            </button>
          ))}
        </div>
        {/* 23/11/2026: periapical, interproximal e oclusal so se separam
            olhando - a triagem faz isso em lote */}
        {((porTipo.intraoral ?? 0) > 0 || (porTipo.nao_informado ?? 0) > 0) && (
          <Link
            href={`/curadoria/triagem?tipo=${(porTipo.intraoral ?? 0) > 0 ? 'intraoral' : 'nao_informado'}`}
            className="mt-4 inline-block text-sm font-medium text-teal-300 underline hover:no-underline"
          >
            {t('triagem')}
          </Link>
        )}
      </div>
    </section>
  )
}

export function CaixaModalidade({
  porTipo,
  valor,
  onEscolher,
}: {
  porTipo: Record<string, number>
  valor: string
  onEscolher: (tipo: string) => void
}) {
  const t = useTranslations('ModalidadeFila')
  const presentes = modalidadesPresentes(porTipo)
  // a escolhida continua na lista mesmo sem imagens (fila daquele tipo acabou)
  const lista = valor && !presentes.includes(valor) ? [...presentes, valor] : presentes
  return (
    <label className="flex items-center gap-2 text-xs text-ink-2">
      {t('caixa')}
      <select
        value={valor}
        onChange={(e) => onEscolher(e.target.value)}
        className="rounded-lg border border-base-border bg-base-surface2 px-2 py-1 text-xs text-ink"
      >
        <option value="">{t('opcao', { nome: t('todas'), total: totalDaFila(porTipo) })}</option>
        {lista.map((m) => (
          <option key={m} value={m}>
            {t('opcao', { nome: t(m), total: porTipo[m] ?? 0 })}
          </option>
        ))}
      </select>
    </label>
  )
}
