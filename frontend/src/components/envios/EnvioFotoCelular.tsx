'use client'

// ENVIO DA FOTO DO NEGATOSCOPIO PELO CELULAR (Fase 1, 10/11/2026)
// docs/ESPECIFICACAO_FASE1_FOTO_CELULAR.md
//
// 1. "Enviar foto" abre uma JANELA no servidor (/envios/foto/iniciar): o
//    servidor devolve um comprovante de uso unico e a hora de termino pelo
//    relogio DELE. A contagem usa a diferenca entre o relogio do servidor e o
//    do celular - mudar a hora do celular nao muda nada.
// 2. Tirar foto (camera) ou escolher da galeria -> ajustar (girar, recortar,
//    tarja) -> confirmar que nao ha dados do paciente -> destino -> enviar.
// 3. O navegador NAO guarda o comprovante (ASVS 14.3.3: so preferencias no
//    navegador). Se o celular recarregar a pagina ao voltar da camera, a tela
//    pergunta ao servidor (/envios/foto/janela): a janela continua valendo,
//    com o mesmo prazo, e so a foto precisa ser refeita.
// 4. Acabou o tempo: a foto e descartada do celular e recomeca do inicio.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Camera, ImageUp, Send, Timer } from 'lucide-react'
import EditorFoto from './EditorFoto'

const API = process.env.NEXT_PUBLIC_API_URL
const AVISO_SEGUNDOS = 60

type Destino = 'pessoal' | 'analise' | 'fila'
type Analista = { id: number; nome: string; perfil: string }
type Janela = { comprovante: string; expiraServidor: number; diferenca: number }
type Etapa = 'inicio' | 'foto' | 'ajuste' | 'dados' | 'feito' | 'expirou'

async function lerErro(r: Response, padrao: string) {
  try {
    const d = await r.json()
    if (typeof d?.detail === 'string') return d.detail
  } catch {
    // sem corpo legivel
  }
  return padrao
}

