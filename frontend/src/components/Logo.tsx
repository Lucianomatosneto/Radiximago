import Image from 'next/image'

type VarianteLogo = 'navbar' | 'sidebar' | 'login' | 'hero' | 'footer' | 'icone' | 'escuro'

interface LogoProps {
  /** Contexto de uso - cada um tem o tamanho de icone/texto definido na
   * identidade visual do RÁDIX IMAGO (marca "Layered Scan", 2026). */
  variante: VarianteLogo
  className?: string
}

// Icone em SVG (nao pixela em nenhum tamanho) + nome/tagline como texto
// real - em vez de uma unica imagem "achatada" com tudo desenhado dentro.
// Isso evita o problema classico de logo em imagem unica: numa barra
// baixa (navbar/sidebar, ~40-54px), o texto encolhia junto com o icone
// ate ficar ilegivel. Com o texto vivo, cada contexto usa o tamanho de
// fonte que faz sentido pra ele, sem depender da altura do icone.
//
// Sem nenhuma referencia a modalidade especifica (ex.: odontologia) -
// a marca foi pensada pra uso multi-modalidade (RX, RM, TC, entre outras).
const CONFIG_POR_VARIANTE: Record<
  VarianteLogo,
  {
    empilhado: boolean // true = icone em cima, texto embaixo (login/hero); false = lado a lado
    iconePx: number
    tituloClasse: string
    tagline: boolean
    taglineClasse?: string
    gapClasse: string
    // true = mostra so o icone (sem "RÁDIX IMAGO" escrito ao lado) - usado
    // em cantos apertados onde so cabe um simbolo pequeno (ex.: cabecalho
    // do visualizador em tela cheia, onde a Topbar com o nome completo
    // fica escondida).
    somenteIcone?: boolean
  }
> = {
  navbar: {
    empilhado: false,
    iconePx: 36,
    tituloClasse: 'text-base font-bold tracking-tight text-ink sm:text-lg',
    tagline: false,
    gapClasse: 'gap-2.5',
  },
  sidebar: {
    empilhado: false,
    iconePx: 32,
    tituloClasse: 'text-sm font-bold tracking-tight text-ink',
    tagline: true,
    taglineClasse: 'text-[9px] font-medium uppercase tracking-wide text-slate-400',
    gapClasse: 'gap-2.5',
  },
  footer: {
    empilhado: false,
    iconePx: 28,
    tituloClasse: 'text-sm font-bold tracking-tight text-ink',
    tagline: false,
    gapClasse: 'gap-2',
  },
  login: {
    empilhado: true,
    iconePx: 72,
    tituloClasse: 'text-2xl font-bold tracking-tight text-ink sm:text-3xl',
    tagline: true,
    taglineClasse: 'text-[11px] font-medium uppercase tracking-wider text-slate-400 sm:text-xs',
    gapClasse: 'gap-3',
  },
  hero: {
    empilhado: true,
    iconePx: 96,
    tituloClasse: 'text-3xl font-bold tracking-tight text-ink sm:text-4xl',
    tagline: true,
    taglineClasse: 'text-xs font-medium uppercase tracking-wider text-slate-400 sm:text-sm',
    gapClasse: 'gap-4',
  },
  icone: {
    empilhado: false,
    iconePx: 24,
    tituloClasse: '',
    tagline: false,
    gapClasse: 'gap-0',
    somenteIcone: true,
  },
  // Usada em cabecalhos "flutuantes" por cima de tudo (ex.: o do
  // visualizador em sequencia), que nao ficam dentro da Topbar normal.
  // Antes tinha texto branco fixo (ignorava o tema); agora usa text-ink
  // (a mesma variavel de tema das outras variantes) porque essas telas
  // passaram a acompanhar o alternador claro/escuro tambem.
  escuro: {
    empilhado: false,
    iconePx: 28,
    tituloClasse: 'text-sm font-bold tracking-tight text-ink',
    tagline: false,
    gapClasse: 'gap-2',
  },
}

export default function Logo({ variante, className = '' }: LogoProps) {
  const cfg = CONFIG_POR_VARIANTE[variante]

  return (
    <div
      className={`animar-logo-entrada flex items-center ${cfg.empilhado ? `flex-col text-center ${cfg.gapClasse}` : `flex-row ${cfg.gapClasse}`} ${className}`}
      aria-label="RÁDIX IMAGO"
      role="img"
    >
      <Image
        src="/assets/logo-radix-imago-icone.svg"
        alt=""
        aria-hidden="true"
        width={cfg.iconePx}
        height={cfg.iconePx}
        priority
        loading="eager"
        decoding="async"
        style={{ width: cfg.iconePx, height: cfg.iconePx }}
        className="shrink-0"
      />
      {!cfg.somenteIcone && (
        <div className={cfg.empilhado ? 'flex flex-col items-center' : 'flex flex-col justify-center leading-tight'}>
          <span className={cfg.tituloClasse}>RÁDIX IMAGO</span>
          {cfg.tagline && <span className={cfg.taglineClasse}>Ensino e pesquisa em saúde</span>}
        </div>
      )}
    </div>
  )
}
