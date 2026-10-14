'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import PainelDadosSobrepostos from './PainelDadosSobrepostos'
import PainelAchadosFicha from './PainelAchadosFicha'
import PainelErroTecnico from './PainelErroTecnico'
import type { FormularioFicha } from './FichaCuradoriaForm'
import { corMarcacao, rotularAchadoMarcacao } from '../../lib/marcacoes'
import { SECOES_FICHA, secaoVizinha, type SecaoFicha } from '../../lib/secoesCuradoria'
import type { ItemConferencia } from '../../lib/conferenciaFicha'
import { SECOES_OPCIONAIS, estadoSecoes, proximaPendente, temConteudo, type EstadoSecao } from '../../lib/progressoFicha'
import AjudaSecao from './AjudaSecao'

// COLUNA DA FICHA DE CURADORIA (direita da tela; a imagem fica a esquerda).
//
// Todas as secoes da ficha numa unica coluna com barra de rolagem, de cima
// para baixo, na ordem de SECOES_FICHA (lib/secoesCuradoria.ts). Uma secao
// fica EM DESTAQUE (borda e brilho teal):
// - na curadoria MANUAL, as setas ↓/↑ do teclado (fora de campos de texto)
//   e os botoes ▼/▲ passam para a secao seguinte/anterior, e a coluna rola
//   sozinha ate ela; clicar numa secao tambem a destaca;
// - na curadoria por VOZ, a secao em destaque e o destino da fala sem
//   palavra-guia (ex.: com "Descrição didática" em destaque, o que for
//   falado vira a descricao), e depois de preencher a coluna rola ate a
//   secao que recebeu o dado.
// O painel de voz fica fixo no topo da coluna (`topo`), fora da rolagem.
//
// ROTEIRO (para nao errar a sequencia nem deixar nada em branco): uma
// trilha de 8 passos no topo mostra cada secao como concluida (verde) ou
// pendente; cada secao tem o selo "Concluída/Pendente", um "?" com o que
// falar no microfone e, nas secoes opcionais, o botao "Nada a registrar"
// (ou a fala "nada a registrar"), que conta como revisada e leva a proxima
// pendente. Ver lib/progressoFicha.ts.
//
// Justificativa (dissertacao): um unico fluxo vertical reduz a troca de
// contexto (antes eram 5 telas num carrossel + uma faixa embaixo) e da ao
// curador uma "posicao atual" visivel, o que tambem deixa a voz previsivel
// - o sistema mostra ANTES de falar onde o texto vai entrar (principio de
// visibilidade do estado do sistema, Nielsen).

const campoTexto =
  'w-full rounded-lg border border-teal-500/40 bg-teal-100/70 dark:bg-teal-600/20 px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand'

function emCampoDeTexto(): boolean {
  const alvo = document.activeElement
  return (
    alvo instanceof HTMLElement &&
    (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable)
  )
}

