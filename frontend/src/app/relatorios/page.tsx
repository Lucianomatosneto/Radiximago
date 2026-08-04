'use client'

import { ReactNode, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import DashboardCard from '../../components/DashboardCard'
import StatusBadge from '../../components/StatusBadge'
import { corBarraAchado, corTextoAchado } from '../../lib/coresAchados'
import { obterSessaoAtual } from '../../lib/sessao'

const PERFIS_PERMITIDOS = ['administrador', 'curador']

// Rotulos vem do namespace compartilhado Pesquisa.opcoes (mesmo texto
// usado em Pesquisa avançada, Curadoria e demais telas) - so os valores
// crus (mesmos salvos pelo backend) ficam fixos aqui.
const OPCOES_TIPO_RADIOGRAFIA = ['periapical', 'panoramica', 'interproximal', 'oclusal']
const OPCOES_DIFICULDADE = ['basico', 'intermediario', 'avancado']
const OPCOES_QUALIDADE_TECNICA = ['otima', 'boa', 'regular', 'insatisfatoria']

// achadoPrincipal precisa do mapa abaixo porque as chaves de traducao nao
// batem 1:1 com o valor cru salvo pelo curador (mesmo mapa ja usado em
// outras telas, ex. segunda-opiniao/page.tsx).
const CHAVE_ACHADO: Record<string, string> = {
  normal: 'normal',
  carie: 'carie',
  lesao_periapical: 'lesaoPeriapical',
  perda_ossea: 'perdaOssea',
  dente_incluso: 'denteIncluso',
  tratamento_endodontico: 'tratamentoEndodontico',
  erro_tecnico: 'erroTecnico',
  outro: 'outro',
}

interface StatsResponse {
  total_imagens_orthanc: number
  total_fichas_curadoria: number
  usuarios_ativos: number
  usuarios_bloqueados: number
  por_status: Record<string, number>
  por_tipo_radiografia: Record<string, number>
  por_achado_principal: Record<string, number>
  por_dificuldade: Record<string, number>
  por_qualidade_tecnica: Record<string, number>
  por_curador: Record<string, number>
}

interface Usuario {
  id: number
  nome: string
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

function TabelaProporcao({
  titulo,
  dados,
  renderRotulo,
  corPorChave,
}: {
  titulo: string
  dados: Record<string, number>
  renderRotulo: (chave: string) => ReactNode
  // Opcional: quando informado, colore o rotulo e a barra de cada linha
  // com a MESMA cor usada no Banco de imagens pra aquele achado
  // (../../lib/coresAchados) - so faz sentido pra tabela "Fichas por
  // achado principal"; as demais (status, tipo, dificuldade, qualidade,
  // curador) continuam com a cor neutra/marca de sempre.
  corPorChave?: (chave: string) => { texto: string; barra: string }
}) {
  const t = useTranslations('Relatorios')
  const entradas = Object.entries(dados).sort((a, b) => b[1] - a[1])
  const total = entradas.reduce((soma, [, valor]) => soma + valor, 0)

  return (
    <section className="rounded-xl border border-base-border bg-base-surface p-5">
      <h2 className="mb-4 text-sm font-semibold text-slate-200">{titulo}</h2>
      {entradas.length === 0 ? (
        <p className="text-sm text-slate-500">{t('semDados')}</p>
      ) : (
        <div className="space-y-3">
          {entradas.map(([chave, valor]) => {
            const porcentagem = total > 0 ? Math.round((valor / total) * 100) : 0
            const cor = corPorChave?.(chave)
            return (
              <div key={chave}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className={cor ? `font-medium ${cor.texto}` : 'text-slate-400'}>{renderRotulo(chave)}</span>
                  <span className="text-slate-400">
                    {valor} ({porcentagem}%)
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-base-surface2">
                  <div
                    className={`h-full rounded-full ${cor ? cor.barra : 'bg-brand'}`}
                    style={{ width: `${porcentagem}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default function RelatoriosPage() {
  const router = useRouter()
  const t = useTranslations('Relatorios')
  const tComum = useTranslations('Comum')
  const tOpcoes = useTranslations('Pesquisa.opcoes')

  function rotular(opcoes: string[], namespace: 'tipoRadiografia' | 'dificuldade' | 'qualidadeTecnica', chave: string): string {
    if (chave === 'nao_informado') return t('naoInformado')
    if (!opcoes.includes(chave)) return chave
    return tOpcoes(`${namespace}.${chave}`)
  }

  function rotularAchado(chave: string): string {
    if (chave === 'nao_informado') return t('naoInformado')
    const chaveTraducao = CHAVE_ACHADO[chave]
    if (!chaveTraducao) return chave
    return tOpcoes(`achadoPrincipal.${chaveTraducao}`)
  }

  const [carregando, setCarregando] = useState(true)

  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [mapaCuradores, setMapaCuradores] = useState<Record<number, string>>({})
  const [erro, setErro] = useState('')
  const [perfil, setPerfil] = useState<string | null>(null)

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

      setPerfil(sessao.perfil)
      carregarDados()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function carregarDados() {
    setCarregando(true)
    setErro('')
    try {
      const [respostaStats, respostaUsuarios] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/stats`, {
          credentials: 'include',
        }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/`, {
          credentials: 'include',
        }),
      ])

      if (respostaStats.status === 401 || respostaUsuarios.status === 401) {
        router.push('/login')
        return
      }

      if (!respostaStats.ok) {
        setErro(await extrairErro(respostaStats, t('erroCarregar')))
        return
      }
      const dadosStats: StatsResponse = await respostaStats.json()
      setStats(dadosStats)

      if (respostaUsuarios.ok) {
        const usuarios: Usuario[] = await respostaUsuarios.json()
        const mapa: Record<number, string> = {}
        for (const usuario of usuarios) mapa[usuario.id] = usuario.nome
        setMapaCuradores(mapa)
      }
      // Se /users/ falhar por qualquer motivo, os relatorios continuam de pe -
      // so o nome do curador cai no fallback "Usuario #<id>" abaixo.
    } catch {
      setErro(t('erroCarregar'))
    } finally {
      setCarregando(false)
    }
  }

  function rotularCurador(chave: string): string {
    if (chave === 'nao_informado') return t('semCuradorAtribuido')
    const id = Number(chave)
    return mapaCuradores[id] ?? t('usuarioNumero', { id: chave })
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
          <h1 className="mb-6 text-xl font-semibold text-slate-100">{t('titulo')}</h1>

          {erro && (
            <p className="mb-4 text-sm text-red-400" role="alert">
              {erro}
            </p>
          )}

          {stats && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <DashboardCard label={t('totalImagens')} valor={stats.total_imagens_orthanc} cor="teal" />
                <DashboardCard label={t('totalFichas')} valor={stats.total_fichas_curadoria} cor="blue" />
                {perfil === 'administrador' && (
                  <>
                    <DashboardCard label={t('usuariosAtivos')} valor={stats.usuarios_ativos} cor="green" />
                    <DashboardCard label={t('usuariosBloqueados')} valor={stats.usuarios_bloqueados} cor="red" />
                  </>
                )}
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <TabelaProporcao
                  titulo={t('fichasPorStatus')}
                  dados={stats.por_status}
                  renderRotulo={(chave) => <StatusBadge status={chave} />}
                />
                <TabelaProporcao
                  titulo={t('fichasPorTipoRadiografia')}
                  dados={stats.por_tipo_radiografia}
                  renderRotulo={(chave) => rotular(OPCOES_TIPO_RADIOGRAFIA, 'tipoRadiografia', chave)}
                />
                <TabelaProporcao
                  titulo={t('fichasPorAchadoPrincipal')}
                  dados={stats.por_achado_principal}
                  renderRotulo={(chave) => rotularAchado(chave)}
                  corPorChave={(chave) => ({ texto: corTextoAchado(chave), barra: corBarraAchado(chave) })}
                />
                <TabelaProporcao
                  titulo={t('fichasPorDificuldade')}
                  dados={stats.por_dificuldade}
                  renderRotulo={(chave) => rotular(OPCOES_DIFICULDADE, 'dificuldade', chave)}
                />
                <TabelaProporcao
                  titulo={t('fichasPorQualidadeTecnica')}
                  dados={stats.por_qualidade_tecnica}
                  renderRotulo={(chave) => rotular(OPCOES_QUALIDADE_TECNICA, 'qualidadeTecnica', chave)}
                />
                <TabelaProporcao
                  titulo={t('fichasPorCurador')}
                  dados={stats.por_curador}
                  renderRotulo={rotularCurador}
                />
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
