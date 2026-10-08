'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import SeletorDentesQuadrante from './SeletorDentesQuadrante'
import { Achado, TIPOS_ACHADO, REGIOES_ANATOMICAS, rotularTipoAchado } from '../../lib/achados'
import type { Marcacao } from '../../lib/marcacoes'

// Mesma regra de status editavel ja aplicada pela API (STATUS_EDITAVEIS em
// common.py) - so espelhada aqui pra desabilitar a interface ANTES de
// tentar a chamada (a API continua sendo a fonte de verdade: um 409 dela,
// se por algum motivo chegar, tambem e tratado como erro normal abaixo).
const STATUS_EDITAVEL = ['pendente', 'em_analise']

// Campo local de formulario - null explicito (nao string vazia) pra
// "nenhuma selecao ainda", pra nao confundir com um valor de fato "outro"
// nem com regiao vazia.
interface FormAchado {
  tipo: string
  regiaoAnatomica: string
  dentes: number[]
  denteNaoIdentificado: boolean
  descricao: string
  marcacoesSelecionadasIds: string[]
}

const FORM_VAZIO: FormAchado = {
  tipo: '',
  regiaoAnatomica: '',
  dentes: [],
  denteNaoIdentificado: false,
  descricao: '',
  marcacoesSelecionadasIds: [],
}

async function extrairErro(response: Response, generica: string): Promise<string> {
  try {
    const dados = await response.json()
    if (typeof dados?.detail === 'string') return dados.detail
  } catch {
    // resposta sem corpo JSON legivel
  }
  return generica
}

