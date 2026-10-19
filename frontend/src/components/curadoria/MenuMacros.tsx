'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import type { MacroVoz } from '../../lib/vozCuradoria'
import { normalizar } from '../../lib/vozCuradoria'

// MENU DE MACROS (frases prontas) no topo da coluna da ficha.
// - procurar e aplicar uma macro com um clique (ou falar "macro <nome>");
// - "Salvar esta ficha como macro": cria uma macro com o texto, as
//   alteracoes, o tipo e a qualidade da ficha atual (recurso parecido com
//   o "criar autotexto a partir do laudo" dos sistemas de laudo);
// - link para a tela de gerenciar macros.

export default function MenuMacros({
  macros,
  onAplicar,
  onCriar,
}: {
  macros: MacroVoz[]
  onAplicar: (macro: MacroVoz) => void
  /** cria macro a partir da ficha atual; devolve mensagem de erro ou null */
  onCriar: (nome: string) => Promise<string | null>
}) {
  const t = useTranslations('Curadoria.macros')
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [criando, setCriando] = useState(false)
  const [nome, setNome] = useState('')
  const [mensagem, setMensagem] = useState('')
  const caixaRef = useRef<HTMLDivElement>(null)

  // fecha ao clicar fora
  useEffect(() => {
    if (!aberto) return
    function fora(e: MouseEvent) {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  const filtro = normalizar(busca.trim())
  const lista = macros.filter((m) => !filtro || normalizar(m.nome).includes(filtro))

  async function salvar() {
    if (nome.trim().length < 2) return
    const erro = await onCriar(nome.trim())
    if (erro) {
      setMensagem(erro)
      return
    }
    setMensagem(t('criada', { nome: nome.trim() }))
    setNome('')
    setCriando(false)
  }

  return (
    <div className="relative" ref={caixaRef}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        title={t('dica')}
        className="flex items-center gap-1 rounded-full border border-violet-300/50 bg-violet-400/10 px-2.5 py-1 text-xs font-semibold text-violet-100 hover:bg-violet-400/20"
      >
        ⚡ {t('botao')} <span className="text-[10px] opacity-70">▾</span>
      </button>
      {aberto && (
        <div
          className="absolute right-0 top-full z-40 mt-1 w-80 rounded-xl border border-base-border bg-base-surface p-2 shadow-2xl"
          onKeyDown={(e) => e.stopPropagation()}
        >
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={t('procurar')}
            className="mb-2 w-full rounded-lg border border-base-border bg-base-surface2 px-2.5 py-1.5 text-sm text-ink outline-hidden focus:border-brand"
          />
          <ul className="max-h-60 space-y-0.5 overflow-y-auto">
            {lista.length === 0 && <li className="px-2 py-1 text-xs text-slate-500">{t('nenhuma')}</li>}
            {lista.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    onAplicar(m)
                    setAberto(false)
                    setBusca('')
                  }}
                  className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/5"
                >
                  <span className="block text-sm text-ink">{m.nome}</span>
                  <span className="block truncate text-[11px] text-slate-500">
                    {m.conteudo.descricao_didatica || m.conteudo.achados_detalhe || m.conteudo.observacoes_internas || t('semTexto')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1 px-2 text-[10px] text-slate-500">{t('dicaVoz')}</p>
          <div className="mt-2 border-t border-base-border pt-2">
            {criando ? (
              <div className="flex gap-1">
                <input
                  autoFocus
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && salvar()}
                  maxLength={80}
                  placeholder={t('nomeNova')}
                  className="min-w-0 flex-1 rounded-lg border border-base-border bg-base-surface2 px-2 py-1 text-sm text-ink outline-hidden focus:border-brand"
                />
                <button type="button" onClick={salvar} className="rounded-lg bg-brand px-2.5 py-1 text-xs font-semibold text-white">
                  {t('salvar')}
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => { setCriando(true); setMensagem('') }} className="w-full rounded-lg px-2 py-1 text-left text-xs text-teal-200 hover:bg-white/5">
                + {t('salvarFichaComoMacro')}
              </button>
            )}
            {mensagem && <p className="mt-1 px-2 text-[11px] text-slate-300">{mensagem}</p>}
            <Link href="/macros" target="_blank" rel="noopener" className="mt-1 block px-2 text-[11px] text-slate-400 hover:text-teal-200 hover:underline">
              {t('gerenciar')} →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
