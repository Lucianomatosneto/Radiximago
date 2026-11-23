'use client'

// "?" A DIREITA DE CADA MARCACAO (pedido do video, 22/11/2026 - B14): o
// clique mostra a DEFINICAO do achado, escrita pelo curador na tela
// Vocabulario, sempre com a FONTE (DeCS/BIREME ou texto do curador). O
// servidor acha o termo pelo nome ou por um sinonimo
// (GET /vocabulario/definicao). Cada texto e pedido uma vez enquanto o
// quadro da imagem estiver na tela.

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { fetchOuNulo } from '../../lib/fetchSeguro'

const API = process.env.NEXT_PUBLIC_API_URL

type Resultado = { tipo: 'ok'; termo: string; definicao: string; fonte: string | null } | { tipo: 'sem' } | { tipo: 'erro' }

export function useDefinicaoAchado() {
  const [abertas, setAbertas] = useState<Record<string, Resultado | 'carregando'>>({})
  const guardadas = useRef(new Map<string, Resultado>()).current

  async function alternar(chave: string, texto: string) {
    if (abertas[chave]) {
      setAbertas(({ [chave]: _fechada, ...resto }) => resto)
      return
    }
    const guardada = guardadas.get(texto)
    if (guardada) {
      setAbertas((a) => ({ ...a, [chave]: guardada }))
      return
    }
    setAbertas((a) => ({ ...a, [chave]: 'carregando' }))
    const r = await fetchOuNulo(`${API}/vocabulario/definicao?texto=${encodeURIComponent(texto)}`, { credentials: 'include' })
    let resultado: Resultado = { tipo: 'erro' }
    if (r?.ok) {
      const d = await r.json()
      resultado = { tipo: 'ok', termo: d.termo, definicao: d.definicao, fonte: d.fonte ?? null }
      guardadas.set(texto, resultado)
    } else if (r?.status === 404) {
      resultado = { tipo: 'sem' }
      guardadas.set(texto, resultado)
    }
    setAbertas((a) => (a[chave] ? { ...a, [chave]: resultado } : a))
  }

  return { abertas, alternar }
}

export function BotaoDefinicao({ achado, aberta, onClick }: { achado: string; aberta: boolean; onClick: () => void }) {
  const t = useTranslations('Visualizador.definicao')
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onClick()
      }}
      onKeyDown={(e) => e.stopPropagation()}
      aria-expanded={aberta}
      aria-label={t('oQueE', { achado })}
      title={t('oQueE', { achado })}
      className={`ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold leading-none transition ${
        aberta ? 'border-teal-300 bg-teal-300 text-black' : 'border-teal-300/60 text-teal-200 hover:bg-teal-300/20'
      }`}
    >
      ?
    </button>
  )
}

export function TextoDefinicao({ achado, resultado }: { achado: string; resultado: Resultado | 'carregando' }) {
  const t = useTranslations('Visualizador.definicao')
  return (
    <div role="note" aria-label={achado} className="mb-1 ml-5 rounded-md border border-teal-300/30 bg-teal-400/10 px-2 py-1.5 text-[11px] leading-snug text-ink">
      {resultado === 'carregando' ? (
        t('carregando')
      ) : resultado.tipo === 'ok' ? (
        <>
          <p className="whitespace-pre-line">{resultado.definicao}</p>
          {resultado.fonte && <p className="mt-1 text-[10px] text-slate-400">{t('fonte', { fonte: resultado.fonte })}</p>}
        </>
      ) : resultado.tipo === 'sem' ? (
        t('semDefinicao')
      ) : (
        t('erro')
      )}
    </div>
  )
}
