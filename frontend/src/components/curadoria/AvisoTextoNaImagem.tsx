'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

/**
 * Aviso da verificacao automatica de texto gravado na imagem
 * (backend: app/modules/texto_na_imagem.py), para o curador conferir a
 * imagem ANTES de marcar "Anonimizacao validada":
 * - "tarjado": havia texto e ele foi coberto - conferir se sobrou algo e se
 *   a tarja nao cobriu anatomia importante;
 * - "nao_verificado" ou sem registro (imagem antiga): o sistema nao conseguiu
 *   verificar - conferir com atencao redobrada;
 * - "sem_texto": nada a mostrar.
 *
 * 23/11/2026 (pedido do Luciano): o aviso ocupava a altura das caixas da
 * curadoria. Agora ele aparece AO ABRIR o exame, numa janela, e o curador
 * marca que esta CIENTE de que tem de conferir se ha dados na imagem; depois
 * disso o aviso some. Cada ficha (chave) pede o ciente de novo.
 */
export default function AvisoTextoNaImagem({
  situacao,
  regioes,
  cortes = 1,
  chave = null,
}: {
  situacao: string | null
  regioes: number | null
  /** exame em volume (tomografia, 18/11/2026): a ficha vale para todos os
   * cortes e a verificacao de texto ja considera todos eles (pior caso) */
  cortes?: number
  /** ficha aberta: outra ficha pede o ciente de novo */
  chave?: number | null
}) {
  const t = useTranslations('Curadoria.textoNaImagem')
  const [cienteDe, setCienteDe] = useState<number | null | undefined>(undefined)
  const [marcado, setMarcado] = useState(false)

  useEffect(() => {
    setMarcado(false)
  }, [chave])

  if (situacao === 'sem_texto' || cienteDe === chave) return null

  const mensagem =
    situacao === 'tarjado'
      ? t('tarjado', { regioes: regioes ?? 0 })
      : situacao === 'nao_verificado'
        ? t('naoVerificado')
        : t('semRegistro')
  const volume = cortes > 1

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="aviso-texto-titulo"
        className="w-full max-w-lg space-y-4 rounded-xl border border-amber-400/50 bg-base-surface p-5 shadow-2xl"
      >
        <h2 id="aviso-texto-titulo" className="text-base font-semibold text-amber-300">
          <span aria-hidden="true">⚠ </span>
          {t('titulo')}
        </h2>
        <p className="text-sm leading-relaxed text-ink">
          {mensagem}
          {volume && <> {t('volumeTodosCortes', { cortes })}</>}
        </p>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            autoFocus
            checked={marcado}
            onChange={(e) => setMarcado(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-amber-400"
          />
          <span>{t('ciente')}</span>
        </label>
        <div className="flex justify-end">
          <button
            type="button"
            disabled={!marcado}
            onClick={() => setCienteDe(chave)}
            className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {t('continuar')}
          </button>
        </div>
      </div>
    </div>
  )
}
