'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { sugestaoDeEmail } from '../../lib/emailDigitacao'
import SeletorPessoasGrupos, { type Pessoa } from '../envios/SeletorPessoasGrupos'

// PRANCHA COM INFORMACOES (pedido de 20/10/2026)
// Folha A4 com as imagens EMPILHADAS na metade esquerda e as informacoes de
// cada uma na metade direita, na mesma altura - 2 ou 3 imagens por folha.
// A folha e montada no SERVIDOR (backend/app/modules/prancha.py), entao o
// arquivo baixado, o que sai na impressora e o que chega no e-mail sao
// exatamente iguais. Cada prancha gerada fica registrada na auditoria.
//  - Baixar: PDF (ou PNG; varias folhas em PNG vem num .zip)
//  - Imprimir: abre o mesmo PDF na janela de impressao do navegador
//  - E-mail: envia o PDF para o e-mail da propria conta
// 27/10/2026: a prancha deixou de ser um botao a parte - ela aparece DENTRO
// de "Imprimir", "Baixar"/"Salvar como" e "Enviar por e-mail" (OpcaoPrancha
// abre esta mesma janela ja com a acao certa).
// 08/11/2026 (etapa E): 1, 2 ou 3 por folha; a pessoa escolhe QUAIS dados vao
// ao lado da imagem; e-mail para outras pessoas (qualquer usuario) vai so como
// LINK que exige login - o PDF anexado so vai para o proprio e-mail.

export interface ItemPrancha {
  curation_id: number
  numero: number
}

export interface GrupoPrancha {
  chave: string
  rotulo: string
  itens: ItemPrancha[]
}

// mesmos tetos do servidor (backend/app/core/rate_limit.py)
const MAX_IMAGENS = 30
const MAX_IMAGENS_EMAIL = 15

type Acao = 'pdf' | 'png' | 'imprimir' | 'email'
type Campo = 'tipo' | 'regiao' | 'achados' | 'descricao' | 'marcadores'
const CAMPOS: Campo[] = ['tipo', 'regiao', 'achados', 'descricao', 'marcadores']

function nomeDoArquivo(resposta: Response, padrao: string): string {
  const cabecalho = resposta.headers.get('content-disposition') ?? ''
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(cabecalho)
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1])
    } catch {
      // nome mal formado: usa o padrao
    }
  }
  const simples = /filename="?([^";]+)"?/i.exec(cabecalho)
  return simples ? simples[1] : padrao
}

async function mensagemDeErro(resposta: Response, generica: string): Promise<string> {
  try {
    const dados = await resposta.json()
    if (typeof dados?.detail === 'string') return dados.detail
  } catch {
    // sem corpo JSON
  }
  return generica
}

export default function MenuPrancha({
  grupos,
  compacto = false,
  enxuto = false,
  soIcone = false,
}: {
  grupos: GrupoPrancha[]
  /** botao pequeno (barra de acoes do visualizador) */
  compacto?: boolean
  /** botao da barra fixa da Pesquisa */
  enxuto?: boolean
  /** so o icone (o nome aparece ao parar o mouse em cima) */
  soIcone?: boolean
}) {
  const t = useTranslations('Prancha')
  const [aberto, setAberto] = useState(false)
  const gruposComItens = grupos.filter((g) => g.itens.length > 0)
  const temAlgo = gruposComItens.length > 0

  const classeBotao = compacto
    ? 'flex items-center gap-1.5 rounded-md border border-base-border bg-base-surface/80 px-3 py-1 text-xs text-slate-200 hover:border-brand hover:text-brand-300 disabled:opacity-50'
    : enxuto
      ? 'flex h-8 items-center gap-1.5 rounded-lg border border-base-border bg-base-surface px-2.5 text-xs text-slate-200 hover:border-brand hover:text-brand-300 disabled:opacity-50'
      : 'flex items-center gap-2 rounded-lg border border-base-border bg-base-surface px-4 py-2 text-sm text-slate-200 hover:border-brand hover:text-brand-300 disabled:opacity-50'

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        disabled={!temAlgo}
        title={t('dica')}
        aria-label={soIcone ? t('botao') : undefined}
        aria-haspopup="dialog"
        className={classeBotao}
      >
        <IconePrancha por={2} className="h-4 w-4" />
        {!soIcone && t('botao')}
      </button>
      {aberto && <DialogoPrancha grupos={gruposComItens} onFechar={() => setAberto(false)} />}
    </>
  )
}

interface PessoaDestino {
  id: number
  nome: string
  perfil: string
  email: string
  email_sugerido: string | null
}

