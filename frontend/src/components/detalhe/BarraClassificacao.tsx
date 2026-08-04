'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { corTextoAchado, COR_TEXTO_TIPO_RADIOGRAFIA, COR_TEXTO_QUALIDADE_TECNICA, COR_TEXTO_DENTES } from '../../lib/coresAchados'

// Faixa compacta com a classificacao da imagem, sempre abaixo do
// visualizador - propositalmente enxuta pra deixar o maximo de espaco
// possivel pra imagem em si. Tipo/qualidade/dentes numa linha compacta;
// alterações observadas tem cartao proprio (ver `CampoEmDestaque` abaixo -
// e a lista concreta do que o curador marcou, por isso o destaque); achados
// detalhados e descrição didática ficam no formato simples de sempre
// (titulo ao lado do valor, cortando em 2 linhas - line-clamp-2).
//
// Os titulos da linha compacta (Tipo:, Qualidade:, Dentes:) tem cada um sua
// cor fixa (../../lib/coresAchados): "Tipo:" fica azul-petroleo (igual aos
// cards de Periapicais/Panoramicas/Interproximais/Oclusais no Banco de
// imagens), "Qualidade:" fica amarelo (igual ao card de Imagens de alta
// qualidade didatica) e "Dentes:" fica azul (cor fixa, por pedido - nao tem
// card equivalente no Banco de imagens). Ja "Alterações observadas:",
// "Achados detalhados:" e "Descrição:" usam a cor do achado principal
// (`achadoPrincipal`, opcional; sem ela ou com achado nao mapeado, ficam na
// cor neutra de sempre).
function CampoEmDestaque({
  icone,
  titulo,
  cor,
  children,
}: {
  icone: string
  titulo: string
  cor: string
  children: ReactNode
}) {
  return (
    <div className="rounded-xl border border-base-border bg-base-surface2/70 p-4">
      <div className={`mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${cor}`}>
        <span aria-hidden="true">{icone}</span>
        {titulo}
      </div>
      {children}
    </div>
  )
}

export default function BarraClassificacao({
  tipo,
  qualidade,
  dentes,
  alteracoesObservadas,
  achadosDetalhe,
  descricaoDidatica,
  achadoPrincipal,
}: {
  tipo: string
  qualidade: string
  dentes: number[] | null
  alteracoesObservadas: string[] | null | undefined
  achadosDetalhe: string | null
  descricaoDidatica: string | null
  achadoPrincipal?: string | null
}) {
  const t = useTranslations('Visualizador.classificacao')
  const tAlteracoes = useTranslations('AlteracoesObservadas.itens')
  const rotulosAlteracoes = (alteracoesObservadas ?? []).map((valor) => {
    // Se algum valor antigo nao estiver mais no catalogo de traducao,
    // mostra o proprio valor cru em vez de quebrar a tela.
    try {
      return tAlteracoes(valor)
    } catch {
      return valor
    }
  })
  const corAchado = corTextoAchado(achadoPrincipal)

  return (
    <div className="mt-3 flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <span className="whitespace-nowrap">
          <span className={`font-medium ${COR_TEXTO_TIPO_RADIOGRAFIA}`}>{t('tipo')}</span>
          <span className="text-ink">{tipo}</span>
        </span>
        <span className="whitespace-nowrap">
          <span className={`font-medium ${COR_TEXTO_QUALIDADE_TECNICA}`}>{t('qualidade')}</span>
          <span className="text-ink">{qualidade}</span>
        </span>
        <span className="whitespace-nowrap">
          <span className={`font-medium ${COR_TEXTO_DENTES}`}>{t('dentes')}</span>
          <span className="text-ink">{dentes && dentes.length > 0 ? dentes.join(', ') : '—'}</span>
        </span>
      </div>

      <CampoEmDestaque icone="🔎" titulo={t('alteracoesObservadas')} cor={corAchado}>
        {rotulosAlteracoes.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {rotulosAlteracoes.map((rotulo) => (
              <span
                key={rotulo}
                className="rounded-full border border-base-border bg-base-surface px-2.5 py-1 text-xs font-medium text-ink"
              >
                {rotulo}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm italic text-slate-500">{t('nenhumaAlteracao')}</p>
        )}
      </CampoEmDestaque>

      <p className="line-clamp-2 text-ink">
        <span className={`font-medium ${corAchado}`}>{t('achadosDetalhados')}</span>
        {achadosDetalhe || '—'}
      </p>
      <p className="line-clamp-2 text-ink">
        <span className={`font-medium ${corAchado}`}>{t('descricao')}</span>
        {descricaoDidatica || '—'}
      </p>
    </div>
  )
}
