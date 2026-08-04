// Valores reais do enum AlteracaoObservada no backend, agrupados por
// categoria so pra organizar a exibicao - o backend guarda como lista
// plana de strings. Compartilhado entre o formulario de curadoria (onde o
// curador marca) e a faixa de classificacao (onde o estudante ve os
// rotulos legiveis do que foi marcado). `categoriaChave` referencia o
// namespace AlteracoesObservadas.categorias das mensagens de traducao -
// usado por telas ja traduzidas (ex.: PainelAchadosRadiografia.tsx); telas
// ainda nao traduzidas continuam usando `categoria` (texto fixo em
// portugues) normalmente.
export const CATEGORIAS_ALTERACOES: { categoria: string; categoriaChave: string; itens: { valor: string; label: string }[] }[] = [
  {
    categoria: 'Cárie',
    categoriaChave: 'carie',
    itens: [
      { valor: 'carie_esmalte', label: 'Cárie em esmalte' },
      { valor: 'carie_dentina', label: 'Cárie em dentina' },
      { valor: 'carie_proxima_polpa', label: 'Cárie próxima à polpa' },
      { valor: 'carie_secundaria', label: 'Cárie secundária (sob restauração)' },
    ],
  },
  {
    categoria: 'Periodontal',
    categoriaChave: 'periodontal',
    itens: [
      { valor: 'perda_ossea_horizontal', label: 'Perda óssea horizontal' },
      { valor: 'perda_ossea_vertical', label: 'Perda óssea vertical' },
      { valor: 'calculo_dentario', label: 'Cálculo dentário (tártaro)' },
      { valor: 'alargamento_ligamento_periodontal', label: 'Alargamento do ligamento periodontal' },
    ],
  },
  {
    categoria: 'Periapical / Endodôntico',
    categoriaChave: 'periapicalEndodontico',
    itens: [
      { valor: 'lesao_periapical', label: 'Lesão periapical' },
      { valor: 'reabsorcao_radicular_externa', label: 'Reabsorção radicular externa' },
      { valor: 'reabsorcao_radicular_interna', label: 'Reabsorção radicular interna' },
      { valor: 'tratamento_endodontico_presente', label: 'Tratamento endodôntico presente' },
      { valor: 'tratamento_endodontico_inadequado', label: 'Tratamento endodôntico inadequado' },
      { valor: 'fratura_radicular', label: 'Fratura radicular' },
    ],
  },
  {
    categoria: 'Restaurador / Protético',
    categoriaChave: 'restauradorProtetico',
    itens: [
      { valor: 'restauracao_presente', label: 'Restauração presente' },
      { valor: 'restauracao_com_infiltracao', label: 'Restauração com infiltração' },
      { valor: 'coroa_protetica', label: 'Coroa protética' },
      { valor: 'nucleo_pino', label: 'Núcleo/pino intrarradicular' },
    ],
  },
  {
    categoria: 'Ósseo / Anatômico',
    categoriaChave: 'osseoAnatomico',
    itens: [
      { valor: 'cisto', label: 'Cisto' },
      { valor: 'lesao_radiopaca', label: 'Lesão radiopaca' },
      { valor: 'lesao_radiolucida_inespecifica', label: 'Lesão radiolúcida inespecífica' },
      { valor: 'dente_incluso', label: 'Dente incluso/impactado' },
      { valor: 'dente_supranumerario', label: 'Dente supranumerário' },
      { valor: 'agenesia_dentaria', label: 'Agenesia dentária' },
      { valor: 'alteracao_seio_maxilar', label: 'Alteração no seio maxilar' },
      { valor: 'corpo_estranho', label: 'Corpo estranho' },
    ],
  },
]

const _MAPA_ROTULOS: Record<string, string> = Object.fromEntries(
  CATEGORIAS_ALTERACOES.flatMap((grupo) => grupo.itens.map((item) => [item.valor, item.label]))
)

export function rotularAlteracaoObservada(valor: string): string {
  return _MAPA_ROTULOS[valor] ?? valor
}
