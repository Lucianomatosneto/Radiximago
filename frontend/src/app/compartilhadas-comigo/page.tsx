'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import MiniaturaImagem from '../../components/MiniaturaImagem'
import VisualizadorSequencial, { type ItemSequencia } from '../../components/VisualizadorSequencial'
import type { Marcacao } from '../../lib/marcacoes'
import { corTextoAchado, corCartaoTipoRadiografia } from '../../lib/coresAchados'
import { obterSessaoAtual } from '../../lib/sessao'

// "Compartilhadas comigo": imagens que outros usuarios compartilharam com
// quem esta logado, com o recado e as anotacoes de quem compartilhou (so
// leitura, sempre a versao atual). Ver backend/app/modules/compartilhamentos_router.py.

interface Recebida {
  id: number
  curation_id: number
  remetente_nome: string
  mensagem: string | null
  compartilhado_em: string | null
  novo: boolean
  quantidade_anotacoes: number
  tipo_radiografia: string | null
  achado_principal: string | null
  achados_detalhe?: string | null
  alteracoes_observadas?: string[] | null
  marcacoes?: Marcacao[]
  qualidade_tecnica?: string | null
  dentes?: number[] | null
  descricao_didatica: string | null
  viewer_url: string | null
}

const API = process.env.NEXT_PUBLIC_API_URL
const CHAVES_TIPO = ['periapical', 'panoramica', 'interproximal', 'oclusal']
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

export default function CompartilhadasComigoPage() {
  const router = useRouter()
  const t = useTranslations('CompartilhadasComigo')
  const tComum = useTranslations('Comum')
  const tOpcoes = useTranslations('Pesquisa.opcoes')
  const [carregando, setCarregando] = useState(true)
  const [itens, setItens] = useState<Recebida[]>([])
  const [erro, setErro] = useState('')
  const [removendo, setRemovendo] = useState<number | null>(null)
  const [aberta, setAberta] = useState<number | null>(null)

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
    setCarregando(true)
    setErro('')
    try {
      const r = await fetch(`${API}/shares/recebidas`, { credentials: 'include' })
      if (r.status === 401) {
        router.push('/login')
        return
      }
      if (!r.ok) {
        setErro(t('erroCarregar'))
        return
      }
      const dados = await r.json()
      setItens(dados.itens ?? [])
      // abriu a pagina: as novas passam a contar como vistas (o selo
      // "Nova" continua aparecendo nesta visita)
      if ((dados.itens ?? []).some((i: Recebida) => i.novo)) {
        fetch(`${API}/shares/recebidas/vistas`, { method: 'POST', credentials: 'include' })
          .then(() => window.dispatchEvent(new Event('radix-compartilhadas-vistas')))
          .catch(() => {})
      }
    } catch {
      setErro(t('erroCarregar'))
    } finally {
      setCarregando(false)
    }
  }

  async function remover(id: number) {
    setRemovendo(id)
    setErro('')
    try {
      const r = await fetch(`${API}/shares/recebidas/${id}`, { method: 'DELETE', credentials: 'include' })
      if (!r.ok) {
        setErro(t('erroRemover'))
        return
      }
      setItens((atual) => atual.filter((i) => i.id !== id))
    } catch {
      setErro(t('erroRemover'))
    } finally {
      setRemovendo(null)
    }
  }

  function rotularTipo(valor: string | null) {
    if (!valor) return '—'
    return CHAVES_TIPO.includes(valor) ? tOpcoes(`tipoRadiografia.${valor}`) : valor
  }
  function rotularAchado(valor: string | null) {
    if (!valor) return '—'
    const chave = CHAVE_ACHADO[valor]
    return chave ? tOpcoes(`achadoPrincipal.${chave}`) : valor
  }
  function dataCurta(iso: string | null) {
    if (!iso) return ''
    try {
      return new Date(iso).toLocaleDateString()
    } catch {
      return ''
    }
  }

  const itensVisualizador: ItemSequencia[] = itens.map((i, indice) => ({
    curation_id: i.curation_id,
    numero: indice + 1,
    descricao_didatica: i.descricao_didatica,
    tipo_radiografia: i.tipo_radiografia,
    viewer_url: i.viewer_url,
    achados_detalhe: i.achados_detalhe,
    alteracoes_observadas: i.alteracoes_observadas,
    marcacoes: i.marcacoes,
    qualidade_tecnica: i.qualidade_tecnica,
    dentes: i.dentes,
    achado_principal: i.achado_principal,
    compartilhamento: { id: i.id, remetente_nome: i.remetente_nome, mensagem: i.mensagem },
  }))

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
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="titulo-pagina tela-entra">
                {t('tituloPrefixo')} <span className="text-teal-600 dark:text-teal-300">{t('tituloDestaque')}</span>
              </h1>
              <p className="mt-1 text-sm text-slate-400">{t('subtitulo')}</p>
            </div>
            {itens.length > 1 && (
              <button
                type="button"
                onClick={() => setAberta(0)}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-glow hover:bg-brand-hover"
              >
                ▶ {t('verTodas', { quantidade: itens.length })}
              </button>
            )}
          </div>

          {erro && (
            <p className="mt-4 text-sm text-red-400" role="alert">
              {erro}
            </p>
          )}

          <div className="mt-6">
            {itens.length === 0 ? (
              <p className="py-12 text-center text-slate-500">{t('vazio')}</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {itens.map((item, indice) => (
                  <div
                    key={item.id}
                    className={`flex flex-col rounded-2xl border bg-gradient-to-br p-4 ${corCartaoTipoRadiografia(item.tipo_radiografia)}`}
                  >
                    <div className="relative mb-3 overflow-hidden rounded-lg">
                      <MiniaturaImagem
                        curationId={item.curation_id}
                        alt={item.descricao_didatica ?? t('imagem', { numero: indice + 1 })}
                        className="h-36 w-full bg-base-surface2 object-cover"
                      />
                      {item.novo && (
                        <span className="absolute left-2 top-2 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-black">
                          {t('nova')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      {t('de')} <span className="font-semibold text-ink">{item.remetente_nome}</span>
                      {item.compartilhado_em && <span> · {dataCurta(item.compartilhado_em)}</span>}
                    </p>
                    <span className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand-300">
                      {rotularTipo(item.tipo_radiografia)}
                    </span>
                    <span className={`mt-1 truncate text-xs font-medium ${corTextoAchado(item.achado_principal)}`}>
                      {rotularAchado(item.achado_principal)}
                    </span>
                    {item.mensagem && <p className="mt-1 line-clamp-2 text-xs italic text-slate-300">“{item.mensagem}”</p>}
                    <p className="mt-1 text-[11px] text-slate-500">
                      {t('anotacoes', { quantidade: item.quantidade_anotacoes })}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setAberta(indice)}
                        className="flex-1 rounded-lg border border-base-border px-3 py-2 text-center text-sm text-slate-200 hover:border-brand hover:text-brand-300"
                      >
                        {t('abrir')}
                      </button>
                      <button
                        type="button"
                        onClick={() => remover(item.id)}
                        disabled={removendo === item.id}
                        className="rounded-lg border border-base-border px-3 py-2 text-sm text-red-400 hover:border-red-500 disabled:opacity-50"
                      >
                        {removendo === item.id ? '...' : t('remover')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {aberta !== null && itensVisualizador.length > 0 && (
        <VisualizadorSequencial itens={itensVisualizador} indiceInicial={aberta} onFechar={() => setAberta(null)} />
      )}
    </div>
  )
}
