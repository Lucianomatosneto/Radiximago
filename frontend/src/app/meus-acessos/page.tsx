'use client'

// "Meus acessos" (OWASP ASVS 7.5.2): onde a conta esta aberta agora -
// aparelho resumido ("Chrome · Windows"), endereco de rede, quando entrou e
// o ultimo uso. O usuario encerra o que nao reconhece (ex.: esqueceu o login
// num computador da clinica). So mostra/encerra acessos da propria conta;
// a API recebe um RESUMO do identificador da sessao, nunca o identificador.

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import { obterSessaoAtual } from '../../lib/sessao'

interface Acesso {
  id: string
  aparelho: string | null
  ip: string | null
  criada_em: string | null
  ultimo_uso: string | null
  atual: boolean
}

const API = process.env.NEXT_PUBLIC_API_URL

export default function MeusAcessosPage() {
  const t = useTranslations('MeusAcessos')
  const tComum = useTranslations('Comum')
  const idioma = useLocale()
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)
  const [acessos, setAcessos] = useState<Acesso[]>([])
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    obterSessaoAtual().then((sessao) => {
      if (!sessao) {
        router.push('/login')
        return
      }
      carregar()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function carregar() {
    setErro('')
    try {
      const resposta = await fetch(`${API}/auth/sessoes`, { credentials: 'include' })
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) {
        setErro(t('erroCarregar'))
        return
      }
      setAcessos(await resposta.json())
    } catch {
      setErro(t('erroCarregar'))
    } finally {
      setCarregando(false)
    }
  }

  async function encerrar(caminho: string, mensagemOk: string) {
    if (ocupado) return
    setOcupado(true)
    setErro('')
    setAviso('')
    try {
      const resposta = await fetch(`${API}${caminho}`, { method: 'POST', credentials: 'include' })
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) {
        setErro(t('erroEncerrar'))
        return
      }
      setAviso(mensagemOk)
      await carregar()
    } catch {
      setErro(t('erroEncerrar'))
    } finally {
      setOcupado(false)
    }
  }

  function quando(valor: string | null): string {
    if (!valor) return '—'
    return new Date(valor).toLocaleString(idioma === 'en' ? 'en-US' : 'pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  }

  if (carregando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-base">
        <p className="text-slate-300">{tComum('carregando')}</p>
      </main>
    )
  }

  const outros = acessos.filter((a) => !a.atual)

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">
          <h1 className="titulo-pagina tela-entra mb-2">{t('titulo')}</h1>
          <p className="mb-6 max-w-2xl text-sm text-slate-400">{t('explicacao')}</p>

          {erro && (
            <p className="mb-4 text-sm text-red-400" role="alert">
              {erro}
            </p>
          )}
          {aviso && (
            <p className="mb-4 text-sm text-emerald-300" role="status">
              {aviso}
            </p>
          )}

          <section className="rounded-xl border border-base-border bg-base-surface">
            <ul className="divide-y divide-base-border">
              {acessos.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-200">
                      {a.aparelho ?? t('aparelhoDesconhecido')}
                      {a.atual && (
                        <span className="ml-2 rounded-full bg-brand/20 px-2 py-0.5 text-[11px] font-medium text-brand-300">
                          {t('esteAparelho')}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {t('detalhes', { ip: a.ip ?? '—', entrou: quando(a.criada_em), uso: quando(a.ultimo_uso) })}
                    </p>
                  </div>
                  {!a.atual && (
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => encerrar(`/auth/sessoes/${encodeURIComponent(a.id)}/encerrar`, t('encerrado'))}
                      className="rounded-lg border border-red-800/60 px-3 py-1.5 text-sm text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                    >
                      {t('encerrar')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {outros.length > 0 && (
            <button
              type="button"
              disabled={ocupado}
              onClick={() => encerrar('/auth/sessoes/encerrar-outras', t('outrosEncerrados'))}
              className="mt-4 rounded-lg border border-red-800/60 px-4 py-2 text-sm text-red-300 hover:bg-red-950/40 disabled:opacity-50"
            >
              {t('encerrarOutros', { quantidade: outros.length })}
            </button>
          )}
          <p className="mt-6 max-w-2xl text-xs text-slate-500">{t('dica')}</p>
        </main>
      </div>
    </div>
  )
}
