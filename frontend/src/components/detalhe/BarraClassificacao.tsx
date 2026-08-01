'use client'

import { rotularAlteracaoObservada } from '../../lib/alteracoesObservadas'

// Faixa compacta com a classificacao da imagem, sempre abaixo do
// visualizador - propositalmente enxuta pra deixar o maximo de espaco
// possivel pra imagem em si. Tipo/qualidade/dentes numa linha; alterações
// observadas, achados detalhados e descrição didática cada um na sua
// própria linha, com espaço pra pelo menos duas linhas de texto
// (line-clamp-2) em vez de cortar tudo numa linha só.
export default function BarraClassificacao({
  tipo,
  qualidade,
  dentes,
  alteracoesObservadas,
  achadosDetalhe,
  descricaoDidatica,
}: {
  tipo: string
  qualidade: string
  dentes: number[] | null | undefined
  alteracoesObservadas: string[] | null | undefined
  achadosDetalhe: string | null
  descricaoDidatica: string | null
}) {
  const rotulosAlteracoes = (alteracoesObservadas ?? []).map(rotularAlteracaoObservada)

  return (
    <div className="mt-3 flex flex-col gap-1.5 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <span className="whitespace-nowrap">
          <span className="text-slate-500">Tipo: </span>
          <span className="text-ink">{tipo}</span>
        </span>
        <span className="whitespace-nowrap">
          <span className="text-slate-500">Qualidade: </span>
          <span className="text-ink">{qualidade}</span>
        </span>
        <span className="whitespace-nowrap">
          <span className="text-slate-500">Dentes: </span>
          <span className="text-ink">{dentes && dentes.length > 0 ? dentes.join(', ') : '—'}</span>
        </span>
      </div>
      <p className="line-clamp-2 text-ink">
        <span className="text-slate-500">Alterações observadas: </span>
        {rotulosAlteracoes.length > 0 ? rotulosAlteracoes.join(', ') : '—'}
      </p>
      <p className="line-clamp-2 text-ink">
        <span className="text-slate-500">Achados detalhados: </span>
        {achadosDetalhe || '—'}
      </p>
      <p className="line-clamp-2 text-ink">
        <span className="text-slate-500">Descrição: </span>
        {descricaoDidatica || '—'}
      </p>
    </div>
  )
}
