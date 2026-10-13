'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { FormularioFicha } from './FichaCuradoriaForm'
import { interpretar, type Alteracao, type NaoReconhecido, type TermoVoz } from '../../lib/vozCuradoria'
import { SECAO_DO_CAMPO, secaoVizinha, type SecaoFicha } from '../../lib/secoesCuradoria'

// CURADORIA POR VOZ (painel flutuante da tela de Curadoria).
//
// Fluxo: o curador clica no microfone (ou Alt+V), fala, clica de novo ->
// o audio vai para o backend (/voz/transcrever), que repassa ao Whisper
// LOCAL (o audio nao sai da maquina do Radix e nao e guardado) -> volta o
// texto -> as regras de lib/vozCuradoria.ts preenchem os campos -> a ficha
// e salva como RASCUNHO (nunca aprovada: aprovar continua sendo um clique
// do curador). Cada campo preenchido aparece aqui "a conferir"; o que nao
// foi entendido vai para "Não reconhecido", com botoes de destino.
// A auditoria registra "preenchimento_por_voz".
//
// Com `embutido`, o painel deixa de flutuar e fica no topo da coluna da
// ficha (layout atual da Curadoria). A SECAO ATIVA (em destaque na coluna)
// e o destino da fala sem palavra-guia - o painel mostra "A fala vai para:
// ..." - e, depois de preencher, a coluna rola ate a secao que recebeu o
// dado (onSecao).

const API = process.env.NEXT_PUBLIC_API_URL
const DURACAO_MAXIMA_MS = 60_000

interface ItemConferir extends Alteracao {
  id: number
  conferido: boolean
}

