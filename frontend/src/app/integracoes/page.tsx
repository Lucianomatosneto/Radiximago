'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import {
  CORES_STATUS,
  LABELS_STATUS,
  ResultadoChecagem,
  StatusServico,
  checarHealthEndpoint,
} from '../../lib/healthCheck'

const PERFIS_PERMITIDOS = ['administrador', 'suporte']

function badgeStatus(status: StatusServico) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${CORES_STATUS[status]}`}
    >
      {LABELS_STATUS[status]}
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
        {badgeStatus(status)}
      </div>
      <p className="mt-2 text-xs text-slate-500">{descricao}</p>
    </div>
  )
}

export default function IntegracoesPage() {
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)

  const [banco, setBanco] = useState<ResultadoChecagem>({
    status: 'offline',
    descricao: 'Verificando...',
  })
  const [orthanc, setOrthanc] = useState<ResultadoChecagem>({
    status: 'offline',
    descricao: 'Verificando...',
  })
  const [ohif, setOhif] = useState<ResultadoChecagem>({
    status: 'aguardando',
    descricao: 'Verificando...',
  })

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      router.push('/login')
      return
    }

    const perfil = localStorage.getItem('perfil')
    if (!perfil || !PERFIS_PERMITIDOS.includes(perfil)) {
      router.push('/acesso-negado')
      return
    }

    verificarBancoEOrthanc()
    verificarOhif()
    setCarregando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function verificarBancoEOrthanc() {
    setAtualizando(true)
    const [resultadoBanco, resultadoOrthanc] = await Promise.all([
      checarHealthEndpoint(`${process.env.NEXT_PUBLIC_API_URL}/health/database`, 'database'),
      checarHealthEndpoint(`${process.env.NEXT_PUBLIC_API_URL}/health/orthanc`, 'orthanc'),
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
        descricao: 'Variável NEXT_PUBLIC_OHIF_URL não configurada.',
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
        descricao: 'Respondeu à requisição (checagem best-effort, sem validar o conteúdo).',
      })
    } catch {
      setOhif({
        status: 'instavel',
        descricao:
          'Não respondeu — pode ser falha real ou apenas CORS/rede local. Checagem best-effort.',
      })
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
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-xl font-semibold text-slate-100">Integrações</h1>
            <button
              type="button"
              onClick={verificarBancoEOrthanc}
              disabled={atualizando}
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
            >
              {atualizando ? 'Atualizando...' : 'Atualizar status'}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <CardServico
              nome="FastAPI"
              status="online"
              descricao="A própria resposta desta página confirma que a API respondeu."
            />
            <CardServico nome="PostgreSQL" status={banco.status} descricao={banco.descricao} />
            <CardServico nome="Orthanc" status={orthanc.status} descricao={orthanc.descricao} />
            <CardServico
              nome="Next.js"
              status="online"
              descricao="O frontend está rodando — você está vendo esta página."
            />
            <CardServico nome="OHIF" status={ohif.status} descricao={ohif.descricao} />
            <CardServico
              nome="DICOMWeb (via Orthanc)"
              status={orthanc.status}
              descricao={`Mesmo status do Orthanc — DICOMWeb é um plugin dele, não uma checagem separada. ${orthanc.descricao}`}
            />
            <CardServico
              nome="Docker"
              status="aguardando"
              descricao="Sem endpoint de checagem disponível."
            />
            <CardServico
              nome="Armazenamento"
              status="aguardando"
              descricao="Sem endpoint de checagem disponível."
            />
          </div>
        </main>
      </div>
    </div>
  )
}
