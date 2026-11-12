'use client'

// APARELHOS DA REDE (etapa D, 08/11/2026): aparelhos de raio X que mandam
// as imagens direto para o Radix (protocolo DICOM, porta 4242). So o
// administrador cadastra, libera e bloqueia; o suporte ve a lista e testa a
// conexao. Aparelho nao cadastrado ou bloqueado e recusado.

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Cpu } from 'lucide-react'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import { useConfirmacao } from '../../components/useConfirmacao'
import { obterSessaoAtual } from '../../lib/sessao'

const API = process.env.NEXT_PUBLIC_API_URL
const PERFIS = ['administrador', 'suporte']

type Aparelho = {
  id: number
  nome: string
  unidade: string
  aet: string
  ip: string
  porta: number
  liberado: boolean
  total_recebidas: number
  ultimo_recebimento_em: string | null
}
type Configuracao = { aet: string; porta: number; endereco: string }
type Formulario = { id: number; nome: string; unidade: string; aet: string; ip: string; porta: string }

const VAZIO: Formulario = { id: 0, nome: '', unidade: '', aet: '', ip: '', porta: '104' }

async function lerErro(r: Response, padrao: string) {
  try {
    const d = await r.json()
    if (typeof d?.detail === 'string') return d.detail
    // erro de validacao (422): a primeira mensagem, sem o prefixo tecnico
    const msg = Array.isArray(d?.detail) ? d.detail[0]?.msg : null
    if (typeof msg === 'string') return msg.replace(/^Value error,\s*/, '')
  } catch {
    // sem corpo
  }
  return padrao
}

