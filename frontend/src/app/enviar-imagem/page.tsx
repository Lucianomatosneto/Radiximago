'use client'

// ENVIAR IMAGEM (etapa B, 08/11/2026; Fase 1 da foto pelo celular, 10/11/2026)
// - FOTO da radiografia (negatoscopio, celular ou galeria): fluxo proprio
//   com janela de 5 minutos, ajuste/tarja no aparelho e confirmacao de que
//   nao ha dados do paciente (components/envios/EnvioFotoCelular.tsx).
// - ARQUIVO DICOM do computador: este formulario (so DICOM).
// - Estudante: "So para mim" (fica em Minhas imagens) ou "Enviar para
//   analise" de UM professor ou curador, que decide colocar na fila de
//   curadoria ou devolver com um recado.
// - Professor, curador e administrador: fila de curadoria ou "So para mim".
// A foto vira DICOM no servidor, sem os dados do celular, e passa pela mesma
// anonimizacao de qualquer imagem. So o curador publica no banco geral.

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Camera, FileUp, Send } from 'lucide-react'
import EnvioFotoCelular from '../../components/envios/EnvioFotoCelular'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import SeletorPessoasGrupos, { type Pessoa } from '../../components/envios/SeletorPessoasGrupos'
import { obterSessaoAtual, type SessaoUsuario } from '../../lib/sessao'

const API = process.env.NEXT_PUBLIC_API_URL
const PERFIS_QUE_ENVIAM = ['estudante', 'professor', 'curador', 'administrador']
type Destino = 'pessoal' | 'analise' | 'fila'
type Analista = { id: number; nome: string; perfil: string }
type Resultado = { nome: string; ok: boolean; texto: string }

const campo =
  'w-full rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-ink outline-hidden focus:border-brand'

async function lerErro(r: Response, padrao: string) {
  try {
    const d = await r.json()
    if (typeof d?.detail === 'string') return d.detail
    if (Array.isArray(d?.detail) && d.detail[0]?.msg) return String(d.detail[0].msg)
  } catch {
    // sem corpo legivel
  }
  return padrao
}

