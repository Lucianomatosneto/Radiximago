'use client'

// EDITOR DA FOTO NO CELULAR (Fase 1 - foto do negatoscopio, 10/11/2026)
// Girar de 90 em 90 graus, recortar e cobrir com TARJA qualquer area com
// nome, numero ou data. Tudo e feito num <canvas> (recurso do proprio
// navegador, sem biblioteca nova) e a tarja e GRAVADA NOS PIXELS - a versao
// sem tarja nunca sai do aparelho. No fim a imagem e reduzida (lado maior
// ate 2048 px) e regravada em JPEG: a regravacao descarta os dados do
// celular (EXIF: data, aparelho, localizacao). O servidor confere tudo de novo.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Crop, RotateCw, Square, Undo2, Check, X } from 'lucide-react'

const LADO_MAX = 2048
const QUALIDADE_JPEG = 0.85
const MAX_DESFAZER = 5

type Modo = 'tarja' | 'recorte'
type Retangulo = { x: number; y: number; w: number; h: number }

function copiar(origem: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = origem.width
  c.height = origem.height
  c.getContext('2d')?.drawImage(origem, 0, 0)
  return c
}

async function carregar(arquivo: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(arquivo)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode() // o navegador ja aplica a rotacao gravada pelo celular
    const escala = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.naturalWidth * escala))
    c.height = Math.max(1, Math.round(img.naturalHeight * escala))
    c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height)
    return c
  } finally {
    URL.revokeObjectURL(url)
  }
}

