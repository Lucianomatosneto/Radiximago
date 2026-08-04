'use client'

import { ReactNode, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import { obterSessaoAtual } from '../../lib/sessao'

const PERFIS_PERMITIDOS = ['administrador']

const MODALIDADES_RADIOGRAFIA = ['periapical', 'panoramica', 'interproximal', 'oclusal']

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

function ListaValoresFixos({ titulo, valores }: { titulo: string; valores: string[] }) {
  return (
    <div>
      <dt className="mb-1.5 text-xs text-slate-500">{titulo}</dt>
      <dd className="flex flex-wrap gap-1.5">
        {valores.map((valor) => (
          <span
            key={valor}
            className="rounded-full border border-slate-700 bg-base-surface2 px-2.5 py-0.5 text-xs text-slate-300"
          >
            {valor}
          </span>
        ))}
      </dd>
    </div>
  )
}

export default function ConfiguracoesPage() {
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)

  const [config, setConfig] = useState<SettingsResponse | null>(null)
  const [erro, setErro] = useState('')

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
      buscarConfiguracoes()
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
        setErro(await extrairErro(resposta, 'Não foi possível carregar as configurações.'))
        return
      }
      const dados: SettingsResponse = await resposta.json()
      setConfig(dados)
    } catch {
      setErro('Não foi possível carregar as configurações.')
    } finally {
      setCarregando(false)
    }
  }

  if (carregando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-base">
        <p className="text-slate-300">Carregando...</p>
      </main>
    )
  }


  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar />

      <div className="flex flex-1 flex-col">
        <Topbar />

        <main className="flex-1 overflow-y-auto p-6">
          <h1 className="mb-4 text-xl font-semibold text-slate-100">Configurações</h1>

          <div className="mb-6 rounded-lg border border-amber-700/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            Estas configurações são definidas no ambiente do servidor. A edição pela
            interface ainda não está disponível — qualquer alteração requer suporte técnico.
          </div>

          {erro && (
            <p className="mb-4 text-sm text-red-400" role="alert">
              {erro}
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Secao titulo="Geral">
              <dl className="space-y-3">
                <Campo label="Nome do sistema" valor="Radix Imago" />
                <Campo label="Ambiente" valor={config?.environment ?? '—'} />
              </dl>
            </Secao>

            <Secao titulo="Segurança">
              <dl className="space-y-3">
                <Campo label="Algoritmo de token" valor={config?.jwt_algorithm ?? '—'} />
                <Campo
                  label="Tempo de sessão"
                  valor={config ? `${config.jwt_expire_minutes} minutos` : '—'}
                />
              </dl>
            </Secao>

            <Secao titulo="Integrações técnicas">
              <dl className="space-y-3">
                <Campo label="URL do Orthanc" valor={config?.orthanc_url ?? '—'} />
                <Campo label="URL do DICOMWeb" valor={config?.dicomweb_url ?? '—'} />
                <Campo label="URL do OHIF" valor={config?.ohif_base_url ?? '—'} />
              </dl>
            </Secao>

            <Secao titulo="Upload">
              <dl className="space-y-3">
                <Campo
                  label="Tamanho máximo de upload"
                  valor={config ? `${config.max_upload_size_mb} MB` : '—'}
                />
              </dl>
            </Secao>

            <div className="lg:col-span-2">
              <Secao titulo="Valores fixos do sistema">
                <p className="mb-4 text-xs text-slate-500">
                  Não vêm da API — são os mesmos vocabulários já usados nas telas de Curadoria,
                  Pesquisa e Usuários, mostrados aqui só como referência.
                </p>
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <ListaValoresFixos
                    titulo="Modalidades de radiografia"
                    valores={MODALIDADES_RADIOGRAFIA}
                  />
                  <ListaValoresFixos titulo="Status de curadoria" valores={STATUS_CURADORIA} />
                  <ListaValoresFixos titulo="Perfis de usuário" valores={PERFIS_USUARIO} />
                </dl>
              </Secao>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
