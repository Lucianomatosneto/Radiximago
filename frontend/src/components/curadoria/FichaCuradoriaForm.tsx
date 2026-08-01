'use client'

import { KeyboardEvent, useState } from 'react'
import StatusBadge from '../StatusBadge'
import MarcadorAchado from './MarcadorAchado'
import type { Marcacao } from '../../lib/marcacoes'
import { CATEGORIAS_ALTERACOES } from '../../lib/alteracoesObservadas'

const DENTES_PERMANENTES = [
  ...Array.from({ length: 8 }, (_, i) => 11 + i),
  ...Array.from({ length: 8 }, (_, i) => 21 + i),
  ...Array.from({ length: 8 }, (_, i) => 31 + i),
  ...Array.from({ length: 8 }, (_, i) => 41 + i),
]

const OPCOES_TIPO_RADIOGRAFIA = [
  { valor: 'periapical', label: 'Periapical' },
  { valor: 'panoramica', label: 'Panorâmica' },
  { valor: 'interproximal', label: 'Interproximal' },
  { valor: 'oclusal', label: 'Oclusal' },
]

const OPCOES_GENERO = [
  { valor: 'masculino', label: 'Masculino' },
  { valor: 'feminino', label: 'Feminino' },
]

// Valores reais do enum QualidadeTecnica no backend.
const OPCOES_QUALIDADE_TECNICA = [
  { valor: 'otima', label: 'Ótima' },
  { valor: 'boa', label: 'Boa' },
  { valor: 'regular', label: 'Regular' },
  { valor: 'insatisfatoria', label: 'Insatisfatória' },
]

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

const campoLabel = 'mb-1.5 block text-xs font-medium text-slate-400'
const campoInput =
  'w-full rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand'

function Secao({
  titulo,
  obrigatoria,
  children,
}: {
  titulo: string
  obrigatoria?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="mb-3 flex items-center gap-1.5 border-b border-base-border pb-2 text-sm font-semibold uppercase tracking-wide text-ink">
        {titulo}
        {obrigatoria && (
          <span className="text-status-danger" title="Contém campos usados na aprovação">
            *
          </span>
        )}
      </p>
      <div className="space-y-3.5">{children}</div>
    </div>
  )
}

