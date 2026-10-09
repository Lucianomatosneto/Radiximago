'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { useDescricaoCuradoria, type ItemDescritivel } from '../../lib/descricaoCuradoria'

// IMPRESSAO DAS IMAGENS
// Botao "Imprimir" com um menu: para cada grupo (ex.: "Todas", "Selecionadas")
// ha a opcao COM descricao da curadoria e SEM descricao.
//  - Com descricao: 2 imagens por pagina, cada uma com o texto da curadoria
//    (e com as marcacoes do curador desenhadas, quando houver).
//  - Sem descricao: 4 imagens por pagina (2 x 2), so com o numero.
// Como funciona: as imagens sao baixadas com a sessao do usuario (a rota e
// protegida), montadas numa area escondida da pagina que so aparece na
// impressao, e entao abrimos a janela de impressao do navegador (dali da
// para imprimir no papel ou "Salvar como PDF").
// Todas as paginas levam o aviso de uso academico - as imagens ja sao
// anonimizadas (LGPD), mas o material impresso continua sendo de ensino e
// pesquisa, nao de diagnostico.

export interface ItemImpressao extends ItemDescritivel {
  curation_id: number
  numero: number
}

export interface GrupoImpressao {
  chave: string
  rotulo: string
  itens: ItemImpressao[]
}

interface Trabalho {
  itens: ItemImpressao[]
  comDescricao: boolean
}

const PARALELO = 4

