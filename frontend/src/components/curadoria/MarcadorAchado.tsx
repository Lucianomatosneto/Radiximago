'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import FormasMarcacoes from '../detalhe/FormasMarcacoes'
import { FORMAS_MARCACAO, OPCOES_ACHADO_MARCACAO, gerarIdMarcacao, type Marcacao, type TipoMarcacao } from '../../lib/marcacoes'
import { detectarRecorteConteudo, type RecorteRelativo } from '../../lib/recorteImagem'

// Mapeia o valor cru do enum AchadoPrincipal (mesmos valores de
// lib/marcacoes.ts, usados aqui pra rotular o achado de CADA marcacao
// individual) pra chave de traducao do namespace Pesquisa.opcoes.achadoPrincipal
// - mesmo mapa ja usado em detalhe/FormasMarcacoes.tsx, reaproveitado aqui
// em vez de duplicar os 8 rotulos numa terceira lista.
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

// Chaves de traducao pras 3 formas (oval/retangulo/seta) - mesmos `tipo`
// usados em lib/marcacoes.ts (FORMAS_MARCACAO), que continua fornecendo o
// icone (nao traduzivel) de cada botao.
const CHAVE_FORMA: Record<string, string> = {
  oval: 'oval',
  retangulo: 'retangulo',
  seta: 'seta',
}

// Deixa o curador desenhar formas (oval, retangulo ou seta) sobre a
// miniatura estatica da imagem (a mesma usada na fila, via
// /curation/{orthancReferenceId}/preview) pra indicar onde estao as
// lesoes. Nao usa o OHIF de proposito - o OHIF roda em outra origem
// (iframe cross-origin) e nao ha como capturar de volta o que foi
// desenhado dentro dele sem alterar a configuracao do OHIF em si, que e
// justamente o que este projeto evita mexer.
//
// Clique e arraste desenha uma forma nova (do tipo selecionado na barra
// de ferramentas). Clicar numa forma existente seleciona ela (mostra a
// alca de redimensionar e o botao de remover); arrastar o corpo dela
// move; arrastar a alca redimensiona.
// `recorte` (opcional) e a caixa recortada visivel (ver
// lib/recorteImagem.ts) - quando presente, o wrapper na tela mostra so
// esse pedaco da imagem, entao um clique precisa ser remapeado da fracao
// visivel (0-1 dentro do que aparece recortado) pra coordenada real na
// imagem INTEIRA (0-1 da imagem completa, que e o que fica salvo em
// Marcacao.x/y etc.). Sem recorte, os dois sistemas sao o mesmo (fracao
// visivel == coordenada real), entao o calculo cai no comportamento de
// sempre.
function coordenadas(clientX: number, clientY: number, wrapper: HTMLElement, recorte: RecorteRelativo | null) {
  const rect = wrapper.getBoundingClientRect()
  const fracaoX = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  const fracaoY = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
  if (!recorte) return { x: fracaoX, y: fracaoY }
  return {
    x: recorte.x + fracaoX * recorte.largura,
    y: recorte.y + fracaoY * recorte.altura,
  }
}

type Arrasto =
  | { tipo: 'mover'; id: string; inicioX: number; inicioY: number; original: Marcacao }
  | { tipo: 'redimensionar'; id: string; original: Marcacao }
  | { tipo: 'ponta'; id: string; extremidade: 'x1y1' | 'x2y2' }

