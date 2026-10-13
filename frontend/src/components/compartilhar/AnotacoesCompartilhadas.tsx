'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

// Para quem RECEBEU a imagem: o recado e as anotacoes ATUAIS de quem
// compartilhou, so para leitura (o servidor so devolve se o compartilhamento
// ainda existir e for para o usuario logado).

const API = process.env.NEXT_PUBLIC_API_URL

export interface InfoCompartilhamento {
  id: number
  remetente_nome: string
  mensagem: string | null
}

interface Nota {
  id: number
  texto: string
}

export default function AnotacoesCompartilhadas({ compartilhamento }: { compartilhamento: InfoCompartilhamento }) {
  const t = useTranslations('Compartilhar')
  const [notas, setNotas] = useState<Nota[] | null>(null)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    let cancelado = false
    setNotas(null)
    setErro(false)
    fetch(`${API}/shares/recebidas/${compartilhamento.id}/anotacoes`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((dados: { itens: Nota[] }) => {
        if (!cancelado) setNotas(dados.itens)
      })
      .catch(() => {
        if (!cancelado) setErro(true)
      })
    return () => {
      cancelado = true
    }
  }, [compartilhamento.id])

  return (
    <div className="mt-3 rounded-md border border-sky-400/30 bg-sky-400/5 p-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-200">
        {t('anotacoesDe', { nome: compartilhamento.remetente_nome })}
      </p>
      {compartilhamento.mensagem && (
        <p className="mt-1 whitespace-pre-line text-xs italic text-slate-300">“{compartilhamento.mensagem}”</p>
      )}
      {erro ? (
        <p className="mt-1 text-xs text-slate-400">{t('anotacoesIndisponiveis')}</p>
      ) : notas === null ? (
        <p className="mt-1 text-xs text-slate-500">…</p>
      ) : notas.length === 0 ? (
        <p className="mt-1 text-xs italic text-slate-400">{t('semAnotacoes')}</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {notas.map((n) => (
            <li key={n.id} className="whitespace-pre-line break-words text-xs leading-snug text-ink">
              • {n.texto}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-[10px] text-slate-500">{t('somenteLeitura')}</p>
    </div>
  )
}
