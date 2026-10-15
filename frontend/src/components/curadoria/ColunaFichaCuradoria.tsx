'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { confirmarComEnter, tamanhoCursor, trocarOpcao } from '../../lib/opcoesTeclado'
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
  anotacaoVazio,
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
  /** "Sem observações" etc. quando declarada sem conteudo */
  anotacaoVazio?: string
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
          ? 'z-10 border-teal-300 bg-base-surface shadow-[0_0_0_3px_rgba(45,212,191,.28),0_0_40px_-2px_rgba(45,212,191,.55)] [zoom:1.5]'
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
        {/* "não" / "sem observações": fica anotado aqui (so para a equipe -
            o estudante simplesmente nao ve o item vazio) */}
        {anotacaoVazio && (
          <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-px text-[11px] font-semibold text-emerald-200">
            {anotacaoVazio}
          </span>
        )}
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
  revisadas = [],
  onNadaRegistrar,
  acoesFinais,
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
  /** secoes opcionais declaradas "Nada a registrar" nesta ficha */
  revisadas?: SecaoFicha[]
  /** marca/desmarca "Nada a registrar" numa secao */
  onNadaRegistrar?: (secao: SecaoFicha) => void
  /** Salvar/Aprovar/2a opiniao/Descartar: no fim, depois da ultima caixa */
  acoesFinais?: ReactNode
}) {
  const t = useTranslations('Curadoria.coluna')
  const estado = estadoSecoes(form, revisadas)
  // holofote no botao Aprovar (barra superior): nenhuma secao fica acesa
  const secaoAtiva: SecaoFicha | null = etapaAtiva === 'aprovar' ? null : SECAO_DA_ETAPA[etapaAtiva]
  // cursor das setas ←/→ nos itens de varias escolhas (dentes, erros)
  const [cursor, setCursor] = useState(0)
  useEffect(() => setCursor(0), [etapaAtiva])
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
    alvo?.scrollIntoView({ behavior: 'smooth', block: SECAO_DA_ETAPA[etapaAtiva] === 'dados' || etapaAtiva === 'aprovar' ? 'center' : 'start' })
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
  const formRef = useRef(form)
  formRef.current = form
  const cursorRef = useRef(cursor)
  cursorRef.current = cursor
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  useEffect(() => {
    if (!teclasAtivas) return
    function aoTeclar(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const etapaAgora = etapaRef.current
      // IDADE acesa: digitar um numero ja escreve na caixa da idade (sem
      // precisar clicar nela); Enter dentro dela confirma e passa adiante
      if (etapaAgora === 'idade' && !e.shiftKey) {
        const caixa = document.querySelector<HTMLInputElement>('[data-campo-idade]')
        if (/^[0-9]$/.test(e.key) && !emCampoDeTexto() && caixa) {
          e.preventDefault()
          caixa.focus()
          onChangeRef.current({ ...formRef.current, idade_min: e.key, idade_max: e.key })
          return
        }
        if (e.key === 'Enter' && document.activeElement === caixa) {
          e.preventDefault()
          caixa?.blur()
          onEtapa(etapaVizinha(etapaAgora, 1))
          return
        }
      }
      // ←/→ escolhem as opcoes DENTRO do item aceso; ENTER confirma e o
      // holofote ja vai para o proximo item (nos itens de varias escolhas -
      // dentes, erros - Enter marca/desmarca a opcao do cursor e fica)
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Enter') && !e.shiftKey && !emCampoDeTexto()) {
        const etapa = etapaRef.current
        const f = formRef.current
        const total = tamanhoCursor(etapa, f)
        if (e.key === 'Enter') {
          if (e.repeat) return
          const r = confirmarComEnter(etapa, f, cursorRef.current)
          if (!r) return
          e.preventDefault()
          // um botao focado nao deve ser "clicado" de novo pelo Enter
          const ativo = document.activeElement
          if (ativo instanceof HTMLElement && ativo.tagName === 'BUTTON') ativo.blur()
          if (r.form) onChangeRef.current(r.form)
          if (r.avancar) onEtapa(etapaVizinha(etapa, 1))
          return
        }
      const lado = e.key === 'ArrowRight' ? 1 : -1
        if (total) {
          e.preventDefault()
          setCursor((c) => (c + lado + total) % total)
          return
        }
        const novo = trocarOpcao(etapa, f, lado)
        if (!novo) return
        e.preventDefault()
        onChangeRef.current(novo)
        return
      }
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
    anotacaoVazio: revisadas.includes(id) && !temConteudo(id, form) && t.has(`semConteudo.${id}`) ? t(`semConteudo.${id}`) : undefined,
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

      <div ref={rolagemRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-1 pr-1 pt-1">
        <Secao {...p('dados')} simples>
          <PainelDadosSobrepostos
            form={form}
            onChange={onChange}
            etapa={secaoAtiva === 'dados' ? etapaAtiva : undefined}
            onEtapa={ativarPorClique}
            // clicar a opcao do item aceso (ou validar a anonimizacao) ja
            // leva o holofote ao proximo item, como o Enter
            onEscolhido={(e) => onEtapa(etapaVizinha(e, 1))}
            cursorDente={etapaAtiva === 'dentes' ? cursor : undefined}
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
          <PainelErrosTecnicosFicha form={form} onChange={onChange} palavrasChave={etapaAtiva === 'erro_tecnico'} cursor={etapaAtiva === 'erro_tecnico' ? cursor : undefined} />
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

        {/* acoes da ficha no FIM de todas as caixas; o holofote chega aqui
            no passo "Aprovar" (Enter aprova) */}
        {acoesFinais && (
          <div data-etapa="aprovar" className={`scroll-my-6 rounded-xl ${etapaAtiva === 'aprovar' ? 'relative z-10 [zoom:1.5]' : ''}`}>
            {acoesFinais}
          </div>
        )}

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
