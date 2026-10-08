'use client'

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

interface Categoria {
  // Chaves em GradeCategorias.categorias/.rotulos (messages/*.json) - o
  // rotulo visivel vem de t(chaveTitulo)/t(`rotulos.${chaveRotulo}`), nao
  // fica fixo aqui.
  chaveTitulo: string
  chaveRotulo: 'tipoRadiografia' | 'achadoPrincipal' | 'qualidadeTecnica'
  parametro: 'tipo_radiografia' | 'achado_principal' | 'qualidade_tecnica'
  valor: string
  /** Cor de destaque (hex) usada no brilho, na barra e no ponto do cartao. */
  destaque: string
}

// Categorias do banco de imagens - cada card leva pra pesquisa avancada ja
// filtrada. Usado na tela "Banco de imagens", agrupado por tipo de filtro.
const CATEGORIAS: Categoria[] = [
  {
    chaveTitulo: 'periapicais',
    chaveRotulo: 'tipoRadiografia',
    parametro: 'tipo_radiografia',
    valor: 'periapical',
    destaque: '#14B8A6',
  },
  {
    chaveTitulo: 'panoramicas',
    chaveRotulo: 'tipoRadiografia',
    parametro: 'tipo_radiografia',
    valor: 'panoramica',
    destaque: '#06B6D4',
  },
  {
    chaveTitulo: 'interproximais',
    chaveRotulo: 'tipoRadiografia',
    parametro: 'tipo_radiografia',
    valor: 'interproximal',
    destaque: '#0EA5E9',
  },
  {
    chaveTitulo: 'oclusais',
    chaveRotulo: 'tipoRadiografia',
    parametro: 'tipo_radiografia',
    valor: 'oclusal',
    destaque: '#6366F1',
  },
  {
    chaveTitulo: 'anatomiaNormal',
    chaveRotulo: 'achadoPrincipal',
    parametro: 'achado_principal',
    valor: 'normal',
    destaque: '#10B981',
  },
  {
    chaveTitulo: 'carie',
    chaveRotulo: 'achadoPrincipal',
    parametro: 'achado_principal',
    valor: 'carie',
    destaque: '#EF4444',
  },
  {
    chaveTitulo: 'lesoesPeriapicais',
    chaveRotulo: 'achadoPrincipal',
    parametro: 'achado_principal',
    valor: 'lesao_periapical',
    destaque: '#F97316',
  },
  {
    chaveTitulo: 'perdaOssea',
    chaveRotulo: 'achadoPrincipal',
    parametro: 'achado_principal',
    valor: 'perda_ossea',
    destaque: '#F59E0B',
  },
  {
    chaveTitulo: 'dentesInclusos',
    chaveRotulo: 'achadoPrincipal',
    parametro: 'achado_principal',
    valor: 'dente_incluso',
    destaque: '#A855F7',
  },
  {
    chaveTitulo: 'tratamentoEndodontico',
    chaveRotulo: 'achadoPrincipal',
    parametro: 'achado_principal',
    valor: 'tratamento_endodontico',
    destaque: '#3B82F6',
  },
  {
    chaveTitulo: 'errosTecnicos',
    chaveRotulo: 'achadoPrincipal',
    parametro: 'achado_principal',
    valor: 'erro_tecnico',
    destaque: '#94A3B8',
  },
  {
    chaveTitulo: 'altaQualidade',
    chaveRotulo: 'qualidadeTecnica',
    parametro: 'qualidade_tecnica',
    valor: 'otima',
    destaque: '#EAB308',
  },
]

export interface Contagens {
  total: number
  por_tipo_radiografia: Record<string, number>
  por_achado_principal: Record<string, number>
  por_qualidade_tecnica: Record<string, number>
}

const MAPA_CONTAGEM: Record<Categoria['parametro'], keyof Contagens> = {
  tipo_radiografia: 'por_tipo_radiografia',
  achado_principal: 'por_achado_principal',
  qualidade_tecnica: 'por_qualidade_tecnica',
}


const GRUPOS: Categoria['chaveRotulo'][] = ['tipoRadiografia', 'achadoPrincipal', 'qualidadeTecnica']

/**
 * Busca as contagens do acervo (total e por categoria) na API.
 * Devolve null enquanto carrega ou se a API nao responder - nesse caso os
 * cartoes continuam funcionando, so sem os numeros.
 */
