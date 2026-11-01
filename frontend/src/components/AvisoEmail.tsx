'use client'

import { useTranslations } from 'next-intl'
import { sugestaoDeEmail } from '../lib/emailDigitacao'

/**
 * Aviso de PROVAVEL ERRO DE DIGITACAO no e-mail (01/11/2026 - QA item 2):
 * "gabi@hotmai.com -> você quis dizer gabi@hotmail.com?". So avisa, nao
 * bloqueia (o dominio pode existir). Usado ao digitar (cadastro, criacao de
 * usuario) e ao lado de e-mails ja cadastrados (lista de usuarios, prancha).
 */
export default function AvisoEmail({ email }: { email: string | null | undefined }) {
  const t = useTranslations('AvisoEmail')
  const sugerido = sugestaoDeEmail(email)
  if (!sugerido) return null
  return (
    <span className="mt-1 block text-xs text-amber-500 dark:text-amber-300" role="note">
      {t('vocequisdizer', { sugerido })}
    </span>
  )
}
