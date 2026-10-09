'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useDescricaoCuradoria } from '../../lib/descricaoCuradoria'
import { criarZip, escolherOndeSalvar, gravarArquivo, type ArquivoZip } from '../../lib/zip'
import { ImpressaoEmAndamento, type GrupoImpressao, type ItemImpressao, type Trabalho } from './MenuImpressao'

// Dois botoes ao lado de "Imprimir", com os mesmos grupos (ex.: todas as
// encontradas / somente as selecionadas):
//
// "Salvar como" - grava no computador da pessoa:
//   - Imagens (.zip), com ou sem a descricao da curadoria (um .txt por
//     imagem, com o mesmo nome);
//   - PDF, com ou sem descricao (usa o mesmo layout da impressao; na janela
//     do navegador basta escolher "Salvar como PDF").
//   Onde o navegador permite, abre a janela "Salvar como" de verdade para
//   escolher pasta e nome; senao, o arquivo vai para Downloads.
//
// "Salvar em Minhas imagens" - guarda as imagens na lista pessoal do
// usuario dentro do Radix (a mesma de "Minhas imagens" no menu).

const PARALELO = 4

function MenuBase({
  rotulo,
  icone,
  aberto,
  setAberto,
  desativado,
  children,
}: {
  rotulo: string
  icone: string
  aberto: boolean
  setAberto: (v: boolean) => void
  desativado: boolean
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aberto) return
    function fora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto, setAberto])
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        disabled={desativado}
        aria-haspopup="true"
        aria-expanded={aberto}
        className="flex items-center gap-2 rounded-lg border border-base-border bg-base-surface px-4 py-2 text-sm text-slate-200 hover:border-brand hover:text-brand-300 disabled:opacity-50"
      >
        {icone} {rotulo} <span aria-hidden="true" className="text-xs opacity-70">▾</span>
      </button>
      {aberto && (
        <div className="absolute right-0 top-full z-[70] mt-2 w-80 rounded-xl border border-base-border bg-base-surface p-2 shadow-2xl">
          {children}
        </div>
      )}
    </div>
  )
}

function Opcao({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-white/5 disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function Progresso({ titulo, feitas, total, aviso }: { titulo: string; feitas: number; total: number; aviso?: string }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" role="status">
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
  const [mensagem, setMensagem] = useMensagemTemporaria()
  useEffect(() => {
    if (!mensagem) return
    const id = setTimeout(() => setMensagem(''), 6000)
    return () => clearTimeout(id)
  }, [mensagem])
  return [mensagem, setMensagem]
}

const tresDigitos = (n: number) => String(n).padStart(3, '0')

export function MenuSalvarComo({ grupos }: { grupos: GrupoImpressao[] }) {
  const t = useTranslations('Salvar')
  const descrever = useDescricaoCuradoria()
  const [aberto, setAberto] = useState(false)
  const [pdf, setPdf] = useState<Trabalho | null>(null)
  const [progresso, setProgresso] = useState<{ feitas: number; total: number } | null>(null)
  const [mensagem, setMensagem] = useMensagemTemporaria()

  async function salvarZip(itens: ItemImpressao[], comDescricao: boolean) {
    setAberto(false)
    setMensagem('')
    const hoje = new Date()
    const data = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`
    const nome = `radix-imago-${itens.length}-imagens-${data}.zip`
    // a janela "Salvar como" precisa abrir ainda no clique
    const alca = await escolherOndeSalvar(nome, 'application/zip', t('tipoZip'))
    if (alca === 'cancelado') return

    const arquivos: ArquivoZip[] = []
    let falhas = 0
    let feitas = 0
    setProgresso({ feitas: 0, total: itens.length })
    await emParalelo(itens, async (item) => {
      const comMarcacao = comDescricao && (item.marcacoes ?? []).length > 0
      try {
        const r = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/search/${item.curation_id}/preview${comMarcacao ? '?com_marcacao=true' : ''}`,
          { credentials: 'include' }
        )
        if (!r.ok) throw new Error(String(r.status))
        const blob = await r.blob()
        const ext = blob.type.includes('jpeg') ? 'jpg' : 'png'
        const base = `imagem-${tresDigitos(item.numero)}`
        arquivos.push({ nome: `${base}.${ext}`, dados: new Uint8Array(await blob.arrayBuffer()) })
        if (comDescricao) {
          const texto = [`Rádix Imago - ${t('imagem')} #${item.numero}`, '', ...descrever(item).map((l) => `${l.rotulo}: ${l.valor}`)].join('\r\n')
          arquivos.push({ nome: `${base}.txt`, dados: new TextEncoder().encode(texto) })
        }
      } catch {
        falhas++
      } finally {
        feitas++
        setProgresso({ feitas, total: itens.length })
      }
    })
    arquivos.sort((a, b) => a.nome.localeCompare(b.nome))
    arquivos.unshift({ nome: 'LEIA-ME.txt', dados: new TextEncoder().encode(t('leiaMe')) })
    await gravarArquivo(criarZip(arquivos), alca, nome)
    setProgresso(null)
    setMensagem(falhas ? t('salvoComFalhas', { total: falhas }) : t('salvo'))
  }

  return (
    <>
      <MenuBase
        rotulo={t('salvarComo')}
        icone="💾"
        aberto={aberto}
        setAberto={setAberto}
        desativado={!grupos.some((g) => g.itens.length) || !!progresso || !!pdf}
      >
        {grupos.map((g) => (
          <div key={g.chave} className="py-1">
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {g.rotulo} ({g.itens.length})
            </p>
            <Opcao disabled={!g.itens.length} onClick={() => salvarZip(g.itens, true)}>{t('zipCom')}</Opcao>
            <Opcao disabled={!g.itens.length} onClick={() => salvarZip(g.itens, false)}>{t('zipSem')}</Opcao>
            <Opcao
              disabled={!g.itens.length}
              onClick={() => {
                setAberto(false)
                setPdf({ itens: g.itens, comDescricao: true })
              }}
            >
              {t('pdfCom')}
            </Opcao>
            <Opcao
              disabled={!g.itens.length}
              onClick={() => {
                setAberto(false)
                setPdf({ itens: g.itens, comDescricao: false })
              }}
            >
              {t('pdfSem')}
            </Opcao>
          </div>
        ))}
      </MenuBase>
      {mensagem && <span className="text-xs text-emerald-400">{mensagem}</span>}
      {progresso && <Progresso titulo={t('preparandoZip')} feitas={progresso.feitas} total={progresso.total} />}
      {pdf && <ImpressaoEmAndamento trabalho={pdf} dicaPdf onTerminar={() => setPdf(null)} />}
    </>
  )
}

export function MenuSalvarMinhasImagens({ grupos }: { grupos: GrupoImpressao[] }) {
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

  return (
    <>
      <MenuBase
        rotulo={t('salvarMinhas')}
        icone="★"
        aberto={aberto}
        setAberto={setAberto}
        desativado={!grupos.some((g) => g.itens.length) || !!progresso}
      >
        <p className="px-2 pb-1 text-xs text-slate-400">{t('ajudaMinhas')}</p>
        {grupos.map((g) => (
          <Opcao key={g.chave} disabled={!g.itens.length} onClick={() => salvar(g.itens)}>
            {g.rotulo} ({g.itens.length})
          </Opcao>
        ))}
      </MenuBase>
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