export function useContagensBanco(): Contagens | null {
  const [contagens, setContagens] = useState<Contagens | null>(null)

  useEffect(() => {
    let cancelado = false

    // A sessao vive num cookie httpOnly (ver lib/sessao.ts): o navegador o
    // envia sozinho com credentials: 'include'. Antes esta busca ainda
    // procurava um token no localStorage, que nao existe mais desde a
    // migracao para cookie - por isso os numeros nao apareciam.
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/search/counts`, {
      credentials: 'include',
    })
      .then((resposta) => (resposta.ok ? resposta.json() : null))
      .then((dados) => {
        if (dados && !cancelado) setContagens(dados)
      })
      .catch(() => {
        // sem contagem, os cards continuam funcionando normalmente sem o numero
      })
    return () => {
      cancelado = true
    }
  }, [])

  return contagens
}

/**
 * Numero que "sobe" de 0 ate o valor final em ~0,9 s (efeito de contador).
 * Com "reduzir movimento" ligado no sistema, mostra o valor final direto.
 */
export function useContador(valor: number | null, duracaoMs = 900): number | null {
  const [mostrado, setMostrado] = useState<number | null>(valor)
  const anterior = useRef(0)

  useEffect(() => {
    if (valor === null) {
      setMostrado(null)
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setMostrado(valor)
      anterior.current = valor
      return
    }
    const de = anterior.current
    const inicio = performance.now()
    let quadro = 0
    const passo = (agora: number) => {
      const k = Math.min(1, (agora - inicio) / duracaoMs)
      const suave = 1 - Math.pow(1 - k, 3)
      setMostrado(Math.round(de + (valor - de) * suave))
      if (k < 1) quadro = requestAnimationFrame(passo)
      else anterior.current = valor
    }
    quadro = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(quadro)
  }, [valor, duracaoMs])

  return mostrado
}

interface PropsCartao {
  categoria: Categoria
  contagem: number | null
  total: number | null
  indice: number
}

function CartaoCategoria({ categoria, contagem, total, indice }: PropsCartao) {
  const t = useTranslations('GradeCategorias')
  const numero = useContador(contagem)
  const fracao = contagem !== null && total ? contagem / total : 0
  const percentual = Math.round(fracao * 100)

  // "Lanterna" colorida que segue o mouse dentro do cartao
  function aoMover(e: PointerEvent<HTMLAnchorElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
  }

  const estilo = {
    '--cor': categoria.destaque,
    animationDelay: `${80 + indice * 55}ms`,
  } as CSSProperties

  return (
    <Link
      href={`/pesquisa?${categoria.parametro}=${categoria.valor}`}
      onPointerMove={aoMover}
      style={estilo}
      className="cartao-categoria group relative flex min-h-[168px] flex-col overflow-hidden rounded-2xl p-5 outline-none"
    >
      {/* brilho que acompanha o mouse */}
      <span aria-hidden="true" className="cartao-lanterna pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      {/* filete colorido no topo */}
      <span aria-hidden="true" className="cartao-filete pointer-events-none absolute inset-x-0 top-0 h-px" />

      <div className="relative flex items-start justify-between gap-3">
        {/* numero do cartao (o tipo de filtro ja aparece no titulo do grupo) */}
        <span className="flex items-center gap-2 font-mono text-[11px] tracking-[.2em] text-ink-3" aria-hidden="true">
          <span className="cartao-ponto h-2 w-2 rounded-full" />
          {String(indice + 1).padStart(2, '0')}
        </span>
        <span className="font-mono text-2xl font-semibold tabular-nums leading-none text-ink">
          {numero ?? '—'}
        </span>
      </div>

      <span className="relative mt-4 text-lg font-semibold leading-snug text-ink">
        {t(`categorias.${categoria.chaveTitulo}` as Parameters<typeof t>[0])}
      </span>

      <div className="relative mt-auto pt-5">
        <div className="h-1 overflow-hidden rounded-full bg-[rgba(15,23,42,.08)] dark:bg-white/10">
          <div className="cartao-barra h-full rounded-full" style={{ width: `${Math.max(fracao > 0 ? 3 : 0, percentual)}%` }} />
        </div>
        <div className="mt-2.5 flex items-center justify-between text-xs">
          <span className="text-ink-3">{contagem !== null && total ? t('doAcervo', { pct: percentual }) : ' '}</span>
          <span className="cartao-ver flex items-center gap-1 font-medium">
            {t('abrir')}
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  )
}

interface Props {
  /** Contagens ja buscadas pela pagina (evita buscar duas vezes). */
  contagens: Contagens | null
}

export default function GradeCategoriasImagens({ contagens }: Props) {
  const t = useTranslations('GradeCategorias')

  function contagemDaCategoria(categoria: Categoria): number | null {
    if (!contagens) return null
    const grupo = contagens[MAPA_CONTAGEM[categoria.parametro]] as Record<string, number>
    return grupo?.[categoria.valor] ?? 0
  }

  let indice = 0
  return (
    <div className="space-y-9">
      {GRUPOS.map((grupo) => {
        const itens = CATEGORIAS.filter((c) => c.chaveRotulo === grupo)
        return (
          <section key={grupo} aria-labelledby={`grupo-${grupo}`}>
            <div className="mb-4 flex items-center gap-3">
              <h2 id={`grupo-${grupo}`} className="text-xs font-semibold uppercase tracking-[.18em] text-ink-2">
                {t(`rotulos.${grupo}`)}
              </h2>
              <span className="h-px flex-1 bg-gradient-to-r from-teal-400/40 to-transparent" aria-hidden="true" />
              <span className="font-mono text-[11px] text-ink-4">{String(itens.length).padStart(2, '0')}</span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {itens.map((categoria) => (
                <CartaoCategoria
                  key={`${categoria.parametro}-${categoria.valor}`}
                  categoria={categoria}
                  contagem={contagemDaCategoria(categoria)}
                  total={contagens?.total ?? null}
                  indice={indice++}
                />
              ))}
            </div>
          </section>
        )
      })}
      <style>{ESTILO_CARTOES}</style>
    </div>
  )
}

// Visual "vidro" dos cartoes: fundo translucido com desfoque (o mapa-mundi
// aparece por tras), borda e brilho na cor da categoria (--cor) e entrada
// em cascata. Fica aqui para nao depender do globals.css.
const ESTILO_CARTOES = `
.cartao-categoria{
  background:linear-gradient(160deg, color-mix(in srgb, var(--cor) 9%, rgba(255,255,255,.7)), rgba(255,255,255,.5));
  border:1px solid color-mix(in srgb, var(--cor) 28%, rgba(15,23,42,.08));
  box-shadow:0 1px 2px rgba(15,23,42,.06), 0 12px 32px -18px color-mix(in srgb, var(--cor) 55%, transparent);
  backdrop-filter:blur(7px) saturate(140%);-webkit-backdrop-filter:blur(7px) saturate(140%);
  transition:transform .35s cubic-bezier(.2,.8,.2,1), border-color .35s, box-shadow .35s;
  animation:cartaoEntra .7s cubic-bezier(.2,.8,.2,1) backwards;
}
.dark .cartao-categoria{
  background:linear-gradient(160deg, color-mix(in srgb, var(--cor) 14%, rgba(7,11,16,.5)), rgba(7,11,16,.36));
  border-color:color-mix(in srgb, var(--cor) 30%, rgba(255,255,255,.07));
  box-shadow:0 1px 0 rgba(255,255,255,.04) inset, 0 18px 40px -24px color-mix(in srgb, var(--cor) 70%, transparent);
}
.cartao-categoria:hover,.cartao-categoria:focus-visible{
  transform:translateY(-4px);
  border-color:color-mix(in srgb, var(--cor) 70%, transparent);
  box-shadow:0 0 0 1px color-mix(in srgb, var(--cor) 35%, transparent), 0 22px 48px -20px color-mix(in srgb, var(--cor) 80%, transparent);
}
.cartao-categoria:focus-visible{outline:2px solid var(--cor);outline-offset:3px}
.cartao-lanterna{background:radial-gradient(260px circle at var(--mx,50%) var(--my,50%), color-mix(in srgb, var(--cor) 26%, transparent), transparent 70%)}
.cartao-filete{background:linear-gradient(90deg, transparent, var(--cor), transparent);opacity:.7}
.cartao-ponto{background:var(--cor);box-shadow:0 0 10px var(--cor)}
.cartao-barra{background:linear-gradient(90deg, color-mix(in srgb, var(--cor) 55%, transparent), var(--cor));box-shadow:0 0 12px var(--cor);transition:width 1s cubic-bezier(.2,.8,.2,1)}
.cartao-ver{color:color-mix(in srgb, var(--cor) 75%, #0f172a)}
.dark .cartao-ver{color:color-mix(in srgb, var(--cor) 70%, #fff)}
@keyframes cartaoEntra{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.cartao-categoria{animation:none;transition:none}.cartao-categoria:hover{transform:none}}
`
