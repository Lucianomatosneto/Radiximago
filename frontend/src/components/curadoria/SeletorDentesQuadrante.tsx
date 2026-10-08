'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { QUADRANTES, dentesDoQuadrante, quadranteDoDente } from '../../lib/dentesFdi'

// Selecionar de dentes DEPENDENTE do quadrante (pedido explicito: os
// numeros de dente nao aparecem antes da escolha do quadrante). Usado
// tanto pelos dentes da FICHA (PainelDadosSobrepostos.tsx, sem "dente nao
// identificado" - esse conceito so existe no nivel do Achado) quanto pelos
// dentes de um ACHADO especifico (PainelAchadosEstruturados.tsx, com
// "dente nao identificado").
//
// Estado de "qual quadrante estou vendo agora" e local (useState) - NAO e
// o mesmo que "quais dentes estao selecionados" (isso vem de fora, via
// `dentesSelecionados`/`onChange`, e sobrevive a troca de quadrante: o
// pedido explicito e que seleciones de quadrantes anteriores nao se
// apaguem ao trocar de quadrante nem ao voltar).
export default function SeletorDentesQuadrante({
  dentesSelecionados,
  onChange,
  desabilitado,
  naoIdentificado,
  onChangeNaoIdentificado,
  dentesLimitadosA,
  onQuadranteChange,
}: {
  dentesSelecionados: number[]
  onChange: (dentes: number[]) => void
  desabilitado?: boolean
  /** So passado pelo formulario de Achado - dentes da ficha nao tem esse
   * conceito (Curation nao tem coluna equivalente, so Achado). */
  naoIdentificado?: boolean
  onChangeNaoIdentificado?: (valor: boolean) => void
  /** Opcional: restringe as opcoes marcaveis a este conjunto (usado pelo
   * formulario de Achado, que só deveria comportar dentes já presentes na
   * ficha - ver PainelAchadosEstruturados.tsx). Quando omitido, qualquer
   * dente do quadrante pode ser marcado (uso da ficha). */
  dentesLimitadosA?: number[]
  /** Opcional (Fase 4/Busca Avançada): avisa o componente pai qual
   * quadrante esta aberto no momento, mesmo sem nenhum dente marcado -
   * a Curadoria (dentes da ficha/achado) nao usa isso, so a Busca
   * Avançada precisa, porque la "Quadrante 4 sozinho, sem dente
   * específico" já é um filtro válido por si só (ver pesquisa/page.tsx). */
  onQuadranteChange?: (quadrante: 1 | 2 | 3 | 4 | null) => void
}) {
  const t = useTranslations('Curadoria.seletorDentes')
  const [quadranteAberto, setQuadranteAbertoState] = useState<1 | 2 | 3 | 4 | null>(
    dentesSelecionados.length > 0 ? quadranteDoDente(dentesSelecionados[0]) : null
  )

  function setQuadranteAberto(quadrante: 1 | 2 | 3 | 4 | null) {
    setQuadranteAbertoState(quadrante)
    onQuadranteChange?.(quadrante)
  }

  const temNaoIdentificado = typeof onChangeNaoIdentificado === 'function'
  const bloqueadoPorNaoIdentificado = temNaoIdentificado && naoIdentificado

  function alternarDente(numero: number) {
    if (desabilitado || bloqueadoPorNaoIdentificado) return
    onChange(
      dentesSelecionados.includes(numero)
        ? dentesSelecionados.filter((d) => d !== numero)
        : [...dentesSelecionados, numero].sort((a, b) => a - b)
    )
  }

  function removerDente(numero: number) {
    if (desabilitado) return
    onChange(dentesSelecionados.filter((d) => d !== numero))
  }

  return (
    <div className="flex flex-col gap-2">
      {temNaoIdentificado && (
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={!!naoIdentificado}
            disabled={desabilitado}
            onChange={(e) => {
              const marcado = e.target.checked
              onChangeNaoIdentificado!(marcado)
              // Contraditorio nao e permitido (mesma regra da API) - marcar
              // "nao identificado" limpa os dentes especificos ja escolhidos.
              if (marcado && dentesSelecionados.length > 0) onChange([])
            }}
            className="h-4 w-4 rounded border-base-border bg-base-surface2 text-brand"
          />
          {t('denteNaoIdentificado')}
        </label>
      )}

      {bloqueadoPorNaoIdentificado ? (
        <p className="text-xs text-slate-500">{t('naoIdentificadoExplicacao')}</p>
      ) : (
        <>
          {/* Passo 1: escolher o quadrante - os numeros so aparecem depois */}
          <div className="grid grid-cols-4 gap-1.5" role="group" aria-label={t('escolherQuadrante')}>
            {QUADRANTES.map((q) => (
              <button
                key={q.numero}
                type="button"
                disabled={desabilitado}
                onClick={() => setQuadranteAberto(q.numero)}
                aria-pressed={quadranteAberto === q.numero}
                className={`rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                  quadranteAberto === q.numero
                    ? 'border-brand bg-brand text-white'
                    : 'border-base-border text-slate-300 hover:border-brand/50'
                }`}
              >
                {t('quadranteAbreviado', { numero: q.numero })}
              </button>
            ))}
          </div>

          {/* Passo 2: numeros do quadrante escolhido */}
          {quadranteAberto && (
            <div className="grid grid-cols-4 gap-1.5" role="group" aria-label={t('dentesDoQuadrante', { numero: quadranteAberto })}>
              {dentesDoQuadrante(quadranteAberto).map((numero) => {
                const foraDoLimite = !!dentesLimitadosA && !dentesLimitadosA.includes(numero)
                return (
                  <label
                    key={numero}
                    className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-1 text-xs ${
                      foraDoLimite
                        ? 'cursor-not-allowed border-base-border/50 text-slate-600'
                        : 'cursor-pointer border-base-border text-slate-300 hover:border-brand/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={dentesSelecionados.includes(numero)}
                      disabled={desabilitado || foraDoLimite}
                      onChange={() => alternarDente(numero)}
                      className="h-3.5 w-3.5 rounded border-base-border bg-base-surface2 text-brand"
                    />
                    {numero}
                  </label>
                )
              })}
            </div>
          )}

          {/* Resumo do que ja esta selecionado, independente de qual
              quadrante esta aberto no momento - o pedido explicito e que a
              selecao de um quadrante anterior continue visivel/preservada
              ao trocar de quadrante. */}
          {dentesSelecionados.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {dentesSelecionados.map((numero) => (
                <span
                  key={numero}
                  className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 text-xs text-brand-300"
                >
                  {numero}
                  {!desabilitado && (
                    <button
                      type="button"
                      onClick={() => removerDente(numero)}
                      aria-label={t('removerDente', { numero })}
                      className="text-brand-300 hover:text-brand-hover"
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
