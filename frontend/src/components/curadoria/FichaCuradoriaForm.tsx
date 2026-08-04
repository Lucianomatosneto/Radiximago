'use client'

import { useTranslations } from 'next-intl'
import type { Marcacao } from '../../lib/marcacoes'

// Tipo de radiografia, faixa etária, sexo, dentes (notação FDI) e
// qualidade técnica saíram de aqui e foram para a caixa sobreposta no
// canto do visualizador (PainelDadosSobrepostos.tsx) - ver comentário em
// PainelVisualizador.tsx. Qualidade técnica ficou logo abaixo de Dentes
// (pedido explícito). Ficam só lá agora, não duplicados aqui, para não
// confundir o curador com o mesmo campo em dois lugares diferentes da
// tela.

export interface FormularioFicha {
  tipo_radiografia: string
  dentes: number[]
  idade_min: string
  idade_max: string
  genero: string
  // Formas (oval/retangulo/seta) desenhadas pelo curador na miniatura pra
  // indicar onde estao as lesoes - lista vazia quando nao ha marcacoes.
  marcacoes: Marcacao[]
  achados_detalhe: string
  alteracoes_observadas: string[]
  qualidade_tecnica: string
  descricao_didatica: string
  observacoes_internas: string
  anonimizacao_validada: boolean
}

export const FORM_VAZIO: FormularioFicha = {
  tipo_radiografia: 'periapical',
  dentes: [],
  idade_min: '',
  idade_max: '',
  genero: '',
  marcacoes: [],
  achados_detalhe: '',
  alteracoes_observadas: [],
  qualidade_tecnica: '',
  descricao_didatica: '',
  observacoes_internas: '',
  anonimizacao_validada: false,
}

const campoLabel = 'mb-1 block text-xs font-medium text-slate-400'
const campoInput =
  'w-full rounded-lg border border-base-border bg-base-surface2 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-brand'

// Ficha de curadoria: agora so tem "Regiao anatomica" (Descricao
// didatica, Observacoes internas - Qualidade tecnica saiu pra caixa
// sobreposta, abaixo de Dentes). Deixou de ser paginada -
// "Achados em radiografia" (que era a segunda pagina) saiu daqui de vez e
// foi morar ao lado do OHIF, no lugar do painel de marcacao de lesao (ver
// PainelAchadosRadiografia.tsx e o comentario sobre "painelLateral" em
// curadoria/page.tsx) - o curador ja marcou a lesao antes de chegar em
// achados, entao aquele espaco (bem mais alto que esta ficha de baixo)
// ficou livre pra receber o checklist.
export default function FichaCuradoriaForm({
  form,
  onChange,
  statusFicha,
  erro,
  rascunhoSalvo,
}: {
  form: FormularioFicha
  onChange: (form: FormularioFicha) => void
  statusFicha: string
  erro: string
  rascunhoSalvo: boolean
}) {
  const t = useTranslations('Curadoria.ficha')
  return (
    <section className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-base-border bg-base-surface p-3">
      <h2 className="mb-2 shrink-0 text-sm font-bold text-ink">{t('titulo')}</h2>

      {/* Status atual, Anonimização validada, Tipo de radiografia, Faixa
          etária, Sexo e Dentes saíram daqui: agora ficam na caixa
          sobreposta no canto do visualizador (sempre visível, mesmo no
          modo "ajustar a tela", onde esta ficha inteira fica escondida) -
          ver PainelDadosSobrepostos.tsx. "Achados em radiografia" também
          saiu daqui - foi morar ao lado do OHIF, no lugar do painel de
          marcação (ver PainelAchadosRadiografia.tsx e o comentário em
          curadoria/page.tsx). Por isso esta ficha voltou a ser 1 página
          só, sem carrossel: só resta "Região anatômica" (Descrição
          didática, Observações internas). */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={campoLabel}>{t('descricaoDidatica')}</label>
            <textarea
              value={form.descricao_didatica}
              onChange={(e) => onChange({ ...form, descricao_didatica: e.target.value })}
              rows={2}
              className={campoInput}
            />
          </div>

          <div>
            <label className={campoLabel}>{t('observacoesInternas')}</label>
            <textarea
              value={form.observacoes_internas}
              onChange={(e) => onChange({ ...form, observacoes_internas: e.target.value })}
              rows={2}
              className={campoInput}
            />
          </div>
        </div>
      </div>

      {erro && (
        <p className="mt-3 shrink-0 text-sm text-red-400" role="alert">
          {erro}
        </p>
      )}
      {rascunhoSalvo && <p className="mt-3 shrink-0 text-sm text-emerald-400">{t('rascunhoSalvo')}</p>}
    </section>
  )
}
