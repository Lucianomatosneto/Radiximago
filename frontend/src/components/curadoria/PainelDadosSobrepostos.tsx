'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import type { FormularioFicha } from './FichaCuradoriaForm'
import type { EtapaFicha } from '../../lib/secoesCuradoria'

// DADOS DA IMAGEM (secao 1 da ficha), um ITEM por vez no holofote: so o
// item em destaque (`etapa`) aparece aceso, com a sua PALAVRA-CHAVE de voz
// (🎤); os outros ficam quase apagados. Com o item em destaque basta falar
// o valor ("35" na Idade); a palavra-guia continua valendo em qualquer item:
//   anonimização: "ok" / "anonimizada"   tipo: "pan", "in", "pe", "o", "tomografia"
//   idade: "idade 35"                     gênero: "m" / "f" (ou masculino/feminino)
//   dentes: "dentes 36 e 37"              qualidade: "qualidade boa"
// Dentes sem a etapa de quadrante: odontograma unico (notacao FDI), um
// clique liga/desliga o dente.

const OPCOES_TIPO_RADIOGRAFIA = ['periapical', 'interproximal', 'oclusal', 'panoramica', 'tomografia']
const ATALHO_TIPO: Record<string, string> = { periapical: 'pe', interproximal: 'in', oclusal: 'o', panoramica: 'pan', tomografia: 'tomo' }
const OPCOES_GENERO = ['masculino', 'feminino']
const OPCOES_QUALIDADE_TECNICA = ['otima', 'boa', 'regular', 'insatisfatoria']
const ARCADA_SUPERIOR = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]
const ARCADA_INFERIOR = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]

const campoLabel = 'flex items-center gap-2 text-sm font-medium text-slate-300'
const campoInput =
  'w-full rounded-lg border border-teal-500/40 bg-teal-100/70 dark:bg-teal-600/20 px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand'
const botaoOpcao = 'rounded-full border px-3 py-1.5 text-sm transition-colors'

/** etiqueta da palavra-chave de voz de um campo */
export function PalavraChave({ texto, visivel }: { texto: string; visivel: boolean }) {
  if (!visivel) return null
  return (
    <span className="rounded-full border border-amber-300/60 bg-amber-300/15 px-2 py-px font-mono text-[11px] font-semibold text-amber-100">
      🎤 {texto}
    </span>
  )
}

/** Um item da secao "Dados": aceso quando esta no holofote, quase apagado
 * quando nao. Clicar nele leva o holofote para ele. */
function Item({
  etapa,
  ativa,
  apagado,
  onAtivar,
  children,
}: {
  etapa: EtapaFicha
  ativa: boolean
  /** outro item da secao esta no holofote */
  apagado: boolean
  onAtivar?: (etapa: EtapaFicha) => void
  children: ReactNode
}) {
  return (
    <div
      data-etapa={etapa}
      aria-current={ativa ? 'step' : undefined}
      onMouseDown={() => !ativa && onAtivar?.(etapa)}
      className={`scroll-my-6 rounded-xl px-2.5 py-2 transition-[opacity,box-shadow,background-color] duration-200 ${
        ativa
          ? 'relative z-10 bg-base-surface shadow-[0_0_0_2px_rgba(45,212,191,.85),0_0_32px_-4px_rgba(45,212,191,.6)]'
          : apagado
            ? 'opacity-[.18] saturate-0 hover:opacity-50'
            : ''
      }`}
    >
      {/* item apagado: o primeiro clique so acende (nao muda o valor) */}
      <div className={ativa || !onAtivar ? '' : 'pointer-events-none'}>{children}</div>
    </div>
  )
}

