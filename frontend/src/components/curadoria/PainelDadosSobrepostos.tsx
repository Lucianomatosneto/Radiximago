'use client'

import { useTranslations } from 'next-intl'
import StatusBadge from '../StatusBadge'
import type { FormularioFicha } from './FichaCuradoriaForm'

// DADOS DA IMAGEM (secao 1 da ficha). Cada campo mostra a sua PALAVRA-CHAVE
// de voz (🎤) quando a secao esta em destaque - o curador fala a palavra e
// o valor, e o sistema sabe exatamente qual campo preencher:
//   anonimização: "ok" / "anonimizada"   tipo: "pan", "in", "pe", "o", "tomografia"
//   idade: "idade 35"                     sexo: "m" / "f" (ou masculino/feminino)
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

export default function PainelDadosSobrepostos({
  form,
  onChange,
  statusFicha,
  palavrasChave = false,
}: {
  form: FormularioFicha
  onChange: (form: FormularioFicha) => void
  statusFicha: string
  /** mostra as palavras-chave de voz (secao em destaque) */
  palavrasChave?: boolean
  // compatibilidade com usos antigos (ignorados)
  embutido?: boolean
  marcacaoAtiva?: boolean
  onAlternarMarcacao?: () => void
}) {
  const t = useTranslations('Curadoria.dadosSobrepostos')
  const tOpcoes = useTranslations('Pesquisa.opcoes')
  const pk = palavrasChave

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

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-slate-400">{t('status')}</span>
        <StatusBadge status={statusFicha} />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={form.anonimizacao_validada}
          onChange={(e) => onChange({ ...form, anonimizacao_validada: e.target.checked })}
          className="h-5 w-5 rounded border-base-border bg-base-surface2 text-brand"
        />
        {t('anonimizacaoValidada')} <span className="text-status-danger">*</span>
        <PalavraChave texto={t('chaveAnonimizacao')} visivel={pk} />
      </label>

      <div className="border-t border-base-border pt-2.5">
        <p className={`${campoLabel} mb-1.5`}>
          {t('tipoRadiografia')} <span className="text-status-danger">*</span>
          <PalavraChave texto={t('chaveTipo')} visivel={pk} />
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
              {pk && <span className="ml-1.5 font-mono text-[10px] opacity-70">“{ATALHO_TIPO[valor]}”</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 border-t border-base-border pt-2.5 sm:grid-cols-2">
        <div>
          <p className={`${campoLabel} mb-1.5`}>
            {t('idade')}
            <PalavraChave texto={t('chaveIdade')} visivel={pk} />
          </p>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              max={120}
              value={form.idade_min}
              onChange={(e) => {
                const v = e.target.value
                // um valor so = idade exata (min = max); "até" vira faixa
                onChange({ ...form, idade_min: v, idade_max: form.idade_max === '' || form.idade_max === form.idade_min ? v : form.idade_max })
              }}
              placeholder={t('anos')}
              className={campoInput}
            />
            <span className="text-xs text-slate-500">{t('ate')}</span>
            <input
              type="number"
              min={0}
              max={120}
              value={form.idade_max === form.idade_min ? '' : form.idade_max}
              onChange={(e) => onChange({ ...form, idade_max: e.target.value || form.idade_min })}
              placeholder={t('opcional')}
              className={campoInput}
            />
          </div>
        </div>
        <div>
          <p className={`${campoLabel} mb-1.5`}>
            {t('sexo')} <span className="text-status-danger">*</span>
            <PalavraChave texto={t('chaveSexo')} visivel={pk} />
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
                {pk && <span className="ml-1.5 font-mono text-[10px] opacity-70">“{valor === 'masculino' ? 'm' : 'f'}”</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-base-border pt-2.5">
        <p className={`${campoLabel} mb-1.5`}>
          {t('dentes')}
          <PalavraChave texto={t('chaveDentes')} visivel={pk} />
          {form.dentes.length > 0 && <span className="ml-auto text-xs text-teal-200">{form.dentes.join(', ')}</span>}
        </p>
        <div className="space-y-1 rounded-lg border border-teal-500/30 bg-teal-600/10 p-1.5">
          {linhaDentes(ARCADA_SUPERIOR)}
          <div className="border-t border-white/10" />
          {linhaDentes(ARCADA_INFERIOR)}
        </div>
      </div>

      <div className="border-t border-base-border pt-2.5">
        <p className={`${campoLabel} mb-1.5`}>
          {t('qualidadeTecnica')}
          <PalavraChave texto={t('chaveQualidade')} visivel={pk} />
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
      </div>
    </div>
  )
}
