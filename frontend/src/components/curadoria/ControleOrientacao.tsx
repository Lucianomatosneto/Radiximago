'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { arcadaDosDentes, chaveSugestao, type Giro } from '../../lib/orientacao'

/**
 * Botoes para GIRAR a radiografia na Curadoria (90° para cada lado e 180°)
 * e a SUGESTAO de posicao pelos dentes marcados (FDI 11-28 superiores:
 * coroas para baixo; 31-48 inferiores: coroas para cima).
 *
 * O giro e gravado no proprio arquivo, sem perda (backend:
 * POST /curation/imagem/{id}/girar) - vale em todas as telas, e as
 * marcacoes giram junto. `onGirou` avisa a pagina para recarregar o
 * visualizador e girar as marcacoes do formulario.
 */
export default function ControleOrientacao({
  orthancReferenceId,
  dentes,
  tipoRadiografia,
  onGirou,
}: {
  orthancReferenceId: number
  dentes: number[]
  tipoRadiografia: string | null
  onGirou: (graus: Giro) => void
}) {
  const t = useTranslations('Curadoria.orientacao')
  const [girando, setGirando] = useState(false)
  const [erro, setErro] = useState('')

  const arcada = arcadaDosDentes(dentes)
  const sugestao = t(`sugestao.${chaveSugestao(arcada, tipoRadiografia)}`, {
    dentes: [...dentes].sort((a, b) => a - b).join(', '),
  })

  async function girar(graus: Giro) {
    if (girando) return
    setGirando(true)
    setErro('')
    try {
      const resposta = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/curation/imagem/${orthancReferenceId}/girar`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ graus }),
        }
      )
      if (!resposta.ok) {
        let detalhe = t('erro')
        try {
          const dados = await resposta.json()
          if (typeof dados?.detail === 'string') detalhe = dados.detail
        } catch {
          // sem corpo legivel
        }
        setErro(detalhe)
        return
      }
      onGirou(graus)
    } catch {
      setErro(t('erro'))
    } finally {
      setGirando(false)
    }
  }

  const botao =
    'flex items-center gap-1 rounded-md border border-base-border bg-base-surface2 px-2 py-1 text-xs text-slate-200 transition hover:border-brand hover:text-brand-300 disabled:cursor-wait disabled:opacity-50'

  return (
    <div
      className="flex shrink-0 items-center gap-3 rounded-lg border border-base-border bg-base-surface px-3 py-1.5"
      role="group"
      aria-label={t('titulo')}
    >
      <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-slate-300">{t('titulo')}</span>
      <div className="flex shrink-0 gap-1.5 whitespace-nowrap">
        <button type="button" className={botao} disabled={girando} onClick={() => girar(270)} title={t('esquerdaDica')}>
          <span aria-hidden="true" className="text-sm leading-none">⟲</span> {t('esquerda')}
        </button>
        <button type="button" className={botao} disabled={girando} onClick={() => girar(90)} title={t('direitaDica')}>
          <span aria-hidden="true" className="text-sm leading-none">⟳</span> {t('direita')}
        </button>
        <button type="button" className={botao} disabled={girando} onClick={() => girar(180)} title={t('inverterDica')}>
          <span aria-hidden="true" className="text-sm leading-none">⇅</span> {t('inverter')}
        </button>
      </div>
      {/* no maximo duas linhas (a imagem fica com quase toda a altura); o
          texto inteiro aparece ao parar o mouse em cima */}
      <p className="line-clamp-2 min-w-0 flex-1 text-xs leading-snug text-slate-300" aria-live="polite" title={erro || sugestao}>
        {girando ? (
          t('girando')
        ) : erro ? (
          <span className="text-status-danger" role="alert">{erro}</span>
        ) : (
          <>
            <span className="font-semibold text-brand-300">{t('sugestaoRotulo')}</span> {sugestao}
          </>
        )}
      </p>
    </div>
  )
}