export default function EnviarImagemPage() {
  const router = useRouter()
  const t = useTranslations('EnviarImagem')
  const [sessao, setSessao] = useState<SessaoUsuario | null>(null)
  const [arquivos, setArquivos] = useState<File[]>([])
  const [previas, setPrevias] = useState<string[]>([])
  const [destino, setDestino] = useState<Destino>('pessoal')
  const [analistas, setAnalistas] = useState<Analista[]>([])
  const [analistaId, setAnalistaId] = useState('')
  const [nota, setNota] = useState('')
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [grupos, setGrupos] = useState<number[]>([])
  const [enviando, setEnviando] = useState(false)
  const [resultados, setResultados] = useState<Resultado[]>([])
  const [erro, setErro] = useState('')
  const [modoFoto, setModoFoto] = useState(false)
  const entradaArquivo = useRef<HTMLInputElement>(null)

  const ehEstudante = sessao?.perfil === 'estudante'

  useEffect(() => {
    void obterSessaoAtual().then((s) => {
      if (!s) {
        router.push('/login')
        return
      }
      if (!PERFIS_QUE_ENVIAM.includes(s.perfil)) {
        router.push('/acesso-negado?de=/enviar-imagem')
        return
      }
      setSessao(s)
      setDestino(s.perfil === 'estudante' ? 'pessoal' : 'fila')
      if (s.perfil === 'estudante') {
        fetch(`${API}/envios/analistas`, { credentials: 'include' })
          .then((r) => (r.ok ? r.json() : { pessoas: [] }))
          .then((d) => setAnalistas(d.pessoas ?? []))
          .catch(() => setAnalistas([]))
      }
    })
  }, [router])

  // miniaturas das fotos escolhidas (DICOM nao tem previa no navegador)
  useEffect(() => {
    const urls = arquivos.map((a) => (a.type.startsWith('image/') ? URL.createObjectURL(a) : ''))
    setPrevias(urls)
    return () => urls.forEach((u) => u && URL.revokeObjectURL(u))
  }, [arquivos])

  function escolher(lista: FileList | null) {
    if (!lista?.length) return
    // Copia os arquivos AGORA: logo depois o campo e limpo (value = '') e o
    // navegador esvazia essa mesma FileList; se a copia ficasse para depois
    // (dentro do setArquivos), a foto se perdia e a lista ficava vazia.
    const novos = Array.from(lista)
    setResultados([])
    setErro('')
    setArquivos((atuais) => [...atuais, ...novos].slice(0, 20))
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (!arquivos.length) {
      setErro(t('escolhaArquivo'))
      return
    }
    if (destino === 'analise' && !analistaId) {
      setErro(t('escolhaAnalista'))
      return
    }
    setEnviando(true)
    const saida: Resultado[] = []
    for (const arquivo of arquivos) {
      const dados = new FormData()
      dados.append('arquivo', arquivo)
      dados.append('destino', destino)
      if (destino === 'analise') {
        dados.append('analista_id', analistaId)
        if (nota.trim()) dados.append('nota', nota.trim())
      }
      if (!ehEstudante) {
        if (pessoas.length) dados.append('pessoas', pessoas.map((p) => p.id).join(','))
        if (grupos.length) dados.append('grupos', grupos.join(','))
      }
      try {
        const r = await fetch(`${API}/envios`, { method: 'POST', credentials: 'include', body: dados })
        const corpo = r.ok ? await r.json() : null
        saida.push(r.ok
          ? { nome: arquivo.name, ok: true, texto: t(`enviado.${destino}`) + (corpo?.enviada_para ? ` ${t('enviadoPessoas', { n: corpo.enviada_para })}` : '') }
          : { nome: arquivo.name, ok: false, texto: await lerErro(r, t('erroEnviar')) })
      } catch {
        saida.push({ nome: arquivo.name, ok: false, texto: t('erroConexao') })
      }
    }
    setResultados(saida)
    setArquivos(saida.some((r) => !r.ok) ? arquivos.filter((_, i) => !saida[i].ok) : [])
    setEnviando(false)
  }

  if (!sessao) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-base">
        <p className="text-sm text-slate-400">{t('carregando')}</p>
      </main>
    )
  }

  const opcoes: Destino[] = ehEstudante ? ['pessoal', 'analise'] : ['fila', 'pessoal']

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-w-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
          <div>
            <h1 className="titulo-pagina tela-entra">{t('titulo')}</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">{t(ehEstudante ? 'subtituloEstudante' : 'subtituloEquipe')}</p>
          </div>

          {modoFoto ? (
            <EnvioFotoCelular opcoes={opcoes} analistas={analistas} onSair={() => setModoFoto(false)} />
          ) : (
            <section className="max-w-3xl rounded-2xl border border-brand/40 bg-brand/5 p-4 sm:p-6">
              <h2 className="text-base font-semibold text-ink">{t('foto.titulo')}</h2>
              <p className="mt-1 text-sm text-ink-2">{t('foto.explica')}</p>
              <button type="button" onClick={() => setModoFoto(true)} data-teste="abrir-envio-foto"
                      className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-white hover:bg-brand-hover sm:w-auto">
                <Camera aria-hidden="true" className="h-5 w-5" /> {t('foto.comecar')}
              </button>
            </section>
          )}

          {!modoFoto && (
          <form method="post" onSubmit={enviar} className="max-w-3xl space-y-5 rounded-2xl border border-base-border bg-base-surface p-4 sm:p-6">
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-ink">{t('passo1')}</legend>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => entradaArquivo.current?.click()}
                  className="inline-flex items-center gap-2 rounded-lg border border-base-border px-4 py-2 text-sm text-ink hover:border-brand"
                >
                  <FileUp aria-hidden="true" className="h-4 w-4" /> {t('escolherArquivo')}
                </button>
              </div>
              <input ref={entradaArquivo} type="file" multiple accept=".dcm,application/dicom"
                     className="sr-only" aria-label={t('escolherArquivo')}
                     onChange={(e) => { escolher(e.target.files); e.target.value = '' }} />
              <p className="mt-2 text-xs text-ink-3">{t('ajudaArquivo')}</p>
              {arquivos.length > 0 && (
                <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4" data-teste="arquivos-escolhidos">
                  {arquivos.map((a, i) => (
                    <li key={`${a.name}-${i}`} className="overflow-hidden rounded-lg border border-base-border bg-base-surface2 text-xs">
                      {previas[i] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={previas[i]} alt={a.name} className="h-24 w-full object-cover" />
                      ) : (
                        <div className="flex h-24 items-center justify-center text-ink-3">DICOM</div>
                      )}
                      <div className="flex items-center justify-between gap-1 p-1.5">
                        <span className="truncate text-ink" title={a.name}>{a.name}</span>
                        <button type="button" onClick={() => setArquivos(arquivos.filter((_, j) => j !== i))}
                                className="text-ink-3 hover:text-rose-500" aria-label={t('tirarDaLista', { nome: a.name })}>×</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-sm font-medium text-ink">{t('passo2')}</legend>
              <div className="space-y-2">
                {opcoes.map((op) => (
                  <label key={op} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${destino === op ? 'border-brand bg-brand/5' : 'border-base-border'}`}>
                    <input type="radio" name="destino" value={op} checked={destino === op} onChange={() => setDestino(op)} className="mt-1" />
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
                  <label htmlFor="analista" className="mb-1 block text-sm font-medium text-ink">{t('quemAnalisa')}</label>
                  <select id="analista" value={analistaId} onChange={(e) => setAnalistaId(e.target.value)} className={campo}>
                    <option value="">{t('escolhaPessoa')}</option>
                    {analistas.map((p) => (
                      <option key={p.id} value={p.id}>{p.nome} ({t(`perfis.${p.perfil}`)})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="nota" className="mb-1 block text-sm font-medium text-ink">{t('recado')}</label>
                  <textarea id="nota" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} rows={3}
                            className={campo} placeholder={t('recadoExemplo')} />
                </div>
              </div>
            )}

            {!ehEstudante && (
              <fieldset>
                <legend className="mb-1 text-sm font-medium text-ink">{t('passo3')}</legend>
                <p className="mb-2 text-xs text-ink-2">{t('passo3Explica')}</p>
                <SeletorPessoasGrupos pessoas={pessoas} grupos={grupos} aoMudar={(p, g) => { setPessoas(p); setGrupos(g) }} />
              </fieldset>
            )}

            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-ink-2">{t('avisoDados')}</p>

            {erro && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300" role="alert">{erro}</p>}

            <button type="submit" disabled={enviando}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50">
              <Send aria-hidden="true" className="h-4 w-4" />
              {enviando ? t('enviando') : t('enviar', { quantidade: arquivos.length })}
            </button>
          </form>
          )}

          {resultados.length > 0 && (
            <section aria-live="polite" className="max-w-3xl space-y-2" data-teste="resultados-envio">
              {resultados.map((r, i) => (
                <p key={i} className={`rounded-lg p-3 text-sm ${r.ok ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' : 'bg-red-500/10 text-red-700 dark:text-red-300'}`}>
                  <strong>{r.nome}:</strong> {r.texto}
                </p>
              ))}
              <button type="button" onClick={() => router.push('/minhas-imagens')} className="text-sm text-brand underline">
                {t('verMinhasImagens')}
              </button>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}
