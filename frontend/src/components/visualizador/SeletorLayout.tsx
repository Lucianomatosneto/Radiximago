'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

// Seletor de layout da area de imagens (quantas imagens lado a lado), no
// estilo dos sistemas PACS: atalhos prontos (1, 2, 3, 4, 8 e 10 imagens) e
// um "Personalizar" em que a pessoa passa o mouse numa grade e escolhe
// linhas x colunas (como inserir tabela no Word).

export interface Grade {
  linhas: number
  colunas: number
}

export const PRESETS: { rotulo: string; grade: Grade }[] = [
  { rotulo: '1', grade: { linhas: 1, colunas: 1 } },
  { rotulo: '2', grade: { linhas: 1, colunas: 2 } },
  { rotulo: '3', grade: { linhas: 1, colunas: 3 } },
  { rotulo: '4', grade: { linhas: 2, colunas: 2 } },
  { rotulo: '8', grade: { linhas: 2, colunas: 4 } },
  { rotulo: '10', grade: { linhas: 2, colunas: 5 } },
]

const MAX_LINHAS = 4
const MAX_COLUNAS = 5

function Icone({ grade, tamanho = 18 }: { grade: Grade; tamanho?: number }) {
  const g = 1.5
  const w = (tamanho - g * (grade.colunas - 1)) / grade.colunas
  const h = (tamanho - g * (grade.linhas - 1)) / grade.linhas
  const quadros = []
  for (let l = 0; l < grade.linhas; l++)
    for (let c = 0; c < grade.colunas; c++)
      quadros.push(<rect key={`${l}-${c}`} x={c * (w + g)} y={l * (h + g)} width={w} height={h} rx={1} />)
  return (
    <svg viewBox={`0 0 ${tamanho} ${tamanho}`} width={tamanho} height={tamanho} fill="currentColor" aria-hidden="true">
      {quadros}
    </svg>
  )
}

export default function SeletorLayout({ grade, onEscolher }: { grade: Grade; onEscolher: (grade: Grade) => void }) {
  const t = useTranslations('Visualizador.layout')
  const [aberto, setAberto] = useState(false)
  const [hover, setHover] = useState<Grade | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    function fora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    function esc(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [aberto])

  function escolher(g: Grade) {
    onEscolher(g)
    setAberto(false)
  }

  const total = grade.linhas * grade.colunas
  const igual = (a: Grade, b: Grade) => a.linhas === b.linhas && a.colunas === b.colunas

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="true"
        aria-expanded={aberto}
        title={t('titulo')}
        className="flex items-center gap-2 rounded-full border border-teal-400/50 bg-teal-400/10 px-3 py-1.5 text-sm text-teal-200 hover:bg-teal-400/20"
      >
        <Icone grade={grade} />
        {t('rotulo', { total, linhas: grade.linhas, colunas: grade.colunas })}
        <span aria-hidden="true" className="text-xs opacity-70">▾</span>
      </button>

      {aberto && (
        <div className="absolute right-0 top-full z-[60] mt-2 w-[300px] rounded-2xl border border-base-border bg-base-surface p-3 shadow-2xl">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.14em] text-slate-400">{t('prontos')}</p>
          <div className="grid grid-cols-3 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.rotulo}
                type="button"
                onClick={() => escolher(p.grade)}
                className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs transition ${
                  igual(p.grade, grade)
                    ? 'border-teal-400 bg-teal-400/15 text-teal-200'
                    : 'border-base-border text-slate-300 hover:border-teal-400/60 hover:text-teal-200'
                }`}
              >
                <Icone grade={p.grade} tamanho={26} />
                {t('imagens', { total: Number(p.rotulo) })}
              </button>
            ))}
          </div>

          <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-[.14em] text-slate-400">
            {t('personalizar')}{' '}
            <span className="normal-case tracking-normal text-teal-300">
              {hover ? `${hover.linhas} × ${hover.colunas}` : ''}
            </span>
          </p>
          <div
            className="inline-grid gap-1"
            style={{ gridTemplateColumns: `repeat(${MAX_COLUNAS}, 1.6rem)` }}
            onMouseLeave={() => setHover(null)}
          >
            {Array.from({ length: MAX_LINHAS * MAX_COLUNAS }, (_, i) => {
              const l = Math.floor(i / MAX_COLUNAS) + 1
              const c = (i % MAX_COLUNAS) + 1
              const ref2 = hover ?? grade
              const ativo = l <= ref2.linhas && c <= ref2.colunas
              return (
                <button
                  key={i}
                  type="button"
                  onMouseEnter={() => setHover({ linhas: l, colunas: c })}
                  onFocus={() => setHover({ linhas: l, colunas: c })}
                  onClick={() => escolher({ linhas: l, colunas: c })}
                  aria-label={t('gradeAria', { linhas: l, colunas: c })}
                  className={`h-6 w-[1.6rem] rounded border transition ${
                    ativo ? 'border-teal-400 bg-teal-400/40' : 'border-base-border bg-base-surface2 hover:border-teal-400/60'
                  }`}
                />
              )
            })}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">{t('dica')}</p>
        </div>
      )}
    </div>
  )
}
