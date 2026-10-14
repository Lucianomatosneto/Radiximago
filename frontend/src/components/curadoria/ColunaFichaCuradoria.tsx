'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import PainelDadosSobrepostos from './PainelDadosSobrepostos'
import PainelAchadosFicha from './PainelAchadosFicha'
import PainelErrosTecnicosFicha from './PainelErrosTecnicosFicha'
import type { FormularioFicha } from './FichaCuradoriaForm'
import { ETAPA_INICIAL, SECAO_DA_ETAPA, SECOES_FICHA, etapaVizinha, primeiraEtapa, type EtapaFicha, type SecaoFicha } from '../../lib/secoesCuradoria'
import type { ItemConferencia } from '../../lib/conferenciaFicha'
import { SECOES_OPCIONAIS, estadoSecoes, temConteudo, type EstadoSecao } from '../../lib/progressoFicha'
import AjudaSecao from './AjudaSecao'

// COLUNA DA FICHA DE CURADORIA (metade direita da tela; a imagem e as
// miniaturas ficam na metade esquerda).
//
// Todas as secoes da ficha numa unica coluna com rolagem, na ordem de
// SECOES_FICHA (lib/secoesCuradoria.ts). O HOLOFOTE anda ITEM POR ITEM
// (ETAPAS_FICHA): "Anonimização", "Tipo de radiografia", "Idade",
// "Gênero", "Dentes", "Qualidade técnica", "Achados", "Erro técnico",
// "Descrição didática" e "Observações internas".
// - Cada imagem nova comeca SEMPRE em "Anonimização validada".
// - O holofote SO muda com Tab ou ↓ (proximo) e Shift+Tab ou ↑ (anterior);
//   falar ou clicar num valor nao muda o item sozinho - o curador fala,
//   confere e passa adiante. Clicar num item apagado tambem o acende.
// - So o item em destaque fica aceso; os outros ficam quase apagados, para
//   o curador nao se perder (principio de foco/visibilidade do estado do
//   sistema, Nielsen). A voz sem palavra-guia vai para o item aceso.
// O painel de voz fica fixo no topo da coluna (`topo`), fora da rolagem.

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
  titulo,
  ativa,
  holofote,
  onAtivar,
  extra,
  piscando,
  estado,
  rodape,
  simples = false,
  children,
}: {
  id: SecaoFicha
  titulo: string
  /** o item em destaque esta nesta secao */
  ativa: boolean
  /** a secao inteira e o item em destaque (todas menos "Dados") */
  holofote: boolean
  onAtivar: () => void
  extra?: ReactNode
  /** chave que muda a cada preenchimento: reinicia a animacao de destaque */
  piscando?: number
  estado: EstadoSecao
  rodape?: ReactNode
  /** sem "?" e sem selo Pendente/Concluída (secao "Dados") */
  simples?: boolean
  children: ReactNode
}) {
  const t = useTranslations('Curadoria.coluna')
  return (
    <section
      data-secao={id}
      data-etapa={simples ? undefined : id}
      aria-current={holofote ? 'step' : undefined}
      onMouseDown={() => !ativa && !simples && onAtivar()}
      className={`scroll-mt-2 rounded-xl border p-3 relative transition-[opacity,border-color,box-shadow] duration-200 ${
        holofote
          ? 'z-10 border-teal-300 bg-base-surface shadow-[0_0_0_3px_rgba(45,212,191,.28),0_0_40px_-2px_rgba(45,212,191,.55)]'
          : ativa
            ? 'z-10 border-base-border bg-base-surface'
            : 'border-base-border bg-base-surface/70 opacity-[.18] saturate-0 hover:opacity-50'
      }`}
    >
      {/* brilho de "acabou de ser preenchida" - so este enfeite e recriado
          (key), os campos da secao continuam montados */}
      {piscando ? <span key={piscando} aria-hidden="true" className="secao-preenchida pointer-events-none absolute inset-0 rounded-xl" /> : null}
      <header className="mb-2 flex items-center gap-2">
        <h3 className={`text-sm font-semibold ${ativa ? 'text-teal-100' : 'text-slate-300'}`}>{titulo}</h3>
        {!simples && <AjudaSecao secao={id} />}
        {estado === 'concluida' && <span className="text-xs font-bold text-emerald-400" title={t('concluida')}>✓</span>}
        {extra && <div className="ml-auto">{extra}</div>}
      </header>
      {/* secao apagada: o primeiro clique so acende (nao muda valores); em
          "Dados" cada item cuida disso (PainelDadosSobrepostos) */}
      <div className={ativa || simples ? '' : 'pointer-events-none'}>{children}</div>
      {ativa && rodape && <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2">{rodape}</div>}
    </section>
  )
}

export default function ColunaFichaCuradoria({
  form,
  onChange,
  curationId,
  erro,
  rascunhoSalvo,
  etapaAtiva,
  onEtapa,
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
  statusFicha?: string
  curationId: number
  erro: string
  rascunhoSalvo: boolean
  /** item no holofote */
  etapaAtiva: EtapaFicha
  onEtapa: (etapa: EtapaFicha) => void
  marcacaoAberta: boolean
  onAlternarMarcacao: () => void
  /** conteudo fixo acima da rolagem (painel de voz) */
  topo?: ReactNode
  /** desliga Tab/↑/↓ (ex.: modal aberto) */
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
  const secaoAtiva = SECAO_DA_ETAPA[etapaAtiva]
  const rolagemRef = useRef<HTMLDivElement>(null)
  const tSecoes = useTranslations('Curadoria.secoes')
  // clique num item so acende (sem pular a rolagem); teclas rolam ate ele
  const porCliqueRef = useRef(false)

  useEffect(() => {
    if (porCliqueRef.current) {
      porCliqueRef.current = false
      return
    }
    const caixa = rolagemRef.current
    if (!caixa) return
    if (etapaAtiva === ETAPA_INICIAL) {
      caixa.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const alvo = caixa.querySelector<HTMLElement>(`[data-etapa="${etapaAtiva}"]`)
    alvo?.scrollIntoView({ behavior: 'smooth', block: SECAO_DA_ETAPA[etapaAtiva] === 'dados' ? 'center' : 'start' })
  }, [etapaAtiva])

  // imagem nova: a coluna volta ao topo (comeca na anonimizacao)
  useEffect(() => {
    if (rolagemRef.current) rolagemRef.current.scrollTop = 0
  }, [curationId])

  // TAB / ↓ = proximo item; SHIFT+TAB / ↑ = item anterior. Tab vale ate
  // dentro de campos de texto (para sair da idade ou da descricao); ↑/↓
  // dentro de campos de texto continuam movendo o cursor/numero.
  const etapaRef = useRef(etapaAtiva)
  etapaRef.current = etapaAtiva
  useEffect(() => {
    if (!teclasAtivas) return
    function aoTeclar(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      let passo: 1 | -1 | 0 = 0
      if (e.key === 'Tab') passo = e.shiftKey ? -1 : 1
      else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.shiftKey && !emCampoDeTexto()) passo = e.key === 'ArrowDown' ? 1 : -1
      if (!passo) return
      e.preventDefault()
      // o foco sai do campo do item anterior (senao ↑/↓ ficariam presos nele)
      const ativo = document.activeElement
      if (ativo instanceof HTMLElement) ativo.blur()
      onEtapa(etapaVizinha(etapaRef.current, passo))
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [teclasAtivas, onEtapa])

  const tFicha = useTranslations('Curadoria.ficha')

  function ativarPorClique(etapa: EtapaFicha) {
    porCliqueRef.current = true
    onEtapa(etapa)
  }

  // propriedades comuns de cada secao
  const p = (id: SecaoFicha) => ({
    id,
    titulo: tSecoes(id),
    ativa: id === secaoAtiva,
    holofote: id !== 'dados' && id === secaoAtiva,
    onAtivar: () => ativarPorClique(primeiraEtapa(id)),
    piscando: destaques[id],
    estado: estado[id],
    rodape: rodape(id),
  })

  // rodape da secao ativa: so "Nada a registrar" (opcionais, sem
  // conteudo). Passar ao proximo item e sempre Tab/↓.
  function rodape(id: SecaoFicha): ReactNode {
    const opcional = SECOES_OPCIONAIS.includes(id)
    const comConteudo = temConteudo(id, form)
    if (!opcional || comConteudo || !onNadaRegistrar) return null
    const revisada = revisadas.includes(id)
    return (
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
    )
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2">
      {topo && <div className="shrink-0">{topo}</div>}

      {/* barra com o titulo, o progresso e o lembrete das teclas */}
      <div className="relative z-20 flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-base-border bg-base-surface px-3 py-1.5">
        <h2 className="text-sm font-bold text-ink" title={t('ajudaTeclas')}>{t('titulo')}</h2>
        <span title={t('progresso', { feitas: concluidas, total: SECOES_FICHA.length })} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${concluidas === SECOES_FICHA.length ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/5 text-slate-300'}`}>
          {concluidas}/{SECOES_FICHA.length}
        </span>
        <span className="text-[11px] text-slate-400">{t('lembreteTeclas')}</span>
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

      <div ref={rolagemRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-1 pr-1 pt-1">
        <Secao {...p('dados')} simples>
          <PainelDadosSobrepostos
            form={form}
            onChange={onChange}
            etapa={secaoAtiva === 'dados' ? etapaAtiva : undefined}
            onEtapa={ativarPorClique}
          />
        </Secao>

        {/* Achados = marcacoes da imagem (a imagem de marcacao abre sozinha
            quando este item fica em destaque - ver curadoria/page.tsx) */}
        <Secao
          {...p('achados')}
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
          <PainelAchadosFicha form={form} onChange={onChange} palavrasChave={etapaAtiva === 'achados'} />
        </Secao>

        <Secao {...p('erro_tecnico')}>
          <PainelErrosTecnicosFicha form={form} onChange={onChange} palavrasChave={etapaAtiva === 'erro_tecnico'} />
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
        {/* espaco no fim: o ultimo item tambem consegue rolar ate o topo */}
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
