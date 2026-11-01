'use client'

import { Printer, Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import LayoutCasos from '../../../components/casos/LayoutCasos'
import ListaPacientes from '../../../components/casos/ListaPacientes'
import { apiJson, type ResumoCaso } from '../../../lib/casos'
import type { SessaoUsuario } from '../../../lib/sessao'

// AGUARDANDO TRATAMENTO (Etapa 4):
// - curador: pastas encaminhadas pelos professores para CLASSIFICAR o tipo
//   de tratamento, e a fila ja classificada;
// - professor: a fila, com BUSCA AVANCADA por tipo de tratamento, nome do
//   paciente e modalidade; abre a pasta e encaminha ao aluno (sai da fila).

const campo = 'rounded-lg border border-base-border bg-base-surface2 px-2.5 py-1.5 text-sm text-ink'

function Fila({ sessao }: { sessao: SessaoUsuario }) {
  const t = useTranslations('Casos')
  const curador = sessao.perfil === 'curador'
  const [aba, setAba] = useState<'aguardando_classificacao' | 'na_fila'>(curador ? 'aguardando_classificacao' : 'na_fila')
  const [tratamento, setTratamento] = useState('')
  const [modalidade, setModalidade] = useState('')
  const [nome, setNome] = useState('')
  const [casos, setCasos] = useState<ResumoCaso[] | null>(null)
  const [opcoes, setOpcoes] = useState<{ tratamentos: string[]; modalidades: string[] }>({ tratamentos: [], modalidades: [] })
  const [erro, setErro] = useState('')

  useEffect(() => {
    apiJson<{ tratamentos: string[]; modalidades: string[] }>('/casos/opcoes').then(setOpcoes).catch(() => {})
  }, [])

  const buscar = useCallback(async () => {
    setErro('')
    const q = new URLSearchParams({ etapa: aba })
    if (tratamento) q.set('tratamento', tratamento)
    if (modalidade) q.set('modalidade', modalidade)
    if (nome.trim()) q.set('busca', nome.trim())
    try {
      setCasos((await apiJson<{ casos: ResumoCaso[] }>(`/casos/fila?${q}`)).casos)
    } catch (e) {
      setErro((e as Error).message)
    }
  }, [aba, tratamento, modalidade, nome])

  useEffect(() => {
    const id = setTimeout(buscar, 250)
    return () => clearTimeout(id)
  }, [buscar])

  return (
    <>
      {curador && (
        <div className="flex gap-2" role="tablist">
          {(['aguardando_classificacao', 'na_fila'] as const).map((a) => (
            <button key={a} type="button" role="tab" aria-selected={aba === a} onClick={() => setAba(a)} className={`rounded-full border px-3 py-1.5 text-sm ${aba === a ? 'border-brand bg-brand text-white' : 'border-base-border text-ink'}`}>
              {a === 'aguardando_classificacao' ? t('fila.paraClassificar') : t('fila.naFila')}
            </button>
          ))}
        </div>
      )}
      <section className="space-y-2 rounded-2xl border border-base-border bg-base-surface p-3 print:hidden" aria-label={t('fila.buscaAvancada')}>
        <h2 className="text-sm font-semibold text-ink"><Search aria-hidden="true" className="mr-1 inline h-4 w-4 align-[-2px]" />{t('fila.buscaAvancada')}</h2>
        <div className="flex flex-wrap gap-2">
          <select value={tratamento} onChange={(e) => setTratamento(e.target.value)} className={campo} aria-label={t('fila.tipoTratamento')}>
            <option value="">{t('fila.todosTratamentos')}</option>
            {opcoes.tratamentos.map((x) => <option key={x} value={x}>{t(`tratamentos.${x}`)}</option>)}
          </select>
          <select value={modalidade} onChange={(e) => setModalidade(e.target.value)} className={campo} aria-label={t('novo.modalidade')}>
            <option value="">{t('fila.todasModalidades')}</option>
            {opcoes.modalidades.map((m) => <option key={m} value={m}>{t(`modalidades.${m}`)}</option>)}
          </select>
          <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={100} placeholder={t('fila.nomePaciente')} aria-label={t('fila.nomePaciente')} className={`${campo} min-w-[200px] flex-1`} />
          <button type="button" onClick={() => window.print()} className="rounded-lg border border-base-border px-3 py-1.5 text-sm text-ink"><Printer aria-hidden="true" className="mr-1 inline h-4 w-4 align-[-2px]" />{t('acoes.imprimir')}</button>
        </div>
        <div className="flex flex-wrap gap-1">
          {opcoes.tratamentos.map((x) => (
            <button key={x} type="button" onClick={() => setTratamento(tratamento === x ? '' : x)} aria-pressed={tratamento === x} className={`rounded-full border px-2.5 py-0.5 text-xs ${tratamento === x ? 'border-violet-500 bg-violet-500 text-white' : 'border-violet-400/50 text-violet-700 dark:text-violet-200'}`}>
              {t(`tratamentos.${x}`)}
            </button>
          ))}
        </div>
      </section>
      {erro && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-600" role="alert">{erro}</p>}
      {casos && <p className="text-sm text-slate-500">{t('fila.encontrados', { n: casos.length })}</p>}
      {casos && <ListaPacientes casos={casos} vazio={aba === 'na_fila' ? t('fila.vazia') : t('fila.nadaClassificar')} />}
    </>
  )
}

export default function FilaPage() {
  const t = useTranslations('Casos')
  return (
    <LayoutCasos perfis={['professor', 'curador']} titulo={t('fila.titulo')} subtitulo={t('fila.subtitulo')}>
      {(s) => <Fila sessao={s} />}
    </LayoutCasos>
  )
}
