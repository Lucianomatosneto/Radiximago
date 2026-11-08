'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'

// Barra de acoes da ficha ativa. Todos os botoes chamam funcoes que ja
// existiam na tela de Curadoria antes deste sprint (salvar rascunho,
// aprovar, abrir modal de descarte/segunda opiniao) - nada de logica nova
// aqui. A navegacao fica no topo da coluna e as acoes no FIM da ficha
// (depois de Observacoes internas), onde o holofote chega no passo Aprovar.
// destaque do ultimo passo (holofote): a acao que o Enter vai fazer
const DESTAQUE = 'relative z-10 scale-110 ring-4 ring-teal-300 shadow-[0_0_28px_rgba(45,212,191,.8)]'

export default function BarraSuperiorCuradoria({
  posicaoAtual,
  totalFila,
  explicacaoFila,
  podeAnterior,
  podeProxima,
  onAnterior,
  onProxima,
  onSalvar,
  onAprovar,
  onDescartar,
  onSolicitarSegundaOpiniao,
  salvando,
  aprovando,
  extra,
  destacarAprovar = false,
  acaoEscolhida = 'aprovar',
  parte = 'tudo',
  semDescartar = false,
  modoProfessor,
}: {
  posicaoAtual: number | null
  totalFila: number
  /** o que conta (e o que nao conta) na fila - dica ao passar o mouse */
  explicacaoFila?: string
  podeAnterior: boolean
  podeProxima: boolean
  onAnterior: () => void
  onProxima: () => void
  onSalvar: () => void
  onAprovar: () => void
  onDescartar: () => void
  onSolicitarSegundaOpiniao: () => void
  salvando: boolean
  aprovando: boolean
  /** Conteudo extra renderizado ao lado dos botoes de acao (ex.: badge
   * "Aguardando sua decisao") - o estado/logica continua todo em
   * curadoria/page.tsx, essa barra so reserva o espaco visual. */
  extra?: ReactNode
  /** holofote no Aprovar (ultimo passo da ficha): botao aceso + "Enter" */
  destacarAprovar?: boolean
  /** ultimo passo: qual das tres acoes as setas ← → escolheram (Enter faz) */
  acaoEscolhida?: 'salvar' | 'aprovar' | 'segunda'
  /** 'navegacao' = so "← Imagem X de Y →" (topo da coluna); 'acoes' = so
   * Salvar/Aprovar/2a opiniao/Descartar (no FIM da ficha, depois da
   * ultima caixa de curadoria); 'tudo' = os dois juntos */
  parte?: 'tudo' | 'navegacao' | 'acoes'
  /** sem o botao Descartar (na curadoria ele fica ao lado de Macros) */
  semDescartar?: boolean
  /** etapa C (08/11/2026): o PROFESSOR nao aprova - envia a sugestao ao
   * curador ou guarda a imagem marcada em Minhas imagens */
  modoProfessor?: { onEnviarCurador: () => void; onGuardar: () => void; enviando: boolean }
}) {
  const t = useTranslations('Curadoria.barraSuperior')
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-base-border bg-base-surface px-3 py-2">
      {parte !== 'acoes' && (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onAnterior}
            disabled={!podeAnterior}
            aria-label={t('imagemAnterior')}
            title={t('imagemAnterior')}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-base-border text-slate-300 hover:border-brand hover:text-brand-300 disabled:cursor-not-allowed disabled:opacity-30"
          >
            ←
          </button>
          <button
            type="button"
            onClick={onProxima}
            disabled={!podeProxima}
            aria-label={t('proximaImagem')}
            title={t('proximaImagem')}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-base-border text-slate-300 hover:border-brand hover:text-brand-300 disabled:cursor-not-allowed disabled:opacity-30"
          >
            →
          </button>
        </div>
        <span className="text-sm font-medium text-slate-300" title={explicacaoFila}>
          {posicaoAtual !== null ? t('imagemXdeY', { atual: posicaoAtual, total: totalFila }) : '—'}
        </span>
      </div>
      )}

      {parte !== 'navegacao' && (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSalvar}
          disabled={salvando || aprovando}
          data-teste="acao-salvar"
          className={`flex items-center gap-1.5 rounded-lg border border-base-border px-3 py-1.5 text-sm text-slate-200 hover:border-brand hover:text-brand-300 disabled:opacity-50 ${
            destacarAprovar && acaoEscolhida === 'salvar' ? DESTAQUE : ''
          }`}
        >
          {salvando ? t('salvando') : t('salvar')}
          {destacarAprovar && acaoEscolhida === 'salvar' && <kbd className="rounded-sm border border-white/50 px-1 font-mono text-[10px]">Enter</kbd>}
        </button>
        {modoProfessor ? (
          <>
            <button
              type="button"
              data-teste="enviar-ao-curador"
              onClick={modoProfessor.onEnviarCurador}
              disabled={modoProfessor.enviando || salvando}
              className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {t('enviarAoCurador')}
            </button>
            <button
              type="button"
              data-teste="guardar-para-mim"
              onClick={modoProfessor.onGuardar}
              disabled={modoProfessor.enviando || salvando}
              className="rounded-lg border border-base-border px-3 py-1.5 text-sm text-ink hover:border-brand disabled:opacity-50"
            >
              {t('guardarMinhasImagens')}
            </button>
          </>
        ) : (
        <>
        <button
          type="button"
          onClick={onAprovar}
          disabled={aprovando || salvando}
          data-teste="acao-aprovar"
          className={`flex items-center gap-1.5 rounded-lg bg-brand hover:bg-brand-hover px-3 py-1.5 text-sm font-medium text-white shadow-glow transition-opacity hover:opacity-90 disabled:opacity-50 ${
            destacarAprovar && acaoEscolhida === 'aprovar' ? DESTAQUE : ''
          }`}
        >
          {aprovando ? t('aprovando') : t('aprovar')}
          {destacarAprovar && acaoEscolhida === 'aprovar' && <kbd className="rounded-sm border border-white/50 px-1 font-mono text-[10px]">Enter</kbd>}
        </button>
        <button
          type="button"
          onClick={onSolicitarSegundaOpiniao}
          data-teste="acao-segunda"
          className={`flex items-center gap-1.5 rounded-lg border border-purple-800/60 px-3 py-1.5 text-sm text-purple-300 hover:bg-purple-950/40 ${
            destacarAprovar && acaoEscolhida === 'segunda' ? DESTAQUE : ''
          }`}
        >
          {t('solicitarSegundaOpiniao')}
          {destacarAprovar && acaoEscolhida === 'segunda' && <kbd className="rounded-sm border border-white/50 px-1 font-mono text-[10px]">Enter</kbd>}
        </button>
{!semDescartar && (
        <button
          type="button"
          onClick={onDescartar}
          className="rounded-lg border border-red-800/60 px-3 py-1.5 text-sm text-red-300 hover:bg-red-950/40"
        >
          {t('descartar')}
        </button>
        )}
        </>
        )}
        {extra}
      </div>
      )}
    </div>
  )
}
