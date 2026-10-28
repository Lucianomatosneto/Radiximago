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
  detalhes = [],
  alertas = [],
}: {
  nome: string
  status: StatusServico
  descricao: string
  /** linhas extras (ex.: espaco em disco, ultimo backup) */
  detalhes?: string[]
  /** avisos em destaque (ex.: backup vazio) */
  alertas?: string[]
}) {
  return (
    <div className="rounded-xl border border-base-border bg-base-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-100">{nome}</h2>
        <BadgeStatus status={status} />
      </div>
      <p className="mt-2 text-xs text-slate-500">{descricao}</p>
      {detalhes.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-slate-400">
          {detalhes.map((linha) => (
            <li key={linha}>{linha}</li>
          ))}
        </ul>
      )}
      {alertas.length > 0 && (
        <ul className="mt-2 space-y-1">
          {alertas.map((linha) => (
            <li key={linha} role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-200">
              ⚠ {linha}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface InfoBackup {
  arquivo: string
  tamanho_bytes: number
  data: string
  horas_desde: number
  quantidade_guardada: number
}

interface SituacaoArmazenamento {
  status: StatusServico
  alertas: string[]
  disco: { total_gb: number; livre_gb: number; percentual_livre: number } | null
  orthanc: { tamanho_mb: number | null; instancias: number | null } | null
  backup_banco: InfoBackup | null
  backup_imagens: InfoBackup | null
}

const ALERTAS_CONHECIDOS = [
  'backup_banco_ausente',
  'backup_banco_vazio',
  'backup_banco_antigo',
  'backup_imagens_ausente',
  'backup_imagens_vazio',
  'backup_imagens_antigo',
  'disco_pouco_espaco',
  'pasta_backup_indisponivel',
  'orthanc_estatisticas_indisponiveis',
]

function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const unidades = ['KB', 'MB', 'GB', 'TB']
  let valor = bytes / 1024
  let i = 0
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024
    i++
  }
  return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${unidades[i]}`
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
  const [armazenamento, setArmazenamento] = useState<SituacaoArmazenamento | null>(null)
  const [erroStatus, setErroStatus] = useState(false)
  const [email, setEmail] = useState<{ status: StatusServico; etapa: string; erro: string | null; servidor?: string; detalhe?: string } | null>(null)

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
      atualizarTudo()
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

  function atualizarTudo() {
    verificarBancoEOrthanc()
    verificarInfraestrutura()
    verificarEmail()
  }

  // servidor de e-mail (cadastro e "esqueci a senha" dependem dele): o
  // backend conecta e faz login SEM enviar nada (GET /integracoes/email)
  async function verificarEmail() {
    setEmail(null)
    try {
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/integracoes/email`, { credentials: 'include', cache: 'no-store' })
      if (!r.ok) throw new Error()
      setEmail(await r.json())
    } catch {
      setEmail({ status: 'instavel', etapa: 'consulta', erro: 'consulta' })
    }
  }

  // OHIF e Armazenamento: o backend informa o endereco do OHIF que o
  // sistema REALMENTE usa (o mesmo das telas de imagem) e a situacao do
  // disco e dos backups (GET /integracoes/status)
  async function verificarInfraestrutura() {
    setErroStatus(false)
    let ohifUrl: string | null = null
    try {
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/integracoes/status`, {
        credentials: 'include',
        cache: 'no-store',
      })
      if (!r.ok) throw new Error(String(r.status))
      const dados = await r.json()
      ohifUrl = dados.ohif_url ?? null
      setArmazenamento(dados.armazenamento ?? null)
    } catch {
      setErroStatus(true)
      setArmazenamento(null)
    }
    await verificarOhif(ohifUrl)
  }

  async function verificarOhif(ohifUrl: string | null) {
    if (!ohifUrl) {
      setOhif({
        status: 'instavel',
        descricao: t('ohifSemEndereco'),
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
        descricao: t('ohifRespondeu', { url: ohifUrl }),
      })
    } catch {
      setOhif({
        status: 'instavel',
        descricao: t('ohifNaoRespondeu'),
      })
    }
  }

  // Docker: checagem INDIRETA (sem acesso ao Docker, por seguranca) - se os
  // servicos que rodam dentro dele respondem, ele esta funcionando
  const servicosNoDocker = [banco.status, orthanc.status]
  const statusDocker: StatusServico = servicosNoDocker.every((s) => s === 'online')
    ? 'online'
    : servicosNoDocker.some((s) => s === 'online')
      ? 'instavel'
      : 'offline'

  const formatarData = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  const linhaBackup = (rotulo: string, b: InfoBackup | null) =>
    b
      ? t('linhaBackup', {
          rotulo,
          data: formatarData(b.data),
          tamanho: tamanhoLegivel(b.tamanho_bytes),
          quantidade: b.quantidade_guardada,
        })
      : null
  const detalhesArmazenamento: string[] = armazenamento
    ? ([
        armazenamento.disco
          ? t('linhaDisco', {
              livre: armazenamento.disco.livre_gb.toLocaleString('pt-BR'),
              total: armazenamento.disco.total_gb.toLocaleString('pt-BR'),
              percentual: armazenamento.disco.percentual_livre.toLocaleString('pt-BR'),
            })
          : null,
        armazenamento.orthanc && armazenamento.orthanc.tamanho_mb !== null
          ? t('linhaOrthanc', {
              tamanho: tamanhoLegivel((armazenamento.orthanc.tamanho_mb ?? 0) * 1024 * 1024),
              instancias: armazenamento.orthanc.instancias ?? 0,
            })
          : null,
        linhaBackup(t('backupBanco'), armazenamento.backup_banco),
        linhaBackup(t('backupImagens'), armazenamento.backup_imagens),
      ].filter(Boolean) as string[])
    : []

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
              onClick={atualizarTudo}
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
              status={statusDocker}
              descricao={statusDocker === 'online' ? t('dockerIndiretoOk') : t('dockerIndiretoFalha')}
              detalhes={[t('dockerPorQue')]}
            />
            <CardServico
              nome={t('servicoEmail')}
              status={email?.status ?? 'aguardando'}
              descricao={!email ? t('verificando') : email.status === 'online' ? t('emailOk', { servidor: email.servidor ?? '' }) : t(`emailErro.${email.erro ?? 'consulta'}`)}
              detalhes={
                email && email.status !== 'online'
                  ? [
                      t('emailPorQue'),
                      ...(email.etapa && email.etapa !== 'consulta' ? [t('emailEtapa', { etapa: t(`emailEtapas.${email.etapa}`) })] : []),
                      ...(email.detalhe ? [t('emailDetalhe', { detalhe: email.detalhe })] : []),
                    ]
                  : []
              }
            />
            <CardServico
              nome={t('servicoArmazenamento')}
              status={erroStatus ? 'instavel' : (armazenamento?.status ?? 'aguardando')}
              descricao={erroStatus ? t('armazenamentoErro') : armazenamento ? t('verificadoAgora') : t('verificando')}
              detalhes={detalhesArmazenamento}
              alertas={(armazenamento?.alertas ?? []).map((a) => (ALERTAS_CONHECIDOS.includes(a) ? t(`alertas.${a}`) : a))}
            />
          </div>
        </main>
      </div>
    </div>
  )
}
