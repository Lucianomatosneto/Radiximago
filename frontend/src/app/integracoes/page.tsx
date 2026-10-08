'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import {
  CORES_STATUS,
  ResultadoChecagem,
  StatusServico,
  checarHealthEndpoint,
} from '../../lib/healthCheck'
import { obterSessaoAtual } from '../../lib/sessao'

const PERFIS_PERMITIDOS = ['administrador', 'suporte']

function BadgeStatus({ status }: { status: StatusServico }) {
  const t = useTranslations('Integracoes.status')
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${CORES_STATUS[status]}`}
    >
      {t(status)}
    </span>
  )
}

function CardServico({
  nome,
  status,
  descricao,
}: {
  nome: string
  status: StatusServico
  descricao: string
}) {
  return (
    <div className="rounded-xl border border-base-border bg-base-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-100">{nome}</h2>
        <BadgeStatus status={status} />
      </div>
      <p className="mt-2 text-xs text-slate-500">{descricao}</p>
    </div>
  )
}

export default function IntegracoesPage() {
  const router = useRouter()
  const t = useTranslations('Integracoes')
  const tComum = useTranslations('Comum')
  const tHealthCheck = useTranslations('Integracoes.healthCheck')

  function traduzirHealthCheck(chave: string, params?: Record<string, string | number | Date>): string {
    return tHealthCheck(chave, params)
  }

  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)

  const [banco, setBanco] = useState<ResultadoChecagem>({
    status: 'offline',
    descricao: t('verificando'),
  })
  const [orthanc, setOrthanc] = useState<ResultadoChecagem>({
    status: 'offline',
    descricao: t('verificando'),
  })
  const [ohif, setOhif] = useState<ResultadoChecagem>({
    status: 'aguardando',
    descricao: t('verificando'),
  })

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
      verificarBancoEOrthanc()
      verificarOhif()
      setCarregando(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function verificarBancoEOrthanc() {
    setAtualizando(true)
    const [resultadoBanco, resultadoOrthanc] = await Promise.all([
      checarHealthEndpoint(`${process.env.NEXT_PUBLIC_API_URL}/health/database`, 'database', traduzirHealthCheck),
      checarHealthEndpoint(`${process.env.NEXT_PUBLIC_API_URL}/health/orthanc`, 'orthanc', traduzirHealthCheck),
    ])
    setBanco(resultadoBanco)
    setOrthanc(resultadoOrthanc)
    setAtualizando(false)
  }

  async function verificarOhif() {
    const ohifUrl = process.env.NEXT_PUBLIC_OHIF_URL
    if (!ohifUrl) {
      setOhif({
        status: 'aguardando',
        descricao: t('variavelOhifNaoConfigurada'),
      })
      return
    }

    try {
      // mode: 'no-cors' evita que a politica de CORS do OHIF derrube a
      // requisicao so por falta de header - assim so falha de verdade
      // (host inalcancavel) cai no catch. Mesmo assim e uma checagem
      // best-effort: a resposta e opaca, nao da pra validar o conteudo.
      await fetch(ohifUrl, { mode: 'no-cors', cache: 'no-store' })
      setOhif({
        status: 'online',
        descricao: t('ohifRespondeu'),
      })
    } catch {
      setOhif({
        status: 'instavel',
        descricao: t('ohifNaoRespondeu'),
      })
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
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="titulo-pagina tela-entra">{t('titulo')}</h1>
              <p className="mt-1 text-sm text-slate-500">
                {t('subtitulo')}
              </p>
            </div>
            <button
              type="button"
              onClick={verificarBancoEOrthanc}
              disabled={atualizando}
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
            >
              {atualizando ? t('atualizando') : t('atualizarStatus')}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CardServico
              nome="FastAPI"
              status="online"
              descricao={t('descricaoFastapi')}
            />
            <CardServico nome="PostgreSQL" status={banco.status} descricao={banco.descricao} />
            <CardServico nome="Orthanc" status={orthanc.status} descricao={orthanc.descricao} />
            <CardServico
              nome="Next.js"
              status="online"
              descricao={t('descricaoNextjs')}
            />
            <CardServico nome="OHIF" status={ohif.status} descricao={ohif.descricao} />
            <CardServico
              nome="DICOMWeb (via Orthanc)"
              status={orthanc.status}
              descricao={t('descricaoDicomweb', { descricaoOrthanc: orthanc.descricao })}
            />
            <CardServico
              nome="Docker"
              status="aguardando"
              descricao={t('semEndpointChecagem')}
            />
            <CardServico
              nome={t('servicoArmazenamento')}
              status="aguardando"
              descricao={t('semEndpointChecagem')}
            />
          </div>
        </main>
      </div>
    </div>
  )
}
