'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { FormularioFicha } from './FichaCuradoriaForm'
import { REGIOES, TIPOS_ACHADO_FICHA, comAchados, regiaoDoAchado, termosDosAchados, type AchadoFicha } from '../../lib/achadosFicha'
import type { TermoVocabularioApi } from '../../lib/catalogoTermos'
import { normalizar } from '../../lib/vozCuradoria'
import { corMarcacao } from '../../lib/marcacoes'
import { PalavraChave } from './PainelDadosSobrepostos'
import { InformacoesAdicionaisFicha } from '../anexos/AnexosCuradoria'

// ACHADOS = AS MARCACOES DA IMAGEM (secao 2 da ficha).
// O curador desenha cada lesao na imagem de marcacao (que abre sozinha
// quando esta secao fica em destaque) e cada marcacao vira uma linha:
// M1, M2... -> ACHADO + DENTE(S) + REGIAO. O achado vem de UMA lista so
// (08/11/2026): os 26 padronizados + os termos do vocabulario; digitando as
// iniciais as opcoes aparecem. "Outros" acrescenta um termo novo, e o
// curador escolhe se ele aparece na Pesquisa avancada e nas proximas
// curadorias.
// Por voz: "um lesão periapical no dente 36", "dois cárie em dentina"...
// (ou so o achado: vai para a proxima marcacao ainda sem achado).
// Imagem normal: "Imagem sem alterações" (sem marcacoes).
// O resumo usado pela Pesquisa (alteracoes_observadas) continua sendo
// montado sozinho (lib/achadosFicha.ts), so nao aparece mais na tela.

const TODOS_DENTES = [
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
  48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
]
const NUMEROS = ['um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez']

/** uma opcao da lista unica: achado padronizado OU termo do vocabulario */
interface OpcaoAchado {
  chave: string
  rotulo: string
  /** textos usados na procura (rotulo + sinonimos), ja normalizados */
  chaves: string[]
  tipo: string
  termo_id?: number
  detalhe?: string
}

function FormOutros({
  textoInicial,
  onConfirmar,
  onCancelar,
}: {
  textoInicial: string
  onConfirmar: (termo: string, naBusca: boolean, nasCuradorias: boolean) => Promise<string | null>
  onCancelar: () => void
}) {
  const t = useTranslations('Curadoria.achadosFicha')
  const [nome, setNome] = useState(textoInicial)
  const [naBusca, setNaBusca] = useState(true)
  const [nasCuradorias, setNasCuradorias] = useState(true)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  async function confirmar() {
    if (nome.trim().length < 2 || salvando) return
    setSalvando(true)
    setErro('')
    const falha = await onConfirmar(nome.trim(), naBusca, nasCuradorias)
    setSalvando(false)
    if (falha) setErro(falha)
  }
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-teal-400/50 bg-teal-400/5 p-2.5" data-teste="form-outros">
      <p className="text-xs font-semibold text-ink">{t('outrosTitulo')}</p>
      <input
        autoFocus
        value={nome}
        maxLength={150}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            confirmar()
          }
          if (e.key === 'Escape') onCancelar()
        }}
        aria-label={t('outrosNome')}
        placeholder={t('outrosNome')}
        className="w-full rounded-lg border border-base-border bg-base-surface2 px-2.5 py-1 text-sm text-ink outline-hidden focus:border-brand"
      />
      <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-2">
        <input type="checkbox" checked={naBusca} onChange={(e) => setNaBusca(e.target.checked)} className="h-3.5 w-3.5 accent-teal-400" />
        {t('outrosNaBusca')}
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-2">
        <input type="checkbox" checked={nasCuradorias} onChange={(e) => setNasCuradorias(e.target.checked)} className="h-3.5 w-3.5 accent-teal-400" />
        {t('outrosNasCuradorias')}
      </label>
      <p className="text-[11px] text-ink-3">{t('outrosAjuda')}</p>
      {erro && <p role="alert" className="text-xs text-red-600 dark:text-red-300">{erro}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={confirmar} disabled={nome.trim().length < 2 || salvando}
                className="rounded-md bg-brand px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">
          {salvando ? '…' : t('outrosAcrescentar')}
        </button>
        <button type="button" onClick={onCancelar} className="rounded-md border border-base-border px-3 py-1 text-xs text-ink">
          {t('outrosCancelar')}
        </button>
      </div>
    </div>
  )
}