export default function PainelDadosSobrepostos({
  form,
  onChange,
  etapa,
  onEtapa,
}: {
  form: FormularioFicha
  onChange: (form: FormularioFicha) => void
  /** item no holofote (undefined = todos acesos, sem palavras-chave) */
  etapa?: EtapaFicha
  /** clique num item leva o holofote para ele */
  onEtapa?: (etapa: EtapaFicha) => void
  // compatibilidade com usos antigos (ignorados)
  statusFicha?: string
  palavrasChave?: boolean
  embutido?: boolean
  marcacaoAtiva?: boolean
  onAlternarMarcacao?: () => void
}) {
  const t = useTranslations('Curadoria.dadosSobrepostos')
  const tOpcoes = useTranslations('Pesquisa.opcoes')
  const pk = (e: EtapaFicha) => etapa === e

  function alternarDente(d: number) {
    const dentes = form.dentes.includes(d) ? form.dentes.filter((x) => x !== d) : [...form.dentes, d].sort((a, b) => a - b)
    onChange({ ...form, dentes })
  }

  const linhaDentes = (lista: number[]) => (
    <div className="grid grid-cols-[repeat(16,minmax(0,1fr))] gap-0.5">
      {lista.map((d, i) => {
        const marcado = form.dentes.includes(d)
        return (
          <button
            key={d}
            type="button"
            onClick={() => alternarDente(d)}
            aria-pressed={marcado}
            className={`rounded py-1 text-[11px] font-semibold transition-colors ${i === 8 ? 'ml-1' : ''} ${
              marcado ? 'bg-brand text-white' : 'bg-white/5 text-slate-300 hover:bg-white/15'
            }`}
          >
            {d}
          </button>
        )
      })}
    </div>
  )

  const item = (e: EtapaFicha, filhos: ReactNode) => (
    <Item etapa={e} ativa={!!etapa && etapa === e} apagado={!!etapa && etapa !== e} onAtivar={onEtapa}>
      {filhos}
    </Item>
  )

  return (
    <div className="flex w-full flex-col gap-1.5">
      {item(
        'anonimizacao',
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={form.anonimizacao_validada}
            onChange={(e) => onChange({ ...form, anonimizacao_validada: e.target.checked })}
            className="h-5 w-5 rounded border-base-border bg-base-surface2 text-brand"
          />
          {t('anonimizacaoValidada')} <span className="text-status-danger">*</span>
          <PalavraChave texto={t('chaveAnonimizacao')} visivel={pk('anonimizacao')} />
        </label>
      )}

      {item(
        'tipo',
        <>
          <p className={`${campoLabel} mb-1.5`}>
            {t('tipoRadiografia')} <span className="text-status-danger">*</span>
            <PalavraChave texto={t('chaveTipo')} visivel={pk('tipo')} />
          </p>
          <div className="flex flex-wrap gap-1.5">
            {OPCOES_TIPO_RADIOGRAFIA.map((valor) => (
              <button
                key={valor}
                type="button"
                onClick={() => onChange({ ...form, tipo_radiografia: valor })}
                className={`${botaoOpcao} ${
                  form.tipo_radiografia === valor ? 'border-brand bg-brand text-white' : 'border-base-border text-slate-300 hover:border-brand/50'
                }`}
              >
                {tOpcoes(`tipoRadiografia.${valor}`)}
                {pk('tipo') && <span className="ml-1.5 font-mono text-[10px] opacity-70">“{ATALHO_TIPO[valor]}”</span>}
              </button>
            ))}
          </div>
        </>
      )}

      {item(
        'idade',
        <>
          <p className={`${campoLabel} mb-1.5`}>
            {t('idade')}
            <PalavraChave texto={t('chaveIdade')} visivel={pk('idade')} />
          </p>
          {/* caixa unica: a idade vale como idade exata (min = max) */}
          <input
            type="number"
            min={0}
            max={120}
            value={form.idade_min}
            onChange={(e) => onChange({ ...form, idade_min: e.target.value, idade_max: e.target.value })}
            aria-label={t('idade')}
            className={`${campoInput} max-w-[8rem]`}
          />
        </>
      )}

      {item(
        'genero',
        <>
          <p className={`${campoLabel} mb-1.5`}>
            {t('sexo')} <span className="text-status-danger">*</span>
            <PalavraChave texto={t('chaveSexo')} visivel={pk('genero')} />
          </p>
          <div className="flex flex-wrap gap-1.5">
            {OPCOES_GENERO.map((valor) => (
              <button
                key={valor}
                type="button"
                onClick={() => onChange({ ...form, genero: valor })}
                className={`${botaoOpcao} ${form.genero === valor ? 'border-brand bg-brand text-white' : 'border-base-border text-slate-300 hover:border-brand/50'}`}
              >
                {tOpcoes(`genero.${valor}`)}
                {pk('genero') && <span className="ml-1.5 font-mono text-[10px] opacity-70">“{valor === 'masculino' ? 'm' : 'f'}”</span>}
              </button>
            ))}
          </div>
        </>
      )}

      {item(
        'dentes',
        <>
          <p className={`${campoLabel} mb-1.5`}>
            {t('dentes')}
            <PalavraChave texto={t('chaveDentes')} visivel={pk('dentes')} />
            {form.dentes.length > 0 && <span className="ml-auto text-xs text-teal-200">{form.dentes.join(', ')}</span>}
          </p>
          <div className="space-y-1 rounded-lg border border-teal-500/30 bg-teal-600/10 p-1.5">
            {linhaDentes(ARCADA_SUPERIOR)}
            <div className="border-t border-white/10" />
            {linhaDentes(ARCADA_INFERIOR)}
          </div>
        </>
      )}

      {item(
        'qualidade',
        <>
          <p className={`${campoLabel} mb-1.5`}>
            {t('qualidadeTecnica')}
            <PalavraChave texto={t('chaveQualidade')} visivel={pk('qualidade')} />
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {OPCOES_QUALIDADE_TECNICA.map((valor) => (
              <button
                key={valor}
                type="button"
                onClick={() => onChange({ ...form, qualidade_tecnica: valor })}
                className={`${botaoOpcao} px-1 ${
                  form.qualidade_tecnica === valor ? 'border-brand bg-brand text-white' : 'border-base-border text-slate-300 hover:border-brand/50'
                }`}
              >
                {tOpcoes(`qualidadeTecnica.${valor}`)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
