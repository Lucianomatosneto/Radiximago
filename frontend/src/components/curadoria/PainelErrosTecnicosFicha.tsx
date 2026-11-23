'use client'

import { useTranslations } from 'next-intl'
import type { FormularioFicha } from './FichaCuradoriaForm'
import { errosParaTipo } from '../../lib/errosTecnicos'
import { PalavraChave } from './PainelDadosSobrepostos'
import { useFichaCompacta } from './FichaCompacta'

// ERRO TECNICO (secao da ficha): mostra SO os erros possiveis para o tipo
// de exame escolhido em "Dados da imagem" (intraoral, panoramica ou
// tomografia - ver lib/errosTecnicos.ts). Um clique liga/desliga; por voz,
// com a secao em destaque, basta falar o nome do erro ("corte de cone",
// "subexposição"); "sem erro técnico" = nada a registrar.

export default function PainelErrosTecnicosFicha({
  form,
  onChange,
  palavrasChave = false,
  cursor,
  faixa,
}: {
  form: FormularioFicha
  onChange: (form: FormularioFicha) => void
  palavrasChave?: boolean
  /** posicao do cursor das setas ←/→ (espaco marca/desmarca) */
  cursor?: number
  /** so os botoes [inicio, fim) da lista (cartoes baixos: o erro tecnico
   *  ocupa 2 cartoes); o cursor continua contando a lista inteira */
  faixa?: [number, number]
}) {
  const t = useTranslations('Curadoria.errosFicha')
  // cartao da panoramica (altura fixa): botoes menores para caberem todos
  const compacta = useFichaCompacta()
  const tOpcoes = useTranslations('Pesquisa.opcoes')
  const lista = errosParaTipo(form.tipo_radiografia)
  const marcados = form.erros_tecnicos
  // erro marcado que nao vale para o tipo atual (ex.: tipo trocado depois)
  const fora = marcados.filter((v) => !lista.some((e) => e.valor === v))

  function alternar(valor: string) {
    onChange({
      ...form,
      erros_tecnicos: marcados.includes(valor) ? marcados.filter((v) => v !== valor) : [...marcados, valor],
    })
  }

  return (
    <div className={compacta ? 'space-y-1' : 'space-y-2'}>
      {/* no cartao (compacta) a frase "Erros possiveis para..." e a dica da
          voz saem, para caberem todos os botoes sem rolar */}
      {!compacta && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          {form.tipo_radiografia
            ? t('paraTipo', { tipo: tOpcoes(`tipoRadiografia.${form.tipo_radiografia}`) })
            : t('semTipo')}
          <PalavraChave texto={t('chave')} visivel={palavrasChave} />
        </p>
      )}
      <div className={`flex flex-wrap ${compacta ? 'gap-0.5' : 'gap-1.5'}`}>
        {lista.map((e, i) => {
          if (faixa && (i < faixa[0] || i >= faixa[1])) return null
          const ligado = marcados.includes(e.valor)
          return (
            <button
              key={e.valor}
              type="button"
              onClick={() => alternar(e.valor)}
              aria-pressed={ligado}
              className={`rounded-full border transition-colors ${compacta ? 'px-1.5 py-0 text-[10.5px] leading-5' : 'px-2.5 py-1 text-xs'} ${i === cursor ? 'ring-2 ring-amber-300' : ''} ${
                ligado ? 'border-rose-400 bg-rose-500/20 font-semibold text-rose-800 dark:text-rose-100' : 'border-base-border text-slate-300 hover:border-rose-300/60'
              }`}
            >
              {ligado ? '✓ ' : ''}
              {e.rotulo}
            </button>
          )
        })}
      </div>
      {fora.length > 0 && (!faixa || faixa[0] === 0) && (
        <p className="text-[11px] text-amber-200">
          {t('foraDoTipo')}{' '}
          {fora.map((v) => (
            <button key={v} type="button" onClick={() => alternar(v)} className="ml-1 underline">
              {v} ×
            </button>
          ))}
        </p>
      )}
    </div>
  )
}
