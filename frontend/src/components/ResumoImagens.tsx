'use client'

import { useTranslations } from 'next-intl'
import DashboardCard from './DashboardCard'

// RESUMO DAS IMAGENS (Inicio e Painel administrativo) - os mesmos numeros
// nas duas telas, vindos da CONTAGEM UNICA do backend (GET /admin/stats ->
// "imagens"; ver contar_imagens_por_situacao em admin_router.py).
//
// Cada imagem ativa esta em UMA situacao so, entao:
//   Total = Aguardando curadoria + Aprovadas + Segunda opiniao
//           + Descartadas + Baixa qualidade
// A linha "Conferencia" mostra essa soma na tela, para quem quiser checar.
// Imagens desativadas nao entram no total (aviso a parte).

export interface ContagemImagens {
  total: number
  aguardando_curadoria: number
  por_situacao: Record<string, number>
  desativadas: number
}

export default function ResumoImagens({ imagens }: { imagens: ContagemImagens }) {
  const t = useTranslations('ResumoImagens')
  const s = imagens.por_situacao
  const n = (chave: string) => s[chave] ?? 0
  const partes = [imagens.aguardando_curadoria, n('aprovada'), n('segunda_opiniao'), n('descartada'), n('baixa_qualidade')]
  const soma = partes.reduce((a, b) => a + b, 0)
  const confere = soma === imagens.total

  return (
    <section aria-label={t('titulo')}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <DashboardCard label={t('total')} valor={imagens.total} cor="teal" detalhe={t('totalDetalhe')} />
        <DashboardCard
          label={t('aguardando')}
          valor={imagens.aguardando_curadoria}
          cor="amber"
          detalhe={t('aguardandoDetalhe', { semFicha: n('sem_ficha'), pendente: n('pendente'), emAnalise: n('em_analise') })}
        />
        <DashboardCard label={t('aprovadas')} valor={n('aprovada')} cor="green" />
        <DashboardCard label={t('segundaOpiniao')} valor={n('segunda_opiniao')} cor="purple" />
        <DashboardCard label={t('descartadas')} valor={n('descartada')} cor="red" />
        <DashboardCard label={t('baixaQualidade')} valor={n('baixa_qualidade')} cor="orange" />
      </div>
      <p className={`mt-2 text-xs ${confere ? 'text-slate-500' : 'text-red-400'}`}>
        {t('conferencia', { partes: partes.join(' + '), total: imagens.total })} {confere ? '✓' : `⚠ ${t('naoConfere')}`}
        {imagens.desativadas > 0 && <> · {t('desativadas', { quantidade: imagens.desativadas })}</>}
      </p>
    </section>
  )
}