export default function MarcadorAchado({
  orthancReferenceId,
  marcacoes,
  onMarcar,
  onCarregou,
  compacto = false,
}: {
  orthancReferenceId: number
  /** Modo miniatura (tela cheia da Curadoria): mostra so a imagem, sem a
   * barra de formas nem o texto de ajuda - o painel fica pequeno ao lado
   * do visualizador e so vira editor quando o curador clica nele. */
  compacto?: boolean
  marcacoes: Marcacao[]
  onMarcar: (marcacoes: Marcacao[]) => void
  /** Chamado uma vez, quando a imagem deste painel termina de carregar
   * (mesmo evento que dispara setSrc abaixo) - a Curadoria usa isso pra
   * saber quando pode liberar o carregamento das miniaturas da fila (ver
   * comentario grande em curadoria/page.tsx sobre a ordem de
   * carregamento). Opcional pra nao quebrar nenhum outro uso deste
   * componente. */
  onCarregou?: () => void
}) {
  const t = useTranslations('Curadoria.marcador')
  const tAchado = useTranslations('Pesquisa.opcoes.achadoPrincipal')
  const [src, setSrc] = useState('')
  const [erro, setErro] = useState(false)
  const [ferramenta, setFerramenta] = useState<TipoMarcacao>('oval')
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)
  const [desenhoAtual, setDesenhoAtualState] = useState<Marcacao | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  // Tamanho NATURAL (em pixels reais) do preview PNG, descoberto assim que
  // a imagem termina de carregar - precisamos dele pra calcular o maior
  // tamanho possivel que caiba no painel preservando a proporcao (o
  // problema que fazia a imagem aparecer "muito ampliada" era o CSS
  // max-height:100% nao funcionar num elemento cujo pai tem altura
  // automatica - com isso a altura ficava sem limite nenhum).
  const tamanhoNaturalRef = useRef<{ largura: number; altura: number } | null>(null)
  const [tamanhoRenderizado, setTamanhoRenderizado] = useState<{ largura: number; altura: number } | null>(null)
  // Caixa (0-1, relativa a imagem inteira) do conteudo "nao-branco"
  // detectado ao carregar a imagem - ver lib/recorteImagem.ts. Null
  // enquanto nao detectado ainda, ou se nao houver borda branca relevante
  // pra recortar (a imagem inteira e mostrada, como sempre foi). Ref (nao
  // state) igual tamanhoNaturalRef logo acima, pelo mesmo motivo: e
  // setado no onload e lido de dentro de recalcularTamanho, que e
  // chamada por um ResizeObserver cujo callback e registrado uma unica
  // vez (closure "presa" na 1a renderizacao) - um useState aqui ficaria
  // desatualizado dentro dessa closure depois da deteccao terminar; ref
  // sempre le o valor mais atual, nao importa quando foi capturada.
  const recorteRef = useRef<RecorteRelativo | null>(null)
  const marcacoesRef = useRef(marcacoes)
  const desenhoRef = useRef<Marcacao | null>(null)
  const arrastoRef = useRef<Arrasto | null>(null)
  marcacoesRef.current = marcacoes

  function setDesenhoAtual(valor: Marcacao | null) {
    desenhoRef.current = valor
    setDesenhoAtualState(valor)
  }

  // Recalcula o maior tamanho (em pixels) que a imagem pode ter dentro do
  // painel disponivel, mantendo a proporcao original (mesma conta de um
  // "object-fit: contain", só que feita manualmente e aplicada como
  // largura/altura explícitas no wrapper - isso evita o bug do
  // max-height:100% e garante que o SVG por cima (que usa h-full/w-full
  // do wrapper) sempre bata exatamente com a área visível da imagem.
  //
  // Quando ha recorte detectado, a conta usa as dimensoes do CONTEUDO
  // recortado (natural * recorte.largura/altura) em vez da imagem
  // inteira - assim o "contain" maximiza o pedaco util (a parte preta),
  // nao a imagem toda com a borda branca incluida.
  function recalcularTamanho() {
    const container = containerRef.current
    const natural = tamanhoNaturalRef.current
    if (!container || !natural) return
    const larguraDisponivel = container.clientWidth
    const alturaDisponivel = container.clientHeight
    if (!larguraDisponivel || !alturaDisponivel) return
    const recorte = recorteRef.current
    const larguraConteudo = natural.largura * (recorte?.largura ?? 1)
    const alturaConteudo = natural.altura * (recorte?.altura ?? 1)
    const escala = Math.min(larguraDisponivel / larguraConteudo, alturaDisponivel / alturaConteudo)
    setTamanhoRenderizado({ largura: larguraConteudo * escala, altura: alturaConteudo * escala })
  }

  // Recalcula sempre que o painel muda de tamanho (janela redimensionada,
  // troca de tela cheia/"ajustar à tela" etc.) - sem isso, o tamanho ficava
  // "congelado" no valor calculado na primeira vez que a imagem carregou.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => recalcularTamanho())
    observer.observe(container)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let urlObjeto = ''
    let cancelado = false

    async function carregar() {
      try {
        const resposta = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/curation/${orthancReferenceId}/preview`,
          { credentials: 'include' }
        )
        if (!resposta.ok) {
          if (!cancelado) setErro(true)
          return
        }
        const blob = await resposta.blob()
        urlObjeto = URL.createObjectURL(blob)
        // So mostra a imagem depois de saber o tamanho natural dela - assim
        // o tamanho certo ja e calculado de cara, sem um "pulo" visual.
        const imagemTeste = new Image()
        imagemTeste.onload = () => {
          if (cancelado) return
          tamanhoNaturalRef.current = { largura: imagemTeste.naturalWidth, altura: imagemTeste.naturalHeight }
          // Detecta a borda branca (se houver) ANTES de mostrar a
          // imagem - assim ja aparece recortada de cara, sem "pulo"
          // visual (mesmo motivo do tamanho natural acima).
          recorteRef.current = detectarRecorteConteudo(imagemTeste)
          setSrc(urlObjeto)
          onCarregou?.()
        }
        imagemTeste.onerror = () => {
          if (!cancelado) setErro(true)
        }
        imagemTeste.src = urlObjeto
      } catch {
        if (!cancelado) setErro(true)
      }
    }

    carregar()
    return () => {
      cancelado = true
      if (urlObjeto) URL.revokeObjectURL(urlObjeto)
    }
  }, [orthancReferenceId])

  useEffect(() => {
    if (src) recalcularTamanho()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  useEffect(() => {
    function aoMover(evento: MouseEvent) {
      const wrapper = wrapperRef.current
      if (!wrapper || (!desenhoRef.current && !arrastoRef.current)) return
      const { x, y } = coordenadas(evento.clientX, evento.clientY, wrapper, recorteRef.current)

      if (desenhoRef.current) {
        const atual = desenhoRef.current
        if (atual.tipo === 'seta') {
          setDesenhoAtual({ ...atual, x2: x, y2: y })
        } else {
          const x0 = atual.x as number
          const y0 = atual.y as number
          setDesenhoAtual({
            ...atual,
            x: Math.min(x0, x),
            y: Math.min(y0, y),
            largura: Math.abs(x - x0),
            altura: Math.abs(y - y0),
          })
        }
        return
      }

      const arrasto = arrastoRef.current
      if (!arrasto) return
      onMarcar(
        marcacoesRef.current.map((m) => {
          if (m.id !== arrasto.id) return m
          if (arrasto.tipo === 'mover') {
            const dx = x - arrasto.inicioX
            const dy = y - arrasto.inicioY
            if (m.tipo === 'seta') {
              return {
                ...m,
                x1: (arrasto.original.x1 as number) + dx,
                y1: (arrasto.original.y1 as number) + dy,
                x2: (arrasto.original.x2 as number) + dx,
                y2: (arrasto.original.y2 as number) + dy,
              }
            }
            return { ...m, x: (arrasto.original.x as number) + dx, y: (arrasto.original.y as number) + dy }
          }
          if (arrasto.tipo === 'ponta') {
            return arrasto.extremidade === 'x1y1' ? { ...m, x1: x, y1: y } : { ...m, x2: x, y2: y }
          }
          const x0 = arrasto.original.x as number
          const y0 = arrasto.original.y as number
          return { ...m, largura: Math.max(0, x - x0), altura: Math.max(0, y - y0) }
        })
      )
    }

    function aoSoltar() {
      if (desenhoRef.current) {
        const atual = desenhoRef.current
        const tamanho =
          atual.tipo === 'seta'
            ? Math.hypot((atual.x2 as number) - (atual.x1 as number), (atual.y2 as number) - (atual.y1 as number))
            : Math.max(atual.largura as number, atual.altura as number)
        if (tamanho > 0.01) {
          onMarcar([...marcacoesRef.current, atual])
          setSelecionadoId(atual.id)
        }
        setDesenhoAtual(null)
      }
      arrastoRef.current = null
    }

    window.addEventListener('mousemove', aoMover)
    window.addEventListener('mouseup', aoSoltar)
    return () => {
      window.removeEventListener('mousemove', aoMover)
      window.removeEventListener('mouseup', aoSoltar)
    }
  }, [onMarcar])

  function aoPressionarFundo(evento: React.MouseEvent<SVGSVGElement>) {
    if (evento.target !== evento.currentTarget) return
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const { x, y } = coordenadas(evento.clientX, evento.clientY, wrapper, recorteRef.current)
    const id = gerarIdMarcacao()
    const nova: Marcacao =
      ferramenta === 'seta'
        ? { id, tipo: 'seta', x1: x, y1: y, x2: x, y2: y }
        : { id, tipo: ferramenta, x, y, largura: 0, altura: 0 }
    setDesenhoAtual(nova)
    setSelecionadoId(null)
  }

  function aoPressionarForma(evento: React.MouseEvent, marcacao: Marcacao) {
    evento.stopPropagation()
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const { x, y } = coordenadas(evento.clientX, evento.clientY, wrapper, recorteRef.current)
    setSelecionadoId(marcacao.id)
    arrastoRef.current = { tipo: 'mover', id: marcacao.id, inicioX: x, inicioY: y, original: marcacao }
  }

  function aoPressionarAlca(evento: React.MouseEvent, marcacao: Marcacao, extremidade?: 'x1y1' | 'x2y2') {
    evento.stopPropagation()
    arrastoRef.current =
      marcacao.tipo === 'seta' && extremidade
        ? { tipo: 'ponta', id: marcacao.id, extremidade }
        : { tipo: 'redimensionar', id: marcacao.id, original: marcacao }
  }

  function remover(id: string) {
    onMarcar(marcacoes.filter((m) => m.id !== id))
    setSelecionadoId(null)
  }

  function definirAchadoDaSelecionada(achado: string) {
    if (!selecionadoId) return
    onMarcar(
      marcacoes.map((m) =>
        m.id === selecionadoId
          ? {
              ...m,
              achado: achado || null,
              // Limpa a descricao livre se o curador trocar pra um achado
              // diferente de "outro" - evita guardar texto orfao amarrado
              // a um achado que nao e mais "outro".
              achado_descricao: achado === 'outro' ? m.achado_descricao : null,
            }
          : m
      )
    )
  }

  function definirDescricaoDaSelecionada(descricao: string) {
    if (!selecionadoId) return
    onMarcar(marcacoes.map((m) => (m.id === selecionadoId ? { ...m, achado_descricao: descricao } : m)))
  }

  function traduzirAchado(valor: string): string {
    const chave = CHAVE_ACHADO[valor]
    if (!chave) return valor
    try {
      return tAchado(chave)
    } catch {
      return valor
    }
  }

  const selecionada = marcacoes.find((m) => m.id === selecionadoId) ?? null
  const formasParaExibir = desenhoAtual ? [...marcacoes, desenhoAtual] : marcacoes

  // Le a ref diretamente no corpo do componente (nao e um closure de
  // efeito, e um valor lido "agora" a cada renderizacao - por isso nao
  // tem o problema de closure presa que recalcularTamanho tem que evitar
  // via ref no lugar de state). Quando ha recorte, a <img> e desenhada
  // MAIOR que o wrapper (tamanho natural inteiro, escalado) e deslocada
  // com offset negativo, pra so a parte recortada ficar visivel dentro
  // do wrapper (que tem overflow-hidden); o <svg> usa esse mesmo recorte
  // como viewBox, entao as marcacoes (coordenadas 0-1 da imagem INTEIRA,
  // sem mudar nada nelas) caem automaticamente no lugar certo.
  const recorteAtual = recorteRef.current
  const imagemLarguraTotal = tamanhoRenderizado ? tamanhoRenderizado.largura / (recorteAtual?.largura ?? 1) : 0
  const imagemAlturaTotal = tamanhoRenderizado ? tamanhoRenderizado.altura / (recorteAtual?.altura ?? 1) : 0
  const imagemOffsetX = recorteAtual ? -recorteAtual.x * imagemLarguraTotal : 0
  const imagemOffsetY = recorteAtual ? -recorteAtual.y * imagemAlturaTotal : 0
  const viewBoxSvg = recorteAtual
    ? `${recorteAtual.x} ${recorteAtual.y} ${recorteAtual.largura} ${recorteAtual.altura}`
    : '0 0 1 1'

  return (
    <div className="flex h-full flex-col">
      <div className={`mb-2 shrink-0 flex-wrap items-center gap-1.5 ${compacto ? 'hidden' : 'flex'}`}>
        {FORMAS_MARCACAO.map((forma) => (
          <button
            key={forma.tipo}
            type="button"
            onClick={() => setFerramenta(forma.tipo)}
            className={`rounded-lg border px-2.5 py-1 text-sm ${
              ferramenta === forma.tipo
                ? 'border-brand bg-brand/10 text-brand-300'
                : 'border-base-border text-slate-400 hover:border-brand hover:text-brand-300'
            }`}
          >
            <span className="mr-1">{forma.icone}</span>
            {t(`formas.${CHAVE_FORMA[forma.tipo] ?? forma.tipo}`)}
          </button>
        ))}
        {selecionada && (
          <button
            type="button"
            onClick={() => remover(selecionada.id)}
            className="ml-auto rounded-lg border border-red-500/40 px-2.5 py-1 text-sm text-red-400 hover:bg-red-500/10"
          >
            {t('removerMarcacao')}
          </button>
        )}
      </div>

      {selecionada && !compacto && (
        <div className="mb-2 flex shrink-0 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400" htmlFor="achado-marcacao">
              {t('tipoLesao')}
            </label>
            <select
              id="achado-marcacao"
              value={selecionada.achado ?? ''}
              onChange={(e) => definirAchadoDaSelecionada(e.target.value)}
              // Mesmo degrade de FichaCuradoriaForm.tsx, aplicado em todas
              // as caixas de texto desta tela (pedido explicito).
              className="rounded-lg border border-teal-500/40 bg-teal-100/70 px-2 py-1 text-sm text-ink outline-none focus:border-brand dark:bg-teal-600/20"
            >
              <option value="">{t('selecione')}</option>
              {OPCOES_ACHADO_MARCACAO.map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>
                  {traduzirAchado(opcao.valor)}
                </option>
              ))}
            </select>
          </div>

          {/* So aparece quando o curador escolhe "Outro" - a lista de
              achados e fechada (enum no backend), entao esse campo de
              texto livre e o unico jeito de descrever algo que nao esta
              nas opcoes acima. O estudante ve esse texto no tooltip, no
              lugar do rotulo generico "Outro" (ver FormasMarcacoes.tsx). */}
          {selecionada.achado === 'outro' && (
            <input
              type="text"
              value={selecionada.achado_descricao ?? ''}
              onChange={(e) => definirDescricaoDaSelecionada(e.target.value)}
              placeholder={t('placeholderDescricaoOutro')}
              aria-label={t('placeholderDescricaoOutro')}
              className="w-full rounded-lg border border-teal-500/40 bg-teal-100/70 px-2 py-1 text-sm text-ink outline-none focus:border-brand dark:bg-teal-600/20"
            />
          )}
        </div>
      )}

      {/* Container externo: ocupa todo o espaco disponivel (agora que a
          imagem vive num painel proprio ao lado do visualizador principal,
          nao mais espremida dentro da ficha) e centraliza a imagem dentro
          dele. O wrapper interno (ref=wrapperRef) recebe largura/altura
          EXPLICITAS em pixels (calculadas em recalcularTamanho, acima) -
          antes ele tentava se ajustar sozinho via CSS (max-height:100%),
          mas isso nao funciona quando o elemento pai tem altura automatica
          (bug conhecido do CSS), e foi o que fazia a imagem aparecer
          "muito ampliada" (sem limite real de altura). Com o tamanho
          calculado manualmente, o SVG por cima (absolute inset-0) sempre
          bate pixel a pixel com a imagem. */}
      {/* bg-black (nao mais bg-black/10): o "contain fit" abaixo preserva a
          proporcao da imagem sem distorcer, entao quando a proporcao dela
          nao bate exatamente com a do painel (ex.: imagem panoramica, bem
          larga, num painel proporcionalmente mais alto), sobra uma faixa
          vazia em cima/embaixo por design - a alternativa seria cortar as
          bordas esquerda/direita da imagem pra preencher tudo, que em
          panoramicas pode cortar a regiao de sisos/ramo mandibular
          (conteudo clinicamente relevante). Fundo preto SOLIDO (em vez do
          quase-transparente de antes) faz essa faixa ficar visualmente
          indistinguivel do fundo preto da propria radiografia - a imagem
          "parece" encostar nas bordas pro olho humano, sem cortar nada de
          verdade. */}
      <div ref={containerRef} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-base-border bg-black">
        {erro ? (
          <div className="flex h-40 w-full items-center justify-center text-xs text-slate-500">
            {t('semPreview')}
          </div>
        ) : !src || !tamanhoRenderizado ? (
          <div className="h-40 w-full animate-pulse" />
        ) : (
          <div
            ref={wrapperRef}
            className="relative overflow-hidden"
            style={{ width: `${tamanhoRenderizado.largura}px`, height: `${tamanhoRenderizado.altura}px` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={t('altImagemMarcacao')}
              className="absolute block max-w-none select-none"
              style={{ left: imagemOffsetX, top: imagemOffsetY, width: imagemLarguraTotal, height: imagemAlturaTotal }}
              draggable={false}
            />
            <svg
              viewBox={viewBoxSvg}
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full"
              style={{ cursor: 'crosshair' }}
              onMouseDown={aoPressionarFundo}
            >
            <FormasMarcacoes marcacoes={formasParaExibir} idPrefixo={`editor-${orthancReferenceId}`} />

            {marcacoes.map((m) => (
              <g key={`interativo-${m.id}`}>
                {m.tipo === 'seta' ? (
                  <line
                    x1={m.x1}
                    y1={m.y1}
                    x2={m.x2}
                    y2={m.y2}
                    stroke="transparent"
                    strokeWidth={0.04}
                    vectorEffect="non-scaling-stroke"
                    onMouseDown={(e) => aoPressionarForma(e, m)}
                    style={{ cursor: 'move' }}
                  />
                ) : (
                  <rect
                    x={m.x}
                    y={m.y}
                    width={m.largura}
                    height={m.altura}
                    fill="transparent"
                    onMouseDown={(e) => aoPressionarForma(e, m)}
                    style={{ cursor: 'move' }}
                  />
                )}
                {selecionadoId === m.id && m.tipo === 'seta' && (
                  <>
                    <circle
                      cx={m.x1}
                      cy={m.y1}
                      r={0.012}
                      fill="#ef4444"
                      stroke="white"
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                      onMouseDown={(e) => aoPressionarAlca(e, m, 'x1y1')}
                      style={{ cursor: 'pointer' }}
                    />
                    <circle
                      cx={m.x2}
                      cy={m.y2}
                      r={0.012}
                      fill="#ef4444"
                      stroke="white"
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                      onMouseDown={(e) => aoPressionarAlca(e, m, 'x2y2')}
                      style={{ cursor: 'pointer' }}
                    />
                  </>
                )}
                {selecionadoId === m.id && m.tipo !== 'seta' && (
                  <rect
                    x={(m.x as number) + (m.largura as number) - 0.012}
                    y={(m.y as number) + (m.altura as number) - 0.012}
                    width={0.024}
                    height={0.024}
                    fill="#ef4444"
                    stroke="white"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                    onMouseDown={(e) => aoPressionarAlca(e, m)}
                    style={{ cursor: 'nwse-resize' }}
                  />
                )}
              </g>
            ))}
          </svg>
          </div>
        )}
      </div>
      <p className={`mt-1.5 shrink-0 text-xs text-slate-500 ${compacto ? 'hidden' : ''}`}>
        {marcacoes.length > 0
          ? t('instrucaoComMarcacoes', { total: marcacoes.length })
          : t('instrucaoSemMarcacoes')}
      </p>
    </div>
  )
}
