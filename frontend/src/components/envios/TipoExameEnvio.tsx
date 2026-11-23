'use client'

// TIPO DE EXAME NO ENVIO (opcional - pedido do Luciano, 23/11/2026): quem
// envia diz o tipo, e ele vira a "modalidade" que o curador usa para escolher
// o que curar na fila. Sem escolher, o sistema reconhece sozinho tomografia e
// panoramica (periapical, interproximal e oclusal ficam como "intraoral").

import { useTranslations } from 'next-intl'

export const TIPOS_EXAME = ['periapical', 'interproximal', 'oclusal', 'panoramica', 'tomografia'] as const

export default function TipoExameEnvio({
  id,
  valor,
  aoMudar,
  className,
}: {
  id: string
  valor: string
  aoMudar: (v: string) => void
  className: string
}) {
  const t = useTranslations('EnviarImagem.tipoExame')
  const tm = useTranslations('ModalidadeFila')
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">
        {t('rotulo')}
      </label>
      <select id={id} value={valor} onChange={(e) => aoMudar(e.target.value)} className={className}>
        <option value="">{t('naoSei')}</option>
        {TIPOS_EXAME.map((tipo) => (
          <option key={tipo} value={tipo}>
            {tm(tipo)}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-ink-2">{t('explica')}</p>
    </div>
  )
}