export default function MenuImpressao({ grupos, compacto = false }: { grupos: GrupoImpressao[]; compacto?: boolean }) {
  const t = useTranslations('Impressao')
  const [aberto, setAberto] = useState(false)
  const [trabalho, setTrabalho] = useState<Trabalho | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    function fora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  const temAlgo = grupos.some((g) => g.itens.length > 0)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        disabled={!temAlgo || !!trabalho}
        aria-haspopup="true"
        aria-expanded={aberto}
        className={
          compacto
            ? 'rounded-md border border-base-border bg-base-surface/80 px-3 py-1 text-xs text-slate-200 hover:border-brand hover:text-brand-300 disabled:opacity-50'
            : 'flex items-center gap-2 rounded-lg border border-base-border bg-base-surface px-4 py-2 text-sm text-slate-200 hover:border-brand hover:text-brand-300 disabled:opacity-50'
        }
      >
        🖨 {t('botao')} <span aria-hidden="true" className="text-xs opacity-70">▾</span>
      </button>

      {aberto && (
        <div className={`absolute z-[70] w-72 rounded-xl border border-base-border bg-base-surface p-2 shadow-2xl ${compacto ? 'bottom-full right-0 mb-2' : 'right-0 top-full mt-2'}`}>
          {grupos.map((g) => (
            <div key={g.chave} className="py-1">
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {g.rotulo} ({g.itens.length})
              </p>
              {[true, false].map((comDescricao) => (
                <button
                  key={String(comDescricao)}
                  type="button"
                  disabled={g.itens.length === 0}
                  onClick={() => {
                    setAberto(false)
                    setTrabalho({ itens: g.itens, comDescricao })
                  }}
                  className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-white/5 disabled:opacity-40"
                >
                  {comDescricao ? t('comDescricao') : t('semDescricao')}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {trabalho && <ImpressaoEmAndamento trabalho={trabalho} onTerminar={() => setTrabalho(null)} />}
    </div>
  )
}

function ImpressaoEmAndamento({ trabalho, onTerminar }: { trabalho: Trabalho; onTerminar: () => void }) {
  const t = useTranslations('Impressao')
  const descrever = useDescricaoCuradoria()
  const [urls, setUrls] = useState<Record<number, string>>({})
  const [prontas, setProntas] = useState(0)
  const [falhas, setFalhas] = useState(0)
  const [fase, setFase] = useState<'baixando' | 'imprimindo'>('baixando')
  const canceladoRef = useRef(false)
  const urlsRef = useRef<string[]>([])
  const total = trabalho.itens.length

  // Baixa as imagens (no maximo PARALELO ao mesmo tempo)
  useEffect(() => {
    canceladoRef.current = false
    const fila = [...trabalho.itens]
    async function trabalhar() {
      while (fila.length && !canceladoRef.current) {
        const item = fila.shift() as ItemImpressao
        const comMarcacao = trabalho.comDescricao && (item.marcacoes ?? []).length > 0
        try {
          const r = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/search/${item.curation_id}/preview${comMarcacao ? '?com_marcacao=true' : ''}`,
            { credentials: 'include' }
          )
          if (!r.ok) throw new Error(String(r.status))
          const url = URL.createObjectURL(await r.blob())
          urlsRef.current.push(url)
          if (!canceladoRef.current) setUrls((u) => ({ ...u, [item.curation_id]: url }))
        } catch {
          if (!canceladoRef.current) setFalhas((f) => f + 1)
        } finally {
          if (!canceladoRef.current) setProntas((p) => p + 1)
        }
      }
    }
    Promise.all(Array.from({ length: Math.min(PARALELO, total) }, trabalhar))
    return () => {
      canceladoRef.current = true
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u))
      urlsRef.current = []
    }
  }, [trabalho, total])

  // Tudo baixado: espera as imagens desenharem e abre a impressao
  useEffect(() => {
    if (prontas < total || fase !== 'baixando') return
    setFase('imprimindo')
    const area = document.getElementById('radix-impressao')
    const imgs = Array.from(area?.querySelectorAll('img') ?? [])
    Promise.all(
      imgs.map((img) => (img.complete ? Promise.resolve() : new Promise((ok) => {
        img.onload = () => ok(null)
        img.onerror = () => ok(null)
      })))
    ).then(() => {
      if (canceladoRef.current) return
      const terminar = () => {
        window.removeEventListener('afterprint', terminar)
        onTerminar()
      }
      window.addEventListener('afterprint', terminar)
      window.print()
    })
  }, [prontas, total, fase, onTerminar])

  const dataHora = new Date().toLocaleString()
  const porPagina = trabalho.comDescricao ? 2 : 4
  const paginas: ItemImpressao[][] = []
  for (let i = 0; i < trabalho.itens.length; i += porPagina) paginas.push(trabalho.itens.slice(i, i + porPagina))

  return createPortal(
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS_IMPRESSAO }} />
      {/* aviso na tela enquanto prepara */}
      <div className="radix-impressao-aviso fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="w-80 rounded-2xl border border-base-border bg-base-surface p-5 text-center shadow-2xl">
          <p className="text-sm font-semibold text-ink">{t('preparando')}</p>
          <p className="mt-1 text-xs text-slate-400">{t('progresso', { feitas: prontas, total })}</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-teal-400 transition-all" style={{ width: `${total ? (prontas / total) * 100 : 0}%` }} />
          </div>
          {falhas > 0 && <p className="mt-2 text-xs text-amber-300">{t('falhas', { total: falhas })}</p>}
          <button
            type="button"
            onClick={() => {
              canceladoRef.current = true
              onTerminar()
            }}
            className="mt-4 rounded-lg border border-base-border px-4 py-1.5 text-xs text-slate-300 hover:border-status-danger hover:text-status-danger"
          >
            {t('cancelar')}
          </button>
        </div>
      </div>

      {/* conteudo que so aparece no papel */}
      <div id="radix-impressao" translate="no">
        {paginas.map((pagina, p) => (
          <section key={p} className={`ri-pagina ${trabalho.comDescricao ? 'ri-com' : 'ri-sem'}`}>
            <header className="ri-cabecalho">
              <strong>Rádix Imago</strong>
              <span>{t('cabecalho', { pagina: p + 1, total: paginas.length, data: dataHora })}</span>
            </header>
            <div className="ri-grade">
              {pagina.map((item) => (
                <figure key={item.curation_id} className="ri-item">
                  <div className="ri-imagem">
                    {urls[item.curation_id] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={urls[item.curation_id]} alt={t('imagemNumero', { numero: item.numero })} />
                    ) : (
                      <span className="ri-falha">{t('imagemIndisponivel')}</span>
                    )}
                  </div>
                  <figcaption>
                    <b>#{item.numero}</b>
                    {trabalho.comDescricao && (
                      <dl>
                        {descrever(item).map((l) => (
                          <div key={l.rotulo}>
                            <dt>{l.rotulo}:</dt> <dd>{l.valor}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
            <footer className="ri-rodape">{t('rodape')}</footer>
          </section>
        ))}
      </div>
    </>,
    document.body
  )
}

const CSS_IMPRESSAO = `
#radix-impressao{position:fixed;left:-100000px;top:0;width:190mm}
@media print{
  @page{size:A4;margin:10mm}
  html,body{background:#fff!important}
  body>*:not(#radix-impressao){display:none!important}
  #radix-impressao{position:static;width:auto;color:#111;font:10pt/1.35 Inter,Arial,sans-serif}
  .ri-pagina{page-break-after:always;break-after:page;height:276mm;display:flex;flex-direction:column}
  .ri-pagina:last-child{page-break-after:auto;break-after:auto}
  .ri-cabecalho{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid #999;padding-bottom:2mm;margin-bottom:3mm;font-size:9pt}
  .ri-grade{flex:1;display:grid;gap:4mm;min-height:0}
  .ri-com .ri-grade{grid-template-rows:1fr 1fr}
  .ri-sem .ri-grade{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}
  .ri-item{margin:0;display:flex;flex-direction:column;min-height:0;break-inside:avoid}
  .ri-com .ri-item{flex-direction:row;gap:4mm}
  .ri-imagem{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;background:#000}
  .ri-com .ri-imagem{flex:0 0 58%}
  .ri-imagem img{max-width:100%;max-height:100%;object-fit:contain;display:block}
  .ri-falha{color:#fff;font-size:9pt}
  .ri-item figcaption{font-size:9pt;padding-top:1.5mm}
  .ri-com .ri-item figcaption{flex:1;padding-top:0;overflow:hidden}
  .ri-item dl{margin:1mm 0 0}
  .ri-item dl div{margin-bottom:1.2mm}
  .ri-item dt{display:inline;font-weight:600}
  .ri-item dd{display:inline;margin:0}
  .ri-rodape{border-top:1px solid #999;padding-top:1.5mm;margin-top:3mm;font-size:8pt;color:#444}
  .radix-impressao-aviso{display:none!important}
}
`