export default function EnvioFotoCelular({
  opcoes,
  analistas,
  onSair,
}: {
  opcoes: Destino[]
  analistas: Analista[]
  onSair: () => void
}) {
  const t = useTranslations('EnviarImagem')
  const tf = useTranslations('EnviarImagem.foto')
  const [janela, setJanela] = useState<Janela | null>(null)
  const [restante, setRestante] = useState(0)
  const [etapa, setEtapa] = useState<Etapa>('inicio')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [foto, setFoto] = useState<Blob | null>(null)
  const [previa, setPrevia] = useState('')
  const [confirmado, setConfirmado] = useState(false)
  const [destino, setDestino] = useState<Destino>(opcoes[0])
  const [analistaId, setAnalistaId] = useState('')
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const camera = useRef<HTMLInputElement>(null)
  const galeria = useRef<HTMLInputElement>(null)
  const iniciou = useRef(false)

  const descartar = useCallback(() => {
    setArquivo(null)
    setFoto(null)
    setConfirmado(false)
  }, [])

  const abrirJanela = useCallback(async () => {
    setErro('')
    setMensagem('')
    descartar()
    try {
      const r = await fetch(`${API}/envios/foto/iniciar`, { method: 'POST', credentials: 'include' })
      if (!r.ok) {
        setErro(await lerErro(r, tf('erroAbrir')))
        return
      }
      const d = await r.json()
      const nova: Janela = {
        comprovante: d.comprovante,
        expiraServidor: Date.parse(d.expira_em),
        diferenca: Date.parse(d.agora_servidor) - Date.now(),
      }
      setJanela(nova)
      setEtapa('foto')
    } catch {
      setErro(t('erroConexao'))
    }
  }, [descartar, t, tf])

  // ao abrir: retoma a janela guardada (pagina recarregada) ou abre uma nova
  useEffect(() => {
    if (iniciou.current) return // uma janela so, mesmo se o efeito rodar duas vezes
    iniciou.current = true
    fetch(`${API}/envios/foto/janela`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.aberta) {
          setJanela({
            comprovante: d.comprovante,
            expiraServidor: Date.parse(d.expira_em),
            diferenca: Date.parse(d.agora_servidor) - Date.now(),
          })
          setEtapa('foto')
          setMensagem(tf('janelaRetomada'))
        } else {
          abrirJanela()
        }
      })
      .catch(() => abrirJanela())
  }, [abrirJanela, tf])

  // contagem regressiva pelo relogio do servidor
  useEffect(() => {
    if (!janela || etapa === 'feito' || etapa === 'expirou') return
    const passo = () => {
      const s = Math.max(0, Math.ceil((janela.expiraServidor - (Date.now() + janela.diferenca)) / 1000))
      setRestante(s)
      if (s <= 0) {
        descartar()
        setEtapa('expirou')
      }
    }
    passo()
    const id = window.setInterval(passo, 500)
    return () => window.clearInterval(id)
  }, [janela, etapa, descartar])

  useEffect(() => {
    if (!foto) {
      setPrevia('')
      return
    }
    const url = URL.createObjectURL(foto)
    setPrevia(url)
    return () => URL.revokeObjectURL(url)
  }, [foto])

  function escolher(lista: FileList | null) {
    const f = lista?.[0]
    if (!f) return
    setErro('')
    setArquivo(f)
    setEtapa('ajuste')
  }

  async function enviar() {
    if (!janela || !foto) return
    setErro('')
    if (!confirmado) {
      setErro(tf('confirmeSemDados'))
      return
    }
    if (destino === 'analise' && !analistaId) {
      setErro(t('escolhaAnalista'))
      return
    }
    setEnviando(true)
    const dados = new FormData()
    dados.append('arquivo', foto, 'foto.jpg')
    dados.append('comprovante', janela.comprovante)
    dados.append('destino', destino)
    dados.append('confirmacao_sem_identificacao', 'true')
    if (destino === 'analise') {
      dados.append('analista_id', analistaId)
      if (nota.trim()) dados.append('nota', nota.trim())
    }
    try {
      const r = await fetch(`${API}/envios/foto`, { method: 'POST', credentials: 'include', body: dados })
      if (r.ok) {
        descartar()
        setMensagem(`${tf('recebida')} ${t(`enviado.${destino}`)}`)
        setEtapa('feito')
      } else if (r.status === 410 || r.status === 409) {
        descartar()
        setErro(await lerErro(r, tf('tempoAcabou')))
        setEtapa('expirou')
      } else {
        setErro(await lerErro(r, t('erroEnviar')))
      }
    } catch {
      setErro(t('erroConexao'))
    } finally {
      setEnviando(false)
    }
  }

  const minutos = Math.floor(restante / 60)
  const segundos = String(restante % 60).padStart(2, '0')
  const pouco = restante > 0 && restante <= AVISO_SEGUNDOS
  const botaoPrincipal =
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50'
  const botaoSecundario =
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-base-border px-4 text-sm text-ink hover:border-brand'

  return (
    <section className="max-w-3xl space-y-4 rounded-2xl border border-base-border bg-base-surface p-4 sm:p-6" data-teste="envio-foto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-ink">{tf('titulo')}</h2>
        {janela && etapa !== 'feito' && etapa !== 'expirou' && (
          <p role="timer" aria-live={pouco ? 'assertive' : 'off'} data-teste="contagem"
             className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold tabular-nums ${
               pouco ? 'bg-amber-500/20 text-amber-800 dark:text-amber-200' : 'bg-brand/10 text-ink'}`}>
            <Timer aria-hidden="true" className="h-4 w-4" /> {minutos}:{segundos}
          </p>
        )}
      </div>
      {pouco && etapa !== 'feito' && <p className="text-sm text-amber-800 dark:text-amber-200" role="alert">{tf('falta1Minuto')}</p>}
      {mensagem && <p className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300" role="status">{mensagem}</p>}
      {erro && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300" role="alert">{erro}</p>}

      {etapa === 'foto' && (
        <div className="space-y-3">
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
            <li>{tf('dica1')}</li>
            <li>{tf('dica2')}</li>
            <li>{tf('dica3')}</li>
          </ul>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={() => camera.current?.click()} className={botaoPrincipal} data-teste="foto-camera">
              <Camera aria-hidden="true" className="h-5 w-5" /> {t('tirarFoto')}
            </button>
            <button type="button" onClick={() => galeria.current?.click()} className={botaoSecundario} data-teste="foto-galeria">
              <ImageUp aria-hidden="true" className="h-5 w-5" /> {tf('escolherGaleria')}
            </button>
          </div>
          {/* capture="environment": no celular abre direto a camera de tras */}
          <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only"
                 aria-label={t('tirarFoto')} onChange={(e) => { escolher(e.target.files); e.target.value = '' }} />
          <input ref={galeria} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
                 aria-label={tf('escolherGaleria')} data-teste="foto-entrada-galeria"
                 onChange={(e) => { escolher(e.target.files); e.target.value = '' }} />
        </div>
      )}

      {etapa === 'ajuste' && arquivo && (
        <EditorFoto
          arquivo={arquivo}
          onPronto={(blob) => { setFoto(blob); setEtapa('dados') }}
          onCancelar={() => { setArquivo(null); setEtapa('foto') }}
        />
      )}

      {etapa === 'dados' && foto && (
        <div className="space-y-4">
          {previa && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previa} alt={tf('previa')} className="max-h-64 rounded-lg border border-base-border object-contain" />
          )}
          <button type="button" onClick={() => setEtapa('ajuste')} className="text-sm text-brand underline">{tf('voltarAjuste')}</button>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
            <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)}
                   className="mt-0.5 h-5 w-5 accent-teal-500" data-teste="confirmacao-sem-dados" />
            <span className="text-sm text-ink">{tf('confirmacao')}</span>
          </label>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink">{t('passo2')}</legend>
            <div className="space-y-2">
              {opcoes.map((op) => (
                <label key={op} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${destino === op ? 'border-brand bg-brand/5' : 'border-base-border'}`}>
                  <input type="radio" name="destino-foto" value={op} checked={destino === op} onChange={() => setDestino(op)} className="mt-1" />
                  <span>
                    <span className="block text-sm font-medium text-ink">{t(`destinos.${op}.titulo`)}</span>
                    <span className="block text-xs text-ink-2">{t(`destinos.${op}.explica`)}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {destino === 'analise' && (
            <div className="space-y-3">
              <div>
                <label htmlFor="analista-foto" className="mb-1 block text-sm font-medium text-ink">{t('quemAnalisa')}</label>
                <select id="analista-foto" value={analistaId} onChange={(e) => setAnalistaId(e.target.value)}
                        className="min-h-11 w-full rounded-lg border border-base-border bg-base-surface2 px-3 text-sm text-ink">
                  <option value="">{t('escolhaPessoa')}</option>
                  {analistas.map((p) => (
                    <option key={p.id} value={p.id}>{p.nome} ({t(`perfis.${p.perfil}`)})</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="nota-foto" className="mb-1 block text-sm font-medium text-ink">{t('recado')}</label>
                <textarea id="nota-foto" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} rows={3}
                          className="w-full rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-ink"
                          placeholder={t('recadoExemplo')} />
              </div>
            </div>
          )}

          <button type="button" onClick={enviar} disabled={enviando || !confirmado} className={`${botaoPrincipal} w-full sm:w-auto`}
                  data-teste="enviar-foto">
            <Send aria-hidden="true" className="h-4 w-4" /> {enviando ? t('enviando') : tf('enviar')}
          </button>
        </div>
      )}

      {(etapa === 'feito' || etapa === 'expirou') && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {etapa === 'expirou' && !erro && <p className="text-sm text-ink">{tf('tempoAcabou')}</p>}
          <button type="button" onClick={abrirJanela} className={botaoPrincipal} data-teste="nova-foto">
            <Camera aria-hidden="true" className="h-4 w-4" /> {etapa === 'feito' ? tf('outraFoto') : tf('recomecar')}
          </button>
          <button type="button" onClick={onSair} className={botaoSecundario}>{tf('sair')}</button>
        </div>
      )}

      {etapa !== 'feito' && etapa !== 'expirou' && (
        <button type="button" onClick={onSair} className="text-xs text-ink-3 underline">
          {tf('cancelar')}
        </button>
      )}
      <p className="text-xs text-ink-3">{tf('avisoUso')}</p>
    </section>
  )
}
