'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import ResponderCompartilhamento from './ResponderCompartilhamento'

// Para quem RECEBEU a imagem: o recado e as anotacoes ATUAIS de quem
// compartilhou (o servidor so devolve se o compartilhamento ainda existir e
// for para o usuario logado).
//
// O RECADO de quem enviou (ex.: "favor avaliar") e as anotacoes nao podem
// ser editados por quem recebeu - so "apagados".
// "Apagar" aqui e SO PARA QUEM RECEBEU: a anotacao some da sua visao (ex.:
// para imprimir sem ela), mas continua existindo para quem a escreveu -
// ninguem apaga dados de outra pessoa. "Mostrar as apagadas" desfaz.
// Apagar pede confirmacao com um segundo clique (como em Minhas anotacoes).

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
  const [ocultas, setOcultas] = useState(0)
  // recado atual (o servidor manda null se quem recebeu ja o apagou)
  const [mensagem, setMensagem] = useState<string | null>(compartilhamento.mensagem)
  const [erro, setErro] = useState(false)
  const [erroAcao, setErroAcao] = useState('')
  const [confirmando, setConfirmando] = useState<number | 'todas' | 'recado' | null>(null)
  const base = `${API}/shares/recebidas/${compartilhamento.id}/anotacoes`

  async function carregar(cancelado?: () => boolean) {
    try {
      const r = await fetch(base, { credentials: 'include' })
      if (!r.ok) throw new Error()
      const dados: { itens: Nota[]; ocultas?: number; mensagem?: string | null } = await r.json()
      if (cancelado?.()) return
      setNotas(dados.itens)
      if (dados.mensagem !== undefined) setMensagem(dados.mensagem)
      setOcultas(dados.ocultas ?? 0)
    } catch {
      if (!cancelado?.()) setErro(true)
    }
  }

  useEffect(() => {
    let cancelado = false
    setNotas(null)
    setErro(false)
    carregar(() => cancelado)
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compartilhamento.id])

  // sem confirmar em 4 s, o botao volta ao normal
  useEffect(() => {
    if (confirmando === null) return
    const id = setTimeout(() => setConfirmando(null), 4000)
    return () => clearTimeout(id)
  }, [confirmando])

  async function acao(caminho: 'ocultar' | 'reexibir', corpo: { ids?: number[]; mensagem?: boolean }[] = [{}]) {
    setErroAcao('')
    try {
      for (const c of corpo) {
        const r = await fetch(`${base}/${caminho}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(c),
        })
        if (!r.ok) throw new Error()
      }
      await carregar()
      // avisa a tela (ex.: contador de anotacoes do cartao)
      window.dispatchEvent(new CustomEvent('radix-anotacoes-compartilhadas', { detail: { id: compartilhamento.id } }))
    } catch {
      setErroAcao(t('erroApagar'))
    }
  }

  function pedirApagar(alvo: number | 'todas' | 'recado') {
    if (confirmando !== alvo) {
      setConfirmando(alvo)
      return
    }
    setConfirmando(null)
    if (alvo === 'recado') acao('ocultar', [{ mensagem: true }])
    // "apagar todas": as anotacoes e tambem o recado
    else if (alvo === 'todas') acao('ocultar', [{}, ...(mensagem ? [{ mensagem: true }] : [])])
    else acao('ocultar', [{ ids: [alvo] }])
  }

  const totalVisivel = (notas?.length ?? 0) + (mensagem ? 1 : 0)

  const estiloLixeira = (ativo: boolean) =>
    `flex h-5 shrink-0 items-center justify-center gap-1 rounded px-1 text-[10px] font-semibold ${
      ativo ? 'bg-red-500/90 text-white' : 'text-slate-400 hover:bg-red-500/15 hover:text-red-300'
    }`

  return (
    // data-sem-fechar: clicar aqui dentro nao fecha a janela de informacoes
    <div data-sem-fechar className="mt-3 rounded-md border border-sky-400/30 bg-sky-400/5 p-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-200">
        {t('anotacoesDe', { nome: compartilhamento.remetente_nome })}
      </p>
      {/* recado de quem enviou: nao editavel, so pode ser apagado (para si) */}
      {mensagem && (
        <div className="mt-1 flex items-start gap-1.5 rounded px-1 py-0.5 hover:bg-white/5">
          <p className="min-w-0 flex-1 whitespace-pre-line break-words text-xs italic text-slate-300">“{mensagem}”</p>
          <button
            type="button"
            onClick={() => pedirApagar('recado')}
            title={confirmando === 'recado' ? t('confirmarApagar') : t('apagarRecadoParaMim')}
            aria-label={confirmando === 'recado' ? t('confirmarApagar') : t('apagarRecadoParaMim')}
            className={estiloLixeira(confirmando === 'recado')}
          >
            <IconeLixeira />
            {confirmando === 'recado' && <span>{t('apagarCurto')}</span>}
          </button>
        </div>
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
            <li key={n.id} className="flex items-start gap-1.5 rounded px-1 py-0.5 hover:bg-white/5">
              <span className="min-w-0 flex-1 whitespace-pre-line break-words text-xs leading-snug text-ink">• {n.texto}</span>
              <button
                type="button"
                onClick={() => pedirApagar(n.id)}
                title={confirmando === n.id ? t('confirmarApagar') : t('apagarParaMim')}
                aria-label={confirmando === n.id ? t('confirmarApagar') : t('apagarParaMim')}
                className={estiloLixeira(confirmando === n.id)}
              >
                <IconeLixeira />
                {confirmando === n.id && <span>{t('apagarCurto')}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {erroAcao && <p className="mt-1 text-xs text-red-400">{erroAcao}</p>}
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] text-slate-500">{t('apagarSoParaVoce')}</p>
        <div className="flex items-center gap-1">
          {ocultas > 0 && (
            <button
              type="button"
              onClick={() => acao('reexibir')}
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-sky-200 hover:bg-sky-400/15"
            >
              {t('mostrarApagadas', { quantidade: ocultas })}
            </button>
          )}
          {totalVisivel > 1 && (
            <button type="button" onClick={() => pedirApagar('todas')} className={estiloLixeira(confirmando === 'todas') + ' px-1.5'}>
              <IconeLixeira />
              {confirmando === 'todas' ? t('confirmarApagarTodas') : t('apagarTodas')}
            </button>
          )}
        </div>
      </div>
      {/* responder a quem enviou, sem digitar e-mail */}
      <ResponderCompartilhamento compartilhamentoId={compartilhamento.id} remetenteNome={compartilhamento.remetente_nome} />
    </div>
  )
}

function IconeLixeira() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  )
}
