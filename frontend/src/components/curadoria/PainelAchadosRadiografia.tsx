'use client'

import { useState } from 'react'
import { CATEGORIAS_ALTERACOES } from '../../lib/alteracoesObservadas'
import type { FormularioFicha } from './FichaCuradoriaForm'

const campoLabel = 'mb-1 block text-xs font-medium text-slate-400'
const campoInput =
  'w-full rounded-lg border border-base-border bg-base-surface2 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-brand'

// ListaItens e GrupoAlteracoes vieram de FichaCuradoriaForm.tsx sem
// mudanca de logica - so o layout ao redor mudou (ver comentario no
// export default abaixo). Categorias com mais de 4 itens continuam
// quebrando em 2 colunas lado a lado (regra generica, nao amarrada a uma
// categoria especifica - ver comentario original que ainda vale).
function ListaItens({
  itens,
  selecionadas,
  onAlternar,
}: {
  itens: { valor: string; label: string }[]
  selecionadas: string[]
  onAlternar: (valor: string) => void
}) {
  return (
    <div className="flex flex-1 flex-col">
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
  )
}

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
  const [aberto, setAberto] = useState(true)
  const marcadas = itens.filter((item) => selecionadas.includes(item.valor)).length
  const metade = Math.ceil(itens.length / 2)
  const primeiraMetade = itens.slice(0, metade)
  const segundaMetade = itens.slice(metade)
  const quebrarEm2Colunas = itens.length > 4

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
      {aberto &&
        (quebrarEm2Colunas ? (
          <div className="flex divide-x divide-base-border border-t border-base-border">
            <ListaItens itens={primeiraMetade} selecionadas={selecionadas} onAlternar={onAlternar} />
            <ListaItens itens={segundaMetade} selecionadas={selecionadas} onAlternar={onAlternar} />
          </div>
        ) : (
          <div className="border-t border-base-border">
            <ListaItens itens={itens} selecionadas={selecionadas} onAlternar={onAlternar} />
          </div>
        ))}
    </div>
  )
}

// Achados em radiografia: antes era a pagina 2 da ficha de baixo (faixa
// curta, 20% da altura) - agora ocupa o lugar do painel "Imagem para
// marcacao", ao lado do OHIF (ver curadoria/page.tsx e o comentario sobre
// "painelLateral" la dentro). Motivo do pedido: o curador ja marcou a
// lesao na pagina anterior, entao esse espaco pode virar achados, que
// ganham a altura toda do visualizador em vez de ficarem espremidos
// embaixo. Layout mudou de "lado a lado" (checklist + outros achados em
// colunas) para EMPILHADO (checklist em cima, outros achados embaixo) -
// esse painel agora e estreito e alto (cerca de 1/3 da largura da area de
// trabalho, mas quase toda a altura), o oposto do formato anterior.
export default function PainelAchadosRadiografia({
  form,
  onChange,
}: {
  form: FormularioFicha
  onChange: (form: FormularioFicha) => void
}) {
  function alternarAlteracao(valor: string) {
    onChange({
      ...form,
      alteracoes_observadas: form.alteracoes_observadas.includes(valor)
        ? form.alteracoes_observadas.filter((v) => v !== valor)
        : [...form.alteracoes_observadas, valor],
    })
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto">
      <div>
        <label className={campoLabel}>
          Alterações observadas
          {form.alteracoes_observadas.length > 0 && (
            <span className="ml-1 text-brand-300">({form.alteracoes_observadas.length})</span>
          )}
        </label>
        <div className="grid grid-cols-1 gap-1.5">
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

      {/* "Outros": nao vira um valor novo na lista (o backend valida
          alteracoes_observadas contra um Enum fixo - inventar um valor
          tipo "outros" quebraria o salvamento). Em vez disso, reaproveita
          o campo de texto livre que ja existia ("Achados detalhados")
          como o lugar de escrever um achado que nao esta entre as opcoes
          acima. */}
      <div>
        <label className={campoLabel}>Outros achados (não estão na lista acima)</label>
        <textarea
          value={form.achados_detalhe}
          onChange={(e) => onChange({ ...form, achados_detalhe: e.target.value })}
          rows={4}
          className={campoInput}
          placeholder="Descreva aqui qualquer achado que não esteja nas opções acima"
        />
      </div>
    </div>
  )
}
