import { rotularAchadoMarcacao, type Marcacao } from '../../lib/marcacoes'

export interface HoverMarcacao {
  texto: string
  x: number
  y: number
}

// So os tracos (ellipse/rect/line+ponta de seta) das marcacoes, sem
// interatividade - usado tanto na exibicao (leitura, lado do estudante)
// quanto como camada visual no editor do curador. Sempre dentro de um
// <svg viewBox="0 0 1 1"> que ja bate exatamente com a imagem por fora -
// por isso as coordenadas aqui sao direto os valores relativos (0-1) sem
// nenhuma conta. vector-effect="non-scaling-stroke" mantem a espessura da
// linha constante na tela, nao importa o tamanho da forma.
//
// `onHover` (opcional) liga o rotulo do tipo de lesao de cada marcacao ao
// passar o mouse - usado do lado do estudante. Sem essa prop as formas
// ficam so visuais (usado no editor do curador, onde uma camada
// interativa separada e desenhada por cima).
// ~2mm em pixels CSS (referencia de 96dpi: 1mm = 96/25.4px) - a seta e uma
// linha fina, entao o hover so deve valer bem perto dela de verdade, ao
// contrario do oval/retangulo (areas preenchidas, onde o hover vale em
// qualquer ponto de dentro).
const LIMIAR_HOVER_SETA_PX = (2 * 96) / 25.4

function distanciaAoSegmento(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const comprimentoQuadrado = dx * dx + dy * dy
  if (comprimentoQuadrado === 0) return Math.hypot(px - x1, py - y1)
  let t = ((px - x1) * dx + (py - y1) * dy) / comprimentoQuadrado
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

export default function FormasMarcacoes({
  marcacoes,
  idPrefixo,
  onHover,
}: {
  marcacoes: Marcacao[]
  idPrefixo: string
  onHover?: (info: HoverMarcacao | null) => void
}) {
  function eventosHover(m: Marcacao) {
    if (!onHover) return {}
    // Mesmo sem tipo de lesao definido pelo curador, o hover mostra algo -
    // sem isso, passar o mouse numa marcacao antiga (de antes desse campo
    // existir, ou que o curador simplesmente nao preencheu) nao dava
    // nenhum retorno visual, parecendo que o hover nao funcionava.
    const texto = rotularAchadoMarcacao(m.achado) || 'Lesão marcada pelo curador'
    return {
      onMouseMove: (evento: React.MouseEvent) => onHover({ texto, x: evento.clientX, y: evento.clientY }),
      onMouseLeave: () => onHover(null),
      cursor: 'help' as const,
    }
  }

  // Igual a eventosHover, mas so ativa o tooltip quando o mouse esta a no
  // maximo ~2mm (em pixels reais de tela) da linha da seta - calculado a
  // partir do retangulo do proprio <svg>, nao das coordenadas relativas
  // (0-1) da marcacao, pra funcionar em qualquer zoom/tamanho de imagem.
  function eventosHoverSeta(m: Marcacao) {
    if (!onHover) return {}
    const texto = rotularAchadoMarcacao(m.achado) || 'Lesão marcada pelo curador'
    return {
      onMouseMove: (evento: React.MouseEvent<SVGRectElement>) => {
        const svg = evento.currentTarget.ownerSVGElement
        if (!svg) return
        const svgRect = svg.getBoundingClientRect()
        const x1px = svgRect.left + (m.x1 ?? 0) * svgRect.width
        const y1px = svgRect.top + (m.y1 ?? 0) * svgRect.height
        const x2px = svgRect.left + (m.x2 ?? 0) * svgRect.width
        const y2px = svgRect.top + (m.y2 ?? 0) * svgRect.height
        const distancia = distanciaAoSegmento(evento.clientX, evento.clientY, x1px, y1px, x2px, y2px)
        if (distancia <= LIMIAR_HOVER_SETA_PX) {
          onHover({ texto, x: evento.clientX, y: evento.clientY })
        } else {
          onHover(null)
        }
      },
      onMouseLeave: () => onHover(null),
      cursor: 'help' as const,
    }
  }

  return (
    <>
      <defs>
        <marker
          id={`seta-ponta-${idPrefixo}`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="#ef4444" />
        </marker>
      </defs>
      {marcacoes.map((m) => {
        if (m.tipo === 'seta') {
          const x1 = m.x1 ?? 0
          const y1 = m.y1 ?? 0
          const x2 = m.x2 ?? 0
          const y2 = m.y2 ?? 0
          // Area sensivel ao mouse: uma caixa generosa ao redor de toda a
          // seta (canto a canto + margem), em vez de tentar acompanhar a
          // espessura de um traco fino em cima da linha - um traço fino
          // com vector-effect="non-scaling-stroke" nao cobre de forma
          // confiavel a ponta da seta (onde a marcacao do triangulo se
          // estende alem do proprio segmento) nem se comporta bem quando o
          // svg tem escala diferente em x e y (preserveAspectRatio="none").
          // Uma caixa cheia, do mesmo jeito que oval/retangulo ja usam, e
          // muito mais confiavel.
          const margem = 0.05
          return (
            <g key={m.id}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#ef4444"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                markerEnd={`url(#seta-ponta-${idPrefixo})`}
              />
              {onHover && (
                <rect
                  x={Math.min(x1, x2) - margem}
                  y={Math.min(y1, y2) - margem}
                  width={Math.abs(x2 - x1) + margem * 2}
                  height={Math.abs(y2 - y1) + margem * 2}
                  fill="transparent"
                  {...eventosHoverSeta(m)}
                />
              )}
            </g>
          )
        }
        const x = m.x ?? 0
        const y = m.y ?? 0
        const largura = m.largura ?? 0
        const altura = m.altura ?? 0
        if (m.tipo === 'oval') {
          return (
            <ellipse
              key={m.id}
              cx={x + largura / 2}
              cy={y + altura / 2}
              rx={largura / 2}
              ry={altura / 2}
              stroke="#ef4444"
              strokeWidth={1}
              strokeOpacity={0.6}
              vectorEffect="non-scaling-stroke"
              fill="rgba(239,68,68,0.5)"
              style={{ mixBlendMode: 'overlay' }}
              {...eventosHover(m)}
            />
          )
        }
        return (
          <rect
            key={m.id}
            x={x}
            y={y}
            width={largura}
            height={altura}
            stroke="#ef4444"
            strokeWidth={1}
            strokeOpacity={0.6}
            vectorEffect="non-scaling-stroke"
            fill="rgba(239,68,68,0.5)"
            style={{ mixBlendMode: 'overlay' }}
            {...eventosHover(m)}
          />
        )
      })}
    </>
  )
}
