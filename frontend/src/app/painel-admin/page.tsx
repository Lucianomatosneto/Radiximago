'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import DashboardCard from '../../components/DashboardCard'
import {
  CORES_STATUS,
  ResultadoChecagem,
  checarHealthEndpoint,
} from '../../lib/healthCheck'
import { obterSessaoAtual } from '../../lib/sessao'

const PERFIS_PERMITIDOS = ['administrador']

const TAG_LOCALE: Record<string, string> = { pt: 'pt-BR', en: 'en-US' }

// Rotulos vem de PainelAdmin.atalhos - so os hrefs (fixos, definem a rota)
// ficam aqui.
const ATALHOS_GESTAO = [
  { chave: 'usuarios', href: '/usuarios' },
  { chave: 'imagensRecebidas', href: '/imagens' },
  { chave: 'curadoria', href: '/curadoria' },
  { chave: 'relatorios', href: '/relatorios' },
  { chave: 'auditoria', href: '/auditoria' },
  { chave: 'integracoes', href: '/integracoes' },
]

interface StatsResponse {
  total_imagens_orthanc: number
  usuarios_ativos: number
  por_status: Record<string, number>
}

interface AlertaLogin {
  id: number
  criado_em: string | null
  detalhes: string | null
}

function formatarData(valor: string | null, tagLocale: string): string {
  if (!valor) return '—'
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return '—'
  return data.toLocaleString(tagLocale)
}

async function extrairErro(response: Response, generica: string): Promise<string> {
  try {
    const dados = await response.json()
    if (typeof dados?.detail === 'string') return dados.detail
  } catch {
    // resposta sem corpo JSON legivel
  }
  return generica
}