// Uma categoria de "Alterações observadas" (Cárie, Periodontal, etc.) -
// fica recolhida por padrão, mostrando so o nome e quantas opcoes de
// dentro estao marcadas; clicar expande e mostra a lista de opcoes, uma
// embaixo da outra (compacta - sem grade de 2 colunas).
function GrupoAlteracoes({
  categoria,
  itens,
  selecionadas,
  onAlternar,
}: {
  categoria: string
  itens: { valor: string; label: string }[]
  selecionadas: string[]
  onAlternar: (valor: string) => void
}) {
  const [aberto, setAberto] = useState(false)
  const marcadas = itens.filter((item) => selecionadas.includes(item.valor)).length

  return (
    <div className="overflow-hidden rounded-lg border border-base-border">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center justify-between bg-base-surface2 px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/5"
      >
        <span>
          {categoria}
          {marcadas > 0 && <span className="ml-1.5 text-brand-300">({marcadas})</span>}
        </span>
        <span className="text-xs text-slate-500">{aberto ? '▲' : '▼'}</span>
      </button>
      {aberto && (
        <div className="flex flex-col border-t border-base-border">
          {itens.map((item) => (
            <label
              key={item.valor}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5"
            >
              <input
                type="checkbox"
                checked={selecionadas.includes(item.valor)}
                onChange={() => onAlternar(item.valor)}
                className="h-3.5 w-3.5 flex-none rounded border-base-border bg-base-surface2 text-brand"
              />
              {item.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// Painel direito: ficha de curadoria, reorganizada em grupos
// (Identificação, Região Anatômica, Diagnóstico, Qualidade, Descrição,
// Administração). Achado principal, grau de dificuldade e finalidade
// deixaram de existir aqui - o que qualifica a imagem agora e a lista de
// alterações observadas.
export default function FichaCuradoriaForm({
  form,
  onChange,
  statusFicha,
  erro,
  rascunhoSalvo,
  orthancReferenceId,
}: {
  form: FormularioFicha
  onChange: (form: FormularioFicha) => void
  statusFicha: string
  erro: string
  rascunhoSalvo: boolean
  orthancReferenceId: number
}) {
  const [denteInput, setDenteInput] = useState('')
  const [erroDente, setErroDente] = useState('')

  function adicionarDente(event?: KeyboardEvent<HTMLInputElement>) {
    if (event) event.preventDefault()
    const numero = Number(denteInput)
    if (!DENTES_PERMANENTES.includes(numero)) {
      setErroDente('Use um número FDI válido (11-18, 21-28, 31-38, 41-48).')
      return
    }
    setErroDente('')
    setDenteInput('')
    if (form.dentes.includes(numero)) return
    onChange({ ...form, dentes: [...form.dentes, numero].sort((a, b) => a - b) })
  }

  function removerDente(numero: number) {
    onChange({ ...form, dentes: form.dentes.filter((d) => d !== numero) })
  }

  function alternarAlteracao(valor: string) {
    onChange({
      ...form,
      alteracoes_observadas: form.alteracoes_observadas.includes(valor)
        ? form.alteracoes_observadas.filter((v) => v !== valor)
        : [...form.alteracoes_observadas, valor],
    })
  }

  return (
    <section className="max-h-[70vh] overflow-y-auto rounded-2xl border border-base-border bg-base-surface p-5">
      <h2 className="mb-5 text-base font-bold text-ink">Ficha de curadoria</h2>

      <div className="space-y-7">
        <Secao titulo="Identificação" obrigatoria>
          <div>
            <label className={campoLabel}>
              Tipo de radiografia <span className="text-status-danger">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {OPCOES_TIPO_RADIOGRAFIA.map((opcao) => (
                <button
                  key={opcao.valor}
                  type="button"
                  onClick={() => onChange({ ...form, tipo_radiografia: opcao.valor })}
                  className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                    form.tipo_radiografia === opcao.valor
                      ? 'border-brand bg-brand text-white'
                      : 'border-base-border text-slate-300 hover:border-brand/50'
                  }`}
                >
                  {opcao.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={campoLabel}>Faixa etária mín.</label>
              <input
                type="number"
                value={form.idade_min}
                onChange={(e) => onChange({ ...form, idade_min: e.target.value })}
                className={campoInput}
              />
            </div>
            <div>
              <label className={campoLabel}>Faixa etária máx.</label>
              <input
                type="number"
                value={form.idade_max}
                onChange={(e) => onChange({ ...form, idade_max: e.target.value })}
                className={campoInput}
              />
            </div>
          </div>

          <div>
            <label className={campoLabel}>Sexo (opcional)</label>
            <div className="flex flex-wrap gap-2">
              {[{ valor: '', label: 'Não informado' }, ...OPCOES_GENERO].map((opcao) => (
                <button
                  key={opcao.valor || 'nao-informado'}
                  type="button"
                  onClick={() => onChange({ ...form, genero: opcao.valor })}
                  className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                    form.genero === opcao.valor
                      ? 'border-brand bg-brand text-white'
                      : 'border-base-border text-slate-300 hover:border-brand/50'
                  }`}
                >
                  {opcao.label}
                </button>
              ))}
            </div>
          </div>
        </Secao>

        <Secao titulo="Região anatômica">
          <div>
            <label className={campoLabel}>Dentes (notação FDI)</label>
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-base-border bg-base-surface2 p-2">
              {form.dentes.map((numero) => (
                <span
                  key={numero}
                  className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 text-xs text-brand-300"
                >
                  {numero}
                  <button
                    type="button"
                    onClick={() => removerDente(numero)}
                    aria-label={`Remover dente ${numero}`}
                    className="text-brand-300 hover:text-brand-hover"
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={denteInput}
                onChange={(e) => setDenteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') adicionarDente(e)
                }}
                placeholder="ex: 16"
                className="w-16 flex-1 bg-transparent text-sm text-slate-100 outline-none"
              />
            </div>
            {erroDente && <p className="mt-1 text-xs text-red-400">{erroDente}</p>}
          </div>
        </Secao>

        <Secao titulo="Diagnóstico">
          <div>
            <label className={campoLabel}>Localização das lesões na imagem</label>
            <MarcadorAchado
              orthancReferenceId={orthancReferenceId}
              marcacoes={form.marcacoes}
              onMarcar={(marcacoes) => onChange({ ...form, marcacoes })}
            />
          </div>

          <div>
            <label className={campoLabel}>
              Alterações observadas
              {form.alteracoes_observadas.length > 0 && (
                <span className="ml-1 text-brand-300">({form.alteracoes_observadas.length})</span>
              )}
            </label>
            <div className="flex flex-col gap-1.5">
              {CATEGORIAS_ALTERACOES.map((grupo) => (
                <GrupoAlteracoes
                  key={grupo.categoria}
                  categoria={grupo.categoria}
                  itens={grupo.itens}
                  selecionadas={form.alteracoes_observadas}
                  onAlternar={alternarAlteracao}
                />
              ))}
            </div>
          </div>

          <div>
            <label className={campoLabel}>Achados detalhados</label>
            <textarea
              value={form.achados_detalhe}
              onChange={(e) => onChange({ ...form, achados_detalhe: e.target.value })}
              rows={3}
              className={campoInput}
            />
          </div>
        </Secao>

        <Secao titulo="Qualidade">
          <div>
            <label className={campoLabel}>Qualidade técnica</label>
            <select
              value={form.qualidade_tecnica}
              onChange={(e) => onChange({ ...form, qualidade_tecnica: e.target.value })}
              className={campoInput}
            >
              <option value="">Selecione</option>
              {OPCOES_QUALIDADE_TECNICA.map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>
                  {opcao.label}
                </option>
              ))}
            </select>
          </div>
        </Secao>

        <Secao titulo="Descrição">
          <div>
            <label className={campoLabel}>Descrição didática</label>
            <textarea
              value={form.descricao_didatica}
              onChange={(e) => onChange({ ...form, descricao_didatica: e.target.value })}
              rows={3}
              className={campoInput}
            />
          </div>
        </Secao>

        <Secao titulo="Administração" obrigatoria>
          <div>
            <label className={campoLabel}>Observações internas</label>
            <textarea
              value={form.observacoes_internas}
              onChange={(e) => onChange({ ...form, observacoes_internas: e.target.value })}
              rows={3}
              className={campoInput}
            />
          </div>

          <div>
            <label className={campoLabel}>Status atual</label>
            <StatusBadge status={statusFicha} />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.anonimizacao_validada}
              onChange={(e) => onChange({ ...form, anonimizacao_validada: e.target.checked })}
              className="h-4 w-4 rounded border-base-border bg-base-surface2 text-brand"
            />
            Anonimização validada por mim <span className="text-status-danger">*</span>
          </label>
        </Secao>

        {erro && (
          <p className="text-sm text-red-400" role="alert">
            {erro}
          </p>
        )}
        {rascunhoSalvo && <p className="text-sm text-emerald-400">Rascunho salvo.</p>}
      </div>
    </section>
  )
}
