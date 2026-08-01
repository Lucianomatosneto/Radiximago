'use client'

import { useEffect, useRef, useState } from 'react'
import FormasMarcacoes from '../detalhe/FormasMarcacoes'
import { FORMAS_MARCACAO, OPCOES_ACHADO_MARCACAO, gerarIdMarcacao, type Marcacao, type TipoMarcacao } from '../../lib/marcacoes'

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
function coordenadas(clientX: number, clientY: number, wrapper: HTMLElement) {
  const rect = wrapper.getBoundingClientRect()
  return {
    x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
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
}: {
  orthancReferenceId: number
  marcacoes: Marcacao[]
  onMarcar: (marcacoes: Marcacao[]) => void
}) {
  const [src, setSrc] = useState('')
  const [erro, setErro] = useState(false)
  const [ferramenta, setFerramenta] = useState<TipoMarcacao>('oval')
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)
  const [desenhoAtual, setDesenhoAtualState] = useState<Marcacao | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const marcacoesRef = useRef(marcacoes)
  const desenhoRef = useRef<Marcacao | null>(null)
  const arrastoRef = useRef<Arrasto | null>(null)
  marcacoesRef.current = marcacoes

  function setDesenhoAtual(valor: Marcacao | null) {
    desenhoRef.current = valor
    setDesenhoAtualState(valor)
  }

  useEffect(() => {
    let urlObjeto = ''
    let cancelado = false

    async function carregar() {
      const token = localStorage.getItem('access_token')
      if (!token) return
      try {
        const resposta = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/curation/${orthancReferenceId}/preview`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (!resposta.ok) {
          if (!cancelado) setErro(true)
          return
        }
        const blob = await resposta.blob()
        urlObjeto = URL.createObjectURL(blob)
        if (!cancelado) setSrc(urlObjeto)
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
    function aoMover(evento: MouseEvent) {
      const wrapper = wrapperRef.current
      if (!wrapper || (!desenhoRef.current && !arrastoRef.current)) return
      const { x, y } = coordenadas(evento.clientX, evento.clientY, wrapper)

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
    const { x, y } = coordenadas(evento.clientX, evento.clientY, wrapper)
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
    const { x, y } = coordenadas(evento.clientX, evento.clientY, wrapper)
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
    onMarcar(marcacoes.map((m) => (m.id === selecionadoId ? { ...m, achado: achado || null } : m)))
  }

  const selecionada = marcacoes.find((m) => m.id === selecionadoId) ?? null
  const formasParaExibir = desenhoAtual ? [...marcacoes, desenhoAtual] : marcacoes

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
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
            {forma.rotulo}
          </button>
        ))}
        {selecionada && (
          <button
            type="button"
            onClick={() => remover(selecionada.id)}
            className="ml-auto rounded-lg border border-red-500/40 px-2.5 py-1 text-sm text-red-400 hover:bg-red-500/10"
          >
            ✕ Remover marcação
          </button>
        )}
      </div>

      {selecionada && (
        <div className="mb-2 flex items-center gap-2">
          <label className="text-xs text-slate-400" htmlFor="achado-marcacao">
            Tipo de lesão desta marcação:
          </label>
          <select
            id="achado-marcacao"
            value={selecionada.achado ?? ''}
            onChange={(e) => definirAchadoDaSelecionada(e.target.value)}
            className="rounded-lg border border-base-border bg-base-surface2 px-2 py-1 text-sm text-slate-100 outline-none focus:border-brand"
          >
            <option value="">Selecione</option>
            {OPCOES_ACHADO_MARCACAO.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>
                {opcao.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div
        ref={wrapperRef}
        className="relative inline-block max-w-full overflow-hidden rounded-lg border border-base-border"
      >
        {erro ? (
          <div className="flex h-40 w-full items-center justify-center text-xs text-slate-500">
            Sem preview disponível
          </div>
        ) : !src ? (
          <div className="h-40 w-full animate-pulse" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="Imagem para marcação" className="block max-h-[50vh] w-auto select-none" draggable={false} />
        )}

        {src && !erro && (
          <svg
            viewBox="0 0 1 1"
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
        )}
      </div>
      <p className="mt-1.5 text-xs text-slate-500">
        {marcacoes.length > 0
          ? `${marcacoes.length} marcação(ões). Clique e arraste na imagem para adicionar outra, ou clique numa existente para mover/redimensionar.`
          : 'Clique e arraste na imagem para marcar uma lesão (opcional). Escolha a forma acima.'}
      </p>
    </div>
  )
}
