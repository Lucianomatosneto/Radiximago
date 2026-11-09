'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import type { GrupoImpressao, ItemImpressao } from './MenuImpressao'
import { DialogoPrancha } from './MenuPrancha'

// Dois botoes ao lado de "Imprimir" (08/11/2026, sem menus de opcoes):
//
// "Salvar como" - abre direto a prancha (PDF, PNG ou ZIP), onde a pessoa
//   escolhe quais imagens, quantas por folha e quais dados.
//
// "Salvar em Minhas imagens" - guarda na lista pessoal do usuario dentro do
//   Radix as SELECIONADAS (sem selecao, todas as da lista).

const PARALELO = 4

function Progresso({ titulo, feitas, total, aviso }: { titulo: string; feitas: number; total: number; aviso?: string }) {
  return (
    <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/60 backdrop-blur-xs" role="status">
      <div className="w-80 rounded-2xl border border-base-border bg-base-surface p-5 text-center shadow-2xl">
        <p className="text-sm font-semibold text-ink">{titulo}</p>
        <p className="mt-1 text-xs text-slate-400">
          {feitas} / {total}
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-teal-400 transition-all" style={{ width: `${total ? (feitas / total) * 100 : 0}%` }} />
        </div>
        {aviso && <p className="mt-2 text-xs text-amber-300">{aviso}</p>}
      </div>
    </div>
  )
}

async function emParalelo<T>(itens: T[], tarefa: (item: T) => Promise<void>) {
  const fila = [...itens]
  await Promise.all(
    Array.from({ length: Math.min(PARALELO, itens.length) }, async () => {
      while (fila.length) await tarefa(fila.shift() as T)
    })
  )
}

// Mensagem de confirmacao que some sozinha depois de alguns segundos
function useMensagemTemporaria(): [string, (m: string) => void] {
  const [mensagem, setMensagem] = useState('')
  useEffect(() => {
    if (!mensagem) return
    const id = setTimeout(() => setMensagem(''), 6000)
    return () => clearTimeout(id)
  }, [mensagem])
  return [mensagem, setMensagem]
}


export function MenuSalvarComo({
  grupos,
  enxuto = false,
  soIcone = false,
}: {
  grupos: GrupoImpressao[]
  enxuto?: boolean
  soIcone?: boolean
}) {
  // 08/11/2026 (pedido do Luciano): "Salvar como" abre direto a PRANCHA, com
  // PDF, PNG e ZIP (imagens soltas + .txt com os dados escolhidos).
  const t = useTranslations('Salvar')
  const [prancha, setPrancha] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setPrancha(true)}
        disabled={!grupos.some((g) => g.itens.length)}
        aria-haspopup="dialog"
        data-teste="botao-salvar-como"
        title={soIcone ? t('salvarComo') : undefined}
        aria-label={soIcone ? t('salvarComo') : undefined}
        className={`flex items-center rounded-lg border border-base-border bg-base-surface text-slate-200 hover:border-brand hover:text-brand-300 disabled:opacity-50 ${
          enxuto ? 'h-8 gap-1.5 px-2.5 text-xs' : 'gap-2 px-4 py-2 text-sm'
        }`}
      >
        💾 {!soIcone && t('salvarComo')}
      </button>
      {prancha && <DialogoPrancha grupos={grupos} modo="baixar" onFechar={() => setPrancha(false)} />}
    </>
  )
}

export function MenuSalvarMinhasImagens({
  grupos,
  enxuto = false,
  soIcone = false,
}: {
  grupos: GrupoImpressao[]
  enxuto?: boolean
  soIcone?: boolean
}) {
  const t = useTranslations('Salvar')
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [progresso, setProgresso] = useState<{ feitas: number; total: number } | null>(null)
  const [mensagem, setMensagem] = useMensagemTemporaria()
  const [erro, setErro] = useState('')

  async function salvar(itens: ItemImpressao[]) {
    setAberto(false)
    setMensagem('')
    setErro('')
    let feitas = 0
    let falhas = 0
    let semSessao = false
    setProgresso({ feitas: 0, total: itens.length })
    await emParalelo(itens, async (item) => {
      try {
        const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/saved-images/${item.curation_id}`, {
          method: 'POST',
          credentials: 'include',
        })
        if (r.status === 401) semSessao = true
        else if (!r.ok) falhas++
      } catch {
        falhas++
      } finally {
        feitas++
        setProgresso({ feitas, total: itens.length })
      }
    })
    setProgresso(null)
    if (semSessao) {
      router.push('/login')
      return
    }
    if (falhas) setErro(t('minhasFalhas', { total: falhas }))
    setMensagem(t('minhasSalvas', { total: itens.length - falhas }))
  }

  // 08/11/2026 (pedido do Luciano): sem menu de opcoes - salva as
  // SELECIONADAS; sem nenhuma selecionada, todas as da lista.
  const alvo = grupos.find((g) => g.chave === 'selecionadas' && g.itens.length) ?? grupos.find((g) => g.itens.length)

  return (
    <>
      <button
        type="button"
        onClick={() => alvo && salvar(alvo.itens)}
        disabled={!alvo || !!progresso}
        data-teste="botao-salvar-minhas"
        title={alvo ? t('salvarMinhasDica', { total: alvo.itens.length }) : t('salvarMinhas')}
        aria-label={soIcone ? t('salvarMinhas') : undefined}
        className={`flex items-center rounded-lg border border-base-border bg-base-surface text-slate-200 hover:border-brand hover:text-brand-300 disabled:opacity-50 ${
          enxuto ? 'h-8 gap-1.5 px-2.5 text-xs' : 'gap-2 px-4 py-2 text-sm'
        }`}
      >
        ★ {!soIcone && t('salvarMinhas')}
      </button>
      {mensagem && <span className="text-xs text-emerald-400">{mensagem}</span>}
      {erro && (
        <span className="text-xs text-red-400" role="alert">
          {erro}
        </span>
      )}
      {progresso && <Progresso titulo={t('salvandoMinhas')} feitas={progresso.feitas} total={progresso.total} />}
    </>
  )
}