export type ModoPrancha = 'baixar' | 'imprimir' | 'email'

/**
 * Item "Prancha com informações…" para colocar dentro dos menus Imprimir,
 * Baixar/Salvar como e Enviar por e-mail. So o botao: quem usa guarda o
 * estado e mostra <DialogoPrancha modo=...> FORA do menu (o menu fecha ao
 * escolher, e a janela precisa continuar aberta).
 */
export function OpcaoPrancha({
  modo,
  desativado,
  onEscolher,
}: {
  modo: ModoPrancha
  desativado?: boolean
  onEscolher: () => void
}) {
  const t = useTranslations('Prancha')
  return (
    <button
      type="button"
      disabled={desativado}
      onClick={onEscolher}
      className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-base-border px-2 py-2 text-left text-sm text-slate-200 hover:bg-white/5 disabled:opacity-40"
    >
      <IconePrancha por={2} className="h-4 w-4 shrink-0" />
      <span>
        {t(`opcaoMenu.${modo}`)}
        <span className="block text-[11px] text-slate-400">{t('opcaoMenuDica')}</span>
      </span>
    </button>
  )
}

/**
 * Botao de uma acao com menu (barra do visualizador): "Baixar" e "Enviar por
 * e-mail" abrem um menu com a acao de sempre e a "Prancha com informações…".
 */
export function BotaoComPrancha({
  rotulo,
  rotuloAcao,
  onAcao,
  desativado,
  modo,
  grupos,
  className,
  semAcao = false,
  paraBaixo = false,
}: {
  rotulo: string
  /** texto da acao de sempre dentro do menu (ex.: "Esta imagem") */
  rotuloAcao: string
  onAcao: () => void
  desativado?: boolean
  modo: ModoPrancha
  grupos: GrupoPrancha[]
  className: string
  /** a acao de sempre nao vale aqui (ex.: e-mail de serie) - so a prancha */
  semAcao?: boolean
  /** menu abre para baixo (barra no topo da tela) */
  paraBaixo?: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [prancha, setPrancha] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aberto) return
    function fora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setAberto((v) => !v)} disabled={desativado} aria-haspopup="true" aria-expanded={aberto} className={className}>
        {rotulo} <span aria-hidden="true" className="text-xs opacity-70">▾</span>
      </button>
      {aberto && (
        <div className={`absolute right-0 z-70 w-72 rounded-xl border border-base-border bg-base-surface p-2 shadow-2xl ${paraBaixo ? 'top-full mt-2' : 'bottom-full mb-2'}`}>
          {!semAcao && (
            <button
              type="button"
              onClick={() => {
                setAberto(false)
                onAcao()
              }}
              className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-white/5"
            >
              {rotuloAcao}
            </button>
          )}
          <OpcaoPrancha
            modo={modo}
            desativado={!grupos.some((g) => g.itens.length)}
            onEscolher={() => {
              setAberto(false)
              setPrancha(true)
            }}
          />
        </div>
      )}
      {prancha && <DialogoPrancha grupos={grupos} modo={modo} onFechar={() => setPrancha(false)} />}
    </div>
  )
}

export function IconePrancha({ por, className }: { por: 1 | 2 | 3; className?: string }) {
  const altura = por === 1 ? 18 : por === 2 ? 9 : 6
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      <rect x="3" y="2" width="18" height="20" rx="2" />
      {Array.from({ length: por }, (_, k) => {
        const y = 4 + k * (altura + 1)
        return (
          <g key={k}>
            <rect x="5" y={y} width="6" height={altura} fill="currentColor" stroke="none" opacity={0.85} />
            <path d={`M13 ${y + 1.5}h6M13 ${y + 4}h5`} />
          </g>
        )
      })}
    </svg>
  )
}

