'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import StatusBadge from '../../components/StatusBadge'
import DashboardCard from '../../components/DashboardCard'
import { obterSessaoAtual } from '../../lib/sessao'

// "Aguardando curadoria" = sem ficha (null) + pendente + em analise - a
// MESMA regra do Inicio e do Painel administrativo (contagem unica do
// backend, admin_router.contar_imagens_por_situacao), para os numeros
// baterem em todas as telas. Segunda opiniao, descartada e baixa qualidade
// tem contagem propria.
const STATUS_AGUARDANDO = ['pendente', 'em_analise']

// Quem pode ver esta pagina e enviar imagens novas - tem que bater com
// PERFIS_ENVIO_IMAGENS do backend (auth.py) e com o item de menu
// correspondente em Sidebar.tsx. Sem essa checagem, um usuario sem
// permissao que abrisse esta URL direto veria a tela carregar e so depois
// falhar ao buscar os dados (pior experiencia) - com a checagem, e mandado
// direto pra pagina de acesso negado, como as demais telas restritas.
const PERFIS_PERMITIDOS = ['administrador', 'suporte', 'curador', 'professor']

// Chaves usadas nos selects de filtro - os rotulos (label) vem da traducao
// (namespace ImagensRecebidas.statusAnonimizacao / .statusCuradoriaFiltro).
// 01/11/2026 (auditoria do administrador, M5): os valores REAIS gravados
// (images_router.py grava "concluida"; o padrao do banco e "aguardando").
// Antes o filtro oferecia "validada", que nunca existe - dava 0 imagens.
const OPCOES_ANONIMIZACAO = ['concluida', 'aguardando', 'falha']
const POR_PAGINA = 50

const OPCOES_CURADORIA = [
  'pendente',
  'em_analise',
  'aprovada',
  'segunda_opiniao',
  'baixa_qualidade',
  'descartada',
  'sem_ficha',
]

const CLASSES_ANONIMIZACAO: Record<string, string> = {
  concluida: 'bg-emerald-500/15 text-emerald-300 border-emerald-600/40',
  aguardando: 'bg-slate-500/15 text-slate-300 border-slate-600/40',
  validada: 'bg-emerald-500/15 text-emerald-300 border-emerald-600/40',
  falha: 'bg-red-500/15 text-red-300 border-red-600/40',
}

const CLASSE_SEM_FICHA = 'bg-slate-500/15 text-slate-300 border-slate-600/40'

// next-intl usa 'pt'/'en' - toLocaleDateString espera uma tag de idioma
// completa (ex.: 'pt-BR', 'en-US') pra formatar a data corretamente.
const TAG_LOCALE: Record<string, string> = {
  pt: 'pt-BR',
  en: 'en-US',
}

interface Imagem {
  id: number
  orthanc_id: string
  resource_type: string
  anonimizacao_status: string
  criado_em?: string
  status_curadoria: string | null
  aguarda_recorte?: boolean
}

/** "61", "nº 61", "no 61" -> "61"; qualquer outra coisa -> "" */
function numeroBuscado(termo: string): string {
  const semPrefixo = termo.replace(/^n[ºo°.]?\s*/, '')
  return /^\d+$/.test(semPrefixo) ? String(Number(semPrefixo)) : ''
}

