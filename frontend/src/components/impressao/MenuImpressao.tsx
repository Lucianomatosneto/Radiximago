'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { ItemDescritivel } from '../../lib/descricaoCuradoria'
import { DialogoPrancha } from './MenuPrancha'

// IMPRESSAO DAS IMAGENS
// 08/11/2026 (pedido do Luciano): o botao "Imprimir" abre direto a PRANCHA
// (MenuPrancha.tsx): a folha e montada no servidor, entao o que sai na
// impressora e igual ao PDF baixado. As opcoes antigas "com/sem descricao da
// curadoria" por grupo sairam. Todas as folhas levam o aviso de uso
// academico (imagens anonimizadas; material de ensino, nao de diagnostico).

export interface ItemImpressao extends ItemDescritivel {
  curation_id: number
  numero: number
}

export interface GrupoImpressao {
  chave: string
  rotulo: string
  itens: ItemImpressao[]
}

export default function MenuImpressao({
  grupos,
  compacto = false,
  enxuto = false,
  soIcone = false,
}: {
  grupos: GrupoImpressao[]
  compacto?: boolean
  /** botao menor (barra de acoes fixa da Pesquisa) */
  enxuto?: boolean
  /** so o icone (o nome aparece ao parar o mouse em cima) */
  soIcone?: boolean
}) {
  // 08/11/2026 (pedido do Luciano): "Imprimir" abre direto a PRANCHA - as
  // opcoes "com/sem descricao" por grupo sairam do menu. Na prancha a pessoa
  // escolhe quais imagens, quantas por folha e quais dados.
  const t = useTranslations('Impressao')
  const [prancha, setPrancha] = useState(false)
  const temAlgo = grupos.some((g) => g.itens.length > 0)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setPrancha(true)}
        disabled={!temAlgo}
        aria-haspopup="dialog"
        data-teste="botao-imprimir"
        title={soIcone ? t('botao') : undefined}
        aria-label={soIcone ? t('botao') : undefined}
        className={
          compacto
            ? 'rounded-md border border-base-border bg-base-surface/80 px-3 py-1 text-xs text-slate-200 hover:border-brand hover:text-brand-300 disabled:opacity-50'
            : enxuto
              ? 'flex h-8 items-center gap-1.5 rounded-lg border border-base-border bg-base-surface px-2.5 text-xs text-slate-200 hover:border-brand hover:text-brand-300 disabled:opacity-50'
              : 'flex items-center gap-2 rounded-lg border border-base-border bg-base-surface px-4 py-2 text-sm text-slate-200 hover:border-brand hover:text-brand-300 disabled:opacity-50'
        }
      >
        🖨 {!soIcone && t('botao')}
      </button>
      {prancha && <DialogoPrancha grupos={grupos} modo="imprimir" onFechar={() => setPrancha(false)} />}
    </div>
  )
}
