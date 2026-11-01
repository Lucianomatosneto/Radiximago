'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import BuscaTermos from '../pesquisa/BuscaTermos'
import { itensDoVocabulario, normalizarBusca, type TermoBusca, type TermoVocabularioApi } from '../../lib/catalogoTermos'

/**
 * TERMOS PADRONIZADOS na Curadoria (26/10/2026): o curador liga a ficha a
 * termos do vocabulario odontologico (ex.: "Nódulo pulpar", "Lesão de
 * furca") com a mesma caixa de sugestoes da Pesquisa avancada - assim o
 * que ele marca aqui e exatamente o que a busca encontra.
 * Termo que nao existe (27/10/2026): "Acrescentar '...' ao vocabulario" cria
 * o termo (POST /vocabulario/termos, registrado na auditoria) e ja o liga a
 * ficha; a Pesquisa avancada passa a oferece-lo na hora (ela le o mesmo
 * vocabulario).
 */
/**
 * 01/11/2026 - INCENTIVO ao vocabulario: a partir do texto da ficha
 * (descricao didatica + nomes dos achados marcados) sugerimos, com um
 * clique, os termos do vocabulario cujo nome ou sinonimo aparece nele.
 * Sem nenhum termo ligado, um aviso lembra que sao eles que fazem a imagem
 * aparecer na busca por termos.
 */
export function sugerirTermos(vocabulario: TermoVocabularioApi[], texto: string, jaLigados: number[], limite = 8): TermoVocabularioApi[] {
  const alvo = ` ${normalizarBusca(texto).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ')} `
  if (alvo.trim().length < 3) return []
  return vocabulario
    .filter((v) => !jaLigados.includes(v.id))
    .filter((v) =>
      [v.termo, ...(v.sinonimos ?? []).map((x) => x.sinonimo)].some((nome) => {
        const n = normalizarBusca(nome).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
        return n.length >= 4 && alvo.includes(` ${n} `)
      }),
    )
    .slice(0, limite)
}

export default function SeletorTermosFicha({
  termos,
  onChange,
  textoFicha = '',
}: {
  termos: number[]
  onChange: (ids: number[]) => void
  /** texto da ficha (descricao + rotulos dos achados) para sugerir termos */
  textoFicha?: string
}) {
  const t = useTranslations('BuscaTermos')
  const [vocabulario, setVocabulario] = useState<TermoVocabularioApi[]>([])

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/vocabulario`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((dados) => dados?.termos && setVocabulario(dados.termos))
      .catch(() => {
        // sem o vocabulario a caixa so fica sem sugestoes
      })
  }, [])

  async function criarTermo(texto: string): Promise<TermoBusca | string> {
    try {
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/vocabulario/termos`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ termo: texto.trim().slice(0, 150), categoria: 'achado' }),
      })
      const dados = await r.json().catch(() => null)
      if (!r.ok) return typeof dados?.detail === 'string' ? dados.detail : t('erroCriar')
      setVocabulario((lista) => [...lista, dados as TermoVocabularioApi])
      return { tipo: 'vocab', valor: String(dados.id), rotulo: dados.termo }
    } catch {
      return t('erroCriar')
    }
  }

  const catalogo = useMemo(() => itensDoVocabulario(vocabulario, (lista) => t('sinonimos', { lista })), [vocabulario, t])
  const selecionados: TermoBusca[] = termos.map((id) => ({
    tipo: 'vocab',
    valor: String(id),
    rotulo: vocabulario.find((v) => v.id === id)?.termo ?? `#${id}`,
  }))

  const sugeridos = useMemo(() => sugerirTermos(vocabulario, textoFicha, termos), [vocabulario, textoFicha, termos])

  return (
    <div className="mt-3">
      {termos.length === 0 && (
        <p className="mb-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200" role="note">
          {t('incentivoVocabulario')}
        </p>
      )}
      {sugeridos.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5" aria-label={t('sugeridosTitulo')}>
          <span className="text-xs text-slate-500">{t('sugeridosTitulo')}</span>
          {sugeridos.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => onChange([...termos, v.id])}
              className="rounded-full border border-brand/50 bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-ink hover:bg-brand/20"
            >
              + {v.termo}
            </button>
          ))}
        </div>
      )}
      <BuscaTermos
        catalogo={catalogo}
        selecionados={selecionados}
        onChange={(lista) => onChange(lista.filter((x) => x.tipo === 'vocab').map((x) => Number(x.valor)))}
        onCriar={criarTermo}
        rotuloCampo={t('rotuloFicha')}
        placeholder={t('placeholderFicha')}
      />
    </div>
  )
}
