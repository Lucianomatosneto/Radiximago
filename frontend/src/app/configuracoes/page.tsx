'use client'

import { ReactNode, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import { obterSessaoAtual } from '../../lib/sessao'

const PERFIS_PERMITIDOS = ['administrador']

// Mesma lista do backend (TipoRadiografia em backend/app/modules/curations.py)
// - o teste test_configuracoes_valores_fixos.py confere que nao divergem.
const MODALIDADES_RADIOGRAFIA = [
  'periapical',
  'panoramica',
  'interproximal',
  'oclusal',
  'tomografia',
]

const STATUS_CURADORIA = [
  'pendente',
  'em_analise',
  'aprovada',
  'descartada',
  'segunda_opiniao',
  'baixa_qualidade',
]

const PERFIS_USUARIO = [
  'administrador',
  'curador',
  'professor',
  'estudante',
  'pesquisador',
  'suporte',
]

interface SettingsResponse {
  orthanc_url: string
  dicomweb_url: string
  ohif_base_url: string
  max_upload_size_mb: number
  environment: string
  jwt_algorithm: string
  jwt_expire_minutes: number
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

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-base-border bg-base-surface p-5">
      <h2 className="mb-4 text-sm font-semibold text-slate-200">{titulo}</h2>
      {children}
    </section>
  )
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-all text-sm text-slate-200">{valor}</dd>
    </div>
  )
}

function ListaValoresFixos({
  titulo,
  valores,
  rotulo,
}: {
  titulo: string
  valores: string[]
  rotulo: (valor: string) => string
}) {
  return (
    <div>
      <dt className="mb-1.5 text-xs text-slate-500">{titulo}</dt>
      <dd className="flex flex-wrap gap-1.5">
        {valores.map((valor) => (
          <span
            key={valor}
            title={valor}
            className="rounded-full border border-slate-700 bg-base-surface2 px-2.5 py-0.5 text-xs text-slate-300"
          >
            {rotulo(valor)}
          </span>
        ))}
      </dd>
    </div>
  )
}

export default function ConfiguracoesPage() {
  const t = useTranslations('Configuracoes')
  const tComum = useTranslations('Comum')
  const tTipo = useTranslations('Pesquisa.opcoes.tipoRadiografia')
  const tStatus = useTranslations('ImagensRecebidas.statusCuradoriaFiltro')
  const tPerfil = useTranslations('Usuarios.perfis')
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)

  const [config, setConfig] = useState<SettingsResponse | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    void obterSessaoAtual().then((sessao) => {
      if (!sessao) {
        router.push('/login')
        return
      }
      if (!PERFIS_PERMITIDOS.includes(sessao.perfil)) {
        router.push('/acesso-negado?de=/configuracoes')
        return
      }
      void buscarConfiguracoes()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function buscarConfiguracoes() {
    setCarregando(true)
    setErro('')
    try {
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/settings`, {
        credentials: 'include',
      })
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) {
        setErro(await extrairErro(resposta, t('erroCarregarGenerico')))
        return
      }
      const dados: SettingsResponse = await resposta.json()
      setConfig(dados)
    } catch {
      setErro(t('erroCarregarGenerico'))
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
          <h1 className="titulo-pagina tela-entra mb-4">{t('titulo')}</h1>

          <div className="mb-6 rounded-lg border border-amber-700/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            {t('avisoSomenteServidor')}
          </div>

          {erro && (
            <p className="mb-4 text-sm text-red-400" role="alert">
              {erro}
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Secao titulo={t('secaoGeral')}>
              <dl className="space-y-3">
                <Campo label={t('nomeSistema')} valor="Rádix Imago" />
                <Campo
                  label={t('ambiente')}
                  valor={
                    !config
                      ? '—'
                      : config.environment === 'production'
                        ? t('ambienteProducao')
                        : config.environment === 'development'
                          ? t('ambienteDesenvolvimento')
                          : t('ambienteOutro', { nome: config.environment })
                  }
                />
              </dl>
              {config && config.environment !== 'production' && (
                <p
                  role="note"
                  data-teste="aviso-ambiente"
                  className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
                >
                  {t('avisoAmbienteDesenvolvimento')}
                </p>
              )}
            </Secao>

            <Secao titulo={t('secaoSeguranca')}>
              <dl className="space-y-3">
                <Campo label={t('algoritmoToken')} valor={config?.jwt_algorithm ?? '—'} />
                <Campo
                  label={t('tempoSessao')}
                  valor={config ? t('tempoSessaoMinutos', { minutos: config.jwt_expire_minutes }) : '—'}
                />
              </dl>
            </Secao>

            <Secao titulo={t('secaoIntegracoesTecnicas')}>
              <dl className="space-y-3">
                <Campo label={t('urlOrthanc')} valor={config?.orthanc_url ?? '—'} />
                <Campo label={t('urlDicomweb')} valor={config?.dicomweb_url ?? '—'} />
                <Campo label={t('urlOhif')} valor={config?.ohif_base_url ?? '—'} />
              </dl>
            </Secao>

            <Secao titulo={t('secaoUpload')}>
              <dl className="space-y-3">
                <Campo
                  label={t('tamanhoMaximoUpload')}
                  valor={config ? t('tamanhoMaximoUploadMb', { mb: config.max_upload_size_mb }) : '—'}
                />
              </dl>
            </Secao>

            <div className="lg:col-span-2">
              <Secao titulo={t('secaoValoresFixos')}>
                <p className="mb-4 text-xs text-slate-500">
                  {t('notaValoresFixos')}
                </p>
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <ListaValoresFixos
                    titulo={t('modalidadesRadiografia')}
                    valores={MODALIDADES_RADIOGRAFIA}
                    rotulo={(v) => (tTipo.has(v) ? tTipo(v) : v)}
                  />
                  <ListaValoresFixos
                    titulo={t('statusCuradoria')}
                    valores={STATUS_CURADORIA}
                    rotulo={(v) => (tStatus.has(v) ? tStatus(v) : v)}
                  />
                  <ListaValoresFixos
                    titulo={t('perfisUsuario')}
                    valores={PERFIS_USUARIO}
                    rotulo={(v) => (tPerfil.has(v) ? tPerfil(v) : v)}
                  />
                </dl>
              </Secao>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