export default function AparelhosPage() {
  const router = useRouter()
  const t = useTranslations('Aparelhos')
  const locale = useLocale()
  const { pedirConfirmacao, quadroConfirmacao } = useConfirmacao()
  const [pronto, setPronto] = useState(false)
  const [aparelhos, setAparelhos] = useState<Aparelho[]>([])
  const [config, setConfig] = useState<Configuracao | null>(null)
  const [podeGerir, setPodeGerir] = useState(false)
  const [form, setForm] = useState<Formulario | null>(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [alerta, setAlerta] = useState('')
  const [testando, setTestando] = useState<number | null>(null)

  async function carregar() {
    const r = await fetch(`${API}/aparelhos`, { credentials: 'include' })
    if (!r.ok) {
      setErro(t('erroCarregar'))
      return
    }
    const d = await r.json()
    setAparelhos(d.aparelhos)
    setConfig(d.configuracao)
    setPodeGerir(Boolean(d.pode_gerir))
  }

  useEffect(() => {
    obterSessaoAtual().then((s) => {
      if (!s) {
        router.push('/login')
        return
      }
      if (!PERFIS.includes(s.perfil)) {
        router.push('/acesso-negado?de=/aparelhos')
        return
      }
      setPronto(true)
      carregar()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  function mostrarResultado(d: { aviso?: string | null }, ok: string) {
    setAviso(ok)
    setAlerta(d?.aviso ?? '')
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setErro('')
    const r = await fetch(`${API}/aparelhos${form.id ? `/${form.id}` : ''}`, {
      method: form.id ? 'PUT' : 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: form.nome, unidade: form.unidade, aet: form.aet, ip: form.ip, porta: Number(form.porta) || 0,
      }),
    })
    if (!r.ok) {
      setErro(await lerErro(r, t('erroSalvar')))
      return
    }
    mostrarResultado(await r.json(), t('salvo'))
    setForm(null)
    carregar()
  }

  async function mudarLiberacao(a: Aparelho) {
    if (a.liberado) {
      const sim = await pedirConfirmacao({
        titulo: t('bloquearTitulo', { nome: a.nome }),
        texto: t('bloquearTexto'),
        botao: t('bloquearSim'),
        cancelar: t('cancelar'),
      })
      if (!sim) return
    }
    setErro('')
    const r = await fetch(`${API}/aparelhos/${a.id}/${a.liberado ? 'bloquear' : 'liberar'}`, {
      method: 'POST', credentials: 'include',
    })
    if (!r.ok) {
      setErro(await lerErro(r, t('erroSalvar')))
      return
    }
    mostrarResultado(await r.json(), a.liberado ? t('bloqueado', { nome: a.nome }) : t('liberado', { nome: a.nome }))
    carregar()
  }

  async function testar(a: Aparelho) {
    setErro('')
    setAviso('')
    setAlerta('')
    setTestando(a.id)
    try {
      const r = await fetch(`${API}/aparelhos/${a.id}/testar`, { method: 'POST', credentials: 'include' })
      if (!r.ok) {
        setErro(await lerErro(r, t('erroTeste')))
        return
      }
      const d = await r.json()
      if (!d.orthanc_no_ar) setAlerta(t('testeOrthancFora'))
      else if (d.respondeu) setAviso(t('testeOk', { nome: a.nome }))
      else setAlerta(t('testeSemResposta', { nome: a.nome }))
    } finally {
      setTestando(null)
    }
  }

  const campo = (k: keyof Formulario, v: string) => form && setForm({ ...form, [k]: v })
  const data = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(locale === 'en' ? 'en-US' : 'pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : t('nunca')

  if (!pronto) {
    return <main className="flex min-h-screen items-center justify-center bg-base"><p className="text-sm text-ink-3">{t('carregando')}</p></main>
  }

  const entrada = 'w-full rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-ink'

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-w-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="titulo-pagina tela-entra">{t('titulo')}</h1>
              <p className="mt-1 max-w-3xl text-sm text-ink-2">{t('subtitulo')}</p>
            </div>
            {podeGerir && (
              <button type="button" onClick={() => { setForm({ ...VAZIO }); setErro('') }} data-teste="novo-aparelho"
                      className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover">{t('novo')}</button>
            )}
          </div>

          {aviso && <p role="status" className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300">{aviso}</p>}
          {alerta && <p role="alert" className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">{alerta}</p>}
          {erro && !form && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{erro}</p>}

          {config && (
            <section className="max-w-5xl rounded-2xl border border-base-border bg-base-surface p-4">
              <h2 className="text-base font-semibold text-ink">{t('comoConfigurar')}</h2>
              <p className="mt-1 text-sm text-ink-2">{t('comoConfigurarTexto')}</p>
              <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-base-surface2 p-3">
                  <dt className="text-xs text-ink-3">{t('aetRadix')}</dt>
                  <dd className="font-mono text-sm text-ink">{config.aet}</dd>
                </div>
                <div className="rounded-lg bg-base-surface2 p-3">
                  <dt className="text-xs text-ink-3">{t('enderecoRadix')}</dt>
                  <dd className={config.endereco ? 'font-mono text-sm text-ink' : 'text-sm text-ink-2'}>{config.endereco || t('enderecoNaoInformado')}</dd>
                </div>
                <div className="rounded-lg bg-base-surface2 p-3">
                  <dt className="text-xs text-ink-3">{t('portaRadix')}</dt>
                  <dd className="font-mono text-sm text-ink">{config.porta}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-ink-3">{t('recusados')}</p>
            </section>
          )}

          {form && (
            <form method="post" onSubmit={salvar} data-teste="form-aparelho" className="max-w-3xl space-y-4 rounded-2xl border border-base-border bg-base-surface p-4">
              <h2 className="text-base font-semibold text-ink">{form.id ? t('editarTitulo') : t('novoTitulo')}</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="ap-nome" className="mb-1 block text-sm font-medium text-ink">{t('nome')}</label>
                  <input id="ap-nome" value={form.nome} onChange={(e) => campo('nome', e.target.value)} maxLength={80} required
                         placeholder={t('nomeExemplo')} className={entrada} />
                </div>
                <div>
                  <label htmlFor="ap-unidade" className="mb-1 block text-sm font-medium text-ink">{t('unidade')}</label>
                  <input id="ap-unidade" value={form.unidade} onChange={(e) => campo('unidade', e.target.value)} maxLength={80}
                         placeholder={t('unidadeExemplo')} className={entrada} />
                </div>
                <div>
                  <label htmlFor="ap-aet" className="mb-1 block text-sm font-medium text-ink">{t('aet')}</label>
                  <input id="ap-aet" value={form.aet} onChange={(e) => campo('aet', e.target.value.toUpperCase())} maxLength={16} required
                         placeholder="RX-SALA1" className={`${entrada} font-mono`} />
                  <p className="mt-1 text-xs text-ink-3">{t('aetAjuda')}</p>
                </div>
                <div>
                  <label htmlFor="ap-ip" className="mb-1 block text-sm font-medium text-ink">{t('ip')}</label>
                  <input id="ap-ip" value={form.ip} onChange={(e) => campo('ip', e.target.value.trim())} maxLength={45} required
                         placeholder="192.168.0.25" inputMode="decimal" className={`${entrada} font-mono`} />
                  <p className="mt-1 text-xs text-ink-3">{t('ipAjuda')}</p>
                </div>
                <div>
                  <label htmlFor="ap-porta" className="mb-1 block text-sm font-medium text-ink">{t('porta')}</label>
                  <input id="ap-porta" value={form.porta} onChange={(e) => campo('porta', e.target.value.replace(/\D/g, ''))} maxLength={5} required
                         inputMode="numeric" className={`${entrada} font-mono`} />
                  <p className="mt-1 text-xs text-ink-3">{t('portaAjuda')}</p>
                </div>
              </div>
              {erro && <p role="alert" className="rounded-lg bg-red-500/10 p-2 text-sm text-red-700 dark:text-red-300">{erro}</p>}
              <div className="flex gap-2">
                <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">{t('salvar')}</button>
                <button type="button" onClick={() => { setForm(null); setErro('') }} className="rounded-lg border border-base-border px-4 py-2 text-sm text-ink">{t('cancelar')}</button>
              </div>
            </form>
          )}

          {aparelhos.length === 0 ? (
            <p className="text-sm text-ink-3">{podeGerir ? t('vazio') : t('vazioSuporte')}</p>
          ) : (
            <ul className="grid max-w-5xl grid-cols-1 gap-3 md:grid-cols-2" data-teste="lista-aparelhos">
              {aparelhos.map((a) => (
                <li key={a.id} className="min-w-0 rounded-xl border border-base-border bg-base-surface p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="flex items-center gap-2 text-base font-semibold text-ink"><Cpu aria-hidden="true" className="h-4 w-4 shrink-0" /> <span className="truncate">{a.nome}</span></h2>
                      {a.unidade && <p className="text-xs text-ink-3">{a.unidade}</p>}
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${a.liberado ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300' : 'bg-base-surface2 text-ink-2'}`}>
                      {a.liberado ? t('situacaoLiberado') : t('situacaoBloqueado')}
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <dt className="text-ink-3">{t('aet')}</dt><dd className="font-mono text-ink">{a.aet}</dd>
                    <dt className="text-ink-3">{t('ipPorta')}</dt><dd className="font-mono text-ink">{a.ip}:{a.porta}</dd>
                    <dt className="text-ink-3">{t('recebidas')}</dt><dd className="text-ink">{a.total_recebidas}</dd>
                    <dt className="text-ink-3">{t('ultimaChegada')}</dt><dd className="text-ink">{data(a.ultimo_recebimento_em)}</dd>
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs">
                    {a.liberado && (
                      <button type="button" onClick={() => testar(a)} disabled={testando === a.id} className="text-brand underline disabled:opacity-50">
                        {testando === a.id ? t('testando') : t('testar')}
                      </button>
                    )}
                    {podeGerir && (
                      <>
                        <button type="button" className="text-brand underline"
                                onClick={() => { setForm({ id: a.id, nome: a.nome, unidade: a.unidade, aet: a.aet, ip: a.ip, porta: String(a.porta) }); setErro('') }}>
                          {t('editar')}
                        </button>
                        <button type="button" onClick={() => mudarLiberacao(a)}
                                className={a.liberado ? 'text-rose-600 underline dark:text-rose-400' : 'text-emerald-700 underline dark:text-emerald-400'}>
                          {a.liberado ? t('bloquear') : t('liberar')}
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>
      {quadroConfirmacao}
    </div>
  )
}
