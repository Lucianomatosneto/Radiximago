'use client'

import { ArrowDown, ArrowUp, Camera, FileText, Images, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import Sidebar from '../../../components/Sidebar'
import Topbar from '../../../components/Topbar'
import AvisoNaoDiagnostico from '../../../components/casos/AvisoNaoDiagnostico'
import { obterSessaoAtual } from '../../../lib/sessao'
import { API, PERFIS_CADASTRO, lerErro } from '../../../lib/casos'

// UPLOAD PELA CAMERA (Etapa 2 da especificacao): o aluno, com o Radix
// aberto no navegador do celular, fotografa no negatoscopio cada
// radiografia do estudo (dente e observacao opcionais por foto), fotografa
// o termo de aceitacao assinado, preenche a ficha do paciente e envia ao
// professor (ou so para si). Data e hora sao gravadas pelo servidor.
// As fotos sao reduzidas no proprio celular (envio mais rapido) e o
// servidor ainda as regrava sem metadados e CIFRA (casos_arquivos.py).

interface Foto {
  chave: string
  arquivo: Blob
  previa: string
  dentes: string
  observacao: string
}

const LADO_MAXIMO = 2400

async function reduzir(arquivo: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' })
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * escala)
    canvas.height = Math.round(bitmap.height * escala)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.88))
    return blob || arquivo
  } catch {
    return arquivo // o servidor confere e reduz de qualquer forma
  }
}

const campo = 'w-full rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-ink outline-hidden focus:border-brand'
const rotulo = 'mb-1 block text-sm font-medium text-ink'

