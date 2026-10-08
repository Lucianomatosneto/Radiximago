'use client'

import { useTranslations } from 'next-intl'
import { corTextoAchado } from '../../lib/coresAchados'
import type { ItemSequencia } from '../VisualizadorSequencial'

// Legenda curta que fica logo abaixo de cada imagem no visualizador: no
// maximo duas linhas pequenas, para nao roubar espaco da imagem.
//   linha 1: #numero · tipo · qualidade · dentes
//   linha 2: achado principal (na cor do achado) + alteracoes observadas
// O texto que nao couber termina em "..." e aparece inteiro ao passar o
// mouse (title). Clicar escolhe a imagem.
export default function LegendaImagem({
  item,
  ativa,
  onEscolher,
  tipo,
  qualidade,
  achado,
}: {
  item: ItemSequencia
  ativa: boolean
  onEscolher: () => void
  tipo: string
  qualidade: string | null
  achado: string | null
}) {
  const t = useTranslations('Visualizador.legenda')
  const tAlteracoes = useTranslations('AlteracoesObservadas.itens')
  const alteracoes = (item.alteracoes_observadas ?? []).map((valor) => {
    try {
      return tAlteracoes(valor)
    } catch {
      return valor
    }
  })

  const linha1 = [
    tipo,
    qualidade,
    item.dentes && item.dentes.length > 0 ? t('dentes', { lista: item.dentes.join(', ') }) : null,
  ].filter(Boolean) as string[]
  const linha2 = alteracoes.join(', ')
  const textoCompleto = [`#${item.numero}`, ...linha1, achado, linha2].filter(Boolean).join(' · ')

  return (
    <button
      type="button"
      onClick={onEscolher}
      title={textoCompleto}
      aria-pressed={ativa}
      className={`min-w-0 rounded-md border-t-2 px-2 pt-0.5 text-left leading-tight transition ${
        ativa ? 'border-teal-400 bg-teal-400/10' : 'border-transparent hover:bg-white/5'
      }`}
    >
      <span className="block truncate text-[12px] text-slate-300">
        <b className={`font-semibold ${ativa ? 'text-teal-200' : 'text-ink'}`}>#{item.numero}</b>
        {linha1.length > 0 && <span> · {linha1.join(' · ')}</span>}
      </span>
      <span className="block truncate text-[11px] text-slate-400">
        {achado && <span className={`font-medium ${corTextoAchado(item.achado_principal)}`}>{achado}</span>}
        {achado && linha2 && ' · '}
        {linha2 || (!achado ? t('semAlteracoes') : '')}
      </span>
    </button>
  )
}