export default function EditorFoto({
  arquivo,
  onPronto,
  onCancelar,
}: {
  arquivo: File
  onPronto: (foto: Blob) => void
  onCancelar: () => void
}) {
  const t = useTranslations('EnviarImagem.foto.editor')
  const tela = useRef<HTMLCanvasElement>(null)
  const base = useRef<HTMLCanvasElement | null>(null)
  const historico = useRef<HTMLCanvasElement[]>([])
  const inicio = useRef<{ x: number; y: number } | null>(null)
  const [modo, setModo] = useState<Modo>('tarja')
  // o modo vai num ref para o desenho NAO depender dele: trocar de
  // ferramenta nunca pode recarregar a foto original (perderia as tarjas)
  const modoRef = useRef<Modo>('tarja')
  modoRef.current = modo
  const [selecao, setSelecao] = useState<Retangulo | null>(null)
  const [podeDesfazer, setPodeDesfazer] = useState(false)
  const [tarjas, setTarjas] = useState(0)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(true)

  const desenhar = useCallback((sel: Retangulo | null = null) => {
    const c = tela.current
    const b = base.current
    if (!c || !b) return
    c.width = b.width
    c.height = b.height
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.drawImage(b, 0, 0)
    if (sel && sel.w > 0 && sel.h > 0) {
      const espessura = Math.max(2, Math.round(b.width / 300))
      ctx.lineWidth = espessura
      ctx.setLineDash([espessura * 4, espessura * 3])
      ctx.strokeStyle = '#2dd4bf'
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      if (modoRef.current === 'tarja') ctx.fillRect(sel.x, sel.y, sel.w, sel.h)
      ctx.strokeRect(sel.x, sel.y, sel.w, sel.h)
    }
  }, [])

  useEffect(() => {
    let ativo = true
    setOcupado(true)
    carregar(arquivo)
      .then((c) => {
        if (!ativo) return
        base.current = c
        historico.current = []
        setPodeDesfazer(false)
        setTarjas(0)
        desenhar()
      })
      .catch(() => ativo && setErro(t('erroAbrir')))
      .finally(() => ativo && setOcupado(false))
    return () => {
      ativo = false
    }
    // so uma foto NOVA recarrega o editor (desenhar e t nao mudam o que foi feito)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arquivo])

  useEffect(() => {
    desenhar(selecao)
  }, [selecao, desenhar])

  function guardarParaDesfazer() {
    if (!base.current) return
    historico.current = [...historico.current.slice(-(MAX_DESFAZER - 1)), copiar(base.current)]
    setPodeDesfazer(true)
  }

  function desfazer() {
    const anterior = historico.current.pop()
    if (!anterior) return
    base.current = anterior
    setPodeDesfazer(historico.current.length > 0)
    setSelecao(null)
    desenhar()
  }

  function girar() {
    const b = base.current
    if (!b) return
    guardarParaDesfazer()
    const c = document.createElement('canvas')
    c.width = b.height
    c.height = b.width
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.translate(c.width, 0)
    ctx.rotate(Math.PI / 2)
    ctx.drawImage(b, 0, 0)
    base.current = c
    setSelecao(null)
    desenhar()
  }

  // ponto do dedo/mouse em coordenadas da imagem
  function ponto(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = tela.current!
    const caixa = c.getBoundingClientRect()
    return {
      x: Math.min(c.width, Math.max(0, ((e.clientX - caixa.left) / caixa.width) * c.width)),
      y: Math.min(c.height, Math.max(0, ((e.clientY - caixa.top) / caixa.height) * c.height)),
    }
  }

  function aoPressionar(e: React.PointerEvent<HTMLCanvasElement>) {
    if (ocupado) return
    e.currentTarget.setPointerCapture(e.pointerId)
    inicio.current = ponto(e)
    setSelecao({ ...inicio.current, w: 0, h: 0 })
  }

  function aoMover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!inicio.current) return
    const p = ponto(e)
    const a = inicio.current
    setSelecao({ x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(p.x - a.x), h: Math.abs(p.y - a.y) })
  }

  function aoSoltar() {
    inicio.current = null
    const b = base.current
    const sel = selecao
    if (!b || !sel || sel.w < 8 || sel.h < 8) {
      setSelecao(null)
      return
    }
    if (modo === 'tarja') {
      // tarja GRAVADA nos pixels (nao e uma camada por cima)
      guardarParaDesfazer()
      const ctx = b.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#000'
        ctx.fillRect(Math.floor(sel.x), Math.floor(sel.y), Math.ceil(sel.w) + 1, Math.ceil(sel.h) + 1)
      }
      setTarjas((n) => n + 1)
      setSelecao(null)
      desenhar()
    }
    // recorte: a selecao fica marcada ate tocar em "Aplicar recorte"
  }

  function aplicarRecorte() {
    const b = base.current
    const sel = selecao
    if (!b || !sel || sel.w < 8 || sel.h < 8) return
    guardarParaDesfazer()
    const c = document.createElement('canvas')
    c.width = Math.round(sel.w)
    c.height = Math.round(sel.h)
    c.getContext('2d')?.drawImage(b, sel.x, sel.y, sel.w, sel.h, 0, 0, c.width, c.height)
    base.current = c
    setSelecao(null)
    desenhar()
  }

  function concluir() {
    const b = base.current
    if (!b) return
    setOcupado(true)
    // regrava em JPEG: os dados do celular (EXIF) nao vao junto
    b.toBlob(
      (blob) => {
        setOcupado(false)
        if (blob) onPronto(blob)
        else setErro(t('erroGerar'))
      },
      'image/jpeg',
      QUALIDADE_JPEG
    )
  }

  const botao =
    'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm disabled:opacity-40'
  const ativo = 'border-brand bg-brand/10 text-ink'
  const inativo = 'border-base-border text-ink-2 hover:border-brand'

  return (
    <div className="space-y-3" data-teste="editor-foto">
      <div className="flex flex-wrap gap-2" role="toolbar" aria-label={t('ferramentas')}>
        <button type="button" onClick={() => { setModo('tarja'); setSelecao(null) }} aria-pressed={modo === 'tarja'}
                className={`${botao} ${modo === 'tarja' ? ativo : inativo}`} data-teste="modo-tarja">
          <Square aria-hidden="true" className="h-4 w-4 fill-current" /> {t('tarja')}
        </button>
        <button type="button" onClick={() => { setModo('recorte'); setSelecao(null) }} aria-pressed={modo === 'recorte'}
                className={`${botao} ${modo === 'recorte' ? ativo : inativo}`} data-teste="modo-recorte">
          <Crop aria-hidden="true" className="h-4 w-4" /> {t('recortar')}
        </button>
        <button type="button" onClick={girar} disabled={ocupado} className={`${botao} ${inativo}`} data-teste="girar">
          <RotateCw aria-hidden="true" className="h-4 w-4" /> {t('girar')}
        </button>
        <button type="button" onClick={desfazer} disabled={!podeDesfazer || ocupado} className={`${botao} ${inativo}`}>
          <Undo2 aria-hidden="true" className="h-4 w-4" /> {t('desfazer')}
        </button>
      </div>
      <p className="text-xs text-ink-2">{modo === 'tarja' ? t('ajudaTarja') : t('ajudaRecorte')}</p>

      <div className="flex justify-center rounded-lg border border-base-border bg-black/80 p-1">
        <canvas
          ref={tela}
          onPointerDown={aoPressionar}
          onPointerMove={aoMover}
          onPointerUp={aoSoltar}
          onPointerCancel={aoSoltar}
          aria-label={t('imagem')}
          data-teste="canvas-foto"
          className="block max-h-[60vh] w-auto max-w-full touch-none select-none"
        />
      </div>

      {modo === 'recorte' && selecao && selecao.w >= 8 && !inicio.current && (
        <button type="button" onClick={aplicarRecorte} className={`${botao} ${ativo}`} data-teste="aplicar-recorte">
          <Crop aria-hidden="true" className="h-4 w-4" /> {t('aplicarRecorte')}
        </button>
      )}
      {tarjas > 0 && <p className="text-xs text-ink-3">{t('tarjasAplicadas', { n: tarjas })}</p>}
      {erro && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{erro}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={concluir} disabled={ocupado}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                data-teste="concluir-ajuste">
          <Check aria-hidden="true" className="h-4 w-4" /> {t('concluir')}
        </button>
        <button type="button" onClick={onCancelar} className={`${botao} ${inativo}`}>
          <X aria-hidden="true" className="h-4 w-4" /> {t('trocarFoto')}
        </button>
      </div>
    </div>
  )
}
