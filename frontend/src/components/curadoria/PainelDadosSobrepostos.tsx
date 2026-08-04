'use client'

import { KeyboardEvent, useState } from 'react'
import StatusBadge from '../StatusBadge'
import type { FormularioFicha } from './FichaCuradoriaForm'

// Constantes identicas as que existiam em FichaCuradoriaForm.tsx antes de
// serem movidas pra ca - ver comentario em PainelVisualizador.tsx sobre o
// motivo da mudanca (ocupar visualmente o espaco onde o OHIF mostra o
// painel "Studies", que o Radix nao consegue remover de dentro por ser
// iframe cross-origin).
const OPCOES_TIPO_RADIOGRAFIA = [
  { valor: 'periapical', label: 'Periapical' },
  { valor: 'panoramica', label: 'Panorâmica' },
  { valor: 'oclusal', label: 'Oclusal' },
  { valor: 'interproximal', label: 'Interproximal' },
]

const OPCOES_GENERO = [
  { valor: 'masculino', label: 'Masculino' },
  { valor: 'feminino', label: 'Feminino' },
]

// Dentes (notacao FDI): veio de FichaCuradoriaForm.tsx junto com o input e
// a validacao - pedido explicito pra aparecer aqui, logo abaixo de Sexo.
const DENTES_PERMANENTES = [
  ...Array.from({ length: 8 }, (_, i) => 11 + i),
  ...Array.from({ length: 8 }, (_, i) => 21 + i),
  ...Array.from({ length: 8 }, (_, i) => 31 + i),
  ...Array.from({ length: 8 }, (_, i) => 41 + i),
]

// Qualidade tecnica: veio de FichaCuradoriaForm.tsx - pedido explicito pra
// aparecer logo abaixo de Dentes. Valores reais do enum QualidadeTecnica
// no backend.
const OPCOES_QUALIDADE_TECNICA = [
  { valor: 'otima', label: 'Ótima' },
  { valor: 'boa', label: 'Boa' },
  { valor: 'regular', label: 'Regular' },
  { valor: 'insatisfatoria', label: 'Insatisfatória' },
]

// Tamanho de texto/controles alinhado ao pedido: todos os campos aqui do
// mesmo tamanho da palavra "Curadoria" / "Ficha de curadoria" (text-sm,
// 14px) - antes eram bem menores (text-[11px]/text-xs) por causa do
// espaco apertado, mas o pedido foi explicito pra aumentar a legibilidade
// mesmo custando mais altura (a caixa ja tem rolagem propria - ver
// overflow-y-auto no container abaixo - entao cabe do mesmo jeito).
const campoLabel = 'mb-1 block text-sm font-medium text-slate-300'
const campoInput =
  'w-full rounded-lg border border-base-border bg-base-surface2 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-brand'
const botaoOpcao =
  'rounded-full border px-3 py-1.5 text-sm transition-colors'

// Caixa sobreposta no canto superior esquerdo do visualizador OHIF (por
// cima da area onde o OHIF normalmente mostra o painel "Studies"). Reune
// os campos da ficha que precisam ficar sempre visiveis e acessiveis,
// inclusive no modo "ajustar a tela" (onde a ficha completa, mais abaixo
// na tela, fica escondida): status da ficha, anonimizacao (obrigatoria pra
// aprovar), tipo de radiografia (obrigatorio), dados do paciente (faixa
// etaria + sexo), dentes (notacao FDI) e qualidade tecnica. Fundo quase
// solido (bg-base-surface/95 + backdrop-blur) pra garantir leitura por
// cima da imagem de raio-X.
export default function PainelDadosSobrepostos({
  form,
  onChange,
  statusFicha,
}: {
  form: FormularioFicha
  onChange: (form: FormularioFicha) => void
  statusFicha: string
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

  return (
    <div className="flex h-full w-full flex-col gap-3 overflow-y-auto rounded-xl border border-base-border bg-base-surface/95 p-3 shadow-lg backdrop-blur-sm">
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-xs font-medium text-slate-400">Status</span>
          <StatusBadge status={statusFicha} />
        </div>
        {/* Anonimização validada: checkbox e texto maiores (h-5 w-5 e
            text-sm, antes h-3.5 w-3.5 e text-xs) - pedido explícito. */}
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={form.anonimizacao_validada}
            onChange={(e) => onChange({ ...form, anonimizacao_validada: e.target.checked })}
            className="h-5 w-5 rounded border-base-border bg-base-surface2 text-brand"
          />
          Anonimização validada <span className="text-status-danger">*</span>
        </label>
      </div>

      <div className="border-t border-base-border pt-2.5">
        <label className={campoLabel}>
          Tipo de radiografia <span className="text-status-danger">*</span>
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {OPCOES_TIPO_RADIOGRAFIA.map((opcao) => (
            <button
              key={opcao.valor}
              type="button"
              onClick={() => onChange({ ...form, tipo_radiografia: opcao.valor })}
              className={`${botaoOpcao} ${
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

      <div className="border-t border-base-border pt-2.5">
        <label className={campoLabel}>Faixa etária</label>
        <div className="grid grid-cols-2 gap-1.5">
          <input
            type="number"
            value={form.idade_min}
            onChange={(e) => onChange({ ...form, idade_min: e.target.value })}
            placeholder="mín."
            className={campoInput}
          />
          <input
            type="number"
            value={form.idade_max}
            onChange={(e) => onChange({ ...form, idade_max: e.target.value })}
            placeholder="máx."
            className={campoInput}
          />
        </div>
      </div>

      <div className="border-t border-base-border pt-2.5">
        <label className={campoLabel}>
          Sexo <span className="text-status-danger">*</span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {OPCOES_GENERO.map((opcao) => (
            <button
              key={opcao.valor}
              type="button"
              onClick={() => onChange({ ...form, genero: opcao.valor })}
              className={`${botaoOpcao} ${
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

      {/* Dentes (notação FDI): pedido explícito pra aparecer aqui, logo
          abaixo de Sexo (antes ficava na página 1 da ficha, dentro de
          "Região anatômica" - saiu de lá pra não duplicar o mesmo campo em
          dois lugares, seguindo o mesmo padrão já usado pros outros campos
          que vieram pra esta caixa). */}
      <div className="border-t border-base-border pt-2.5">
        <label className={campoLabel}>Dentes (notação FDI)</label>
        <div className="flex flex-wrap gap-1.5 rounded-lg border border-base-border bg-base-surface2 p-2">
          {form.dentes.map((numero) => (
            <span
              key={numero}
              className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 text-sm text-brand-300"
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

      {/* Qualidade tecnica: pedido explicito pra ficar logo abaixo de
          Dentes (antes ficava na ficha de baixo, dentro de "Região
          anatômica" - saiu de lá pra não duplicar o mesmo campo em dois
          lugares). */}
      <div className="border-t border-base-border pt-2.5">
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
    </div>
  )
}