export default function NovaPastaPage() {
  const router = useRouter()
  const t = useTranslations('Casos')
  const [pronto, setPronto] = useState(false)
  const [opcoes, setOpcoes] = useState<{ modalidades: string[]; generos: string[]; professores: { id: number; nome: string }[]; max_fotos: number } | null>(null)
  const [fotos, setFotos] = useState<Foto[]>([])
  const [termo, setTermo] = useState<{ arquivo: Blob; previa: string } | null>(null)
  const [paciente, setPaciente] = useState({ nome: '', nascimento: '', genero: '', contato: '', prontuario: '', observacoes: '' })
  const [modalidade, setModalidade] = useState('')
  const [descricao, setDescricao] = useState('')
  const [professorId, setProfessorId] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const camera = useRef<HTMLInputElement>(null)
  const galeria = useRef<HTMLInputElement>(null)
  const cameraTermo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    obterSessaoAtual().then(async (s) => {
      if (!s) return router.push('/login')
      if (!PERFIS_CADASTRO.includes(s.perfil)) return router.push('/acesso-negado?de=/casos/novo')
      const r = await fetch(`${API}/casos/opcoes`, { credentials: 'include' })
      if (r.ok) setOpcoes(await r.json())
      setPronto(true)
    })
  }, [router])

  async function adicionar(lista: FileList | null) {
    if (!lista) return
    const novas: Foto[] = []
    for (const arq of Array.from(lista)) {
      const blob = await reduzir(arq)
      novas.push({ chave: `${Date.now()}-${Math.random()}`, arquivo: blob, previa: URL.createObjectURL(blob), dentes: '', observacao: '' })
    }
    setFotos((atual) => [...atual, ...novas].slice(0, opcoes?.max_fotos ?? 30))
  }

  async function definirTermo(lista: FileList | null) {
    const arq = lista?.[0]
    if (!arq) return
    const blob = await reduzir(arq)
    setTermo({ arquivo: blob, previa: URL.createObjectURL(blob) })
  }

  const mudarFoto = (chave: string, parcial: Partial<Foto>) => setFotos((l) => l.map((f) => (f.chave === chave ? { ...f, ...parcial } : f)))
  const mover = (i: number, d: number) =>
    setFotos((l) => {
      const n = [...l]
      const j = i + d
      if (j < 0 || j >= n.length) return l
      ;[n[i], n[j]] = [n[j], n[i]]
      return n
    })

  const faltando = [
    !fotos.length && t('novo.faltaFotos'),
    !termo && t('novo.faltaTermo'),
    paciente.nome.trim().length < 3 && t('novo.nome'),
    !paciente.nascimento && t('novo.nascimento'),
    !paciente.genero && t('novo.genero'),
    paciente.contato.trim().length < 3 && t('novo.contato'),
    !modalidade && t('novo.modalidade'),
    descricao.trim().length < 3 && t('novo.descricao'),
  ].filter(Boolean) as string[]

  async function enviar() {
    if (faltando.length) {
      setErro(t('novo.faltam', { lista: faltando.join(', ') }))
      return
    }
    setErro('')
    setEnviando(true)
    try {
      const dados = {
        paciente: { ...paciente, prontuario: paciente.prontuario || null, observacoes: paciente.observacoes || null },
        modalidade,
        descricao,
        professor_id: professorId ? Number(professorId) : null,
        fotos: fotos.map((f) => ({
          dentes: (f.dentes.match(/\d{2}/g) || []).map(Number),
          observacao: f.observacao || null,
        })),
      }
      const form = new FormData()
      form.append('dados', JSON.stringify(dados))
      fotos.forEach((f, i) => form.append('fotos', f.arquivo, `foto-${i + 1}.jpg`))
      form.append('termo', termo!.arquivo, 'termo.jpg')
      const r = await fetch(`${API}/casos`, { method: 'POST', credentials: 'include', body: form })
      if (!r.ok) {
        setErro(await lerErro(r, t('novo.erroEnviar')))
        return
      }
      const caso = await r.json()
      router.push(`/casos/${caso.id}?enviada=1`)
    } catch {
      setErro(t('novo.erroEnviar'))
    } finally {
      setEnviando(false)
    }
  }

  if (!pronto) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-base">
        <p className="text-sm text-slate-400">{t('carregando')}</p>
      </main>
    )
  }

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar recolhivel />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 p-3 sm:p-6">
          <div>
            <h1 className="titulo-pagina tela-entra">{t('novo.titulo')}</h1>
            <p className="mt-1 text-sm text-slate-400">{t('novo.subtitulo')}</p>
          </div>
          <AvisoNaoDiagnostico />

          {/* 1. fotos */}
          <section className="space-y-3 rounded-2xl border border-base-border bg-base-surface p-4">
            <h2 className="text-base font-semibold text-ink">1. {t('novo.fotosTitulo')}</h2>
            <p className="text-xs text-slate-500">{t('novo.fotosAjuda')}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => camera.current?.click()} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white" aria-label={t('novo.abrirCamera')}>
                <Camera aria-hidden="true" className="h-6 w-6" /> {t('novo.abrirCamera')}
              </button>
              <button type="button" onClick={() => galeria.current?.click()} className="rounded-xl border border-base-border px-4 py-3 text-sm text-ink">
                <Images aria-hidden="true" className="mr-1 inline h-4 w-4 align-[-2px]" />{t('novo.escolherGaleria')}
              </button>
            </div>
            <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { adicionar(e.target.files); e.target.value = '' }} data-teste="camera" />
            <input ref={galeria} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => { adicionar(e.target.files); e.target.value = '' }} data-teste="galeria" />

            {fotos.length > 0 && <p className="text-sm font-medium text-ink">{t('novo.quantasFotos', { n: fotos.length })}</p>}
            <ol className="space-y-3">
              {fotos.map((f, i) => (
                <li key={f.chave} className="flex flex-col gap-3 rounded-xl border border-base-border p-3 sm:flex-row">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.previa} alt={t('novo.fotoN', { n: i + 1 })} className="h-40 w-full rounded-lg bg-black object-contain sm:w-40" />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-ink">{t('novo.fotoN', { n: i + 1 })}</span>
                      <span className="flex gap-1">
                        <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="rounded border border-base-border px-2 text-sm disabled:opacity-30" aria-label={t('novo.subir')}><ArrowUp aria-hidden="true" className="h-4 w-4" /></button>
                        <button type="button" onClick={() => mover(i, 1)} disabled={i === fotos.length - 1} className="rounded border border-base-border px-2 text-sm disabled:opacity-30" aria-label={t('novo.descer')}><ArrowDown aria-hidden="true" className="h-4 w-4" /></button>
                        <button type="button" onClick={() => setFotos((l) => l.filter((x) => x.chave !== f.chave))} className="rounded border border-red-400/50 px-2 text-sm text-red-500" aria-label={t('novo.remover')}><X aria-hidden="true" className="h-4 w-4" /></button>
                      </span>
                    </div>
                    <input value={f.dentes} onChange={(e) => mudarFoto(f.chave, { dentes: e.target.value })} className={campo} placeholder={t('novo.dentesExemplo')} aria-label={t('novo.dentes')} inputMode="numeric" />
                    <textarea value={f.observacao} onChange={(e) => mudarFoto(f.chave, { observacao: e.target.value })} rows={2} maxLength={2000} className={campo} placeholder={t('novo.observacaoFoto')} aria-label={t('novo.observacaoFoto')} />
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* 2. termo */}
          <section className="space-y-3 rounded-2xl border border-base-border bg-base-surface p-4">
            <h2 className="text-base font-semibold text-ink">2. {t('novo.termoTitulo')}</h2>
            <p className="text-xs text-slate-500">{t('novo.termoAjuda')}</p>
            <button type="button" onClick={() => cameraTermo.current?.click()} className="rounded-xl border border-brand px-4 py-3 text-sm font-semibold text-brand">
              <FileText aria-hidden="true" className="mr-1 inline h-4 w-4 align-[-2px]" />{termo ? t('novo.trocarTermo') : t('novo.fotografarTermo')}
            </button>
            <input ref={cameraTermo} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { definirTermo(e.target.files); e.target.value = '' }} data-teste="termo" />
            {termo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={termo.previa} alt={t('novo.termoTitulo')} className="h-40 rounded-lg bg-black object-contain" />
            )}
          </section>

          {/* 3. ficha */}
          <section className="space-y-3 rounded-2xl border border-base-border bg-base-surface p-4">
            <h2 className="text-base font-semibold text-ink">3. {t('novo.fichaTitulo')}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="p-nome" className={rotulo}>{t('novo.nome')} *</label>
                <input id="p-nome" value={paciente.nome} maxLength={200} onChange={(e) => setPaciente({ ...paciente, nome: e.target.value })} className={campo} autoComplete="off" />
              </div>
              <div>
                <label htmlFor="p-nasc" className={rotulo}>{t('novo.nascimento')} *</label>
                <input id="p-nasc" type="date" value={paciente.nascimento} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setPaciente({ ...paciente, nascimento: e.target.value })} className={campo} />
              </div>
              <div>
                <label htmlFor="p-gen" className={rotulo}>{t('novo.genero')} *</label>
                <select id="p-gen" value={paciente.genero} onChange={(e) => setPaciente({ ...paciente, genero: e.target.value })} className={campo}>
                  <option value="">{t('novo.escolha')}</option>
                  {opcoes?.generos.map((g) => <option key={g} value={g}>{t(`generos.${g}`)}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="p-cont" className={rotulo}>{t('novo.contato')} *</label>
                <input id="p-cont" value={paciente.contato} maxLength={100} inputMode="tel" onChange={(e) => setPaciente({ ...paciente, contato: e.target.value })} className={campo} placeholder={t('novo.contatoExemplo')} />
              </div>
              <div>
                <label htmlFor="p-pront" className={rotulo}>{t('novo.prontuario')}</label>
                <input id="p-pront" value={paciente.prontuario} maxLength={50} onChange={(e) => setPaciente({ ...paciente, prontuario: e.target.value })} className={campo} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="p-obs" className={rotulo}>{t('novo.outrosDados')}</label>
                <textarea id="p-obs" value={paciente.observacoes} rows={2} maxLength={4000} onChange={(e) => setPaciente({ ...paciente, observacoes: e.target.value })} className={campo} placeholder={t('novo.outrosDadosExemplo')} />
              </div>
              <div>
                <label htmlFor="p-mod" className={rotulo}>{t('novo.modalidade')} *</label>
                <select id="p-mod" value={modalidade} onChange={(e) => setModalidade(e.target.value)} className={campo}>
                  <option value="">{t('novo.escolha')}</option>
                  {opcoes?.modalidades.map((m) => <option key={m} value={m}>{t(`modalidades.${m}`)}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="p-prof" className={rotulo}>{t('novo.professor')} *</label>
                <select id="p-prof" value={professorId} onChange={(e) => setProfessorId(e.target.value)} className={campo}>
                  <option value="">{t('novo.soParaMim')}</option>
                  {opcoes?.professores.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
                {/* 01/11/2026 (QA perfil professor): deixar claro quem ve a pasta */}
                <p className="mt-1 text-xs text-slate-500">{t('novo.quemVePasta')}</p>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="p-desc" className={rotulo}>{t('novo.descricao')} *</label>
                <textarea id="p-desc" value={descricao} rows={4} maxLength={8000} onChange={(e) => setDescricao(e.target.value)} className={campo} placeholder={t('novo.descricaoExemplo')} />
              </div>
            </div>
            <p className="text-xs text-slate-500">{t('novo.dataAutomatica')}</p>
          </section>

          {erro && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300" role="alert">{erro}</p>}
          <button type="button" onClick={enviar} disabled={enviando} className="w-full rounded-xl bg-brand px-4 py-4 text-base font-semibold text-white disabled:opacity-50">
            {enviando ? t('novo.enviando') : professorId ? t('novo.enviarProfessor') : t('novo.salvarParaMim')}
          </button>
        </main>
      </div>
    </div>
  )
}
