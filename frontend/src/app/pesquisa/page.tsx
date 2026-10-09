'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import MiniaturaImagem from '../../components/MiniaturaImagem'
import EtiquetaMarcacoes from '../../components/visualizador/EtiquetaMarcacoes'
import MenuImpressao from '../../components/impressao/MenuImpressao'
import { MenuSalvarComo, MenuSalvarMinhasImagens } from '../../components/impressao/MenuSalvar'
import VisualizadorSequencial from '../../components/VisualizadorSequencial'
import SeletorDentesQuadrante from '../../components/curadoria/SeletorDentesQuadrante'
import type { Marcacao } from '../../lib/marcacoes'
import { corTextoAchado, corCartaoTipoRadiografia } from '../../lib/coresAchados'
import { obterSessaoAtual } from '../../lib/sessao'
import { TIPOS_ACHADO, REGIOES_ANATOMICAS, TIPOS_ERRO_TECNICO, rotularTipoAchado } from '../../lib/achados'

// `chave` referencia o namespace Pesquisa.opcoes das mensagens de traducao
// (messages/pt.json e messages/en.json) - o rotulo (label) visivel vem de
// la, na hora de renderizar, em vez de ficar fixo aqui no codigo.
const OPCOES_TIPO_RADIOGRAFIA = [
  { valor: 'periapical', chave: 'periapical' },
  { valor: 'panoramica', chave: 'panoramica' },
  { valor: 'interproximal', chave: 'interproximal' },
  { valor: 'oclusal', chave: 'oclusal' },
]

const OPCOES_ARCADA = [
  { valor: 'superior', chave: 'superior' },
  { valor: 'inferior', chave: 'inferior' },
]

const OPCOES_LADO = [
  { valor: 'direito', chave: 'direito' },
  { valor: 'esquerdo', chave: 'esquerdo' },
]

const OPCOES_GENERO = [
  { valor: 'masculino', chave: 'masculino' },
  { valor: 'feminino', chave: 'feminino' },
]

// Valores reais do enum AchadoPrincipal (backend/app/modules/curations.py) -
// confirmado no arquivo antes de montar esta lista.
const OPCOES_ACHADO_PRINCIPAL = [
  { valor: 'normal', chave: 'normal' },
  { valor: 'carie', chave: 'carie' },
  { valor: 'lesao_periapical', chave: 'lesaoPeriapical' },
  { valor: 'perda_ossea', chave: 'perdaOssea' },
  { valor: 'dente_incluso', chave: 'denteIncluso' },
  { valor: 'tratamento_endodontico', chave: 'tratamentoEndodontico' },
  { valor: 'erro_tecnico', chave: 'erroTecnico' },
  { valor: 'outro', chave: 'outro' },
]

// Valores reais do enum QualidadeTecnica.
const OPCOES_QUALIDADE_TECNICA = [
  { valor: 'otima', chave: 'otima' },
  { valor: 'boa', chave: 'boa' },
  { valor: 'regular', chave: 'regular' },
  { valor: 'insatisfatoria', chave: 'insatisfatoria' },
]

const OPCOES_DIFICULDADE = [
  { valor: 'basico', chave: 'basico' },
  { valor: 'intermediario', chave: 'intermediario' },
  { valor: 'avancado', chave: 'avancado' },
]

// Valores reais do enum OrigemImagem (backend/app/modules/orthanc_references.py).
// "ufsc" = veio direto do aparelho de raio-x da UFSC (protocolo DICOM/C-STORE),
// detectado automaticamente pelo Orthanc - ninguem escolhe isso na mao.
// "externa" = chegou por upload manual (tela "Imagens recebidas").
const OPCOES_ORIGEM = [
  { valor: 'ufsc', chave: 'ufsc' },
  { valor: 'externa', chave: 'externa' },
]

// Cor suave da caixa de texto/selecao de cada filtro na Busca avancada - um
// degrade indo do azul (primeiro campo) ao verde (ultimo campo), calculado
// por interpolacao linear entre azul (#3b82f6) e verde (#22c55e). Indice =
// posicao do campo na grade (Genero=0 - sem caixa de texto, entao sem cor -,
// Dente=1, ... Idade max=10).
const CORES_CAIXA_FILTRO: [number, number, number][] = [
  [59, 130, 246],
  [57, 137, 231],
  [54, 143, 216],
  [52, 150, 200],
  [49, 157, 185],
  [47, 164, 170],
  [44, 170, 155],
  [42, 177, 140],
  [39, 184, 124],
  [37, 190, 109],
  [34, 197, 94],
]