export function DialogoPrancha({
  grupos: gruposTodos,
  onFechar,
  modo,
}: {
  grupos: GrupoPrancha[]
  onFechar: () => void
  modo?: ModoPrancha
}) {
  const t = useTranslations('Prancha')
  const grupos = gruposTodos.filter((g) => g.itens.length > 0)
  const [chave, setChave] = useState(grupos[grupos.length > 1 ? 1 : 0]?.chave ?? '')
  const [porFolha, setPorFolha] = useState<1 | 2 | 3>(2)
  const [campos, setCampos] = useState<Campo[]>(CAMPOS)
  const [comMarcacoes, setComMarcacoes] = useState(true)
  // e-mail: para mim (PDF anexado) ou para outras pessoas (so o link)
  const [paraOutros, setParaOutros] = useState(false)
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [gruposEnvio, setGruposEnvio] = useState<number[]>([])
  const [recado, setRecado] = useState('')
  const [ocupado, setOcupado] = useState<Acao | null>(null)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  // 01/11/2026 (QA item 2): o e-mail so sai depois de CONFIRMAR, vendo o
  // endereco completo do destinatario e o que vai junto
  const [confirmandoEmail, setConfirmandoEmail] = useState(false)
  const [destinos, setDestinos] = useState<PessoaDestino[] | null>(null)
  const travaRef = useRef(false)
  const quadroImpressao = useRef<HTMLIFrameElement | null>(null)
  const urlImpressao = useRef<string | null>(null)

  const grupo = grupos.find((g) => g.chave === chave) ?? grupos[0]
  const total = grupo?.itens.length ?? 0
  const folhas = Math.ceil(total / porFolha)
  const demais = total > MAX_IMAGENS
  const demaisEmail = total > MAX_IMAGENS_EMAIL

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape' && !ocupado) {
        e.stopPropagation()
        onFechar()
      }
    }
    document.addEventListener('keydown', aoTeclar, true)
    return () => document.removeEventListener('keydown', aoTeclar, true)
  }, [ocupado, onFechar])

  useEffect(
    () => () => {
      quadroImpressao.current?.remove()
      if (urlImpressao.current) URL.revokeObjectURL(urlImpressao.current)
    },
    []
  )

  function corpo(formato: 'pdf' | 'png') {
    return JSON.stringify({
      curation_ids: grupo.itens.map((i) => i.curation_id),
      numeros: grupo.itens.map((i) => i.numero),
      por_folha: porFolha,
      com_informacoes: campos.length > 0,
      campos,
      com_marcacoes: comMarcacoes,
      formato,
    })
  }

  async function abrirConfirmacaoEmail() {
    setErro('')
    setMensagem('')
    setConfirmandoEmail(true)
    if (destinos) return
    try {
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/prancha/destinatarios`, { credentials: 'include' })
      if (!r.ok) {
        setErro(await mensagemDeErro(r, t('erro')))
        return
      }
      const dados: { proprio: PessoaDestino; outros: PessoaDestino[] } = await r.json()
      setDestinos([dados.proprio])
    } catch {
      setErro(t('erro'))
    }
  }

  async function executar(acao: Acao) {
    // a trava em ref vale ja no 2o clique rapido (o estado so muda na
    // proxima renderizacao)
    if (!grupo || ocupado || travaRef.current) return
    travaRef.current = true
    setOcupado(acao)
    setErro('')
    setMensagem('')
    try {
      if (acao === 'email') {
        const r = paraOutros
          ? await fetch(`${process.env.NEXT_PUBLIC_API_URL}/prancha/enviar`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...JSON.parse(corpo('pdf')),
                pessoas: pessoas.map((p) => p.id),
                grupos: gruposEnvio,
                recado: recado.trim() || null,
              }),
            })
          : await fetch(`${process.env.NEXT_PUBLIC_API_URL}/prancha/email`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: corpo('pdf'),
            })
        if (!r.ok) {
          setErro(await mensagemDeErro(r, t('erro')))
          return
        }
        const dados = await r.json()
        setMensagem(dados.mensagem ?? t('emailEnviado'))
        setConfirmandoEmail(false)
        setPessoas([])
        setGruposEnvio([])
        setRecado('')
        return
      }
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/prancha/arquivo`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: corpo(acao === 'png' ? 'png' : 'pdf'),
      })
      if (!r.ok) {
        setErro(await mensagemDeErro(r, t('erro')))
        return
      }
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      if (acao === 'imprimir') {
        // o mesmo PDF, aberto escondido, vai direto para a janela de impressao
        quadroImpressao.current?.remove()
        if (urlImpressao.current) URL.revokeObjectURL(urlImpressao.current)
        urlImpressao.current = url
        const quadro = document.createElement('iframe')
        quadro.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0'
        quadro.src = url
        quadro.onload = () => {
          try {
            quadro.contentWindow?.focus()
            quadro.contentWindow?.print()
            // fechada a impressao, o teclado volta para a tela (Esc fecha a janela)
            window.focus()
          } catch {
            window.open(url, '_blank', 'noopener')
          }
        }
        document.body.appendChild(quadro)
        quadroImpressao.current = quadro
        setMensagem(t('impressaoAberta'))
        return
      }
      const link = document.createElement('a')
      link.href = url
      // (o nome vindo do servidor nem sempre e visivel aqui; o padrao segue o mesmo modelo)
      const extensao = blob.type.includes('zip') ? 'zip' : acao === 'png' ? 'png' : 'pdf'
      link.download = nomeDoArquivo(r, `radix-imago-prancha-${total}-imagens.${extensao}`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      setMensagem(t('baixado'))
    } catch {
      setErro(t('erro'))
    } finally {
      travaRef.current = false
      setOcupado(null)
    }
  }

  const opcao = (ativo: boolean) =>
    `flex flex-1 flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-sm transition ${
      ativo ? 'border-teal-400 bg-teal-400/10 text-teal-100 ring-2 ring-teal-400/40' : 'border-base-border text-slate-300 hover:border-teal-400/60'
    }`
  const botaoAcao =
    'flex items-center justify-center gap-1.5 rounded-lg border border-base-border bg-base-surface px-3 py-2 text-sm text-slate-200 hover:border-brand hover:text-brand-300 disabled:cursor-not-allowed disabled:opacity-50'

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !ocupado) onFechar()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-prancha"
        className="w-full max-w-lg rounded-2xl border border-base-border bg-base-surface p-5 text-slate-200 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="titulo-prancha" className="text-base font-semibold text-ink">
              {t('titulo')}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">{t('subtitulo')}</p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            disabled={!!ocupado}
            aria-label={t('fechar')}
            className="rounded-full px-2 text-lg leading-none text-slate-400 hover:text-white disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        {grupos.length > 1 && (
          <fieldset className="mb-4">
            <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('quais')}</legend>
            <div className="flex flex-wrap gap-2">
              {grupos.map((g) => (
                <label
                  key={g.chave}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                    g.chave === grupo?.chave ? 'border-teal-400 text-teal-100' : 'border-base-border text-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="grupo-prancha"
                    checked={g.chave === grupo?.chave}
                    onChange={() => setChave(g.chave)}
                    className="accent-teal-400"
                  />
                  {g.rotulo} ({g.itens.length})
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className="mb-4">
          <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('porFolha')}</legend>
          <div className="flex gap-3">
            {([1, 2, 3] as const).map((n) => (
              <button key={n} type="button" onClick={() => setPorFolha(n)} aria-pressed={porFolha === n} className={opcao(porFolha === n)}>
                <IconePrancha por={n} className="h-10 w-10" />
                <span className="font-medium">{t('opcao', { quantidade: n })}</span>
                <span className="text-[11px] text-slate-400">{n === 1 ? t('opcaoDicaUma') : t('opcaoDica')}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mb-3" data-teste="campos-prancha">
          <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('dadosTitulo')}</legend>
          <div className="flex flex-wrap gap-2">
            {CAMPOS.map((c) => {
              const ligado = campos.includes(c)
              return (
                <label key={c} className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${ligado ? 'border-teal-400 bg-teal-400/10 text-teal-100' : 'border-base-border text-slate-300'}`}>
                  <input
                    type="checkbox"
                    checked={ligado}
                    onChange={() => setCampos(ligado ? campos.filter((x) => x !== c) : CAMPOS.filter((x) => x === c || campos.includes(x)))}
                    className="h-3.5 w-3.5 accent-teal-400"
                  />
                  {t(`campos.${c}`)}
                </label>
              )
            })}
          </div>
          {campos.length === 0 && <p className="mt-1.5 text-[11px] text-slate-400">{t('semDados')}</p>}
        </fieldset>
        <div className="mb-4 space-y-2 text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={comMarcacoes} onChange={(e) => setComMarcacoes(e.target.checked)} className="h-4 w-4 accent-teal-400" />
            {t('comMarcacoes')}
          </label>
        </div>

        <p className="mb-3 text-xs text-slate-400">{t('resumo', { imagens: total, folhas })}</p>
        {demais && <p className="mb-3 text-xs text-amber-300">{t('limite', { maximo: MAX_IMAGENS })}</p>}

        <div className={`grid gap-2 ${modo === 'baixar' ? 'grid-cols-2' : modo ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-4'}`}>
          {(!modo || modo === 'baixar') && (
            <>
              <button type="button" className={botaoAcao} disabled={!!ocupado || demais || total === 0} onClick={() => executar('pdf')}>
                {ocupado === 'pdf' ? t('gerando') : `⬇ ${t('baixarPdf')}`}
              </button>
              <button type="button" className={botaoAcao} disabled={!!ocupado || demais || total === 0} onClick={() => executar('png')}>
                {ocupado === 'png' ? t('gerando') : `⬇ ${t('baixarPng')}`}
              </button>
            </>
          )}
          {(!modo || modo === 'imprimir') && (
            <button type="button" className={botaoAcao} disabled={!!ocupado || demais || total === 0} onClick={() => executar('imprimir')}>
              {ocupado === 'imprimir' ? t('gerando') : `🖨 ${t('imprimir')}`}
            </button>
          )}
          {(!modo || modo === 'email') && (
            <button
              type="button"
              className={botaoAcao}
              disabled={!!ocupado || demais || total === 0}
              onClick={abrirConfirmacaoEmail}
            >
              {ocupado === 'email' ? t('enviando') : `✉ ${t('email')}`}
            </button>
          )}
        </div>

        {confirmandoEmail && (
          <div role="group" aria-label={t('confirmarTitulo')} className="mt-3 rounded-lg border border-brand/50 bg-brand/10 p-3 text-sm">
            <p className="mb-2 font-semibold text-slate-100">{t('confirmarTitulo')}</p>
            {!destinos ? (
              !erro && <p className="text-xs text-slate-400">{t('carregandoDestinos')}</p>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap gap-2" role="radiogroup" aria-label={t('destinatario')}>
                  {[false, true].map((outros) => (
                    <label key={String(outros)} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${paraOutros === outros ? 'border-teal-400 text-teal-100' : 'border-base-border text-slate-300'}`}>
                      <input type="radio" name="destino-prancha" checked={paraOutros === outros} onChange={() => setParaOutros(outros)}
                             disabled={!!ocupado} className="accent-teal-400" data-teste={outros ? 'prancha-para-outros' : 'prancha-para-mim'} />
                      {outros ? t('paraOutros') : t('paraMim')}
                    </label>
                  ))}
                </div>
                {paraOutros ? (
                  <>
                    <SeletorPessoasGrupos
                      pessoas={pessoas}
                      grupos={gruposEnvio}
                      aoMudar={(p, g) => {
                        setPessoas(p)
                        setGruposEnvio(g)
                      }}
                      urlBusca="/prancha/pessoas"
                      minimoBusca={3}
                      ocultarSemGrupos
                    />
                    <label className="mt-3 block text-xs text-slate-300">
                      {t('recado')}
                      <textarea value={recado} onChange={(e) => setRecado(e.target.value)} maxLength={500} rows={2}
                                className="mt-1 block w-full rounded-md border border-base-border bg-base-surface2 px-2 py-1 text-sm text-slate-100" />
                    </label>
                    <p className="mt-2 text-xs text-slate-300">{t('oQueVaiLink', { imagens: total })}</p>
                  </>
                ) : (
                  (() => {
                    const destino = destinos[0]
                    const sugerido = destino.email_sugerido ?? sugestaoDeEmail(destino.email)
                    return (
                      <>
                        <p className="text-xs text-slate-300">
                          {t('vaiPara')} <strong className="break-all text-slate-100">{destino.email}</strong>
                        </p>
                        <p className="mt-1 text-xs text-slate-300">{t('oQueVai', { imagens: total, folhas })}</p>
                        {demaisEmail && <p className="mt-1 text-xs text-amber-300">{t('limiteEmail', { maximo: MAX_IMAGENS_EMAIL })}</p>}
                        {sugerido && (
                          <p className="mt-2 text-xs text-amber-300" role="alert">
                            {t('emailSuspeito', { sugerido })}
                          </p>
                        )}
                      </>
                    )
                  })()
                )}
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-base-border px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-40"
                    disabled={!!ocupado}
                    onClick={() => setConfirmandoEmail(false)}
                  >
                    {t('cancelar')}
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    data-teste="confirmar-envio-prancha"
                    // desabilitado durante o envio: um segundo clique nao manda de novo
                    disabled={!!ocupado || (paraOutros ? pessoas.length + gruposEnvio.length === 0 : demaisEmail)}
                    aria-busy={ocupado === 'email'}
                    onClick={() => executar('email')}
                  >
                    {ocupado === 'email' ? t('enviando') : paraOutros ? t('confirmarEnvioLink') : t('confirmarEnvio')}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <div aria-live="polite" className="mt-3 min-h-[1.25rem] text-xs">
          {mensagem && <span className="text-emerald-400">{mensagem}</span>}
          {erro && (
            <span className="text-red-400" role="alert">
              {erro}
            </span>
          )}
          {!mensagem && !erro && demaisEmail && !demais && (
            <span className="text-slate-500">{t('limiteEmail', { maximo: MAX_IMAGENS_EMAIL })}</span>
          )}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">{t('aviso')}</p>
      </div>
    </div>,
    // em tela cheia (visualizador), so o que esta DENTRO dela aparece
    (document.fullscreenElement as HTMLElement | null) ?? document.body
  )
}