export default function PainelAdminPage() {
  const router = useRouter()
  const t = useTranslations('PainelAdmin')
  const tComum = useTranslations('Comum')
  const tIntegracoes = useTranslations('Integracoes')
  const tHealthCheck = useTranslations('Integracoes.healthCheck')
  const tStatus = useTranslations('Integracoes.status')
  const locale = useLocale()
  const tagLocale = TAG_LOCALE[locale] ?? 'pt-BR'

  function traduzirHealthCheck(chave: string, params?: Record<string, string | number | Date>): string {
    return tHealthCheck(chave, params)
  }

  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [banco, setBanco] = useState<ResultadoChecagem>({
    status: 'offline',
    descricao: tIntegracoes('verificando'),
  })
  const [orthanc, setOrthanc] = useState<ResultadoChecagem>({
    status: 'offline',
    descricao: tIntegracoes('verificando'),
  })

  const [totalAlertas, setTotalAlertas] = useState(0)
  const [alertas, setAlertas] = useState<AlertaLogin[]>([])

  useEffect(() => {
    obterSessaoAtual().then((sessao) => {
      if (!sessao) {
        router.push('/login')
        return
      }

      if (!PERFIS_PERMITIDOS.includes(sessao.perfil)) {
        router.push('/acesso-negado')
        return
      }

      carregarDados()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function carregarDados() {
    setCarregando(true)
    setErro('')
    try {
      const [respostaStats, resultadoBanco, resultadoOrthanc, respostaAlertas] =
        await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/stats`, {
            credentials: 'include',
          }),
          checarHealthEndpoint(`${process.env.NEXT_PUBLIC_API_URL}/health/database`, 'database', traduzirHealthCheck),
          checarHealthEndpoint(`${process.env.NEXT_PUBLIC_API_URL}/health/orthanc`, 'orthanc', traduzirHealthCheck),
          fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/admin/audit-logs?acao=falha_login&resultado=negado&limit=5`,
            { credentials: 'include' }
          ),
        ])

      if (respostaStats.status === 401 || respostaAlertas.status === 401) {
        router.push('/login')
        return
      }

      if (!respostaStats.ok) {
        setErro(await extrairErro(respostaStats, t('erroCarregar')))
        return
      }
      const dadosStats: StatsResponse = await respostaStats.json()
      setStats(dadosStats)

      setBanco(resultadoBanco)
      setOrthanc(resultadoOrthanc)

      if (respostaAlertas.ok) {
        const dadosAlertas = await respostaAlertas.json()
        setTotalAlertas(dadosAlertas.total ?? 0)
        setAlertas(dadosAlertas.itens ?? [])
      }
    } catch {
      setErro(t('erroCarregarPainel'))
    } finally {
      setCarregando(false)
    }
  }

  if (carregando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-base">
        <p className="text-slate-300">{tComum('carregando')}</p>
      </main>
    )
  }

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar />

      <div className="flex flex-1 flex-col">
        <Topbar />

        <main className="flex-1 overflow-y-auto p-6">
          <h1 className="mb-1 text-xl font-semibold text-slate-100">{t('titulo')}</h1>
          <p className="mb-6 text-sm text-slate-500">
            {t('subtitulo')}
          </p>

          {erro && (
            <p className="mb-4 text-sm text-red-400" role="alert">
              {erro}
            </p>
          )}

          {stats && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <DashboardCard
                label={t('totalImagens')}
                valor={stats.total_imagens_orthanc}
                cor="teal"
              />
              <DashboardCard
                label={t('aguardandoCuradoria')}
                valor={stats.por_status.pendente ?? 0}
                cor="amber"
              />
              <DashboardCard
                label={t('emAnalise')}
                valor={stats.por_status.em_analise ?? 0}
                cor="blue"
              />
              <DashboardCard
                label={t('curadasLiberadas')}
                valor={stats.por_status.aprovada ?? 0}
                cor="green"
              />
              <DashboardCard
                label={t('descartadas')}
                valor={stats.por_status.descartada ?? 0}
                cor="red"
              />
              <DashboardCard label={t('usuariosAtivos')} valor={stats.usuarios_ativos} cor="purple" />
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <section className="lg:col-span-2 rounded-xl border border-base-border bg-base-surface p-5">
              <h2 className="mb-4 text-sm font-semibold text-slate-200">{t('atalhosGestao')}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {ATALHOS_GESTAO.map((atalho) => (
                  <Link
                    key={atalho.href}
                    href={atalho.href}
                    className="rounded-lg border border-slate-700 bg-base-surface2 px-4 py-4 text-center text-sm font-medium text-slate-200 transition-colors hover:border-brand hover:text-brand-300"
                  >
                    {t(`atalhos.${atalho.chave}`)}
                  </Link>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-base-border bg-base-surface p-5">
              <h2 className="mb-4 text-sm font-semibold text-slate-200">{t('statusServicos')}</h2>
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border border-base-border bg-base-surface2/50 px-3 py-2">
                  <span className="text-sm text-slate-300">PostgreSQL</span>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${CORES_STATUS[banco.status]}`}
                  >
                    {tStatus(banco.status)}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-base-border bg-base-surface2/50 px-3 py-2">
                  <span className="text-sm text-slate-300">Orthanc</span>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${CORES_STATUS[orthanc.status]}`}
                  >
                    {tStatus(orthanc.status)}
                  </span>
                </div>
              </div>
              <Link
                href="/integracoes"
                className="mt-4 inline-block text-sm text-brand-300 hover:text-brand-hover"
              >
                {t('verTodosServicos')}
              </Link>
            </section>
          </div>

          <section className="mt-6 rounded-xl border border-base-border bg-base-surface p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-200">{t('alertasSeguranca')}</h2>

            {totalAlertas === 0 ? (
              <p className="text-sm text-emerald-400">{t('nenhumAlerta')}</p>
            ) : (
              <>
                <p className="text-sm text-slate-300">
                  {totalAlertas === 1
                    ? t('loginAlertaSingular', { total: totalAlertas })
                    : t('loginAlertaPlural', { total: totalAlertas })}
                </p>
                <ul className="mt-3 space-y-1.5">
                  {alertas.map((alerta) => (
                    <li key={alerta.id} className="text-xs text-slate-500">
                      {formatarData(alerta.criado_em, tagLocale)} — {alerta.detalhes || t('semDetalhes')}
                    </li>
                  ))}
                </ul>
              </>
            )}

            <Link
              href="/auditoria"
              className="mt-4 inline-block text-sm text-brand-300 hover:text-brand-hover"
            >
              {t('verAuditoriaCompleta')}
            </Link>
          </section>
        </main>
      </div>
    </div>
  )
}