// Painel de Achados odontologicos estruturados (Fase 3), consumindo a API
// criada na Fase 2 (POST/GET/PATCH/DELETE /curation/{id}/achados). Existe
// AO LADO do checklist legado (alteracoes_observadas, PainelAchadosRadiografia.tsx)
// - nao o substitui nesta fase (nao houve pedido explicito pra remove-lo,
// e os dados dele continuam sendo consumidos por relatorios/telas
// existentes - ver especificacao consolidada).
export default function PainelAchadosEstruturados({
  curationId,
  statusFicha,
  dentesDaFicha,
  marcacoesDaFicha,
}: {
  curationId: number
  statusFicha: string
  /** Dentes ja marcados no nivel da FICHA (PainelDadosSobrepostos) - o
   * seletor de dentes do achado so oferece estes como opcao (ver secao 18
   * do pedido: "a interface deve permitir selecionar os dentes ja
   * classificados na ficha"). */
  dentesDaFicha: number[]
  /** Marcacoes ja desenhadas no painel de marcacao (form.marcacoes) - o
   * achado associa 0..N delas, reaproveitando o MESMO mecanismo de
   * desenho existente (MarcadorAchado), sem criar um segundo. */
  marcacoesDaFicha: Marcacao[]
}) {
  const t = useTranslations('Curadoria.achadosEstruturados')
  // Mesmo namespace ja usado por PainelAchadosRadiografia.tsx pros 26
  // valores de achado/alteracao observada - antes rotularTipoAchado
  // devolvia um rotulo fixo em portugues aqui (bug de i18n), agora usa
  // esse tradutor.
  const tAlteracoesItens = useTranslations('AlteracoesObservadas.itens')

  const editavel = STATUS_EDITAVEL.includes(statusFicha)

  const [achados, setAchados] = useState<Achado[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const [editandoId, setEditandoId] = useState<number | 'novo' | null>(null)
  const [form, setForm] = useState<FormAchado>(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [erroForm, setErroForm] = useState('')

  const [confirmandoExclusaoId, setConfirmandoExclusaoId] = useState<number | null>(null)
  const [excluindoId, setExcluindoId] = useState<number | null>(null)

  useEffect(() => {
    carregarAchados()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curationId])

  async function carregarAchados() {
    setCarregando(true)
    setErro('')
    try {
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/curation/${curationId}/achados`, {
        credentials: 'include',
      })
      if (!resposta.ok) {
        setErro(await extrairErro(resposta, t('erroCarregar')))
        return
      }
      setAchados(await resposta.json())
    } catch {
      setErro(t('erroCarregar'))
    } finally {
      setCarregando(false)
    }
  }

  function abrirNovo() {
    setForm(FORM_VAZIO)
    setErroForm('')
    setEditandoId('novo')
  }

  function abrirEdicao(achado: Achado) {
    setForm({
      tipo: achado.tipo,
      regiaoAnatomica: achado.regiao_anatomica ?? '',
      dentes: achado.dentes ?? [],
      denteNaoIdentificado: achado.dente_nao_identificado,
      descricao: achado.descricao ?? '',
      marcacoesSelecionadasIds: (achado.marcacoes ?? []).map((m) => m.id),
    })
    setErroForm('')
    setEditandoId(achado.id)
  }

  function fecharFormulario() {
    setEditandoId(null)
    setForm(FORM_VAZIO)
    setErroForm('')
  }

  function construirPayload(): Record<string, unknown> {
    const marcacoesSelecionadas = marcacoesDaFicha
      .filter((m) => form.marcacoesSelecionadasIds.includes(m.id))
      // So a geometria - achado/achado_descricao ficam de fora de proposito
      // (aqui a classificacao ja e o proprio achado, nao um atributo por
      // forma como em form.marcacoes).
      .map(({ id, tipo, x, y, largura, altura, x1, y1, x2, y2 }) => ({
        id,
        tipo,
        ...(x !== undefined && { x }),
        ...(y !== undefined && { y }),
        ...(largura !== undefined && { largura }),
        ...(altura !== undefined && { altura }),
        ...(x1 !== undefined && { x1 }),
        ...(y1 !== undefined && { y1 }),
        ...(x2 !== undefined && { x2 }),
        ...(y2 !== undefined && { y2 }),
      }))

    return {
      tipo: form.tipo,
      regiao_anatomica: form.regiaoAnatomica || null,
      dentes: form.denteNaoIdentificado ? [] : form.dentes,
      dente_nao_identificado: form.denteNaoIdentificado,
      descricao: form.descricao || null,
      marcacoes: marcacoesSelecionadas,
    }
  }

  async function salvar() {
    if (!form.tipo) {
      setErroForm(t('erroSalvar'))
      return
    }
    // "Outros" exige descricao (Fase 4, regra aprovada) - valida ANTES de
    // enviar a requisicao (a API tambem valida isso, 422 - ver
    // curation/achados.py._validar_outros -, mas nao confia so nela).
    if (form.tipo === 'outro' && !form.descricao.trim()) {
      setErroForm(t('erroDescricaoObrigatoriaOutros'))
      return
    }
    setSalvando(true)
    setErroForm('')
    try {
      const novo = editandoId === 'novo'
      const url = novo
        ? `${process.env.NEXT_PUBLIC_API_URL}/curation/${curationId}/achados`
        : `${process.env.NEXT_PUBLIC_API_URL}/curation/${curationId}/achados/${editandoId}`
      const resposta = await fetch(url, {
        method: novo ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(construirPayload()),
      })
      if (!resposta.ok) {
        setErroForm(await extrairErro(resposta, t('erroSalvar')))
        return
      }
      await carregarAchados()
      fecharFormulario()
    } catch {
      setErroForm(t('erroSalvar'))
    } finally {
      setSalvando(false)
    }
  }

  async function excluir(achadoId: number) {
    setExcluindoId(achadoId)
    setErro('')
    try {
      const resposta = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/curation/${curationId}/achados/${achadoId}`,
        { method: 'DELETE', credentials: 'include' }
      )
      if (!resposta.ok && resposta.status !== 204) {
        setErro(await extrairErro(resposta, t('erroExcluir')))
        return
      }
      setAchados((prev) => prev.filter((a) => a.id !== achadoId))
      setConfirmandoExclusaoId(null)
    } catch {
      setErro(t('erroExcluir'))
    } finally {
      setExcluindoId(null)
    }
  }

  function rotularDentes(achado: Achado): string {
    if (achado.dente_nao_identificado) return t('naoIdentificadoResumo')
    if (!achado.dentes || achado.dentes.length === 0) return t('semDentes')
    return achado.dentes.join(', ')
  }

  const campoInput =
    'w-full rounded-lg border border-teal-500/40 bg-teal-100/70 dark:bg-teal-600/20 px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand disabled:opacity-60'
  const campoLabel = 'mb-1 block text-xs font-medium text-slate-400'

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto">
      {!editavel && (
        <p className="rounded-lg border border-amber-700/40 bg-amber-950/20 px-2.5 py-1.5 text-xs text-amber-300">
          {t('fichaFinalizadaSomenteLeitura')}
        </p>
      )}

      {erro && (
        <p className="text-xs text-red-400" role="alert">
          {erro}
        </p>
      )}

      {editandoId === null ? (
        <>
          {editavel && (
            <button
              type="button"
              onClick={abrirNovo}
              className="self-start rounded-lg border border-brand/50 bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand-300 hover:bg-brand/20"
            >
              {t('adicionar')}
            </button>
          )}

          {carregando ? (
            <p className="text-xs text-slate-500">{t('carregando')}</p>
          ) : achados.length === 0 ? (
            <p className="text-xs text-slate-500">{t('nenhumAchado')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {achados.map((achado) => (
                <li key={achado.id} className="rounded-lg border border-base-border bg-base-surface2/60 p-2.5 text-sm">
                  <p className="font-medium text-ink">{rotularTipoAchado(achado.tipo, t('outro'), tAlteracoesItens)}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {achado.regiao_anatomica
                      ? t(`regioes.${achado.regiao_anatomica}` as Parameters<typeof t>[0])
                      : t('semRegiao')}
                    {' · '}
                    {rotularDentes(achado)}
                  </p>
                  {achado.descricao && <p className="mt-1 text-xs text-slate-300">{achado.descricao}</p>}
                  {achado.marcacoes?.length > 0 && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      {t('marcacaoRotulo', { indice: achado.marcacoes.length, tipo: achado.marcacoes[0]?.tipo ?? '' })}
                    </p>
                  )}

                  {editavel && (
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => abrirEdicao(achado)}
                        className="rounded-lg border border-base-border px-2.5 py-1 text-xs text-slate-300 hover:border-brand hover:text-brand-300"
                      >
                        {t('editar')}
                      </button>
                      {confirmandoExclusaoId === achado.id ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-red-300">{t('confirmarExclusao')}</span>
                          <button
                            type="button"
                            onClick={() => excluir(achado.id)}
                            disabled={excluindoId === achado.id}
                            className="rounded-lg border border-red-600/50 bg-red-500/10 px-2 py-1 text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                          >
                            {excluindoId === achado.id ? t('excluindo') : t('excluir')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmandoExclusaoId(null)}
                            className="rounded-lg border border-base-border px-2 py-1 text-xs text-slate-400"
                          >
                            {t('cancelar')}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmandoExclusaoId(achado.id)}
                          className="rounded-lg border border-red-700/40 px-2.5 py-1 text-xs text-red-400 hover:bg-red-500/10"
                        >
                          {t('excluir')}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        // Formulario (progressivo: tipo -> regiao -> dentes -> descricao ->
        // marcacoes -> salvar, cada bloco sempre visivel mas curto, sem
        // virar uma tela enorme - pedido explicito).
        <div className="flex flex-col gap-2.5">
          <div>
            <label className={campoLabel}>{t('tipo')}</label>
            <select
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              className={campoInput}
            >
              <option value="">{t('selecioneTipo')}</option>
              {TIPOS_ACHADO.map((valor) => (
                <option key={valor} value={valor}>
                  {rotularTipoAchado(valor, t('outro'), tAlteracoesItens)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={campoLabel}>{t('regiaoAnatomica')}</label>
            <select
              value={form.regiaoAnatomica}
              onChange={(e) => setForm({ ...form, regiaoAnatomica: e.target.value })}
              className={campoInput}
            >
              <option value="">{t('selecioneRegiao')}</option>
              {REGIOES_ANATOMICAS.map((valor) => (
                <option key={valor} value={valor}>
                  {t(`regioes.${valor}` as Parameters<typeof t>[0])}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={campoLabel}>{t('dentesRelacionados')}</label>
            {dentesDaFicha.length === 0 ? (
              <p className="text-xs text-slate-500">{t('semDentesNaFicha')}</p>
            ) : (
              <SeletorDentesQuadrante
                dentesSelecionados={form.dentes}
                onChange={(dentes) => setForm({ ...form, dentes })}
                naoIdentificado={form.denteNaoIdentificado}
                onChangeNaoIdentificado={(v) => setForm({ ...form, denteNaoIdentificado: v })}
                dentesLimitadosA={dentesDaFicha}
              />
            )}
          </div>

          <div>
            <label className={campoLabel}>
              {t('descricao')} {form.tipo === 'outro' && <span className="text-status-danger">*</span>}
            </label>
            <textarea
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              rows={2}
              placeholder={t('descricaoPlaceholder')}
              className={campoInput}
            />
          </div>

          {marcacoesDaFicha.length > 0 && (
            <div>
              <label className={campoLabel}>{t('marcacoesRelacionadas')}</label>
              <div className="flex flex-col gap-1">
                {marcacoesDaFicha.map((marcacao, indice) => (
                  <label key={marcacao.id} className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={form.marcacoesSelecionadasIds.includes(marcacao.id)}
                      onChange={() =>
                        setForm({
                          ...form,
                          marcacoesSelecionadasIds: form.marcacoesSelecionadasIds.includes(marcacao.id)
                            ? form.marcacoesSelecionadasIds.filter((id) => id !== marcacao.id)
                            : [...form.marcacoesSelecionadasIds, marcacao.id],
                        })
                      }
                      className="h-3.5 w-3.5 rounded border-base-border bg-base-surface2 text-brand"
                    />
                    {t('marcacaoRotulo', { indice: indice + 1, tipo: marcacao.tipo })}
                  </label>
                ))}
              </div>
            </div>
          )}

          {erroForm && (
            <p className="text-xs text-red-400" role="alert">
              {erroForm}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={salvar}
              disabled={salvando || !form.tipo}
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {salvando ? t('salvando') : t('salvar')}
            </button>
            <button
              type="button"
              onClick={fecharFormulario}
              disabled={salvando}
              className="rounded-lg border border-base-border px-3 py-1.5 text-xs text-slate-300"
            >
              {t('cancelar')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
