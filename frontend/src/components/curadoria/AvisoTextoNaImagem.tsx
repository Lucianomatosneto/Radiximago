'use client'

import { useTranslations } from 'next-intl'

/**
 * Aviso da verificacao automatica de texto gravado na imagem
 * (backend: app/modules/texto_na_imagem.py). Aparece ao lado da ficha para
 * o curador conferir a imagem ANTES de marcar "Anonimizacao validada":
 * - "tarjado": havia texto e ele foi coberto - conferir se sobrou algo e se
 *   a tarja nao cobriu anatomia importante;
 * - "nao_verificado" ou sem registro (imagem antiga): o sistema nao conseguiu
 *   verificar - conferir com atencao redobrada;
 * - "sem_texto": nada a mostrar.
 */
export default function AvisoTextoNaImagem({
  situacao,
  regioes,
}: {
  situacao: string | null
  regioes: number | null
}) {
  const t = useTranslations('Curadoria.textoNaImagem')
  if (situacao === 'sem_texto') return null
  const mensagem =
    situacao === 'tarjado'
      ? t('tarjado', { regioes: regioes ?? 0 })
      : situacao === 'nao_verificado'
        ? t('naoVerificado')
        : t('semRegistro')
  return (
    <div
      role="alert"
      className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-200"
    >
      <span className="font-semibold">⚠ {t('titulo')}</span> {mensagem}
    </div>
  )
}