function SeletorTipo({
  valor,
  opcoes,
  onEscolher,
  onOutros,
  placeholder,
}: {
  /** texto do achado ja escolhido */
  valor: string
  opcoes: OpcaoAchado[]
  onEscolher: (opcao: OpcaoAchado) => void
  /** "Outros": acrescentar um termo novo (so curador/administrador) */
  onOutros?: (texto: string) => void
  placeholder: string
}) {
  const t = useTranslations('Curadoria.achadosFicha')
  const [busca, setBusca] = useState<string | null>(null)
  const [sel, setSel] = useState(0)
  const filtro = normalizar((busca ?? '').trim())
  const achadas =
    busca !== null ? opcoes.filter((op) => !filtro || op.chaves.some((c) => c.includes(filtro))).slice(0, 60) : []
  // "Outros" sempre por ultimo na lista
  const total = achadas.length + (busca !== null && onOutros ? 1 : 0)
  function escolher(i: number) {
    if (i < achadas.length) onEscolher(achadas[i])
    else onOutros?.((busca ?? '').trim())
    setBusca(null)
  }
  return (
    <div className="relative min-w-0 flex-1">
      <input
        value={busca ?? valor}
        onFocus={() => setBusca('')}
        onBlur={() => setTimeout(() => setBusca(null), 150)}
        onChange={(e) => {
          setBusca(e.target.value)
          setSel(0)
        }}
        onKeyDown={(e) => {
          if (!total) return
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setSel((s) => (s + (e.key === 'ArrowDown' ? 1 : -1) + total) % total)
          }
          if (e.key === 'Enter') {
            e.preventDefault()
            escolher(sel)
            ;(e.target as HTMLInputElement).blur()
          }
          if (e.key === 'Escape') setBusca(null)
        }}
        placeholder={placeholder}
        aria-autocomplete="list"
        className={`w-full rounded-lg border px-2.5 py-1 text-sm outline-hidden focus:border-brand ${
          valor ? 'border-teal-500/40 bg-teal-600/15 font-semibold text-ink' : 'border-dashed border-amber-300/60 bg-amber-300/5 text-amber-100'
        }`}
      />
      {busca !== null && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-base-border bg-base-surface shadow-2xl" role="listbox" data-teste="opcoes-achado">
          {achadas.map((op, i) => (
            <li key={op.chave}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  escolher(i)
                }}
                className={`flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left text-sm ${i === sel ? 'bg-teal-400/15' : 'hover:bg-white/5'}`}
              >
                <span className="text-ink">{op.rotulo}</span>
                {op.detalhe && <span className="truncate text-[11px] text-ink-3">{op.detalhe}</span>}
              </button>
            </li>
          ))}
          {achadas.length === 0 && <li className="px-3 py-1.5 text-xs text-ink-3">{t('nenhumaOpcao')}</li>}
          {onOutros && (
            <li className="border-t border-base-border">
              <button
                type="button"
                data-teste="opcao-outros"
                onMouseDown={(e) => {
                  e.preventDefault()
                  escolher(achadas.length)
                }}
                className={`w-full px-3 py-1.5 text-left text-sm font-semibold text-brand ${sel === achadas.length ? 'bg-teal-400/15' : 'hover:bg-white/5'}`}
              >
                {filtro ? t('outrosComTexto', { texto: (busca ?? '').trim() }) : t('outrosOpcao')}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

export default function PainelAchadosFicha({
  form,
  onChange,
  palavrasChave = false,
  podeCriarTermo = true,
  curationId,
}: {
  form: FormularioFicha
  onChange: (form: FormularioFicha) => void
  palavrasChave?: boolean
  /** "Outros" (acrescentar termo ao vocabulario): curador e administrador */
  podeCriarTermo?: boolean
  /** ficha aberta: habilita "Informações adicionais" e anexos */
  curationId?: number
}) {
  const t = useTranslations('Curadoria.achadosFicha')
  const tItens = useTranslations('AlteracoesObservadas.itens')
  const tRegioes = useTranslations('Curadoria.achadosEstruturados.regioes')
  const rotulo = (valor: string) => {
    try {
      return tItens(valor)
    } catch {
      return valor
    }
  }

  const tTermos = useTranslations('BuscaTermos')
  // 08/11/2026: LISTA UNICA - os achados padronizados + os termos do
  // vocabulario que o curador deixou como opcao nas curadorias. O que se
  // escolhe aqui e o que a Pesquisa avancada encontra.
  const [vocabulario, setVocabulario] = useState<TermoVocabularioApi[]>([])
  const [outrosDe, setOutrosDe] = useState<{ marcacao: string; texto: string } | null>(null)
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/vocabulario`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.termos && setVocabulario(d.termos))
      .catch(() => {
        // sem o vocabulario a lista fica so com os achados padronizados
      })
  }, [])
  const opcoes: OpcaoAchado[] = useMemo(() => {
    const fixas = TIPOS_ACHADO_FICHA.map((tp) => ({
      chave: `achado:${tp.valor}`,
      rotulo: rotulo(tp.valor),
      chaves: [normalizar(rotulo(tp.valor))],
      tipo: tp.valor,
    }))
    const nomesFixos = new Set(fixas.map((f) => f.chaves[0]))
    const termos = vocabulario
      .filter((v) => v.ativo !== false && v.nas_curadorias !== false && !nomesFixos.has(normalizar(v.termo)))
      .map((v) => {
        const sinonimos = (v.sinonimos ?? []).map((x) => x.sinonimo)
        return {
          chave: `vocab:${v.id}`,
          rotulo: v.termo,
          chaves: [v.termo, ...sinonimos].map((x) => normalizar(x)),
          tipo: 'outro',
          termo_id: v.id,
          detalhe: sinonimos.length ? tTermos('sinonimos', { lista: sinonimos.join(', ') }) : undefined,
        }
      })
    return [...fixas, ...termos].sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vocabulario])

  async function criarTermo(marcacao: string, termo: string, naBusca: boolean, nasCuradorias: boolean): Promise<string | null> {
    try {
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/vocabulario/termos`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ termo, categoria: 'achado', na_busca: naBusca, nas_curadorias: nasCuradorias }),
      })
      const dados = await r.json().catch(() => null)
      if (!r.ok) return typeof dados?.detail === 'string' ? dados.detail : t('outrosErro')
      setVocabulario((lista) => [...lista, dados as TermoVocabularioApi])
      mudarDaMarcacao(marcacao, { tipo: 'outro', termo_id: dados.id, rotulo: dados.termo })
      setOutrosDe(null)
      return null
    } catch {
      return t('outrosErro')
    }
  }

  const achados = form.achados
  // achado de cada marcacao (indice -> achado)
  const daMarcacao = (id: string) => achados.find((a) => a.marcacoes.includes(id))
  // achados antigos sem marcacao (fichas anteriores) - continuam visiveis
  const idsMarcacoes = new Set(form.marcacoes.map((m) => m.id))
  const semMarcacao = achados.filter((a) => !a.marcacoes.some((id) => idsMarcacoes.has(id)))
  // termos ligados antes, fora de qualquer marcacao (a caixa "Outros termos" saiu)
  const termosDosAchadosAtuais = termosDosAchados(achados)
  const termosSemMarcacao = (form.termos ?? []).filter((id) => !termosDosAchadosAtuais.includes(id))

  function salvar(lista: AchadoFicha[]) {
    onChange(comAchados(form, lista))
  }
  function mudarDaMarcacao(id: string, parcial: Partial<AchadoFicha>) {
    const atual = daMarcacao(id)
    if (atual) salvar(achados.map((a) => (a === atual ? { ...a, ...parcial } : a)))
    else if (parcial.tipo)
      salvar([...achados, { tipo: parcial.tipo, dentes: parcial.dentes ?? [], regiao: parcial.regiao ?? '', marcacoes: [id], termo_id: parcial.termo_id, rotulo: parcial.rotulo }])
  }

  const camposOnde = (a: AchadoFicha | undefined, mudar: (p: Partial<AchadoFicha>) => void) => (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {(a?.dentes ?? []).map((d) => (
        <span key={d} className="flex items-center gap-1 rounded-md border border-base-border bg-white/5 px-1.5 py-0.5 text-xs text-slate-200">
          {t('dente')} {d}
          <button type="button" onClick={() => mudar({ dentes: (a?.dentes ?? []).filter((x) => x !== d) })} aria-label={t('removerDente', { dente: d })} className="text-slate-400 hover:text-red-300">
            ×
          </button>
        </span>
      ))}
      <select
        value=""
        disabled={!a}
        onChange={(e) => e.target.value && mudar({ dentes: Array.from(new Set([...(a?.dentes ?? []), Number(e.target.value)])).sort((x, y) => x - y) })}
        aria-label={t('adicionarDente')}
        className={`rounded-md border bg-transparent px-1 py-0.5 text-xs outline-hidden disabled:opacity-40 ${a?.dentes.length ? 'border-base-border text-slate-300' : 'border-dashed border-amber-300/60 text-amber-200'}`}
      >
        <option value="">{a?.dentes.length ? '+ dente' : t('denteQual')}</option>
        {[...form.dentes, ...TODOS_DENTES.filter((d) => !form.dentes.includes(d))]
          .filter((d) => !(a?.dentes ?? []).includes(d))
          .map((d) => (
            <option key={d} value={d}>
              {d}
              {form.dentes.includes(d) ? ' ★' : ''}
            </option>
          ))}
      </select>
      <select
        value={a ? regiaoDoAchado(a) : ''}
        disabled={!a}
        title={a && !a.regiao && regiaoDoAchado(a) ? t('regiaoPadrao') : undefined}
        onChange={(e) => mudar({ regiao: e.target.value })}
        aria-label={t('regiao')}
        className={`rounded-md border bg-transparent px-1 py-0.5 text-xs outline-hidden disabled:opacity-40 ${a && regiaoDoAchado(a) ? 'border-base-border text-slate-300' : 'border-dashed border-amber-300/60 text-amber-200'}`}
      >
        <option value="">{t('regiaoQual')}</option>
        {REGIOES.map((r) => (
          <option key={r} value={r}>
            {tRegioes(r)}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <div className="space-y-3">
      {form.marcacoes.length === 0 ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => onChange({ ...form, sem_alteracoes: !form.sem_alteracoes })}
            aria-pressed={form.sem_alteracoes}
            className={`w-full rounded-lg border px-3 py-2 text-sm transition ${
              form.sem_alteracoes ? 'border-emerald-400 bg-emerald-500/15 font-semibold text-emerald-200' : 'border-dashed border-slate-500 text-slate-200 hover:border-emerald-400'
            }`}
          >
            {form.sem_alteracoes ? `✓ ${t('normalMarcado')}` : t('normal')}
            <span className="ml-2">
              <PalavraChave texto={t('chaveNormal')} visivel={palavrasChave && !form.sem_alteracoes} />
            </span>
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {form.marcacoes.map((m, n) => {
            const a = daMarcacao(m.id)
            return (
              <li key={m.id} className={`rounded-lg border p-2 ${a ? 'border-base-border' : 'border-amber-300/50 bg-amber-300/5'}`}>
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-xs font-bold text-slate-900 ring-2 ring-black/40"
                    style={{ background: corMarcacao(m) }}
                    title={t('marcacaoN', { numero: n + 1 })}
                  >
                    {n + 1}
                  </span>
                  <SeletorTipo
                    valor={a ? (a.termo_id ? a.rotulo ?? '' : rotulo(a.tipo)) : ''}
                    opcoes={opcoes}
                    onEscolher={(op) => mudarDaMarcacao(m.id, { tipo: op.tipo, termo_id: op.termo_id, rotulo: op.termo_id ? op.rotulo : undefined })}
                    onOutros={podeCriarTermo ? (texto) => setOutrosDe({ marcacao: m.id, texto }) : undefined}
                    placeholder={t('qualAchado', { numero: n + 1 })}
                  />
                  <PalavraChave texto={`${NUMEROS[n] ?? n + 1} …`} visivel={palavrasChave && !a} />
                </div>
                {outrosDe?.marcacao === m.id && (
                  <FormOutros
                    textoInicial={outrosDe.texto}
                    onConfirmar={(termo, naBusca, nasCuradorias) => criarTermo(m.id, termo, naBusca, nasCuradorias)}
                    onCancelar={() => setOutrosDe(null)}
                  />
                )}
                {camposOnde(a, (p) => mudarDaMarcacao(m.id, p))}
              </li>
            )
          })}
        </ul>
      )}

      {semMarcacao.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-slate-500">{t('semMarcacaoAntigos')}</p>
          {semMarcacao.map((a, i) => (
            <div key={`${a.tipo}-${i}`} className="rounded-lg border border-base-border p-2">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 text-sm font-semibold text-ink">{a.termo_id ? a.rotulo : rotulo(a.tipo)}</span>
                <button type="button" onClick={() => salvar(achados.filter((x) => x !== a))} aria-label={t('remover')} className="rounded-sm px-1.5 text-base text-slate-400 hover:text-red-300">
                  ×
                </button>
              </div>
              {camposOnde(a, (p) => salvar(achados.map((x) => (x === a ? { ...x, ...p } : x))))}
            </div>
          ))}
        </div>
      )}

      {termosSemMarcacao.length > 0 && (
        <div className="space-y-1.5" data-teste="termos-sem-marcacao">
          <p className="text-[11px] text-slate-500">{t('termosSemMarcacao')}</p>
          <div className="flex flex-wrap gap-1.5">
            {termosSemMarcacao.map((id) => {
              const nome = vocabulario.find((v) => v.id === id)?.termo ?? `#${id}`
              return (
                <span key={id} className="inline-flex items-center gap-1 rounded-full border border-base-border bg-white/5 px-2 py-0.5 text-xs text-ink">
                  {nome}
                  <button type="button" onClick={() => onChange({ ...form, termos: form.termos.filter((x) => x !== id) })}
                          aria-label={t('removerTermo', { nome })} className="text-slate-400 hover:text-red-300">×</button>
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* texto livre antigo (a secao "Achados detalhados" saiu): so aparece
          se a ficha ja tinha conteudo, para nada se perder */}
      {form.achados_detalhe.trim() && (
        <div>
          <p className="mb-1 text-[11px] text-slate-500">{t('textoAntigo')}</p>
          <textarea
            maxLength={8000}
            value={form.achados_detalhe}
            onChange={(e) => onChange({ ...form, achados_detalhe: e.target.value })}
            rows={2}
            className="w-full rounded-lg border border-base-border bg-white/5 px-2.5 py-1.5 text-sm text-ink outline-hidden focus:border-brand"
          />
        </div>
      )}

      {curationId !== undefined && (
        <InformacoesAdicionaisFicha
          key={curationId}
          curationId={curationId}
          texto={form.informacoes_adicionais ?? ''}
          onTexto={(texto) => onChange({ ...form, informacoes_adicionais: texto })}
        />
      )}
    </div>
  )
}