export default function PainelVoz({
  fichaId,
  form,
  onAplicar,
  onSalvar,
  embutido = false,
  secaoAtiva,
  onSecao,
}: {
  fichaId: number
  form: FormularioFicha
  /** aplica o novo formulario e salva como rascunho (origem: voz) */
  onAplicar: (novo: FormularioFicha) => void
  onSalvar: () => void
  /** dentro da coluna da ficha (sem posicao fixa na tela) */
  embutido?: boolean
  /** secao em destaque na coluna: destino da fala sem palavra-guia */
  secaoAtiva?: SecaoFicha
  /** pede para a coluna destacar/rolar ate uma secao */
  onSecao?: (secao: SecaoFicha) => void
}) {
  const t = useTranslations('Voz')
  const tSecoes = useTranslations('Curadoria.secoes')
  const [aberto, setAberto] = useState(false)
  const [disponivel, setDisponivel] = useState<boolean | null>(null)
  const [gravando, setGravando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [transcrevendo, setTranscrevendo] = useState(false)
  const [erro, setErro] = useState('')
  const [ultimoTexto, setUltimoTexto] = useState('')
  const [conferir, setConferir] = useState<ItemConferir[]>([])
  const [naoReconhecidos, setNaoReconhecidos] = useState<(NaoReconhecido & { id: number })[]>([])
  const [historico, setHistorico] = useState<FormularioFicha[]>([])
  const [ajuda, setAjuda] = useState(false)
  const [vocabulario, setVocabulario] = useState<TermoVoz[]>([])

  const formRef = useRef(form)
  formRef.current = form
  const gravadorRef = useRef<MediaRecorder | null>(null)
  const pedacosRef = useRef<Blob[]>([])
  const relogioRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const limiteRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contadorRef = useRef(0)

  // servico de voz no ar? + vocabulario controlado
  useEffect(() => {
    fetch(`${API}/voz/saude`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { disponivel: false }))
      .then((d) => setDisponivel(Boolean(d.disponivel)))
      .catch(() => setDisponivel(false))
    fetch(`${API}/vocabulario`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.termos && setVocabulario(d.termos))
      .catch(() => {})
  }, [])

  // outra ficha: recomeca a conferencia
  useEffect(() => {
    setConferir([])
    setNaoReconhecidos([])
    historicoRef.current = []
    setHistorico([])
    setUltimoTexto('')
    setErro('')
  }, [fichaId])

  // historico para "desfazer" (ate 20 passos) - em ref para nao repetir
  // efeitos colaterais quando o React reexecuta atualizacoes de estado
  const historicoRef = useRef<FormularioFicha[]>([])
  const aplicar = useCallback(
    (novo: FormularioFicha) => {
      historicoRef.current = [...historicoRef.current.slice(-19), formRef.current]
      setHistorico(historicoRef.current)
      onAplicar(novo)
    },
    [onAplicar]
  )

  const desfazer = useCallback(() => {
    const h = historicoRef.current
    if (!h.length) return
    const anterior = h[h.length - 1]
    historicoRef.current = h.slice(0, -1)
    setHistorico(historicoRef.current)
    onAplicar(anterior)
    setConferir((c) => c.slice(0, -1))
  }, [onAplicar])

  function processarTexto(texto: string) {
    setUltimoTexto(texto)
    const r = interpretar(texto, formRef.current, vocabulario, { secaoAtiva })
    // destaca a secao que recebeu o ultimo dado (a coluna rola ate ela)
    const ultima = r.alteracoes.length ? SECAO_DO_CAMPO[r.alteracoes[r.alteracoes.length - 1].campo] : undefined
    if (ultima && onSecao) onSecao(ultima)
    if (r.alteracoes.length) {
      aplicar({ ...formRef.current, ...r.ficha })
      setConferir((c) => [
        ...c,
        ...r.alteracoes.map((a) => ({ ...a, id: ++contadorRef.current, conferido: false })),
      ])
    }
    if (r.naoReconhecidos.length) {
      setNaoReconhecidos((n) => [...n, ...r.naoReconhecidos.map((x) => ({ ...x, id: ++contadorRef.current }))])
    }
    for (const c of r.comandos) {
      if (c === 'salvar') onSalvar()
      if (c === 'desfazer') desfazer()
      if ((c === 'proxima_secao' || c === 'secao_anterior') && onSecao && secaoAtiva) {
        onSecao(secaoVizinha(secaoAtiva, c === 'proxima_secao' ? 1 : -1))
      }
    }
    if (!r.alteracoes.length && !r.naoReconhecidos.length && !r.comandos.length) setErro(t('nadaEntendido'))
  }

  async function enviar(blob: Blob) {
    setTranscrevendo(true)
    setErro('')
    try {
      const dados = new FormData()
      dados.append('arquivo', blob, blob.type.includes('mp4') ? 'trecho.mp4' : 'trecho.webm')
      const r = await fetch(`${API}/voz/transcrever`, { method: 'POST', credentials: 'include', body: dados })
      if (!r.ok) {
        let detalhe = t('erroTranscrever')
        try {
          const j = await r.json()
          if (typeof j?.detail === 'string') detalhe = j.detail
        } catch {
          // sem corpo legivel
        }
        setErro(r.status === 429 ? t('erroMuitos') : detalhe)
        return
      }
      const j = await r.json()
      const texto = (j.texto ?? '').trim()
      if (!texto) {
        setErro(t('nadaOuvido'))
        return
      }
      processarTexto(texto)
    } catch {
      setErro(t('erroTranscrever'))
    } finally {
      setTranscrevendo(false)
    }
  }

  async function iniciar() {
    setErro('')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErro(t('semSuporte'))
      return
    }
    try {
      const fluxo = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      })
      const tipo = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
      const gravador = new MediaRecorder(fluxo, tipo ? { mimeType: tipo } : undefined)
      pedacosRef.current = []
      gravador.ondataavailable = (e) => e.data.size && pedacosRef.current.push(e.data)
      gravador.onstop = () => {
        fluxo.getTracks().forEach((faixa) => faixa.stop())
        const blob = new Blob(pedacosRef.current, { type: gravador.mimeType || 'audio/webm' })
        if (blob.size > 0) enviar(blob)
      }
      gravador.start()
      gravadorRef.current = gravador
      setGravando(true)
      // embutido na coluna: continua compacto (a coluna mostra o resultado)
      if (!embutido) setAberto(true)
      setSegundos(0)
      relogioRef.current = setInterval(() => setSegundos((s) => s + 1), 1000)
      limiteRef.current = setTimeout(() => parar(), DURACAO_MAXIMA_MS)
    } catch {
      setErro(t('semPermissao'))
    }
  }

  function parar() {
    if (relogioRef.current) clearInterval(relogioRef.current)
    if (limiteRef.current) clearTimeout(limiteRef.current)
    const g = gravadorRef.current
    if (g && g.state !== 'inactive') g.stop()
    gravadorRef.current = null
    setGravando(false)
  }

  const alternar = () => (gravando ? parar() : iniciar())

  // atalho Alt+V (liga/desliga o microfone)
  const alternarRef = useRef(alternar)
  alternarRef.current = alternar
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.altKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault()
        alternarRef.current()
      }
    }
    window.addEventListener('keydown', tecla)
    return () => {
      window.removeEventListener('keydown', tecla)
      if (relogioRef.current) clearInterval(relogioRef.current)
      if (limiteRef.current) clearTimeout(limiteRef.current)
      const g = gravadorRef.current
      if (g && g.state !== 'inactive') g.stop()
    }
  }, [])

  function enviarPara(item: NaoReconhecido & { id: number }, campo: 'descricao_didatica' | 'achados_detalhe' | 'observacoes_internas') {
    const atual = formRef.current[campo].trim()
    const valor = item.texto.charAt(0).toUpperCase() + item.texto.slice(1)
    aplicar({ ...formRef.current, [campo]: atual ? `${atual}${/[.!?;,]$/.test(atual) ? '' : ';'} ${valor}` : valor })
    const nomes = { descricao_didatica: t('campoDescricao'), achados_detalhe: t('campoAchados'), observacoes_internas: t('campoObservacoes') }
    setConferir((c) => [...c, { id: ++contadorRef.current, campo, descricao: `${nomes[campo]}: ${valor}`, conferido: false }])
    setNaoReconhecidos((n) => n.filter((x) => x.id !== item.id))
    onSecao?.(SECAO_DO_CAMPO[campo])
  }

  function aplicarSugestao(item: NaoReconhecido & { id: number }, indice: number) {
    const sug = item.sugestoes[indice]
    aplicar({ ...formRef.current, ...sug.aplicar(formRef.current) })
    setConferir((c) => [...c, { id: ++contadorRef.current, campo: 'alteracoes_observadas', descricao: sug.rotulo, conferido: false }])
    setNaoReconhecidos((n) => n.filter((x) => x.id !== item.id))
  }

  const pendentes = conferir.filter((c) => !c.conferido)
  const minutos = `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`

  // ------------------------------------------------------------- recolhido
  // destino da fala (secao ativa), mostrado no painel embutido
  const destino = secaoAtiva ? (
    <p className="text-[11px] text-slate-400">
      {t('destino')} <span className="font-semibold text-teal-200">{tSecoes(secaoAtiva)}</span>
    </p>
  ) : null

  if (!aberto && embutido) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-teal-300/40 bg-base-surface px-2 py-1.5">
        <button
          type="button"
          onClick={alternar}
          disabled={transcrevendo || disponivel === false}
          aria-pressed={gravando}
          title={gravando ? t('parar') : t('falar')}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition disabled:opacity-40 ${
            gravando ? 'animate-pulse border-red-400 bg-red-500/80 text-white' : 'border-teal-300 bg-teal-500/20 text-teal-100 hover:bg-teal-500/30'
          }`}
        >
          {gravando ? <span className="h-3 w-3 rounded-sm bg-white" /> : <IconeMicrofone className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-ink">
            {gravando ? `${t('gravando')} ${minutos}` : transcrevendo ? t('transcrevendo') : t('titulo')}
          </p>
          {destino}
          {erro ? (
            <p className="truncate text-[11px] text-red-400" title={erro}>{erro}</p>
          ) : ultimoTexto ? (
            <p className="truncate text-[11px] italic text-slate-500" title={ultimoTexto}>“{ultimoTexto}”</p>
          ) : null}
        </div>
        {naoReconhecidos.length > 0 && (
          <button type="button" onClick={() => setAberto(true)} className="rounded-full bg-orange-400/90 px-2 py-0.5 text-[11px] font-bold text-black" title={t('naoReconhecido')}>
            ? {naoReconhecidos.length}
          </button>
        )}
        {pendentes.length > 0 && (
          <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-black">{t('aConferir', { quantidade: pendentes.length })}</span>
        )}
        <button type="button" onClick={() => setAberto(true)} className="rounded-full border border-white/15 px-2 py-0.5 text-xs text-slate-300 hover:border-teal-300" aria-label={t('abrirPainel')} title={t('abrirPainel')}>
          ▸
        </button>
      </div>
    )
  }

  if (!aberto) {
    return (
      <div className="fixed bottom-4 right-4 z-[60] flex items-center gap-2">
        {pendentes.length > 0 && (
          <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-black">{t('aConferir', { quantidade: pendentes.length })}</span>
        )}
        <button
          type="button"
          onClick={() => setAberto(true)}
          title={t('abrirPainel')}
          className="flex items-center gap-2 rounded-full border border-teal-300/60 bg-base-surface/95 px-4 py-2.5 text-sm font-semibold text-teal-100 shadow-2xl backdrop-blur hover:border-teal-300"
        >
          <IconeMicrofone className="h-4 w-4" />
          {t('titulo')}
        </button>
      </div>
    )
  }

  // ----------------------------------------------------------------- aberto
  return (
    <section
      className={
        embutido
          ? 'flex max-h-[45vh] w-full flex-col overflow-hidden rounded-xl border border-teal-300/40 bg-base-surface text-left'
          : 'fixed bottom-4 right-4 z-[60] flex max-h-[75vh] w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-teal-300/40 bg-base-surface/95 text-left shadow-2xl backdrop-blur-md'
      }
      aria-label={t('titulo')}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <IconeMicrofone className="h-4 w-4 text-teal-200" />
        <h2 className="text-sm font-semibold text-ink">{t('titulo')}</h2>
        <button type="button" onClick={() => setAjuda((v) => !v)} className="ml-auto rounded-full border border-white/15 px-2 text-xs text-slate-300 hover:border-teal-300" aria-expanded={ajuda}>
          ?
        </button>
        <button type="button" onClick={() => setAberto(false)} className="text-slate-400 hover:text-ink" aria-label={t('recolher')}>
          ▾
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {ajuda && (
          <div className="rounded-lg border border-white/10 bg-black/20 p-2 text-[11px] leading-relaxed text-slate-300">
            <p className="mb-1 font-semibold text-teal-200">{t('ajudaTitulo')}</p>
            <ul className="list-disc space-y-0.5 pl-4">
              {(['ajuda1', 'ajuda2', 'ajuda3', 'ajuda4', 'ajuda5', 'ajuda6', 'ajuda7', 'ajuda8'] as const).map((k) => (
                <li key={k}>{t(k)}</li>
              ))}
            </ul>
          </div>
        )}

        {disponivel === false && <p className="rounded-md bg-red-500/10 p-2 text-xs text-red-300">{t('indisponivel')}</p>}

        {/* MICROFONE */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={alternar}
            disabled={transcrevendo || disponivel === false}
            aria-pressed={gravando}
            title={gravando ? t('parar') : t('falar')}
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 transition disabled:opacity-40 ${
              gravando ? 'animate-pulse border-red-400 bg-red-500/80 text-white' : 'border-teal-300 bg-teal-500/20 text-teal-100 hover:bg-teal-500/30'
            }`}
          >
            {gravando ? <span className="h-4 w-4 rounded-sm bg-white" /> : <IconeMicrofone className="h-6 w-6" />}
          </button>
          <div className="min-w-0 text-xs">
            {gravando ? (
              <p className="font-semibold text-red-300">
                {t('gravando')} {minutos}
              </p>
            ) : transcrevendo ? (
              <p className="text-teal-200">{t('transcrevendo')}</p>
            ) : (
              <p className="text-slate-400">{t('instrucao')}</p>
            )}
            {destino}
            <p className="text-[10px] text-slate-500">{t('privacidade')}</p>
          </div>
        </div>

        {erro && <p className="text-xs text-red-400">{erro}</p>}

        {ultimoTexto && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">{t('ouvido')}</p>
            <p className="text-xs italic text-slate-300">“{ultimoTexto}”</p>
          </div>
        )}

        {/* A CONFERIR */}
        {conferir.length > 0 && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-200">{t('preenchido')}</p>
              {pendentes.length > 0 && (
                <button type="button" className="text-[11px] text-teal-200 hover:underline" onClick={() => setConferir((c) => c.map((x) => ({ ...x, conferido: true })))}>
                  {t('conferirTudo')}
                </button>
              )}
            </div>
            <ul className="space-y-1">
              {conferir.map((c) => (
                <li
                  key={c.id}
                  className={`flex items-start gap-2 rounded-md px-2 py-1 text-xs ${
                    c.conferido ? 'text-slate-400' : c.aproximada ? 'bg-orange-400/15 text-orange-100 ring-1 ring-orange-300/50' : 'bg-amber-300/10 text-amber-50 ring-1 ring-amber-300/40'
                  }`}
                >
                  <span className="min-w-0 flex-1 break-words">
                    {c.descricao}
                    {c.aproximada && !c.conferido && <span className="ml-1 text-[10px] text-orange-300">({t('aproximada')})</span>}
                  </span>
                  {!c.conferido && (
                    <button type="button" onClick={() => setConferir((l) => l.map((x) => (x.id === c.id ? { ...x, conferido: true } : x)))} className="shrink-0 text-emerald-300 hover:text-emerald-200" aria-label={t('marcarConferido')}>
                      ✓
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* NAO RECONHECIDO */}
        {naoReconhecidos.length > 0 && (
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-300">{t('naoReconhecido')}</p>
            <ul className="space-y-2">
              {naoReconhecidos.map((n) => (
                <li key={n.id} className="rounded-md border border-amber-300/30 bg-amber-300/5 p-2">
                  <p className="text-xs italic text-ink">“{n.texto}”</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {n.sugestoes.map((s, i) => (
                      <button key={i} type="button" onClick={() => aplicarSugestao(n, i)} className="rounded border border-teal-300/50 px-1.5 py-0.5 text-[11px] text-teal-100 hover:bg-teal-300/10">
                        {t('voceQuisDizer')} {s.rotulo}?
                      </button>
                    ))}
                    <button type="button" onClick={() => enviarPara(n, 'descricao_didatica')} className="rounded border border-white/20 px-1.5 py-0.5 text-[11px] text-slate-200 hover:bg-white/10">
                      → {t('campoDescricao')}
                    </button>
                    <button type="button" onClick={() => enviarPara(n, 'achados_detalhe')} className="rounded border border-white/20 px-1.5 py-0.5 text-[11px] text-slate-200 hover:bg-white/10">
                      → {t('campoAchados')}
                    </button>
                    <button type="button" onClick={() => enviarPara(n, 'observacoes_internas')} className="rounded border border-white/20 px-1.5 py-0.5 text-[11px] text-slate-200 hover:bg-white/10">
                      → {t('campoObservacoes')}
                    </button>
                    <button type="button" onClick={() => setNaoReconhecidos((l) => l.filter((x) => x.id !== n.id))} className="rounded px-1.5 py-0.5 text-[11px] text-slate-400 hover:text-red-300">
                      {t('descartar')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-white/10 px-3 py-2">
        <button type="button" onClick={desfazer} disabled={!historico.length} className="rounded-md border border-white/15 px-2 py-1 text-xs text-slate-200 hover:border-teal-300 disabled:opacity-40">
          ↶ {t('desfazer')}
        </button>
        <span className="ml-auto text-[10px] text-slate-500">{t('rodape')}</span>
      </footer>
    </section>
  )
}

function IconeMicrofone({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
    </svg>
  )
}
