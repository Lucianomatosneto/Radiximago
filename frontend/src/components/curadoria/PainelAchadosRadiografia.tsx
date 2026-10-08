'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { CATEGORIAS_ALTERACOES } from '../../lib/alteracoesObservadas'
import type { FormularioFicha } from './FichaCuradoriaForm'

const campoLabel = 'mb-0.5 block text-xs font-medium text-slate-400'
// Mesma cor de FichaCuradoriaForm.tsx (ver comentario completo la),
// aplicada em todas as caixas de texto desta tela (pedido explicito).
// COR SOLIDA (nao degrade) - motivo no comentario acima.
const campoInput =
  'w-full rounded-lg border border-teal-500/40 bg-teal-100/70 dark:bg-teal-600/20 px-2.5 py-1 text-sm text-ink outline-none focus:border-brand'

// ListaItens e GrupoAlteracoes vieram de FichaCuradoriaForm.tsx sem
// mudanca de logica - so o layout ao redor mudou (ver comentario no
// export default abaixo). Categorias com mais de 4 itens continuam
// quebrando em 2 colunas lado a lado (regra generica, nao amarrada a uma
// categoria especifica - ver comentario original que ainda vale).
function ListaItens({
  itens,
  selecionadas,
  onAlternar,
  traduzirItem,
}: {
  itens: { valor: string; label: string }[]
  selecionadas: string[]
  onAlternar: (valor: string) => void
  traduzirItem: (valor: string) => string
}) {
  return (
    <div className="flex flex-1 flex-col">
      {itens.map((item) => (
        <label
          key={item.valor}
          className="flex items-center gap-1.5 px-2.5 py-1 text-[13px] leading-tight text-slate-300 hover:bg-white/5"
        >
          <input
            type="checkbox"
            checked={selecionadas.includes(item.valor)}
            onChange={() => onAlternar(item.valor)}
            className="h-3 w-3 flex-none rounded border-base-border bg-base-surface2 text-brand"
          />
          {traduzirItem(item.valor)}
        </label>
      ))}
    </div>
  )
}

function GrupoAlteracoes({
  categoriaTraduzida,
  itens,
  selecionadas,
  onAlternar,
  traduzirItem,
}: {
  categoriaTraduzida: string
  itens: { valor: string; label: string }[]
  selecionadas: string[]
  onAlternar: (valor: string) => void
  traduzirItem: (valor: string) => string
}) {
  // Comeca ABERTO - pedido explicito pra ver todas as opcoes de cada
  // categoria (Carie, Periodontal, Periapical etc.) direto, sem precisar
  // clicar em cada uma pra abrir. Chegou a comecar fechado numa correcao
  // anterior (pra evitar rolagem), mas o pedido posterior foi claro:
  // melhor ver tudo aberto mesmo que role, do que precisar abrir pasta
  // por pasta. O botao de recolher continua funcionando normalmente pra
  // quem quiser fechar uma categoria especifica.
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
        className="flex w-full items-center justify-between bg-base-surface2 px-2.5 py-1.5 text-left text-[13px] text-slate-300 hover:bg-white/5"
      >
        <span>
          {categoriaTraduzida}
          {marcadas > 0 && <span className="ml-1.5 text-brand-300">({marcadas})</span>}
        </span>
        <span className="text-xs text-slate-500">{aberto ? '▲' : '▼'}</span>
      </button>
      {aberto &&
        (quebrarEm2Colunas ? (
          <div className="flex divide-x divide-base-border border-t border-base-border">
            <ListaItens itens={primeiraMetade} selecionadas={selecionadas} onAlternar={onAlternar} traduzirItem={traduzirItem} />
            <ListaItens itens={segundaMetade} selecionadas={selecionadas} onAlternar={onAlternar} traduzirItem={traduzirItem} />
          </div>
        ) : (
          <div className="border-t border-base-border">
            <ListaItens itens={itens} selecionadas={selecionadas} onAlternar={onAlternar} traduzirItem={traduzirItem} />
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
//
// Dividido em 2 PAGINAS (prop `pagina`) - as 5 categorias (26 checkboxes
// no total) mais o campo de texto livre nao cabiam sem rolagem interna
// nesse painel estreito; a rolagem escondia as ultimas categorias/campo
// "Outros achados" fora da vista, por pedido explicito isso foi trocado
// por uma 2a pagina no MESMO carrossel de setas que ja existia (marcacao
// <-> achados) - ver curadoria/page.tsx. Divisao das 5 categorias em 2+3:
// pagina 1 = Carie/Periodontal/Periapical (14 itens), pagina 2 =
// Restaurador/Osseo (12 itens) + o campo "Outros achados" - divisao por
// contagem de itens (26 no total), nao por numero de categorias, pra
// ficar proximo de metade do conteudo em cada pagina.
const CATEGORIAS_PAGINA_1 = CATEGORIAS_ALTERACOES.slice(0, 3)
const CATEGORIAS_PAGINA_2 = CATEGORIAS_ALTERACOES.slice(3)

export default function PainelAchadosRadiografia({
  form,
  onChange,
  pagina,
}: {
  form: FormularioFicha
  onChange: (form: FormularioFicha) => void
  pagina: 1 | 2
}) {
  const t = useTranslations('Curadoria.achados')
  const tCategorias = useTranslations('AlteracoesObservadas.categorias')
  const tItens = useTranslations('AlteracoesObservadas.itens')

  function alternarAlteracao(valor: string) {
    onChange({
      ...form,
      alteracoes_observadas: form.alteracoes_observadas.includes(valor)
        ? form.alteracoes_observadas.filter((v) => v !== valor)
        : [...form.alteracoes_observadas, valor],
    })
  }

  function traduzirItem(valor: string): string {
    try {
      return tItens(valor)
    } catch {
      return valor
    }
  }

  const categorias = pagina === 1 ? CATEGORIAS_PAGINA_1 : CATEGORIAS_PAGINA_2

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto">
      <div>
        {/* Rotulo + contagem so aparece na pagina 1 - contagem e do total
            geral (nao so da pagina), pra continuar refletindo quantas
            alteracoes estao marcadas no total, mesmo as da pagina 2. */}
        {pagina === 1 && (
          <label className={campoLabel}>
            {t('alteracoesObservadas')}
            {form.alteracoes_observadas.length > 0 && (
              <span className="ml-1 text-brand-300">({form.alteracoes_observadas.length})</span>
            )}
          </label>
        )}
        <div className="grid grid-cols-1 gap-1">
          {categorias.map((grupo) => (
            <GrupoAlteracoes
              key={grupo.categoria}
              categoriaTraduzida={tCategorias(grupo.categoriaChave)}
              itens={grupo.itens}
              selecionadas={form.alteracoes_observadas}
              onAlternar={alternarAlteracao}
              traduzirItem={traduzirItem}
            />
          ))}
        </div>
      </div>

      {/* "Outros": nao vira um valor novo na lista (o backend valida
          alteracoes_observadas contra um Enum fixo - inventar um valor
          tipo "outros" quebraria o salvamento). Em vez disso, reaproveita
          o campo de texto livre que ja existia ("Achados detalhados")
          como o lugar de escrever um achado que nao esta entre as opcoes
          acima. So na pagina 2, junto com as ultimas categorias. */}
      {pagina === 2 && (
        <div>
          <label className={campoLabel}>{t('outrosAchados')}</label>
          <textarea
            value={form.achados_detalhe}
            onChange={(e) => onChange({ ...form, achados_detalhe: e.target.value })}
            rows={3}
            className={campoInput}
            placeholder={t('placeholderOutros')}
          />
        </div>
      )}
    </div>
  )
}