export default function ImagensPage() {
  const router = useRouter()
  const t = useTranslations('ImagensRecebidas')
  const tComum = useTranslations('Comum')
  const locale = useLocale()
  const tagLocale = TAG_LOCALE[locale] ?? 'pt-BR'
  const [autenticado, setAutenticado] = useState(false)
  const [imagens, setImagens] = useState<Imagem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [dataEntrada, setDataEntrada] = useState('')
  const [pagina, setPagina] = useState(1)
  const [filtroAnonimizacao, setFiltroAnonimizacao] = useState('')
  const [filtroCuradoria, setFiltroCuradoria] = useState('')

  // Envio de imagem nova (professor/curador/admin/suporte).
  const inputArquivoRef = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [mensagemEnvio, setMensagemEnvio] = useState('')
  const [erroEnvio, setErroEnvio] = useState('')
  // Erro ao CARREGAR a lista (diferente de erroEnvio, que e so do formulario
  // de upload). So existe pra mostrar mensagem na tela - nunca desloga o
  // usuario, ver comentario abaixo sobre o motivo dessa mudanca.
  const [erroLista, setErroLista] = useState('')

  function formatarData(valor: string | undefined): string {
    if (!valor) return '—'
    const data = new Date(valor)
    if (Number.isNaN(data.getTime())) return '—'
    return data.toLocaleDateString(tagLocale)
  }

  const buscarImagens = useCallback(
    async () => {
      setErroLista('')
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/images/`, {
          credentials: 'include',
        })

        if (!response.ok) {
          // So 401 (token invalido/expirado) e problema de sessao de
          // verdade - so nesse caso manda pro login. Qualquer outro erro
          // (403 de permissao, 500 do servidor, etc.) e mostrado na tela
          // em vez de "deslogar" o usuario - antes QUALQUER erro aqui
          // (inclusive um erro interno do servidor) mandava direto pro
          // login, o que parecia "perder o acesso a conta" mesmo com a
          // conta e a sessao certas.
          if (response.status === 401) {
            router.push('/login')
            return
          }
          const dadosErro = await response.json().catch(() => null)
          setErroLista(
            (typeof dadosErro?.detail === 'string' && dadosErro.detail) ||
              t('erroListaGenerico', { status: response.status })
          )
          setCarregando(false)
          return
        }

        const dados: Imagem[] = await response.json()
        setImagens(dados)
        setCarregando(false)
      } catch {
        // Falha de rede/conexao - tambem nao e problema de sessao.
        setErroLista(t('erroListaConexao'))
        setCarregando(false)
      }
    },
    [router, t]
  )

  useEffect(() => {
    void obterSessaoAtual().then((sessao) => {
      if (!sessao) {
        router.push('/login')
        return
      }

      if (!PERFIS_PERMITIDOS.includes(sessao.perfil)) {
        router.push('/acesso-negado?de=/imagens')
        return
      }

      setAutenticado(true)
      void buscarImagens()
    })
  }, [router, buscarImagens])

  async function enviarImagem(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const arquivo = inputArquivoRef.current?.files?.[0]
    if (!autenticado || !arquivo) return

    setEnviando(true)
    setMensagemEnvio('')
    setErroEnvio('')

    try {
      const corpo = new FormData()
      corpo.append('arquivo', arquivo)

      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/images/upload`, {
        method: 'POST',
        credentials: 'include',
        body: corpo,
      })

      const dados = await resposta.json().catch(() => null)

      if (!resposta.ok) {
        setErroEnvio(
          (typeof dados?.detail === 'string' && dados.detail) || t('erroEnvioGenerico')
        )
        return
      }

      setMensagemEnvio(dados?.status === 'ja_existente' ? t('mensagemDuplicata') : t('mensagemSucesso'))
      if (inputArquivoRef.current) inputArquivoRef.current.value = ''
      void buscarImagens() // atualiza a lista na hora, sem precisar recarregar a pagina
    } catch {
      setErroEnvio(t('erroEnvioConexao'))
    } finally {
      setEnviando(false)
    }
  }

  // Contagens EXATAS sobre a lista completa (imagens), nao a filtrada -
  // os cards de resumo nao devem mudar conforme os filtros da tabela
  // abaixo mudam, sao um retrato geral fixo da tela.
  const totalAguardando = imagens.filter(
    (imagem) => imagem.status_curadoria === null || STATUS_AGUARDANDO.includes(imagem.status_curadoria)
  ).length
  const totalAprovadas = imagens.filter((imagem) => imagem.status_curadoria === 'aprovada').length
  // QA item 9: parte do "aguardando" ainda nao esta na fila da Curadoria
  const totalAguardaRecorte = imagens.filter((imagem) => imagem.aguarda_recorte).length

  const imagensFiltradas = imagens.filter((imagem) => {
    const bateAnonimizacao =
      filtroAnonimizacao === '' || imagem.anonimizacao_status === filtroAnonimizacao

    const bateCuradoria =
      filtroCuradoria === '' ||
      (filtroCuradoria === 'sem_ficha'
        ? imagem.status_curadoria === null
        : imagem.status_curadoria === filtroCuradoria)

    // M5: busca pelo numero curto, pelo ID do Orthanc ou pela data de entrada
    const termo = busca.trim().toLowerCase()
    const bateBusca =
      !termo || String(imagem.id) === numeroBuscado(termo) || imagem.orthanc_id.toLowerCase().includes(termo)
    const bateData = !dataEntrada || (imagem.criado_em ?? '').slice(0, 10) === dataEntrada

    return bateAnonimizacao && bateCuradoria && bateBusca && bateData
  })
  // reteste M5 (01/11/2026): buscando "61", a imagem nº 61 vem PRIMEIRO; os IDs
  // do Orthanc que tem "61" no meio aparecem depois dela
  const numeroExato = numeroBuscado(busca.trim().toLowerCase())
  if (numeroExato) {
    imagensFiltradas.sort((a, b) => Number(String(b.id) === numeroExato) - Number(String(a.id) === numeroExato))
  }
  const totalPaginas = Math.max(1, Math.ceil(imagensFiltradas.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const imagensDaPagina = imagensFiltradas.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA)

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

        <main className="flex-1 overflow-y-auto p-8">
          <h1 className="titulo-pagina tela-entra mb-4">{t('titulo')}</h1>

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DashboardCard
              label={t('totalAguardandoCuradoria')}
              valor={totalAguardando}
              cor="amber"
              detalhe={t('totalAguardandoDetalhe', { recorte: totalAguardaRecorte, fila: totalAguardando - totalAguardaRecorte })}
            />
            <DashboardCard label={t('totalAprovadas')} valor={totalAprovadas} cor="green" />
          </div>

          {erroLista && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-700/40 bg-red-950/30 p-4">
              <p className="text-sm text-red-300">{erroLista}</p>
              <button
                type="button"
                onClick={() => autenticado && buscarImagens()}
                className="rounded-md border border-red-700/50 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-900/40"
              >
                {t('tentarNovamente')}
              </button>
            </div>
          )}

          {/* Envio de imagem nova: liberado pra administrador, suporte,
              curador e professor (PERFIS_ENVIO_IMAGENS no backend). O
              arquivo enviado e anonimizado no Orthanc IMEDIATAMENTE - o
              original identificavel e apagado assim que a versao anonima e
              confirmada (ver _anonimizar_e_excluir_original em
              images_router.py, backend) - e fica registrado na Auditoria
              (tela "Auditoria", visivel so pro administrador) com quem
              enviou e qual imagem. */}
          {/* Degrade horizontal comecando verde (esquerda) e terminando azul
              (direita), por pedido - usa o mesmo caminho de tons do
              Sidebar.tsx (blue -> sky -> cyan -> teal -> emerald), so que
              em ordem invertida da esquerda pra direita. */}
          {/* reteste M5 (01/11/2026): no tema claro o degrade escuro deixava o
              texto quase ilegivel - agora cada tema tem seu fundo. ATENCAO: neste
              projeto as cores "slate-*" sao trocadas pelo tema (globals.css:
              slate-700 = cor de BORDA, quase branca no tema claro); para texto,
              usar as cores do tema (text-ink, text-ink-2) */}
          <section className="mb-6 rounded-xl border border-teal-300 bg-linear-to-r from-emerald-50 via-teal-50 to-blue-50 p-4 dark:border-teal-700/40 dark:from-emerald-950/50 dark:via-teal-950/40 dark:to-blue-950/50">
            <h2 className="mb-1 text-sm font-semibold text-teal-800 dark:text-teal-300">{t('enviarTitulo')}</h2>
            <p className="mb-3 text-xs text-ink-2">
              {t('enviarDescricao')}
            </p>
            <form method="post" onSubmit={enviarImagem} className="flex flex-wrap items-center gap-3">
              <input
                ref={inputArquivoRef}
                type="file"
                accept=".dcm,application/dicom"
                required
                className="text-sm text-ink file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-2 file:text-sm file:font-medium file:text-white file:transition-colors file:hover:bg-brand-hover"
              />
              <button
                type="submit"
                disabled={enviando}
                className="rounded-md bg-brand px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
              >
                {enviando ? t('enviando') : t('enviarBotao')}
              </button>
            </form>
            {mensagemEnvio && <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">{mensagemEnvio}</p>}
            {erroEnvio && (
              <p className="mt-3 text-sm text-red-700 dark:text-red-400" role="alert">
                {erroEnvio}
              </p>
            )}
          </section>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value)
                setPagina(1)
              }}
              placeholder={t('buscaPlaceholder')}
              aria-label={t('buscaPlaceholder')}
              className="w-64 rounded-md border border-slate-700 bg-base-surface2 px-3 py-2 text-sm text-slate-100 outline-hidden focus:border-brand"
            />
            <label className="flex items-center gap-2 text-xs text-slate-400">
              {t('filtroData')}
              <input
                type="date"
                value={dataEntrada}
                onChange={(e) => {
                  setDataEntrada(e.target.value)
                  setPagina(1)
                }}
                className="rounded-md border border-slate-700 bg-base-surface2 px-3 py-2 text-sm text-slate-100 outline-hidden focus:border-brand"
              />
            </label>
            <select
              value={filtroAnonimizacao}
              onChange={(e) => {
                setFiltroAnonimizacao(e.target.value)
                setPagina(1)
              }}
              className="rounded-md border border-slate-700 bg-base-surface2 px-3 py-2 text-sm text-slate-100 outline-hidden focus:border-brand focus:ring-1 focus:ring-brand"
            >
              <option value="">{t('filtroAnonimizacaoTodos')}</option>
              {OPCOES_ANONIMIZACAO.map((valor) => (
                <option key={valor} value={valor}>
                  {t(`statusAnonimizacao.${valor}`)}
                </option>
              ))}
            </select>

            <select
              value={filtroCuradoria}
              onChange={(e) => {
                setFiltroCuradoria(e.target.value)
                setPagina(1)
              }}
              className="rounded-md border border-slate-700 bg-base-surface2 px-3 py-2 text-sm text-slate-100 outline-hidden focus:border-brand focus:ring-1 focus:ring-brand"
            >
              <option value="">{t('filtroCuradoriaTodos')}</option>
              {OPCOES_CURADORIA.map((valor) => (
                <option key={valor} value={valor}>
                  {t(`statusCuradoriaFiltro.${valor}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto rounded-xl border border-base-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-base-surface text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">{t('colunaNumero')}</th>
                  <th className="px-4 py-3 font-medium">{t('colunaIdOrthanc')}</th>
                  <th className="px-4 py-3 font-medium">{t('colunaTipo')}</th>
                  <th className="px-4 py-3 font-medium">{t('colunaStatusAnonimizacao')}</th>
                  <th className="px-4 py-3 font-medium">{t('colunaStatusCuradoria')}</th>
                  <th className="px-4 py-3 font-medium">{t('colunaDataEntrada')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-base">
                {imagensDaPagina.map((imagem) => {
                  const classeAnonimizacao =
                    CLASSES_ANONIMIZACAO[imagem.anonimizacao_status] ??
                    'bg-slate-500/15 text-slate-300 border-slate-600/40'

                  return (
                    <tr key={imagem.id} className="text-slate-200">
                      <td className="px-4 py-3 font-semibold text-ink">nº {imagem.id}</td>
                      {/* ID longo do Orthanc encurtado; o completo aparece ao passar o mouse */}
                      <td className="px-4 py-3 font-mono text-xs text-slate-400" title={imagem.orthanc_id}>
                        {imagem.orthanc_id.slice(0, 8)}…
                      </td>
                      <td className="px-4 py-3">
                        {t.has(`tipoRecurso.${imagem.resource_type}`) ? t(`tipoRecurso.${imagem.resource_type}`) : imagem.resource_type}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${classeAnonimizacao}`}
                        >
                          {imagem.anonimizacao_status in CLASSES_ANONIMIZACAO
                            ? t(`statusAnonimizacao.${imagem.anonimizacao_status}`)
                            : imagem.anonimizacao_status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {imagem.status_curadoria ? (
                          <StatusBadge status={imagem.status_curadoria} />
                        ) : (
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${CLASSE_SEM_FICHA}`}
                          >
                            {t('semFicha')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400">{formatarData(imagem.criado_em)}</td>
                    </tr>
                  )
                })}

                {imagensFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                      {t('nenhumaImagem')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* M5: paginas de 50 (antes as 454 imagens numa tabela so) */}
          <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
            <span>
              {imagensFiltradas.length > 0
                ? t('mostrando', {
                    de: (paginaAtual - 1) * POR_PAGINA + 1,
                    ate: Math.min(paginaAtual * POR_PAGINA, imagensFiltradas.length),
                    total: imagensFiltradas.length,
                  })
                : ''}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPagina(Math.max(1, paginaAtual - 1))}
                disabled={paginaAtual <= 1}
                className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500 disabled:opacity-50"
              >
                {t('anterior')}
              </button>
              <span>{t('paginaDe', { atual: paginaAtual, total: totalPaginas })}</span>
              <button
                type="button"
                onClick={() => setPagina(Math.min(totalPaginas, paginaAtual + 1))}
                disabled={paginaAtual >= totalPaginas}
                className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500 disabled:opacity-50"
              >
                {t('proxima')}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
