'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { GraduationCap } from 'lucide-react'
import { useSessaoAtual } from '../../lib/useVerificarSessao'

// GRUPOS - MODO AULA (17/11/2026): atalho na tela da imagem aprovada para
// prepara-la para um grupo (marcacoes, destaques e mensagem so do envio).
// Aparece so para quem cria grupos e so com a sessao confirmada pelo servidor;
// quem decide de verdade e o servidor (GET /grupos/aula/imagem/{id}).
const PERFIS = ['professor', 'pesquisador', 'curador', 'administrador']

export default function BotaoPrepararAula({ curationId }: { curationId: number }) {
  const t = useTranslations('AulaGrupo')
  const sessao = useSessaoAtual()
  if (!sessao || !PERFIS.includes(sessao.perfil)) return null
  return (
    <Link
      href={`/grupos/aula?imagem=${curationId}`}
      className="inline-flex items-center gap-1 rounded-lg border border-base-border px-3 py-1.5 text-xs font-medium text-ink hover:border-brand"
    >
      <GraduationCap aria-hidden="true" className="h-4 w-4" /> {t('botao')}
    </Link>
  )
}
