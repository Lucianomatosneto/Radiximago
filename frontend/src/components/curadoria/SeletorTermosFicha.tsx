'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import BuscaTermos from '../pesquisa/BuscaTermos'
import { itensDoVocabulario, type TermoBusca, type TermoVocabularioApi } from '../../lib/catalogoTermos'

/**
 * TERMOS PADRONIZADOS na Curadoria (26/10/2026): o curador liga a ficha a
 * termos do vocabulario odontologico (ex.: "Nódulo pulpar", "Lesão de
 * furca") com a mesma caixa de sugestoes da Pesquisa avancada - assim o
 * que ele marca aqui e exatamente o que a busca encontra.
 */
export default function SeletorTermosFicha({ termos, onChange }: { termos: number[]; onChange: (ids: number[]) => void }) {
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

  const catalogo = useMemo(() => itensDoVocabulario(vocabulario, (lista) => t('sinonimos', { lista })), [vocabulario, t])
  const selecionados: TermoBusca[] = termos.map((id) => ({
    tipo: 'vocab',
    valor: String(id),
    rotulo: vocabulario.find((v) => v.id === id)?.termo ?? `#${id}`,
  }))

  return (
    <div className="mt-3">
      <BuscaTermos
        catalogo={catalogo}
        selecionados={selecionados}
        onChange={(lista) => onChange(lista.filter((x) => x.tipo === 'vocab').map((x) => Number(x.valor)))}
        rotuloCampo={t('rotuloFicha')}
        placeholder={t('placeholderFicha')}
      />
    </div>
  )
}