// Uma secao da coluna. Fica FORA do componente principal de proposito: um
// componente declarado dentro de outro e recriado a cada digitacao, o que
// desmontaria os campos (perde o foco do texto e recarrega os paineis).
function Secao({
  id,
  numero,
  titulo,
  ativa,
  onAtivar,
  registrar,
  extra,
  piscando,
  estado,
  rodape,
  children,
}: {
  id: SecaoFicha
  numero: number
  titulo: string
  ativa: boolean
  onAtivar: () => void
  registrar: (el: HTMLElement | null) => void
  extra?: ReactNode
  /** chave que muda a cada preenchimento: reinicia a animacao de destaque */
  piscando?: number
  estado: EstadoSecao
  /** "Nada a registrar" / "Concluir e ir para a próxima" */
  rodape?: ReactNode
  children: ReactNode
}) {
  const t = useTranslations('Curadoria.coluna')
  return (
    <section
      ref={registrar}
      data-secao={id}
      aria-current={ativa ? 'step' : undefined}
      onMouseDown={() => !ativa && onAtivar()}
      onFocusCapture={() => !ativa && onAtivar()}
      className={`scroll-mt-2 rounded-xl border p-3 relative transition-[border-color,box-shadow] duration-200 ${
        ativa
          ? 'z-10 border-teal-400 bg-base-surface shadow-[0_0_0_3px_rgba(45,212,191,.18),0_0_22px_-4px_rgba(45,212,191,.45)]'
          : estado === 'concluida'
            ? 'border-emerald-500/30 bg-base-surface/60 opacity-75 hover:opacity-100'
            : 'border-base-border bg-base-surface/70 opacity-90 hover:opacity-100'
      }`}
    >
      {/* brilho de "acabou de ser preenchida" - so este enfeite e recriado
          (key), os campos da secao continuam montados */}
      {piscando ? <span key={piscando} aria-hidden="true" className="secao-preenchida pointer-events-none absolute inset-0 rounded-xl" /> : null}
      <header className="mb-2 flex items-center gap-2">
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
            estado === 'concluida' ? 'bg-emerald-500 text-white' : ativa ? 'bg-teal-400 text-slate-900' : 'bg-base-surface2 text-slate-400'
          }`}
        >
          {estado === 'concluida' ? '✓' : numero}
        </span>
        <h3 className={`text-sm font-semibold ${ativa ? 'text-teal-100' : 'text-slate-300'}`}>{titulo}</h3>
        <AjudaSecao secao={id} />
        <span
          className={`rounded-full px-1.5 py-px text-[10px] font-semibold ${
            estado === 'concluida' ? 'bg-emerald-500/15 text-emerald-300' : ativa ? 'animate-pulse bg-amber-400/20 text-amber-200' : 'bg-white/5 text-slate-400'
          }`}
        >
          {estado === 'concluida' ? t('concluida') : t('pendente')}
        </span>
        {extra && <div className="ml-auto">{extra}</div>}
      </header>
      {children}
      {ativa && rodape && <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2">{rodape}</div>}
    </section>
  )
}

export default function ColunaFichaCuradoria({
  form,
  onChange,
  statusFicha,
  curationId,
  erro,
  rascunhoSalvo,
  secaoAtiva,
  onSecao,
  marcacaoAberta,
  onAlternarMarcacao,
  topo,
  teclasAtivas = true,
  destaques = {},
  acoesBarra,
  revisadas = [],
  onNadaRegistrar,
  onAbrirGuia,
}: {
  form: FormularioFicha
  onChange: (form: FormularioFicha) => void
  statusFicha: string
  curationId: number
  erro: string
  rascunhoSalvo: boolean
  secaoAtiva: SecaoFicha
  onSecao: (secao: SecaoFicha) => void
  marcacaoAberta: boolean
  onAlternarMarcacao: () => void
  /** conteudo fixo acima da rolagem (painel de voz) */
  topo?: ReactNode
  /** desliga ↑/↓ (ex.: modal aberto) */
  teclasAtivas?: boolean
  /** secoes que acabaram de receber dados (valor = marca de tempo) */
  destaques?: Partial<Record<SecaoFicha, number>>
  /** botoes extras na barra do titulo (menu de macros) */
  acoesBarra?: ReactNode
  /** secoes opcionais declaradas "Nada a registrar" nesta ficha */
  revisadas?: SecaoFicha[]
  /** marca/desmarca "Nada a registrar" numa secao */
  onNadaRegistrar?: (secao: SecaoFicha) => void
  /** abre o guia "Como laudar" */
  onAbrirGuia?: () => void
}) {
  const t = useTranslations('Curadoria.coluna')
  const estado = estadoSecoes(form, revisadas)
  const concluidas = SECOES_FICHA.filter((s) => estado[s] === 'concluida').length
  const proxima = proximaPendente(estado, secaoAtiva)
  const rolagemRef = useRef<HTMLDivElement>(null)
  const tSecoes = useTranslations('Curadoria.secoes')
  const refs = useRef<Partial<Record<SecaoFicha, HTMLElement | null>>>({})
  // clique numa secao so destaca (sem pular a rolagem); teclas, botoes e
  // voz rolam ate o topo da secao
  const porCliqueRef = useRef(false)

  useEffect(() => {
    if (porCliqueRef.current) {
      porCliqueRef.current = false
      return
    }
    refs.current[secaoAtiva]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [secaoAtiva])

  // imagem nova: a coluna volta ao topo (comeca o laudo do passo 1)
  useEffect(() => {
    if (rolagemRef.current) rolagemRef.current.scrollTop = 0
  }, [curationId])

  const secaoRef = useRef(secaoAtiva)
  secaoRef.current = secaoAtiva
  useEffect(() => {
    if (!teclasAtivas) return
    function aoTeclar(e: KeyboardEvent) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
      if (emCampoDeTexto()) return
      e.preventDefault()
      onSecao(secaoVizinha(secaoRef.current, e.key === 'ArrowDown' ? 1 : -1))
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [teclasAtivas, onSecao])

  const indice = SECOES_FICHA.indexOf(secaoAtiva)
  const tFicha = useTranslations('Curadoria.ficha')

  // propriedades comuns de cada secao
  const p = (id: SecaoFicha) => ({
    id,
    numero: SECOES_FICHA.indexOf(id) + 1,
    titulo: tSecoes(id),
    ativa: id === secaoAtiva,
    onAtivar: () => {
      porCliqueRef.current = true
      onSecao(id)
    },
    registrar: (el: HTMLElement | null) => {
      refs.current[id] = el
    },
    piscando: destaques[id],
    estado: estado[id],
    rodape: rodape(id),
  })

  // rodape da secao ativa: "Nada a registrar" (opcionais, sem conteudo) e
  // "Próxima pendente"
  function rodape(id: SecaoFicha): ReactNode {
    const opcional = SECOES_OPCIONAIS.includes(id)
    const comConteudo = temConteudo(id, form)
    const revisada = revisadas.includes(id)
    return (
      <>
        {opcional && !comConteudo && onNadaRegistrar && (
          <button
            type="button"
            onClick={() => onNadaRegistrar(id)}
            aria-pressed={revisada}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              revisada ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200' : 'border-slate-400/50 text-slate-200 hover:border-emerald-400'
            }`}
          >
            {revisada ? `✓ ${t('nadaRegistrado')}` : t('nadaRegistrar')}
          </button>
        )}
        {estado[id] === 'concluida' && proxima && (
          <button
            type="button"
            onClick={() => onSecao(proxima)}
            className="ml-auto rounded-full bg-teal-500 px-3 py-1 text-xs font-semibold text-slate-900 hover:bg-teal-400"
          >
            {t('irProxima', { secao: tSecoes(proxima) })} ▼
          </button>
        )}
      </>
    )
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2">
      {topo && <div className="shrink-0">{topo}</div>}

      {/* barra com o titulo e as setas ▲/▼ entre secoes */}
      <div className="relative z-20 flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-base-border bg-base-surface px-3 py-1.5">
        <h2 className="text-sm font-bold text-ink" title={t('ajudaTeclas')}>{t('titulo')}</h2>
        <span title={t('progresso', { feitas: concluidas, total: SECOES_FICHA.length })} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${concluidas === SECOES_FICHA.length ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/5 text-slate-300'}`}>
          {concluidas}/{SECOES_FICHA.length}
        </span>
        {onAbrirGuia && (
          <button
            type="button"
            onClick={onAbrirGuia}
            title={t('comoLaudar')}
            className="rounded-full border border-sky-300/50 bg-sky-400/10 px-2.5 py-1 text-xs font-semibold text-sky-100 hover:bg-sky-400/20"
          >
            📘 {t('comoLaudar')}
          </button>
        )}
        {acoesBarra}
      </div>

      {/* trilha do roteiro: 8 passos, verde = concluido, teal = atual */}
      <ol className="flex shrink-0 items-center gap-1 px-1" aria-label={t('roteiro')}>
        {SECOES_FICHA.map((id, i) => {
          const ativa = id === secaoAtiva
          const feita = estado[id] === 'concluida'
          return (
            <li key={id} className="flex flex-1 items-center gap-1">
              <button
                type="button"
                onClick={() => onSecao(id)}
                title={`${i + 1}. ${tSecoes(id)} — ${feita ? t('concluida') : t('pendente')}`}
                aria-current={ativa ? 'step' : undefined}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition ${
                  ativa
                    ? 'bg-teal-400 text-slate-900 ring-2 ring-teal-200/60'
                    : feita
                      ? 'bg-emerald-500 text-white'
                      : 'border border-slate-500 text-slate-400 hover:border-teal-300'
                }`}
              >
                {feita && !ativa ? '✓' : i + 1}
              </button>
              {i < SECOES_FICHA.length - 1 && <span className={`h-0.5 flex-1 rounded ${feita ? 'bg-emerald-500/60' : 'bg-white/10'}`} />}
            </li>
          )
        })}
        <li className="ml-1 flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => onSecao(secaoVizinha(secaoAtiva, -1))}
            disabled={indice <= 0}
            title={t('secaoAnterior')}
            aria-label={t('secaoAnterior')}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-base-border bg-base-surface2 text-xs text-slate-300 hover:border-brand hover:text-brand-300 disabled:opacity-30"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={() => onSecao(secaoVizinha(secaoAtiva, 1))}
            disabled={indice >= SECOES_FICHA.length - 1}
            title={t('proximaSecao')}
            aria-label={t('proximaSecao')}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-base-border bg-base-surface2 text-xs text-slate-300 hover:border-brand hover:text-brand-300 disabled:opacity-30"
          >
            ▼
          </button>
        </li>
      </ol>

      <div ref={rolagemRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        <Secao {...p('dados')}>
          <PainelDadosSobrepostos form={form} onChange={onChange} statusFicha={statusFicha} embutido />
        </Secao>

        <Secao
          {...p('marcacoes')}
          extra={
            <button
              type="button"
              onClick={onAlternarMarcacao}
              aria-pressed={marcacaoAberta}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                marcacaoAberta ? 'border-teal-400 bg-teal-500 text-white' : 'border-teal-400/60 bg-teal-400/15 text-teal-200 hover:bg-teal-400/25'
              }`}
            >
              {marcacaoAberta ? t('fecharMarcacao') : t('abrirMarcacao')}
              <kbd className="rounded border border-current/40 px-1 font-mono text-[10px] opacity-80">M</kbd>
            </button>
          }
        >
          {form.marcacoes.length === 0 ? (
            <p className="text-xs text-slate-500">{t('semMarcacoes')}</p>
          ) : (
            <ul className="space-y-1">
              {form.marcacoes.map((m, i) => (
                <li key={m.id} className="flex items-center gap-2 text-sm text-slate-300">
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-slate-900"
                    style={{ background: corMarcacao(m) }}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 truncate">
                    {t('marcacaoN', { numero: i + 1 })}:{' '}
                    {m.achado ? (
                      <>
                        {rotularAchadoMarcacao(m.achado)}
                        {m.achado === 'outro' && m.achado_descricao ? ` — ${m.achado_descricao}` : ''}
                      </>
                    ) : (
                      <span className="italic text-slate-500">{t('semAchado')}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Secao>

        <Secao {...p('achados')}>
          <PainelAchadosFicha form={form} onChange={onChange} />
        </Secao>

        <Secao {...p('achados_detalhados')}>
          <textarea
            value={form.achados_detalhe}
            onChange={(e) => onChange({ ...form, achados_detalhe: e.target.value })}
            rows={3}
            className={campoTexto}
            placeholder={t('placeholderAchados')}
          />
        </Secao>

        <Secao {...p('erro_tecnico')}>
          <PainelErroTecnico curationId={curationId} statusFicha={statusFicha} />
        </Secao>

        <Secao {...p('descricao')}>
          <textarea
            value={form.descricao_didatica}
            onChange={(e) => onChange({ ...form, descricao_didatica: e.target.value })}
            rows={4}
            className={campoTexto}
          />
        </Secao>

        <Secao {...p('observacoes')}>
          <textarea
            value={form.observacoes_internas}
            onChange={(e) => onChange({ ...form, observacoes_internas: e.target.value })}
            rows={3}
            className={campoTexto}
          />
        </Secao>

        {erro && (
          <p className="text-sm text-red-400" role="alert">
            {erro}
          </p>
        )}
        {rascunhoSalvo && <p className="text-sm text-emerald-400">{tFicha('rascunhoSalvo')}</p>}
        {/* espaco no fim: a ultima secao tambem consegue rolar ate o topo */}
        <div className="h-[40vh]" aria-hidden="true" />
      </div>
    </div>
  )
}

/** Lista de pendencias da conferencia, cada uma com "ir para a secao". */
export function ListaConferencia({ itens, onIr }: { itens: ItemConferencia[]; onIr: (secao: SecaoFicha) => void }) {
  const t = useTranslations('Curadoria.conferencia')
  const tSecoes = useTranslations('Curadoria.secoes')
  return (
    <ul className="shrink-0 space-y-1 rounded-xl border border-amber-300/30 bg-amber-300/5 p-2">
      {itens.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-xs">
          <span className={`mt-0.5 shrink-0 rounded px-1 text-[10px] font-bold ${item.nivel === 'bloqueio' ? 'bg-red-500 text-white' : 'bg-amber-400 text-black'}`}>
            {item.nivel === 'bloqueio' ? t('bloqueio') : t('aviso')}
          </span>
          <span className="min-w-0 flex-1 text-slate-200">{t(`itens.${item.chave}`, item.parametros ?? {})}</span>
          <button type="button" onClick={() => onIr(item.secao)} className="shrink-0 text-[11px] text-teal-200 hover:underline">
            {tSecoes(item.secao)} →
          </button>
        </li>
      ))}
    </ul>
  )
}
