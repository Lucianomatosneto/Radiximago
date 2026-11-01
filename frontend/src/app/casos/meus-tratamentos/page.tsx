'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import LayoutCasos from '../../../components/casos/LayoutCasos'
import ListaPacientes from '../../../components/casos/ListaPacientes'
import { apiJson, type ResumoCaso } from '../../../lib/casos'

// MEUS PACIENTES EM TRATAMENTO (aluno): os pacientes que um professor
// encaminhou para ele tratar, com contato e tratamento indicado.
function Lista() {
  const t = useTranslations('Casos')
  const [casos, setCasos] = useState<ResumoCaso[] | null>(null)
  const [erro, setErro] = useState('')
  useEffect(() => {
    apiJson<{ casos: ResumoCaso[] }>('/casos/meus-tratamentos').then((d) => setCasos(d.casos)).catch((e) => setErro((e as Error).message))
  }, [])
  if (erro) return <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-600" role="alert">{erro}</p>
  return casos ? <ListaPacientes casos={casos} vazio={t('meusTratamentos.vazio')} /> : null
}

export default function MeusTratamentosPage() {
  const t = useTranslations('Casos')
  return (
    <LayoutCasos perfis={['estudante']} titulo={t('meusTratamentos.titulo')} subtitulo={t('meusTratamentos.subtitulo')}>
      {() => <Lista />}
    </LayoutCasos>
  )
}
