'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ErroTecnico, TIPOS_ERRO_TECNICO } from '../../lib/achados'

const STATUS_EDITAVEL = ['pendente', 'em_analise']

async function extrairErro(response: Response, generica: string): Promise<string> {
  try {
    const dados = await response.json()
    if (typeof dados?.detail === 'string') return dados.detail
  } catch {
    // resposta sem corpo JSON legivel
  }
  return generica
}

// Painel de Erro Tecnico (Fase 3) - dimensao INDEPENDENTE de Achado, de
// proposito (pedido explicito: "nao colocar Erro Tecnico dentro da lista
// de Achados"). Consome POST/GET/PATCH/DELETE /curation/{id}/erros-tecnicos
// (Fase 2). A API ja suporta multiplos erros por ficha - a interface
// tambem permite (nao limita artificialmente a um so), com o mesmo padrao
// de lista + formulario do painel de Achados.
export default function PainelErroTecnico({
  curationId,
  statusFicha,
}: {
  curationId: number
  statusFicha: string
}) {
  const t = useTranslations('Curadoria.erroTecnico')
  const editavel = STATUS_EDITAVEL.includes(statusFicha)

  const [erros, setErros] = useState<ErroTecnico[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erroCarregar, setErroCarregar] = useState('')

  const [adicionando, setAdicionando] = useState(false)
  const [tipo, setTipo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erroForm, setErroForm] = useState('')

  const [confirmandoExclusaoId, setConfirmandoExclusaoId] = useState<number | null>(null)
  const [excluindoId, setExcluindoId] = useState<number | null>(null)

  useEffect(() => {
    carregarErros()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curationId])

  async function carregarErros() {
    setCarregando(true)
    setErroCarregar('')
    try {
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/curation/${curationId}/erros-tecnicos`, {
        credentials: 'include',
      })
      if (!resposta.ok) {
        setErroCarregar(await extrairErro(resposta, t('erroCarregar')))
        return
      }
      setErros(await resposta.json())
    } catch {
      setErroCarregar(t('erroCarregar'))
    } finally {
      setCarregando(false)
    }
  }

  function abrirFormulario() {
    setTipo('')
    setDescricao('')
    setErroForm('')
    setAdicionando(true)
  }

  async function salvar() {
    if (!tipo) {
      setErroForm(t('erroSalvar'))
      return
    }
    setSalvando(true)
    setErroForm('')
    try {
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/curation/${curationId}/erros-tecnicos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tipo, descricao: descricao || null }),
      })
      if (!resposta.ok) {
        setErroForm(await extrairErro(resposta, t('erroSalvar')))
        return
      }
      await carregarErros()
      setAdicionando(false)
    } catch {
      setErroForm(t('erroSalvar'))
    } finally {
      setSalvando(false)
    }
  }

  async function excluir(erroId: number) {
    setExcluindoId(erroId)
    setErroCarregar('')
    try {
      const resposta = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/curation/${curationId}/erros-tecnicos/${erroId}`,
        { method: 'DELETE', credentials: 'include' }
      )
      if (!resposta.ok && resposta.status !== 204) {
        setErroCarregar(await extrairErro(resposta, t('erroExcluir')))
        return
      }
      setErros((prev) => prev.filter((e) => e.id !== erroId))
      setConfirmandoExclusaoId(null)
    } catch {
      setErroCarregar(t('erroExcluir'))
    } finally {
      setExcluindoId(null)
    }
  }

  const campoInput =
    'w-full rounded-lg border border-teal-500/40 bg-teal-100/70 dark:bg-teal-600/20 px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand'
  const campoLabel = 'mb-1 block text-xs font-medium text-slate-400'

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto">
      {!editavel && (
        <p className="rounded-lg border border-amber-700/40 bg-amber-950/20 px-2.5 py-1.5 text-xs text-amber-300">
          {t('fichaFinalizadaSomenteLeitura')}
        </p>
      )}

      {erroCarregar && (
        <p className="text-xs text-red-400" role="alert">
          {erroCarregar}
        </p>
      )}

      <p className="text-xs font-medium text-slate-300">{t('pergunta')}</p>

      {carregando ? (
        <p className="text-xs text-slate-500">{t('carregando')}</p>
      ) : erros.length === 0 && !adicionando ? (
        <p className="text-xs text-slate-500">{t('nenhumErro')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {erros.map((erro) => (
            <li key={erro.id} className="rounded-lg border border-base-border bg-base-surface2/60 p-2.5 text-sm">
              <p className="font-medium text-ink">{t(`tipos.${erro.tipo}` as Parameters<typeof t>[0])}</p>
              {erro.descricao && <p className="mt-1 text-xs text-slate-300">{erro.descricao}</p>}

              {editavel && (
                <div className="mt-2">
                  {confirmandoExclusaoId === erro.id ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-red-300">{t('confirmarExclusao')}</span>
                      <button
                        type="button"
                        onClick={() => excluir(erro.id)}
                        disabled={excluindoId === erro.id}
                        className="rounded-lg border border-red-600/50 bg-red-500/10 px-2 py-1 text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                      >
                        {excluindoId === erro.id ? t('excluindo') : t('excluir')}
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
                      onClick={() => setConfirmandoExclusaoId(erro.id)}
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

      {editavel && !adicionando && (
        <button
          type="button"
          onClick={abrirFormulario}
          className="self-start rounded-lg border border-brand/50 bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand-300 hover:bg-brand/20"
        >
          {t('adicionar')}
        </button>
      )}

      {adicionando && (
        <div className="flex flex-col gap-2.5 rounded-lg border border-base-border p-2.5">
          <div>
            <label className={campoLabel}>{t('tipo')}</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={campoInput}>
              <option value="">{t('selecioneTipo')}</option>
              {TIPOS_ERRO_TECNICO.map((valor) => (
                <option key={valor} value={valor}>
                  {t(`tipos.${valor}` as Parameters<typeof t>[0])}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={campoLabel}>{t('descricao')}</label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={2}
              placeholder={t('descricaoPlaceholder')}
              className={campoInput}
            />
          </div>
          {erroForm && (
            <p className="text-xs text-red-400" role="alert">
              {erroForm}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={salvar}
              disabled={salvando || !tipo}
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {salvando ? t('salvando') : t('salvar')}
            </button>
            <button
              type="button"
              onClick={() => setAdicionando(false)}
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
