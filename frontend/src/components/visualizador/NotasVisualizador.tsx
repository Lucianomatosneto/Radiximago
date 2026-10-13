'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

// Anotacoes pessoais de quem esta vendo a imagem, escritas dentro do quadro
// de informacoes da curadoria (selo "i" do visualizador).
//
// Usa a MESMA tabela/API das anotacoes que ja existiam (/annotations): uma
// anotacao sem posicao (pos_x/pos_y nulos) e uma nota "solta", que nao
// aparece desenhada sobre a imagem - so aqui, no quadro. Cada anotacao e
// PRIVADA: o servidor so devolve as do proprio usuario logado (LGPD - a
// nota de estudo de um aluno nao fica visivel para os outros).

interface Nota {
  id: number
  texto: string
  pos_x: number | null
  pos_y: number | null
}

const API = process.env.NEXT_PUBLIC_API_URL

export default function NotasVisualizador({ curationId, onAbrir }: { curationId: number; onAbrir?: () => void }) {
  const t = useTranslations('Visualizador.notas')
  const [aberta, setAberta] = useState(false)
  const [notas, setNotas] = useState<Nota[]>([])
  const [texto, setTexto] = useState('')
  const [editando, setEditando] = useState<number | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const campoRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setAberta(false)
    setTexto('')
    setEditando(null)
    setErro('')
    let cancelado = false
    async function carregar() {
      try {
        const resposta = await fetch(`${API}/annotations/${curationId}`, { credentials: 'include' })
        if (!resposta.ok) return
        const dados: { itens: Nota[] } = await resposta.json()
        if (!cancelado) setNotas(dados.itens.filter((n) => n.pos_x === null && n.pos_y === null))
      } catch {
        // sem notas carregadas: o quadro so fica sem elas
      }
    }
    carregar()
    return () => {
      cancelado = true
    }
  }, [curationId])

  useEffect(() => {
    if (aberta) campoRef.current?.focus()
  }, [aberta, editando])

  function abrir() {
    setAberta(true)
    onAbrir?.()
  }

  async function salvar() {
    const conteudo = texto.trim()
    if (!conteudo) {
      setErro(t('erroVazio'))
      return
    }
    setSalvando(true)
    setErro('')
    try {
      const resposta = await fetch(editando ? `${API}/annotations/${editando}` : `${API}/annotations/${curationId}`, {
        method: editando ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: conteudo }),
      })
      if (!resposta.ok) {
        setErro(t('erroSalvar'))
        return
      }
      const salva: Nota = await resposta.json()
      setNotas((atual) => (atual.some((n) => n.id === salva.id) ? atual.map((n) => (n.id === salva.id ? salva : n)) : [...atual, salva]))
      setTexto('')
      setEditando(null)
      setAberta(false)
    } catch {
      setErro(t('erroSalvar'))
    } finally {
      setSalvando(false)
    }
  }

  async function remover(id: number) {
    setErro('')
    try {
      const resposta = await fetch(`${API}/annotations/${id}`, { method: 'DELETE', credentials: 'include' })
      if (!resposta.ok) {
        setErro(t('erroExcluir'))
        return
      }
      setNotas((atual) => atual.filter((n) => n.id !== id))
      if (editando === id) {
        setEditando(null)
        setTexto('')
        setAberta(false)
      }
    } catch {
      setErro(t('erroExcluir'))
    }
  }

  function editar(nota: Nota) {
    setEditando(nota.id)
    setTexto(nota.texto)
    abrir()
  }

  function cancelar() {
    setAberta(false)
    setEditando(null)
    setTexto('')
    setErro('')
  }

  return (
    // as teclas digitadas aqui nao podem acionar os atalhos do visualizador
    // (setas trocam de imagem, Esc fecha, K liga marcacoes)
    <div className="mt-3 border-t border-white/10 pt-2" onKeyDown={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-200">{t('titulo')}</p>
        {!aberta && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              abrir()
            }}
            title={t('nova')}
            aria-label={t('nova')}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-teal-300/50 text-teal-100 hover:border-teal-300 hover:bg-teal-300/10"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16v4z" strokeLinejoin="round" />
              <path d="M13.5 6.5l4 4" />
            </svg>
          </button>
        )}
      </div>

      {notas.length === 0 && !aberta && <p className="mt-1 text-xs italic text-slate-400">{t('vazio')}</p>}

      {notas.length > 0 && (
        <ul className="mt-1 space-y-1">
          {notas.map((nota) => (
            <li key={nota.id} className="group flex items-start gap-1.5 rounded px-1 py-0.5 hover:bg-white/5">
              <button
                type="button"
                onClick={() => editar(nota)}
                title={t('editar')}
                className="min-w-0 flex-1 whitespace-pre-line break-words text-left text-xs leading-snug text-ink"
              >
                {nota.texto}
              </button>
              <button
                type="button"
                onClick={() => remover(nota.id)}
                title={t('excluir')}
                aria-label={t('excluir')}
                className="shrink-0 text-xs text-slate-500 opacity-0 hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {aberta && (
        <div className="mt-2">
          <div className="relative">
            <textarea
              ref={campoRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) salvar()
                if (e.key === 'Escape') cancelar()
              }}
              maxLength={2000}
              rows={4}
              placeholder={t('placeholder')}
              aria-label={t('placeholder')}
              className="w-full resize-y rounded-md border border-teal-500/40 bg-black/40 px-2 py-1.5 pb-4 text-xs leading-snug text-ink outline-none placeholder:text-slate-500 focus:border-teal-300"
            />
            {/* marca discreta no canto da caixa de texto */}
            <span className="pointer-events-none absolute bottom-1.5 right-5 select-none text-[7px] leading-none text-slate-400/50" aria-hidden="true">
              bt
            </span>
          </div>
          {erro && <p className="mt-1 text-xs text-red-400">{erro}</p>}
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-500">{t('privada')}</span>
            <div className="flex gap-1.5">
              <button type="button" onClick={cancelar} className="rounded-md px-2 py-0.5 text-xs text-slate-300 hover:bg-white/10">
                {t('cancelar')}
              </button>
              <button
                type="button"
                onClick={salvar}
                disabled={salvando}
                className="rounded-md bg-teal-500/80 px-2 py-0.5 text-xs font-semibold text-black hover:bg-teal-400 disabled:opacity-50"
              >
                {t('salvar')}
              </button>
            </div>
          </div>
        </div>
      )}
      {!aberta && erro && <p className="mt-1 text-xs text-red-400">{erro}</p>}
    </div>
  )
}
