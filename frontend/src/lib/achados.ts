// Tipos e vocabulario compartilhados da classificacao odontologica
// estruturada (Fase 3, consome a API da Fase 2 - ver
// backend/app/modules/achados.py e backend/app/modules/curation/schemas.py).
// Fonte unica pra nao espalhar os mesmos valores/strings em varios
// componentes (Achados e Erro Tecnico usam este arquivo).
import { CATEGORIAS_ALTERACOES } from './alteracoesObservadas'
import type { Marcacao } from './marcacoes'

// TipoAchado (backend) reaproveita os MESMOS 26 valores de
// AlteracaoObservada (ja usados em alteracoesObservadas.ts) + "outro" - o
// frontend segue a mesma logica: deriva a lista aqui, em vez de copiar os
// 26 valores de novo (evita uma terceira lista com o mesmo conteudo).
export const TIPOS_ACHADO: string[] = [
  ...CATEGORIAS_ALTERACOES.flatMap((grupo) => grupo.itens.map((item) => item.valor)),
  'outro',
]

// tItens: tradutor de useTranslations('AlteracoesObservadas.itens') - o
// MESMO namespace ja usado por PainelAchadosRadiografia.tsx pra esses 26
// valores (nao existe mais um rotulo fixo em portugues aqui dentro; quem
// chama e responsavel por passar o tradutor certo, ja resolvido no idioma
// da pagina).
export function rotularTipoAchado(valor: string, tOutro: string, tItens: (valor: string) => string): string {
  if (valor === 'outro') return tOutro
  return tItens(valor)
}

// Regioes anatomicas (RegiaoAnatomica no backend) - vocabulario novo, sem
// mecanismo existente pra reaproveitar (nao havia nenhum campo de regiao
// anatomica antes da Fase 1/2).
export const REGIOES_ANATOMICAS: string[] = [
  'coroa',
  'raiz',
  'regiao_periapical',
  'periodonto',
  'osso_alveolar',
  'canal_mandibular',
  'seio_maxilar',
  'atm',
  'maxila',
  'mandibula',
  'palato',
  'outras_estruturas',
]

// Tipos de erro tecnico (TipoErroTecnico no backend) - dimensao
// independente de Achado, vocabulario proprio.
export const TIPOS_ERRO_TECNICO: string[] = [
  'movimento',
  'corte_apice',
  'corte_coroa',
  'angulacao_inadequada',
  'exposicao_inadequada',
  'posicionamento_inadequado',
  'artefato',
  'processamento_inadequado',
]

// Formato de resposta de GET/POST/PATCH /curation/{id}/achados (AchadoOut).
export interface Achado {
  id: number
  curation_id: number
  tipo: string
  regiao_anatomica: string | null
  dentes: number[] | null
  dente_nao_identificado: boolean
  descricao: string | null
  marcacoes: Marcacao[]
  criado_em: string | null
  atualizado_em: string | null
}

// Formato de resposta de GET/POST/PATCH /curation/{id}/erros-tecnicos
// (ErroTecnicoOut).
export interface ErroTecnico {
  id: number
  curation_id: number
  tipo: string
  descricao: string | null
  criado_em: string | null
}
