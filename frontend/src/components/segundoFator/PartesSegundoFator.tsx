'use client'

// Pecas do LOGIN EM DUAS ETAPAS (backend: app/modules/mfa.py), usadas na
// tela de login e em "Meus acessos":
// - CampoCodigo: caixa para o codigo de 6 numeros (ou de recuperacao);
// - CadastroAplicativo: passo a passo com o QR code para o celular;
// - CodigosRecuperacao: mostra UMA vez os 8 codigos de uso unico.
// `variante="escura"` = tela de login (fundo preto); "padrao" = demais telas.

import { useState } from 'react'
import { useTranslations } from 'next-intl'

export interface DadosCadastro {
  segredo: string
  qr_code: string
}

type Variante = 'escura' | 'padrao'

export function CampoCodigo({
  valor,
  aoMudar,
  aceitaRecuperacao = false,
  variante = 'padrao',
  autoFocus = true,
}: {
  valor: string
  aoMudar: (v: string) => void
  aceitaRecuperacao?: boolean
  variante?: Variante
  autoFocus?: boolean
}) {
  const t = useTranslations('SegundoFator')
  const cor =
    variante === 'escura'
      ? 'border-slate-600 bg-transparent text-white placeholder:text-slate-500 focus:border-teal-300'
      : 'border-base-border bg-base-surface2 text-slate-100 focus:border-brand'
  return (
    <div>
      <label htmlFor="codigo-segundo-fator" className={`block text-[13px] font-medium ${variante === 'escura' ? 'text-white/90' : 'text-slate-300'}`}>
        {t('campoCodigo')}
      </label>
      <input
        id="codigo-segundo-fator"
        name="codigo"
        // "one-time-code": o celular sugere o codigo sozinho, quando possivel
        autoComplete="one-time-code"
        inputMode={aceitaRecuperacao ? 'text' : 'numeric'}
        maxLength={aceitaRecuperacao ? 12 : 6}
        autoFocus={autoFocus}
        value={valor}
        onChange={(e) => aoMudar(e.target.value.toUpperCase())}
        placeholder={aceitaRecuperacao ? '123456 / ABCD-EFGH' : '123456'}
        className={`mt-1 w-48 rounded-lg border px-3 py-2 font-mono text-lg tracking-[0.3em] outline-hidden ${cor}`}
      />
      {aceitaRecuperacao && (
        <p className={`mt-1 text-xs ${variante === 'escura' ? 'text-white/70' : 'text-slate-400'}`}>{t('dicaRecuperacao')}</p>
      )}
    </div>
  )
}

// Na tela de login (sempre escura) o texto e branco fixo: as cores "slate"
// mudam com o tema claro/escuro do restante do sistema.
function corTexto(variante: Variante) {
  return variante === 'escura' ? 'text-white/90' : 'text-slate-200'
}

export function CadastroAplicativo({
  dados,
  explicacao,
  variante = 'padrao',
}: {
  dados: DadosCadastro
  explicacao?: string
  variante?: Variante
}) {
  const t = useTranslations('SegundoFator')
  return (
    <div className={`space-y-3 text-sm ${corTexto(variante)}`}>
      {explicacao && <p>{explicacao}</p>}
      <ol className="list-decimal space-y-1 pl-5">
        <li>{t('passo1')}</li>
        <li>{t('passo2')}</li>
        <li>{t('passo3')}</li>
      </ol>
      {/* QR code gerado no servidor (SVG em data:, permitido pela politica de conteudo) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dados.qr_code} alt={t('altQr')} className="h-44 w-44 rounded-lg bg-white p-1" />
      <p className={`text-xs ${variante === 'escura' ? 'text-white/70' : 'text-slate-400'}`}>
        {t('semCamera')}{' '}
        <code className="select-all break-all rounded-sm bg-black/40 px-1.5 py-0.5 font-mono text-[12px] text-teal-200">
          {dados.segredo.replace(/(.{4})/g, '$1 ').trim()}
        </code>
      </p>
    </div>
  )
}

export function CodigosRecuperacao({
  codigos,
  aoContinuar,
  variante = 'padrao',
}: {
  codigos: string[]
  aoContinuar: () => void
  variante?: Variante
}) {
  const t = useTranslations('SegundoFator')
  const [copiado, setCopiado] = useState(false)
  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigos.join('\n'))
      setCopiado(true)
    } catch {
      // sem permissao de area de transferencia: a pessoa copia a mao
    }
  }
  return (
    <div className={`space-y-3 text-sm ${corTexto(variante)}`} role="region" aria-label={t('tituloCodigos')}>
      <p className={`text-base font-semibold ${variante === 'escura' ? 'text-white' : 'text-slate-100'}`}>{t('tituloCodigos')}</p>
      <p>{t('explicacaoCodigos')}</p>
      <ul className="grid w-fit grid-cols-2 gap-x-6 gap-y-1 rounded-lg border border-amber-400/40 bg-black/40 px-4 py-3 font-mono text-[15px] tracking-wider text-amber-100">
        {codigos.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copiar}
          className={`rounded-lg border border-slate-500 px-4 py-2 text-sm hover:border-teal-300 hover:text-teal-200 ${corTexto(variante)}`}
        >
          {copiado ? t('copiado') : t('copiar')}
        </button>
        <button
          type="button"
          onClick={aoContinuar}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
        >
          {t('jaGuardei')}
        </button>
      </div>
    </div>
  )
}
