'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  caminhoHolofote,
  corMarcacao,
  geometriaMarcacao,
  marcacaoSobPonto,
  type GeometriaMarcacao,
  type Marcacao,
} from '../../lib/marcacoes'
import { textoMarcacao } from '../../lib/descricaoCuradoria'

// Camada com as marcacoes do curador desenhadas por cima da imagem, no
// estilo padrao do Radix (o mesmo do visualizador OHIF e dos arquivos
// baixados/impressos):
//  - cor por tipo de achado (paleta para daltonicos, ver lib/marcacoes.ts);
//  - contorno com "halo" (borda escura fina por fora), legivel tanto sobre
//    o osso (claro) quanto sobre os tecidos moles (escuros);
//  - sem veu branco por cima: a anatomia mantem o contraste original;
//  - numero (ordem em que o curador marcou) FORA da forma, ligado a ela
//    por uma linha-guia, para nao cobrir a regiao marcada.
//
// Interacao ("foco + contexto"), quando `interativo`:
//  - mouse sobre a forma ou o numero: ela fica mais forte e vai para a
//    frente; as outras ficam esmaecidas; abre a descricao dela;
//  - clique: isola (so ela aparece); clique de novo ou Esc: todas;
//  - teclas 1-9 isolam; H liga/desliga o "holofote" (escurece o resto).
//
// Precisa ficar dentro de uma caixa do MESMO tamanho/posicao da imagem (ou
// do recorte visivel dela, no editor da Curadoria). Desenha em pixels
// reais (mede a caixa), por isso nada fica deformado.
export default function CamadaMarcacoes({
  marcacoes,
  recorte,
  interativo = true,
  destaque = null,
}: {
  marcacoes: Marcacao[]
  recorte?: { x: number; y: number; largura: number; altura: number } | null
  interativo?: boolean
  /** marcacao destacada por fora (ex.: a selecionada no editor) */
  destaque?: number | null
}) {
  const t = useTranslations('DescricaoCuradoria')
  const caixaRef = useRef<HTMLDivElement>(null)
  const [tam, setTam] = useState<{ w: number; h: number } | null>(null)
  const [foco, setFoco] = useState<number | null>(null)
  const [isolada, setIsolada] = useState<number | null>(null)
  const [holofote, setHolofote] = useState(false)
  const [dentro, setDentro] = useState(false)
  const [dica, setDica] = useState<{ texto: string; x: number; y: number } | null>(null)

  useEffect(() => {
    const el = caixaRef.current
    if (!el) return
    const medir = () => setTam({ w: el.clientWidth, h: el.clientHeight })
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // se as marcacoes mudarem (outra imagem), desfaz o isolamento
  const assinatura = marcacoes.map((m) => m.id).join(',')
  useEffect(() => {
    setIsolada(null)
    setFoco(null)
  }, [assinatura])

  const r = recorte ?? { x: 0, y: 0, largura: 1, altura: 1 }
  const geos: (GeometriaMarcacao | null)[] = useMemo(() => {
    if (!tam) return []
    const paraTela = (rx: number, ry: number): [number, number] => [
      ((rx - r.x) / r.largura) * tam.w,
      ((ry - r.y) / r.altura) * tam.h,
    ]
    return marcacoes.map((m) => geometriaMarcacao(m, paraTela))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcacoes, tam, r.x, r.y, r.largura, r.altura])

  const texto = (i: number) => `${t('marcacaoN', { numero: i + 1 })}: ${textoMarcacao(marcacoes[i])}`

  // teclado so enquanto o mouse esta sobre a imagem (nao atrapalha o resto da tela)
  useEffect(() => {
    if (!interativo || !dentro) return
    function aoTeclar(ev: KeyboardEvent) {
      const alvo = ev.target as HTMLElement | null
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable)) return
      if (ev.key === 'Escape') setIsolada(null)
      else if (ev.key === 'h' || ev.key === 'H') setHolofote((v) => !v)
      else {
        const n = parseInt(ev.key, 10)
        if (n >= 1 && n <= marcacoes.length) setIsolada((atual) => (atual === n - 1 ? null : n - 1))
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [interativo, dentro, marcacoes.length])

  function pontoLocal(ev: React.MouseEvent) {
    const rect = caixaRef.current!.getBoundingClientRect()
    return [ev.clientX - rect.left, ev.clientY - rect.top] as const
  }
  function visiveis(): (GeometriaMarcacao | null)[] {
    return geos.map((g, i) => (isolada !== null && i !== isolada ? null : g))
  }

  const ativo = foco ?? destaque ?? isolada
  const ordem = marcacoes.map((_, i) => i).filter((i) => isolada === null || i === isolada)
  if (ativo !== null && ordem.includes(ativo)) ordem.push(ordem.splice(ordem.indexOf(ativo), 1)[0])

  return (
    <div
      ref={caixaRef}
      className="absolute inset-0"
      style={{ pointerEvents: interativo ? 'auto' : 'none', cursor: interativo && foco !== null ? 'pointer' : undefined }}
      onMouseEnter={() => setDentro(true)}
      onMouseMove={(ev) => {
        if (!interativo) return
        const [px, py] = pontoLocal(ev)
        const i = marcacaoSobPonto(visiveis(), px, py)
        setFoco(i)
        setDica(i === null ? null : { texto: texto(i), x: ev.clientX, y: ev.clientY })
      }}
      onMouseLeave={() => {
        setDentro(false)
        setFoco(null)
        setDica(null)
      }}
      onClick={(ev) => {
        if (!interativo) return
        const [px, py] = pontoLocal(ev)
        const i = marcacaoSobPonto(visiveis(), px, py)
        if (i !== null) setIsolada((atual) => (atual === i ? null : i))
      }}
    >
      {tam && (
        <svg width={tam.w} height={tam.h} className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden="true">
          {holofote && ativo !== null && geos[ativo] && (
            <path d={caminhoHolofote(geos[ativo]!, tam.w, tam.h)} fill="rgba(0,0,0,0.55)" fillRule="evenodd" />
          )}
          {ordem.map((i) => {
            const g = geos[i]
            if (!g) return null
            const cor = corMarcacao(marcacoes[i])
            const forte = ativo === i
            const apagada = ativo !== null && !forte
            return (
              <g key={marcacoes[i].id ?? i} style={{ opacity: apagada ? 0.25 : 1, transition: 'opacity .18s ease' }}>
                <path d={g.caminho} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth={forte ? 7 : 5} strokeLinejoin="round" strokeLinecap="round" />
                {g.seta && <path d={g.seta.ponta} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth={forte ? 7 : 5} strokeLinejoin="round" strokeLinecap="round" />}
                <path
                  d={g.caminho}
                  fill={g.seta ? 'none' : cor}
                  fillOpacity={g.seta ? undefined : 0.06}
                  stroke={cor}
                  strokeWidth={forte ? 3.5 : 2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {g.seta && <path d={g.seta.ponta} fill="none" stroke={cor} strokeWidth={forte ? 3.5 : 2.5} strokeLinejoin="round" strokeLinecap="round" />}
                <line x1={g.ancora[0]} y1={g.ancora[1]} x2={g.selo[0]} y2={g.selo[1]} stroke="rgba(0,0,0,0.6)" strokeWidth={3.5} strokeLinecap="round" />
                <line x1={g.ancora[0]} y1={g.ancora[1]} x2={g.selo[0]} y2={g.selo[1]} stroke={cor} strokeWidth={1.5} strokeLinecap="round" />
                <circle cx={g.selo[0]} cy={g.selo[1]} r={forte ? 12 : 11} fill={cor} stroke="#0b1220" strokeWidth={2} />
                <text
                  x={g.selo[0]}
                  y={g.selo[1]}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={12}
                  fontWeight={800}
                  fill="#000"
                  style={{ fontFamily: 'Inter, Arial, sans-serif' }}
                >
                  {i + 1}
                </text>
              </g>
            )
          })}
        </svg>
      )}
      {interativo && dica && (
        <span
          role="tooltip"
          className="pointer-events-none fixed z-50 max-w-xs rounded-lg border border-amber-400 bg-slate-900/95 px-2.5 py-1.5 text-xs font-semibold leading-snug text-slate-50 shadow-xl"
          style={{ left: dica.x + 14, top: dica.y + 14 }}
        >
          {dica.texto}
        </span>
      )}
    </div>
  )
}
