// Faixa horizontal da pagina inicial mostrando as modalidades de imagem
// disponiveis na biblioteca. Fundo transparente, sem cards/sombras, com
// uma linha fina conectando os icones - pensada pra ficar antes do
// rodape da landing page (ver app/page.tsx).
//
// Paleta restrita (via custom properties, trocadas no hover/focus):
//   --c1 #0F4C81 (azul petroleo)  --c2 #1C6EA4  --c3 #37B6C8 (ciano)
// Fonte das legendas: pilha de sistema com peso 600 (aproxima Inter
// SemiBold sem depender de um fetch externo de fonte).

interface Modalidade {
  id: string
  rotulo: string
  icone: JSX.Element
}

const propsIcone = {
  viewBox: '0 0 64 64',
  fill: 'none',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
}

function AneIExterno() {
  return <circle cx="32" cy="32" r="29" style={{ stroke: 'var(--c1)' }} strokeWidth={2} opacity={0.9} fill="none" />
}

// Gradiente diagonal escuro->claro (c1->c3), usado como preenchimento
// principal da maioria dos icones - da a profundidade/aspecto "premium"
// sem sair da paleta de 4 tons. Cada icone define o seu proprio <defs>
// (ids exclusivos) pra herdar corretamente as CSS custom properties do
// wrapper .icone-modalidade mais proximo (inclusive no hover).
function GradientePrincipal({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: 'var(--c1)' }} />
        <stop offset="100%" style={{ stopColor: 'var(--c3)' }} />
      </linearGradient>
    </defs>
  )
}

function IconeRaiosX() {
  const gradId = 'grad-raiosx'
  return (
    <svg {...propsIcone} className="h-full w-full">
      <GradientePrincipal id={gradId} />
      <AneIExterno />
      {/* lobulos pulmonares, preenchidos */}
      <path
        d="M24 28c-8 2-10 12-7 20 2 6 8 6 10 0 2-6 0-14-3-20Z"
        fill={`url(#${gradId})`}
        opacity={0.92}
      />
      <path
        d="M40 28c8 2 11 12 7 21-3 7-11 7-13 0-2-6 1-15 6-21Z"
        fill={`url(#${gradId})`}
        opacity={0.92}
      />
      {/* traqueia / bronquios, em branco por cima do preenchimento */}
      <path
        d="M32 15v7M32 22l-8 6M32 22l8 6M24 28l-3 6M40 28l3 6"
        style={{ stroke: 'white' }}
        strokeWidth={1.3}
        opacity={0.9}
      />
      {/* costelas (arcos), bem sutis */}
      <path d="M13 34q19-7 38 0" style={{ stroke: 'var(--c1)' }} strokeWidth={1} opacity={0.35} />
      <path d="M13 44q19-6 38 0" style={{ stroke: 'var(--c1)' }} strokeWidth={1} opacity={0.35} />
    </svg>
  )
}

function IconeTomografia() {
  const gradId = 'grad-tomografia'
  return (
    <svg {...propsIcone} className="h-full w-full">
      <GradientePrincipal id={gradId} />
      <AneIExterno />
      {/* gantry (anel do tomografo) - anel grosso = "donut" */}
      <circle cx="32" cy="26" r="12" fill="none" style={{ stroke: `url(#${gradId})` }} strokeWidth={6.5} />
      <circle cx="32" cy="26" r="12" fill="none" style={{ stroke: 'var(--c1)' }} strokeWidth={0.8} opacity={0.5} />
      <circle cx="32" cy="26" r="5.5" fill="none" style={{ stroke: 'white' }} strokeWidth={1} opacity={0.6} />
      {/* marcacoes radiais do gantry */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angulo) => {
        const rad = (angulo * Math.PI) / 180
        const x1 = 32 + Math.cos(rad) * 16
        const y1 = 26 + Math.sin(rad) * 16
        const x2 = 32 + Math.cos(rad) * 18.5
        const y2 = 26 + Math.sin(rad) * 18.5
        return (
          <line key={angulo} x1={x1} y1={y1} x2={x2} y2={y2} style={{ stroke: 'var(--c1)' }} strokeWidth={1.2} />
        )
      })}
      {/* mesa do paciente */}
      <path d="M8 47h48" style={{ stroke: 'var(--c1)' }} strokeWidth={1.8} />
      <rect x="6" y="44" width="10" height="6" rx="1.8" fill={`url(#${gradId})`} opacity={0.9} />
    </svg>
  )
}

function IconeDensitometria() {
  const gradId = 'grad-densitometria'
  const vertebras = [15, 23, 31, 39, 47]
  const offsets = [0, -2, 0, 2, 0]
  return (
    <svg {...propsIcone} className="h-full w-full">
      <GradientePrincipal id={gradId} />
      <AneIExterno />
      <path
        d="M32 12c-2 8 2 8 0 16s2 8 0 16s2 8 0 12"
        style={{ stroke: 'white' }}
        strokeWidth={0.9}
        opacity={0.5}
      />
      {vertebras.map((y, i) => (
        <rect
          key={y}
          x={32 - 7 + offsets[i]}
          y={y}
          width="14"
          height="6.5"
          rx="2"
          fill={`url(#${gradId})`}
          opacity={0.92}
        />
      ))}
    </svg>
  )
}