function estiloCaixaFiltro(indice: number): { backgroundColor: string; borderColor: string } {
  const [r, g, b] = CORES_CAIXA_FILTRO[indice % CORES_CAIXA_FILTRO.length]
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.16)`,
    borderColor: `rgba(${r}, ${g}, ${b}, 0.55)`,
  }
}

interface Filtros {
  tipo_radiografia: string
  arcada: string
  lado: string
  achado_principal: string
  genero: string
  qualidade_tecnica: string
  dificuldade: string
  origem: string
  idade_min: string
  idade_max: string
  // Fase 4 - classificacao odontologica estruturada.
  quadrante: string
  dentesSelecionados: number[]
  modoDentes: 'qualquer_um' | 'todos'
  achado: string
  regiaoAnatomica: string
  erroTecnico: string
}

const FILTROS_VAZIOS: Filtros = {
  tipo_radiografia: '',
  arcada: '',
  lado: '',
  achado_principal: '',
  genero: '',
  qualidade_tecnica: '',
  dificuldade: '',
  origem: '',
  idade_min: '',
  idade_max: '',
  quadrante: '',
  dentesSelecionados: [],
  modoDentes: 'qualquer_um',
  achado: '',
  regiaoAnatomica: '',
  erroTecnico: '',
}

// So os filtros de valor simples (string) participam do deep-link por URL
// (usado pelo Banco de imagens, que so manda tipo_radiografia/achado_principal/
// qualidade_tecnica hoje - ver GradeCategoriasImagens.tsx) - quadrante/dentes
// tem forma propria (lista + modo) e nao se encaixam nesse mecanismo de
// "1 parametro = 1 chave de Filtros", entao ficam de fora dele.
type ChaveFiltroTexto = Exclude<keyof Filtros, 'dentesSelecionados' | 'modoDentes'>
const CHAVES_FILTRO: ChaveFiltroTexto[] = [
  'tipo_radiografia',
  'arcada',
  'lado',
  'achado_principal',
  'genero',
  'qualidade_tecnica',
  'dificuldade',
  'origem',
  'idade_min',
  'idade_max',
  'quadrante',
  'achado',
  'regiaoAnatomica',
  'erroTecnico',
]

interface ResultadoImagem {
  curation_id: number
  orthanc_reference_id: number
  orthanc_id: string
  modalidade: string
  tipo_radiografia: string | null
  dentes: number[] | null
  achado_principal: string | null
  achados_detalhe: string | null
  alteracoes_observadas: string[] | null
  marcacoes: Marcacao[]
  qualidade_tecnica: string | null
  dificuldade: string | null
  origem: string | null
  descricao_didatica: string | null
  viewer_url: string | null
}

function rotular(
  opcoes: { valor: string; chave: string }[],
  valor: string | null,
  traduzir: (chave: string) => string
): string {
  if (!valor) return '—'
  const opcao = opcoes.find((o) => o.valor === valor)
  return opcao ? traduzir(opcao.chave) : valor
}

// Ao passar o mouse, o cartao do resultado cresce 70% (scale 1.7) por cima
// dos vizinhos. Para nao "vazar" para fora da area da pagina (sumindo por
// baixo do menu ou da borda), o ponto fixo da ampliacao muda conforme a
// posicao do cartao: perto da borda esquerda ele cresce para a direita,
// perto da direita cresce para a esquerda, e o mesmo em cima/embaixo.
function ajustarOrigemAmpliacao(cartao: HTMLElement) {
  const area = (cartao.closest('main') ?? document.body).getBoundingClientRect()
  const r = cartao.getBoundingClientRect()
  const sobraX = r.width * 0.35 + 8
  const sobraY = r.height * 0.35 + 8
  const topoVisivel = Math.max(area.top, 0)
  const baseVisivel = Math.min(area.bottom, window.innerHeight)
  const h = r.left - area.left < sobraX ? 'left' : area.right - r.right < sobraX ? 'right' : 'center'
  const v = r.top - topoVisivel < sobraY ? 'top' : baseVisivel - r.bottom < sobraY ? 'bottom' : 'center'
  cartao.style.transformOrigin = `${v} ${h}`
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

function PesquisaConteudo() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('Pesquisa')
  const tComum = useTranslations('Comum')
  // Reaproveita os MESMOS rotulos de regiao anatomica/erro tecnico ja
  // criados na Fase 3 pra Curadoria (Curadoria.achadosEstruturados/
  // erroTecnico) - mesmo vocabulario, sem duplicar traducao.
  const tAchadosEstruturados = useTranslations('Curadoria.achadosEstruturados')
  const tErroTecnico = useTranslations('Curadoria.erroTecnico')
  // Mesmo namespace ja usado por PainelAchadosRadiografia.tsx pros 26
  // valores de achado/alteracao observada - antes rotularTipoAchado
  // devolvia um rotulo fixo em portugues aqui (bug de i18n), agora usa
  // esse tradutor.
  const tAlteracoesItens = useTranslations('AlteracoesObservadas.itens')
  const traduzirTipoRadiografia = (chave: string) => t(`opcoes.tipoRadiografia.${chave}`)
  const traduzirGenero = (chave: string) => t(`opcoes.genero.${chave}`)
  const traduzirArcada = (chave: string) => t(`opcoes.arcada.${chave}`)
  const traduzirLado = (chave: string) => t(`opcoes.lado.${chave}`)
  const traduzirAchadoPrincipal = (chave: string) => t(`opcoes.achadoPrincipal.${chave}`)
  const traduzirQualidadeTecnica = (chave: string) => t(`opcoes.qualidadeTecnica.${chave}`)
  const traduzirDificuldade = (chave: string) => t(`opcoes.dificuldade.${chave}`)
  const traduzirOrigem = (chave: string) => t(`opcoes.origem.${chave}`)

  const [autenticado, setAutenticado] = useState(false)
  const [carregandoPagina, setCarregandoPagina] = useState(true)

  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS)
  const [resultados, setResultados] = useState<ResultadoImagem[]>([])
  const [totalResultados, setTotalResultados] = useState(0)
  const [totalDisponivel, setTotalDisponivel] = useState<number | null>(null)
  const [jaPesquisou, setJaPesquisou] = useState(false)
  const [pesquisando, setPesquisando] = useState(false)
  // Depois de pesquisar, os campos de busca se recolhem para dar espaco as
  // imagens encontradas; o botao "Voltar a busca avancada" os mostra de novo.
  const [filtrosRecolhidos, setFiltrosRecolhidos] = useState(false)
  const [erro, setErro] = useState('')
  const [selecionados, setSelecionados] = useState<number[]>([])
  const [indiceVisualizador, setIndiceVisualizador] = useState<number | null>(null)
  // Selecao em lote: numero ajustavel (nao so 10/15/20 fixos - o curador
  // pode digitar qualquer quantidade) usado tanto pelos atalhos rapidos
  // quanto pelo botao "Selecionar mais". Cada clique adiciona as proximas
  // N imagens AINDA NAO selecionadas (nao substitui a selecao atual) -
  // assim da pra ir selecionando "de 10 em 10", "de 15 em 15" etc,
  // acumulando aos poucos em vez de precisar clicar imagem por imagem.
  const [quantidadeLote, setQuantidadeLote] = useState(10)
  // Incrementado a cada "Limpar filtros" e usado como `key` do
  // SeletorDentesQuadrante abaixo - forca o componente a remontar do
  // zero, o que reseta seu estado interno (quadranteAberto), ja que esse
  // estado nao e controlado por fora (ver SeletorDentesQuadrante.tsx).
  // Sem isso, o quadrante clicado por ultimo continuava aparecendo
  // visualmente aberto mesmo depois de "Limpar filtros" (nenhum dente
  // marcado, nenhum filtro real enviado, mas o painel ficava exposto).
  const [chaveSeletorDentes, setChaveSeletorDentes] = useState(0)

  useEffect(() => {
    obterSessaoAtual().then((sessao) => {
      if (!sessao) {
        router.push('/login')
        return
      }
      setAutenticado(true)
      setCarregandoPagina(false)

      fetch(`${process.env.NEXT_PUBLIC_API_URL}/search/counts`, {
        credentials: 'include',
      })
        .then((resposta) => (resposta.ok ? resposta.json() : null))
        .then((dados) => {
          if (dados) setTotalDisponivel(dados.total)
        })
        .catch(() => {
          // sem o total geral, a tela continua funcionando normalmente
        })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  // Se a URL veio com filtros (ex: vindo do Banco de imagens), preenche o
  // formulario com eles e ja dispara a busca automaticamente.
  useEffect(() => {
    if (!autenticado) return

    const filtrosDaUrl: Filtros = { ...FILTROS_VAZIOS }
    let temFiltroNaUrl = false
    for (const chave of CHAVES_FILTRO) {
      const valor = searchParams.get(chave)
      if (valor) {
        filtrosDaUrl[chave] = valor
        temFiltroNaUrl = true
      }
    }

    if (temFiltroNaUrl) {
      setFiltros(filtrosDaUrl)
      pesquisar(filtrosDaUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autenticado])

  function atualizarFiltro(campo: ChaveFiltroTexto, valor: string) {
    setFiltros({ ...filtros, [campo]: valor })
  }

  // Quantos filtros estao em uso (mostrado na barra recolhida).
  const totalFiltrosAtivos =
    (Object.keys(FILTROS_VAZIOS) as (keyof Filtros)[]).filter((chave) => {
      if (chave === 'modoDentes') return false
      const valor = filtros[chave]
      return Array.isArray(valor) ? valor.length > 0 : Boolean(valor)
    }).length

  function voltarBuscaAvancada() {
    setFiltrosRecolhidos(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function limparFiltros() {
    setFiltros(FILTROS_VAZIOS)
    setChaveSeletorDentes((c) => c + 1)
  }

  async function pesquisar(filtrosParaUsar: Filtros = filtros) {
    if (!autenticado) return
    setPesquisando(true)
    setErro('')
    setJaPesquisou(true)
    setFiltrosRecolhidos(true)

    const params = new URLSearchParams()
    if (filtrosParaUsar.tipo_radiografia) params.set('tipo_radiografia', filtrosParaUsar.tipo_radiografia)
    if (filtrosParaUsar.arcada) params.set('arcada', filtrosParaUsar.arcada)
    if (filtrosParaUsar.lado) params.set('lado', filtrosParaUsar.lado)
    if (filtrosParaUsar.achado_principal) params.set('achado_principal', filtrosParaUsar.achado_principal)
    if (filtrosParaUsar.genero) params.set('genero', filtrosParaUsar.genero)
    if (filtrosParaUsar.qualidade_tecnica) params.set('qualidade_tecnica', filtrosParaUsar.qualidade_tecnica)
    if (filtrosParaUsar.dificuldade) params.set('dificuldade', filtrosParaUsar.dificuldade)
    if (filtrosParaUsar.origem) params.set('origem', filtrosParaUsar.origem)
    if (filtrosParaUsar.idade_min) params.set('idade_min', filtrosParaUsar.idade_min)
    if (filtrosParaUsar.idade_max) params.set('idade_max', filtrosParaUsar.idade_max)

    // Fase 4 - dentes: se ha dentes INDIVIDUAIS marcados, eles mandam (o
    // quadrante vira redundante, a interface nunca marca os dois ao mesmo
    // tempo - ver SeletorDentesQuadrante). Sem dente nenhum marcado mas
    // com um quadrante escolhido, o quadrante sozinho vira filtro (secao
    // 9/10 do pedido: "Quadrante 4, nenhum dente selecionado" -> pesquisa
    // por qualquer dente do Q4).
    if (filtrosParaUsar.dentesSelecionados.length > 0) {
      filtrosParaUsar.dentesSelecionados.forEach((d) => params.append('dentes', String(d)))
      if (filtrosParaUsar.dentesSelecionados.length > 1) {
        params.set('modo_dentes', filtrosParaUsar.modoDentes)
      }
    } else if (filtrosParaUsar.quadrante) {
      params.set('quadrante', filtrosParaUsar.quadrante)
    }
    if (filtrosParaUsar.achado) params.set('achado', filtrosParaUsar.achado)
    if (filtrosParaUsar.regiaoAnatomica) params.set('regiao_anatomica', filtrosParaUsar.regiaoAnatomica)
    if (filtrosParaUsar.erroTecnico) params.set('erro_tecnico', filtrosParaUsar.erroTecnico)

    // Antes nao mandava "limit" nenhum, entao o backend usava o padrao
    // (50) - "Selecionar todas" e a selecao em lote so fazem sentido
    // sobre as imagens que de fato carregaram aqui, entao subimos pro
    // maximo que a API aceita (200) pra cobrir bem mais resultados.
    params.set('limit', '200')

    try {
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/search?${params.toString()}`, {
        credentials: 'include',
      })
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) {
        setErro(await extrairErro(resposta, t('erroPesquisaGenerico')))
        return
      }
      const dados = await resposta.json()
      setResultados(dados.itens ?? [])
      setTotalResultados(dados.total ?? (dados.itens ?? []).length)
      setSelecionados([])
    } catch {
      setErro(t('erroPesquisaGenerico'))
    } finally {
      setPesquisando(false)
    }
  }

  function alternarSelecao(curationId: number) {
    setSelecionados((atual) =>
      atual.includes(curationId) ? atual.filter((id) => id !== curationId) : [...atual, curationId]
    )
  }

  function selecionarTodas() {
    setSelecionados(resultados.map((imagem) => imagem.curation_id))
  }

  function limparSelecao() {
    setSelecionados([])
  }

  // Seleciona as proximas "quantidade" imagens que ainda NAO estao
  // selecionadas, na ordem em que aparecem nos resultados, e ACRESCENTA
  // a selecao atual (nao substitui) - permite ir selecionando aos poucos
  // ("de 10 em 10", "de 15 em 15" etc, ou qualquer numero digitado em
  // quantidadeLote).
  function selecionarMais(quantidade: number) {
    if (quantidade < 1) return
    const naoSelecionados = resultados
      .map((imagem) => imagem.curation_id)
      .filter((id) => !selecionados.includes(id))
    const proximos = naoSelecionados.slice(0, quantidade)
    if (proximos.length === 0) return
    setSelecionados((atual) => [...atual, ...proximos])
  }

  const itensSelecionados = resultados
    .map((imagem, indice) => ({ imagem, numero: indice + 1 }))
    .filter(({ imagem }) => selecionados.includes(imagem.curation_id))
    .map(({ imagem, numero }) => ({
      curation_id: imagem.curation_id,
      numero,
      descricao_didatica: imagem.descricao_didatica,
      tipo_radiografia: imagem.tipo_radiografia,
      viewer_url: imagem.viewer_url,
      achados_detalhe: imagem.achados_detalhe,
      alteracoes_observadas: imagem.alteracoes_observadas,
      marcacoes: imagem.marcacoes,
      qualidade_tecnica: imagem.qualidade_tecnica,
      dentes: imagem.dentes,
      achado_principal: imagem.achado_principal,
    }))

  if (carregandoPagina) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-base">
        <p className="text-slate-300">{tComum('carregando')}</p>
      </main>
    )
  }

  const campoLabel = 'mb-1.5 block text-xs font-medium text-slate-400'
  const campoInput =
    'w-full rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand'

  function pillClasse(ativo: boolean): string {
    return `rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
      ativo
        ? 'border-brand bg-brand text-white'
        : 'border-base-border text-slate-300 hover:border-brand/50'
    }`
  }

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar />

      <div className="flex flex-1 flex-col">
        <Topbar />

        <main className="flex-1 overflow-y-auto p-6">
          <h1 className="titulo-pagina tela-entra">
            {t('tituloPrefixo')} <span className="text-teal-600 dark:text-teal-300">{t('tituloDestaque')}</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {t('subtitulo')}
            {totalDisponivel !== null && (
              <>
                {' '}
                <span className="font-semibold text-slate-200">{totalDisponivel}</span>{' '}
                {totalDisponivel === 1 ? t('totalDisponivelSingular') : t('totalDisponivelPlural')}.
              </>
            )}
          </p>

          {filtrosRecolhidos ? (
            // Busca recolhida: so uma barra fina com o botao de voltar, para
            // as imagens encontradas ocuparem a tela.
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={voltarBuscaAvancada}
                className="flex items-center gap-2 rounded-lg border border-teal-400/50 bg-teal-400/10 px-4 py-2 text-sm font-medium text-teal-200 transition hover:bg-teal-400/20"
              >
                <span aria-hidden="true">←</span> 🔎 {t('voltarBuscaAvancada')}
              </button>
              {totalFiltrosAtivos > 0 && (
                <span className="text-xs text-slate-400">{t('filtrosEmUso', { total: totalFiltrosAtivos })}</span>
              )}
              {erro && (
                <p className="text-sm text-red-400" role="alert">
                  {erro}
                </p>
              )}
            </div>
          ) : (
          <>
          <div className="mt-6">
            <p className="mb-3 text-sm font-medium text-slate-300">{t('acessoRapidoTitulo')}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {/* Cada caixa com sua PROPRIA cor (../../lib/coresAchados) - Periapical
                  em teal, Panoramica em ciano, Interproximal em azul-claro e
                  Oclusal em indigo, pra ficarem facilmente distinguiveis entre si.
                  O anel azul (ring-brand) continua marcando qual esta selecionada. */}
              {OPCOES_TIPO_RADIOGRAFIA.map((o) => (
                <button
                  key={o.valor}
                  type="button"
                  onClick={() => {
                    const novos = { ...filtros, tipo_radiografia: o.valor }
                    setFiltros(novos)
                    pesquisar(novos)
                  }}
                  className={`flex flex-col items-center gap-2 rounded-2xl border bg-gradient-to-br p-5 text-sm font-medium transition-transform hover:-translate-y-0.5 ${corCartaoTipoRadiografia(o.valor)} ${
                    filtros.tipo_radiografia === o.valor ? 'ring-2 ring-brand ring-offset-2 ring-offset-base' : ''
                  }`}
                >
                  <span className="text-2xl" aria-hidden="true">
                    🦷
                  </span>
                  {traduzirTipoRadiografia(o.chave)}
                </button>
              ))}
            </div>
          </div>

          <section className="mt-6 rounded-2xl border border-base-border bg-base-surface p-5">
            <p className="text-sm font-semibold text-ink">🔎 {t('buscaAvancadaTitulo')}</p>
            <p className="mb-4 mt-0.5 text-xs text-slate-400">{t('buscaAvancadaSubtitulo')}</p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <div>
                <label className={campoLabel}>{t('campoGenero')}</label>
                <div className="flex flex-wrap gap-2">
                  {[{ valor: '', chave: '' }, ...OPCOES_GENERO].map((o) => (
                    <button
                      key={o.valor || 'todos'}
                      type="button"
                      onClick={() => atualizarFiltro('genero', o.valor)}
                      className={pillClasse(filtros.genero === o.valor)}
                    >
                      {o.valor ? traduzirGenero(o.chave) : t('campoTodos')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fase 4: quadrante -> dentes, mesma regra da Curadoria (os
                  numeros dos dentes so aparecem depois de escolhido um
                  quadrante - secao 7/53 do pedido). Reaproveita o MESMO
                  componente/lista FDI da Curadoria (SeletorDentesQuadrante,
                  lib/dentesFdi.ts), sem duplicar nada. Quadrante SOZINHO
                  (sem nenhum dente marcado) ja e um filtro valido por si so
                  - por isso guarda o quadrante ativo em filtros.quadrante
                  via onQuadranteChange, nao so os dentes marcados. */}
              <div className="col-span-2 rounded-lg border p-2.5" style={estiloCaixaFiltro(1)}>
                <label className={campoLabel}>{t('campoDentes')}</label>
                <SeletorDentesQuadrante
                  key={chaveSeletorDentes}
                  dentesSelecionados={filtros.dentesSelecionados}
                  onChange={(dentes) => setFiltros({ ...filtros, dentesSelecionados: dentes })}
                  onQuadranteChange={(quadrante) => setFiltros((f) => ({ ...f, quadrante: quadrante ? String(quadrante) : '' }))}
                />
                {/* Modo ANY/TODOS - so aparece com mais de 1 dente marcado
                    (pedido explicito, secao 14: "nao fazer o usuario
                    selecionar um modo quando houver apenas um dente"). */}
                {filtros.dentesSelecionados.length > 1 && (
                  <div className="mt-2 flex items-center gap-3 text-xs text-slate-300">
                    <label className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="modo_dentes"
                        checked={filtros.modoDentes === 'qualquer_um'}
                        onChange={() => setFiltros({ ...filtros, modoDentes: 'qualquer_um' })}
                      />
                      {t('modoQualquerUm')}
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="modo_dentes"
                        checked={filtros.modoDentes === 'todos'}
                        onChange={() => setFiltros({ ...filtros, modoDentes: 'todos' })}
                      />
                      {t('modoTodos')}
                    </label>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="filtro-arcada" className={campoLabel}>{t('campoArcada')}</label>
                <select
                  id="filtro-arcada"
                  value={filtros.arcada}
                  onChange={(e) => atualizarFiltro('arcada', e.target.value)}
                  className={campoInput}
                  style={estiloCaixaFiltro(2)}
                >
                  <option className="bg-white text-slate-900" value="">{t('opcaoTodas')}</option>
                  {OPCOES_ARCADA.map((o) => (
                    <option className="bg-white text-slate-900" key={o.valor} value={o.valor}>{traduzirArcada(o.chave)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="filtro-lado" className={campoLabel}>{t('campoLado')}</label>
                <select
                  id="filtro-lado"
                  value={filtros.lado}
                  onChange={(e) => atualizarFiltro('lado', e.target.value)}
                  className={campoInput}
                  style={estiloCaixaFiltro(3)}
                >
                  <option className="bg-white text-slate-900" value="">{t('opcaoAmbos')}</option>
                  {OPCOES_LADO.map((o) => (
                    <option className="bg-white text-slate-900" key={o.valor} value={o.valor}>{traduzirLado(o.chave)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="filtro-tipo-exame" className={campoLabel}>{t('campoTipoExame')}</label>
                <select
                  id="filtro-tipo-exame"
                  value={filtros.tipo_radiografia}
                  onChange={(e) => atualizarFiltro('tipo_radiografia', e.target.value)}
                  className={campoInput}
                  style={estiloCaixaFiltro(4)}
                >
                  <option className="bg-white text-slate-900" value="">{t('opcaoTodas')}</option>
                  {OPCOES_TIPO_RADIOGRAFIA.map((o) => (
                    <option className="bg-white text-slate-900" key={o.valor} value={o.valor}>{traduzirTipoRadiografia(o.chave)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="filtro-patologia" className={campoLabel}>{t('campoPatologia')}</label>
                <select
                  id="filtro-patologia"
                  value={filtros.achado_principal}
                  onChange={(e) => atualizarFiltro('achado_principal', e.target.value)}
                  className={campoInput}
                  style={estiloCaixaFiltro(5)}
                >
                  <option className="bg-white text-slate-900" value="">{t('opcaoTodas')}</option>
                  {OPCOES_ACHADO_PRINCIPAL.map((o) => (
                    <option className="bg-white text-slate-900" key={o.valor} value={o.valor}>{traduzirAchadoPrincipal(o.chave)}</option>
                  ))}
                </select>
              </div>

              {/* Fase 4 - achado/condicao estruturado: busca HIBRIDA
                  (legado + Achado estruturado) quando sozinho; so
                  estruturado quando combinado com dentes/regiao (ver
                  search_router.py). Diferente do campo "Patologia" acima
                  (achado_principal, legado, write-orphaned na Curadoria
                  atual - preservado sem alteracao nenhuma). */}
              <div>
                <label htmlFor="filtro-achado" className={campoLabel}>{t('campoAchado')}</label>
                <select
                  id="filtro-achado"
                  value={filtros.achado}
                  onChange={(e) => atualizarFiltro('achado', e.target.value)}
                  className={campoInput}
                  style={estiloCaixaFiltro(9)}
                >
                  <option className="bg-white text-slate-900" value="">{t('opcaoTodas')}</option>
                  {TIPOS_ACHADO.map((valor) => (
                    <option className="bg-white text-slate-900" key={valor} value={valor}>
                      {rotularTipoAchado(valor, tAchadosEstruturados('outro'), tAlteracoesItens)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="filtro-regiao-anatomica" className={campoLabel}>{t('campoRegiaoAnatomica')}</label>
                <select
                  id="filtro-regiao-anatomica"
                  value={filtros.regiaoAnatomica}
                  onChange={(e) => atualizarFiltro('regiaoAnatomica', e.target.value)}
                  className={campoInput}
                  style={estiloCaixaFiltro(10)}
                >
                  <option className="bg-white text-slate-900" value="">{t('opcaoTodas')}</option>
                  {REGIOES_ANATOMICAS.map((valor) => (
                    <option className="bg-white text-slate-900" key={valor} value={valor}>
                      {tAchadosEstruturados(`regioes.${valor}` as Parameters<typeof tAchadosEstruturados>[0])}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="filtro-erro-tecnico" className={campoLabel}>{t('campoErroTecnico')}</label>
                <select
                  id="filtro-erro-tecnico"
                  value={filtros.erroTecnico}
                  onChange={(e) => atualizarFiltro('erroTecnico', e.target.value)}
                  className={campoInput}
                  style={estiloCaixaFiltro(0)}
                >
                  <option className="bg-white text-slate-900" value="">{t('opcaoTodas')}</option>
                  {TIPOS_ERRO_TECNICO.map((valor) => (
                    <option className="bg-white text-slate-900" key={valor} value={valor}>
                      {tErroTecnico(`tipos.${valor}` as Parameters<typeof tErroTecnico>[0])}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="filtro-qualidade-tecnica" className={campoLabel}>{t('campoQualidadeTecnica')}</label>
                <select
                  id="filtro-qualidade-tecnica"
                  value={filtros.qualidade_tecnica}
                  onChange={(e) => atualizarFiltro('qualidade_tecnica', e.target.value)}
                  className={campoInput}
                  style={estiloCaixaFiltro(6)}
                >
                  <option className="bg-white text-slate-900" value="">{t('opcaoTodas')}</option>
                  {OPCOES_QUALIDADE_TECNICA.map((o) => (
                    <option className="bg-white text-slate-900" key={o.valor} value={o.valor}>{traduzirQualidadeTecnica(o.chave)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="filtro-dificuldade" className={campoLabel}>{t('campoDificuldade')}</label>
                <select
                  id="filtro-dificuldade"
                  value={filtros.dificuldade}
                  onChange={(e) => atualizarFiltro('dificuldade', e.target.value)}
                  className={campoInput}
                  style={estiloCaixaFiltro(7)}
                >
                  <option className="bg-white text-slate-900" value="">{t('opcaoTodas')}</option>
                  {OPCOES_DIFICULDADE.map((o) => (
                    <option className="bg-white text-slate-900" key={o.valor} value={o.valor}>{traduzirDificuldade(o.chave)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="filtro-origem" className={campoLabel}>{t('campoOrigem')}</label>
                <select
                  id="filtro-origem"
                  value={filtros.origem}
                  onChange={(e) => atualizarFiltro('origem', e.target.value)}
                  className={campoInput}
                  style={estiloCaixaFiltro(8)}
                >
                  <option className="bg-white text-slate-900" value="">{t('opcaoTodas')}</option>
                  {OPCOES_ORIGEM.map((o) => (
                    <option className="bg-white text-slate-900" key={o.valor} value={o.valor}>{traduzirOrigem(o.chave)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={campoLabel}>{t('campoIdadeMin')}</label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={filtros.idade_min}
                  onChange={(e) => atualizarFiltro('idade_min', e.target.value)}
                  className={campoInput}
                  style={estiloCaixaFiltro(9)}
                />
              </div>

              <div>
                <label className={campoLabel}>{t('campoIdadeMax')}</label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={filtros.idade_max}
                  onChange={(e) => atualizarFiltro('idade_max', e.target.value)}
                  className={campoInput}
                  style={estiloCaixaFiltro(10)}
                />
              </div>
            </div>

            {/* Resumo do que esta selecionado no momento (secao 39 do
                pedido) - so os filtros da classificacao odontologica nova,
                que sao os que mais mudam de estado (quadrante/dentes/modo)
                e onde fica menos obvio "o que exatamente vou pesquisar". */}
            {(filtros.tipo_radiografia || filtros.quadrante || filtros.dentesSelecionados.length > 0 || filtros.achado || filtros.regiaoAnatomica || filtros.erroTecnico) && (
              <div className="mt-4 flex flex-wrap items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-xs text-slate-300">
                <span className="font-medium text-brand-300">{t('resumoSelecaoTitulo')}:</span>
                {filtros.tipo_radiografia && (
                  <span>
                    {t('resumoTipoRadiografia', { tipo: rotular(OPCOES_TIPO_RADIOGRAFIA, filtros.tipo_radiografia, traduzirTipoRadiografia) })}
                  </span>
                )}
                {filtros.quadrante && <span>{t('resumoQuadrante', { numero: filtros.quadrante })}</span>}
                {filtros.dentesSelecionados.length > 0 && (
                  <span>{t('resumoDentes', { dentes: filtros.dentesSelecionados.join(', ') })}</span>
                )}
                {filtros.dentesSelecionados.length > 1 && (
                  <span>
                    {t('resumoModo', { modo: filtros.modoDentes === 'todos' ? t('modoTodos') : t('modoQualquerUm') })}
                  </span>
                )}
                {filtros.achado && (
                  <span>{t('resumoAchado', { achado: rotularTipoAchado(filtros.achado, tAchadosEstruturados('outro'), tAlteracoesItens) })}</span>
                )}
                {filtros.regiaoAnatomica && (
                  <span>
                    {t('resumoRegiao', {
                      regiao: tAchadosEstruturados(`regioes.${filtros.regiaoAnatomica}` as Parameters<typeof tAchadosEstruturados>[0]),
                    })}
                  </span>
                )}
                {filtros.erroTecnico && (
                  <span>
                    {t('resumoErroTecnico', {
                      erro: tErroTecnico(`tipos.${filtros.erroTecnico}` as Parameters<typeof tErroTecnico>[0]),
                    })}
                  </span>
                )}
              </div>
            )}

            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => pesquisar()}
                disabled={pesquisando}
                className="flex items-center gap-2 rounded-lg bg-brand hover:bg-brand-hover px-5 py-2.5 text-sm font-medium text-white shadow-glow transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                🔍 {pesquisando ? t('pesquisando') : t('botaoPesquisar')}
              </button>
              <button
                type="button"
                onClick={limparFiltros}
                disabled={pesquisando}
                className="rounded-lg border border-base-border px-4 py-2.5 text-sm text-slate-300 hover:border-status-danger hover:text-status-danger disabled:opacity-50"
              >
                {t('botaoLimparFiltros')}
              </button>
              {erro && (
                <p className="text-sm text-red-400" role="alert">
                  {erro}
                </p>
              )}
            </div>
          </section>
          </>
          )}

          <div className="mt-6">
            {!jaPesquisou ? (
              <p className="py-12 text-center text-slate-500">
                {t('dicaUseFiltros')}
              </p>
            ) : pesquisando ? (
              <p className="py-12 text-center text-slate-500">{t('pesquisando')}</p>
            ) : totalResultados === 0 ? (
              <p className="py-12 text-center text-slate-500">
                {t('nenhumaImagemEncontrada')}
              </p>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-slate-400">
                    <span className="rounded-full bg-brand/10 px-2.5 py-1 text-brand-300">
                      {totalResultados} {totalResultados === 1 ? t('imagemEncontradaSingular') : t('imagensEncontradasPlural')}
                    </span>
                    {resultados.length < totalResultados && (
                      <span className="ml-2 text-slate-500">{t('mostrandoPrimeiras', { quantidade: resultados.length })}</span>
                    )}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                  {(() => {
                    const gruposAcoes = [
                      {
                        chave: 'todas',
                        rotulo: t('imprimirTodas'),
                        itens: resultados.map((imagem, indice) => ({ ...imagem, numero: indice + 1 })),
                      },
                      { chave: 'selecionadas', rotulo: t('imprimirSelecionadas'), itens: itensSelecionados },
                    ]
                    return (
                      <>
                        <MenuSalvarMinhasImagens grupos={gruposAcoes} />
                        <MenuSalvarComo grupos={gruposAcoes} />
                      </>
                    )
                  })()}
                  <MenuImpressao
                    grupos={[
                      {
                        chave: 'todas',
                        rotulo: t('imprimirTodas'),
                        itens: resultados.map((imagem, indice) => ({ ...imagem, numero: indice + 1 })),
                      },
                      { chave: 'selecionadas', rotulo: t('imprimirSelecionadas'), itens: itensSelecionados },
                    ]}
                  />
                  {selecionados.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIndiceVisualizador(0)}
                      className="flex items-center gap-2 rounded-lg bg-brand hover:bg-brand-hover px-4 py-2 text-sm font-medium text-white shadow-glow transition-opacity hover:opacity-90"
                    >
                      ▶ {selecionados.length > 1
                        ? t('verSelecionadasPlural', { quantidade: selecionados.length })
                        : t('verSelecionadasSingular', { quantidade: selecionados.length })}
                    </button>
                  )}
                  </div>
                </div>

                {/* Selecao em lote: "Selecionar todas", atalhos rapidos de
                    10/15/20/25 (somam a selecao atual, nao substituem) e um
                    campo ajustavel pra digitar qualquer quantidade -
                    pedido explicito pra nao ficar preso so a esses 4
                    numeros fixos. */}
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-base-border bg-base-surface p-3">
                  <span className="text-xs font-medium text-slate-400">{t('selecaoLabel')}</span>
                  <button
                    type="button"
                    onClick={selecionarTodas}
                    className="rounded-full border border-base-border px-3 py-1.5 text-xs text-slate-300 hover:border-brand hover:text-brand-300"
                  >
                    {t('selecionarTodas', { quantidade: resultados.length })}
                  </button>
                  {[10, 15, 20, 25].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => selecionarMais(n)}
                      className="rounded-full border border-base-border px-3 py-1.5 text-xs text-slate-300 hover:border-brand hover:text-brand-300"
                    >
                      +{n}
                    </button>
                  ))}
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      max={resultados.length}
                      value={quantidadeLote}
                      onChange={(e) => setQuantidadeLote(Number(e.target.value))}
                      className="w-16 rounded-lg border border-base-border bg-base-surface2 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-brand"
                    />
                    <button
                      type="button"
                      onClick={() => selecionarMais(quantidadeLote)}
                      className="rounded-full border border-base-border px-3 py-1.5 text-xs text-slate-300 hover:border-brand hover:text-brand-300"
                    >
                      {t('selecionarMaisBotao')}
                    </button>
                  </div>
                  {selecionados.length > 0 && (
                    <button
                      type="button"
                      onClick={limparSelecao}
                      className="ml-auto rounded-full border border-base-border px-3 py-1.5 text-xs text-slate-400 hover:border-status-danger hover:text-status-danger"
                    >
                      {t('limparSelecao')}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">
                  {resultados.map((imagem, indice) => (
                    <Link
                      key={imagem.curation_id}
                      href={`/visualizar/${imagem.curation_id}`}
                      onMouseEnter={(e) => ajustarOrigemAmpliacao(e.currentTarget)}
                      className="group relative flex flex-col overflow-hidden rounded-xl border border-base-border bg-base-surface transition duration-200 hover:z-30 hover:scale-[1.7] hover:border-brand/60 hover:shadow-2xl hover:delay-150 motion-reduce:hover:scale-100"
                    >
                      <div className="relative aspect-square overflow-hidden">
                        <MiniaturaImagem
                          curationId={imagem.curation_id}
                          alt={imagem.descricao_didatica ?? t('imagemNumero', { numero: indice + 1 })}
                          className="h-full w-full bg-base-surface2 object-cover"
                        />
                        <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-[10px] font-semibold text-white">
                          {indice + 1}
                        </span>
                        {/* Selo "i": ao passar o mouse mostra a descricao da curadoria
                            (continua funcionando com o cartao ampliado em 70%) */}
                        <EtiquetaMarcacoes
                          item={{ ...imagem, numero: indice + 1 }}
                          flutuante
                          className="bottom-1.5 right-1.5"
                        />
                        <label
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-1.5 top-1.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-md bg-black/70"
                        >
                          <input
                            type="checkbox"
                            checked={selecionados.includes(imagem.curation_id)}
                            onChange={() => alternarSelecao(imagem.curation_id)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={t('selecionarImagem', { numero: indice + 1 })}
                            className="h-3.5 w-3.5 accent-brand"
                          />
                        </label>
                      </div>
                      <div className="flex flex-col gap-1 p-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-300">
                            {rotular(OPCOES_TIPO_RADIOGRAFIA, imagem.tipo_radiografia, traduzirTipoRadiografia)}
                          </span>
                          {/* Badge de origem: "ufsc" = veio direto do aparelho de raio-x
                              (deteccao automatica no Orthanc), "externa" = upload manual. */}
                          {imagem.origem && (
                            <span
                              className={`inline-flex w-fit items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                imagem.origem === 'ufsc'
                                  ? 'bg-emerald-500/10 text-emerald-300'
                                  : 'bg-slate-500/10 text-slate-300'
                              }`}
                            >
                              {rotular(OPCOES_ORIGEM, imagem.origem, traduzirOrigem)}
                            </span>
                          )}
                        </div>
                        {/* Titulo do resultado (achado principal) com a MESMA cor usada
                            no card correspondente do Banco de imagens (../../lib/coresAchados) -
                            assim o estudante ja reconhece visualmente o tipo de achado antes
                            mesmo de abrir a imagem, igual acontece la. */}
                        <span
                          className={`truncate text-xs font-medium ${corTextoAchado(imagem.achado_principal)}`}
                          title={rotular(OPCOES_ACHADO_PRINCIPAL, imagem.achado_principal, traduzirAchadoPrincipal)}
                        >
                          {rotular(OPCOES_ACHADO_PRINCIPAL, imagem.achado_principal, traduzirAchadoPrincipal)}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {indiceVisualizador !== null && itensSelecionados.length > 0 && (
        <VisualizadorSequencial
          itens={itensSelecionados}
          indiceInicial={indiceVisualizador}
          onFechar={() => setIndiceVisualizador(null)}
        />
      )}
    </div>
  )
}

export default function PesquisaPage() {
  const tComum = useTranslations('Comum')
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-base">
          <p className="text-slate-300">{tComum('carregando')}</p>
        </main>
      }
    >
      <PesquisaConteudo />
    </Suspense>
  )
}