function IconeRessonancia() {
  const gradId = 'grad-ressonancia'
  return (
    <svg {...propsIcone} className="h-full w-full">
      <GradientePrincipal id={gradId} />
      <AneIExterno />
      {/* silhueta sagital do cerebro, preenchida */}
      <path
        d="M21 25c-1-7 6-11 13-10 7-1 14 3 14 10 0 4-2 6-1 10 1 5-3 9-7 9 0 3-3 5-6 4-3-1-4-4-7-4-5 0-8-5-7-10-3-2-4-6 1-9Z"
        fill={`url(#${gradId})`}
        opacity={0.92}
      />
      {/* giros/sulcos, em branco por cima */}
      <path d="M25 22c4-2 7 0 6 4" style={{ stroke: 'white' }} strokeWidth={1} opacity={0.7} />
      <path d="M27 30c4-2 7 0 6 4" style={{ stroke: 'white' }} strokeWidth={1} opacity={0.7} />
      <path d="M25 38c3-1.5 6 0 5 3.5" style={{ stroke: 'white' }} strokeWidth={1} opacity={0.7} />
      <path d="M36 20c3-1 5 1 4 4" style={{ stroke: 'white' }} strokeWidth={0.9} opacity={0.55} />
    </svg>
  )
}

function IconeOdontologia() {
  const gradId = 'grad-odontologia'
  return (
    <svg {...propsIcone} className="h-full w-full">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style={{ stopColor: 'white' }} />
          <stop offset="100%" style={{ stopColor: 'var(--c3)' }} stopOpacity={0.35} />
        </linearGradient>
      </defs>
      <AneIExterno />
      {/* coroa, "porcelana" (branco->ciano bem sutil) */}
      <path
        d="M22 22c0-6 5-9 10-8 5-1 10 2 10 8 0 4-2 6-3 9-1-3-3-5-7-5s-6 2-7 5c-1-3-3-5-3-9Z"
        fill={`url(#${gradId})`}
        style={{ stroke: 'var(--c2)' }}
        strokeWidth={1}
      />
      {/* raizes */}
      <path
        d="M28 31c-1 6-2 10-3 15"
        fill="none"
        style={{ stroke: 'var(--c1)' }}
        strokeWidth={1.8}
      />
      <path
        d="M36 31c1 6 2 10 3 15"
        fill="none"
        style={{ stroke: 'var(--c1)' }}
        strokeWidth={1.8}
      />
      {/* canal radicular */}
      <path d="M32 17v29" style={{ stroke: 'var(--c2)' }} strokeWidth={0.9} opacity={0.5} />
      {/* sombra radiolucida (achado) */}
      <circle cx="25" cy="46" r="3" fill="none" style={{ stroke: 'var(--c3)' }} strokeWidth={1.2} opacity={0.85} />
    </svg>
  )
}

function IconeMais() {
  return (
    <svg {...propsIcone} className="h-full w-full">
      <AneIExterno />
      <circle cx="21" cy="32" r="3.6" style={{ fill: 'var(--c1)' }} />
      <circle cx="32" cy="32" r="3.6" style={{ fill: 'var(--c2)' }} />
      <circle cx="43" cy="32" r="3.6" style={{ fill: 'var(--c3)' }} />
    </svg>
  )
}

const MODALIDADES: Modalidade[] = [
  { id: 'raios-x', rotulo: 'Raios-X', icone: <IconeRaiosX /> },
  { id: 'tomografia', rotulo: 'Tomografia', icone: <IconeTomografia /> },
  { id: 'densitometria', rotulo: 'Densitometria', icone: <IconeDensitometria /> },
  { id: 'ressonancia', rotulo: 'Ressonância', icone: <IconeRessonancia /> },
  { id: 'odontologia', rotulo: 'Odontologia', icone: <IconeOdontologia /> },
  { id: 'mais', rotulo: 'E muito mais', icone: <IconeMais /> },
]

export default function SecaoModalidades() {
  return (
    <section
      id="modalidades"
      aria-hidden="true"
      className="secao-modalidades relative bg-transparent py-14 md:py-20"
    >
      <div className="modalidades-scroll relative overflow-x-auto">
        <div className="relative mx-auto flex w-max min-w-full justify-center px-4">
          {/* linha de conexao decorativa, atras dos icones */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-6 top-6 sm:top-7 md:top-8 z-0"
          >
            <div className="h-px w-full" style={{ backgroundColor: 'var(--c1)', opacity: 0.4 }} />
            <div
              className="absolute inset-x-0 -top-[3px] h-[7px]"
              style={{
                backgroundImage: 'radial-gradient(circle, var(--c1) 1.4px, transparent 1.6px)',
                backgroundSize: '90px 7px',
                backgroundRepeat: 'repeat-x',
                backgroundPosition: 'center',
                opacity: 0.6,
              }}
            />
          </div>

          <div className="relative z-10 flex flex-nowrap items-start justify-center gap-x-8 sm:gap-x-12 md:gap-x-16 lg:gap-x-20">
            {MODALIDADES.map((modalidade) => (
              <div key={modalidade.id} className="flex flex-col items-center gap-2 md:gap-3">
                <div className="icone-modalidade flex h-12 w-12 items-center justify-center rounded-full transition-transform duration-300 ease-out hover:scale-[1.08] sm:h-14 sm:w-14 md:h-16 md:w-16">
                  {modalidade.icone}
                </div>
                <span className="rotulo-modalidade whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide sm:text-xs md:text-sm">
                  {modalidade.rotulo}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
