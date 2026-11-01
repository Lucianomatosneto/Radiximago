'use client'

import { Check, ChevronLeft, ChevronRight, Download, FileText, Mail, Pencil, Printer } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Sidebar from '../../../components/Sidebar'
import Topbar from '../../../components/Topbar'
import AvisoNaoDiagnostico from '../../../components/casos/AvisoNaoDiagnostico'
import ImagemPrincipalMarcada from '../../../components/detalhe/ImagemPrincipalMarcada'
import { obterSessaoAtual, type SessaoUsuario } from '../../../lib/sessao'
import { COR_ETAPA, apiJson, data, dataHora, urlFoto, type DetalheCaso, type RevisaoCaso } from '../../../lib/casos'

// UMA PASTA DE PACIENTE: ficha, radiografias (setas ou ← → do teclado) com
// as marcacoes e anotacoes da versao atual, termo, historico, versoes e as
// acoes permitidas ao perfil (o servidor diz em `pode`).

const campo = 'w-full rounded-lg border border-base-border bg-base-surface2 px-2.5 py-1.5 text-sm text-ink outline-hidden focus:border-brand'
const botao = 'rounded-lg border border-base-border px-3 py-1.5 text-sm text-ink transition hover:border-brand hover:text-brand disabled:opacity-40'
const botaoForte = 'rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40'

interface Pessoa { id: number; nome: string; perfil: string }

export default function PastaPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const busca = useSearchParams()
  const id = Number(params.id)
  const t = useTranslations('Casos')
  const [sessao, setSessao] = useState<SessaoUsuario | null>(null)
  const [caso, setCaso] = useState<DetalheCaso | null>(null)
  const [indice, setIndice] = useState(0)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState(busca.get('enviada') ? 'enviada' : '')
  const [painel, setPainel] = useState<'' | 'editar' | 'compartilhar' | 'link' | 'curador' | 'classificar' | 'aluno' | 'versoes' | 'concluir' | 'reabrir'>('')
  // trava contra clique duplo nas confirmacoes (concluir/reabrir)
  const [enviando, setEnviando] = useState(false)
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [destino, setDestino] = useState('')
  const [nota, setNota] = useState('')
  const [tratamentos, setTratamentos] = useState<string[]>([])
  const [listaTratamentos, setListaTratamentos] = useState<string[]>([])
  const [tratamentoAluno, setTratamentoAluno] = useState('')
  const [versoes, setVersoes] = useState<RevisaoCaso[]>([])
  const [edicao, setEdicao] = useState<Record<string, string>>({})

  const carregar = useCallback(async () => {
    try {
      const d = await apiJson<DetalheCaso>(`/casos/${id}`)
      setCaso(d)
      setTratamentos(d.tratamentos)
    } catch (e) {
      setErro((e as Error).message)
    }
  }, [id])

  useEffect(() => {
    obterSessaoAtual().then((s) => {
      if (!s) return router.push('/login')
      setSessao(s)
      carregar()
      apiJson<{ tratamentos: string[] }>('/casos/opcoes').then((o) => setListaTratamentos(o.tratamentos)).catch(() => {})
    })
  }, [router, carregar])

  const imagens = caso?.imagens ?? []
  const atual = imagens[Math.min(indice, Math.max(imagens.length - 1, 0))]
  const anotacao = atual && caso?.revisao?.anotacoes?.[String(atual.id)]

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement
      if (alvo && ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName)) return
      if (e.key === 'ArrowRight') setIndice((i) => Math.min(i + 1, imagens.length - 1))
      if (e.key === 'ArrowLeft') setIndice((i) => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [imagens.length])

  async function abrirPainel(qual: typeof painel) {
    setErro('')
    setDestino('')
    setPainel(painel === qual ? '' : qual)
    try {
      if (qual === 'compartilhar' || qual === 'link') {
        const [p, c, a] = await Promise.all([
          apiJson<{ pessoas: Pessoa[] }>('/casos/pessoas?perfil=professor'),
          apiJson<{ pessoas: Pessoa[] }>('/casos/pessoas?perfil=curador'),
          qual === 'link' ? apiJson<{ pessoas: Pessoa[] }>('/casos/pessoas?perfil=estudante') : Promise.resolve({ pessoas: [] as Pessoa[] }),
        ])
        setPessoas([...p.pessoas, ...c.pessoas, ...a.pessoas])
      }
      if (qual === 'aluno') setPessoas((await apiJson<{ pessoas: Pessoa[] }>('/casos/pessoas?perfil=estudante')).pessoas)
      if (qual === 'versoes') setVersoes((await apiJson<{ revisoes: RevisaoCaso[] }>(`/casos/${id}/revisoes`)).revisoes)
      if (qual === 'editar' && caso) {
        setEdicao({
          nome: caso.paciente.nome, nascimento: caso.paciente.nascimento || '', genero: caso.paciente.genero,
          contato: caso.paciente.contato, prontuario: caso.paciente.prontuario || '', observacoes: caso.paciente.observacoes || '',
          descricao: caso.descricao,
        })
      }
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  async function acao(caminho: string, corpo: unknown, mensagem: string) {
    setErro('')
    try {
      await apiJson(caminho, { method: caminho.endsWith('/paciente') ? 'PATCH' : 'POST', body: JSON.stringify(corpo ?? {}) })
      setAviso(mensagem)
      setPainel('')
      carregar()
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  if (!sessao || (!caso && !erro)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-base">
        <p className="text-sm text-slate-400">{t('carregando')}</p>
      </main>
    )
  }

  if (!caso) {
    return (
      <div className="flex min-h-screen bg-base">
        <Sidebar recolhivel />
        <div className="flex flex-1 flex-col">
          <Topbar />
          <main className="p-6"><p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300" role="alert">{erro}</p></main>
        </div>
      </div>
    )
  }

  const equipe = caso.pode.revisar
  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar recolhivel />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 space-y-4 p-3 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <button type="button" onClick={() => (window.history.length > 1 ? router.back() : router.push('/minhas-imagens'))} className="mb-2 text-sm text-slate-500 hover:text-brand">← {t('voltar')}</button>
              <h1 className="titulo-pagina">{caso.paciente.nome}</h1>
              <p className="text-sm text-slate-500">
                {t('pasta', { id: caso.id })} · {caso.paciente.idade} {t('anos')} · {t(`generos.${caso.paciente.genero}`)} · {t(`modalidades.${caso.modalidade}`)} · {t('enviadaPor', { aluno: caso.aluno ?? '—', quando: dataHora(caso.criado_em) })}
              </p>
            </div>
            <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${COR_ETAPA[caso.etapa]}`}>{t(`etapas.${caso.etapa}`)}</span>
          </div>
          <AvisoNaoDiagnostico />
          {aviso && <p className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300" role="status">{aviso === 'enviada' ? t('enviadaComSucesso') : aviso}</p>}
          {erro && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300" role="alert">{erro}</p>}

          <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
            {/* imagens */}
            <section className="space-y-2 rounded-2xl border border-base-border bg-base-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <button type="button" className={botao} onClick={() => setIndice((i) => Math.max(i - 1, 0))} disabled={indice === 0} aria-label={t('anterior')}><ChevronLeft aria-hidden="true" className="h-4 w-4" /></button>
                <span className="text-sm text-ink">{t('imagemDe', { n: Math.min(indice + 1, imagens.length), total: imagens.length })}</span>
                <button type="button" className={botao} onClick={() => setIndice((i) => Math.min(i + 1, imagens.length - 1))} disabled={indice >= imagens.length - 1} aria-label={t('proxima')}><ChevronRight aria-hidden="true" className="h-4 w-4" /></button>
              </div>
              <div className="h-[55vh] min-h-[280px] rounded-xl bg-black">
                {atual && <ImagemPrincipalMarcada key={atual.id} curationId={0} alt={t('imagemDe', { n: indice + 1, total: imagens.length })} marcacoes={anotacao?.marcacoes ?? []} srcPreCarregado={urlFoto(caso.id, atual.id)} />}
              </div>
              <p className="text-center text-[11px] text-slate-500">{t('dicaTeclado')}</p>
              {atual && (
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <div className="rounded-lg border border-base-border p-2">
                    <div className="text-xs font-semibold text-slate-500">{t('doAluno')}</div>
                    <div className="text-ink">{atual.dentes.length ? `${t('dentes')}: ${atual.dentes.join(', ')}` : ''}</div>
                    <div className="whitespace-pre-wrap text-ink">{atual.observacao || '—'}</div>
                  </div>
                  <div className="rounded-lg border border-violet-400/40 bg-violet-500/5 p-2">
                    <div className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                      {caso.revisao ? t('anotacaoDe', { autor: caso.revisao.autor ?? '', versao: caso.revisao.versao }) : t('semRevisao')}
                    </div>
                    <div className="whitespace-pre-wrap text-ink">{anotacao?.texto || (caso.revisao ? '—' : '')}</div>
                  </div>
                </div>
              )}
              {caso.revisao?.comentario && (
                <div className="rounded-lg border border-violet-400/40 bg-violet-500/5 p-2 text-sm">
                  <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">{t('comentarioGeral')}: </span>
                  <span className="whitespace-pre-wrap text-ink">{caso.revisao.comentario}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {imagens.map((img, i) => (
                  <button key={img.id} type="button" onClick={() => setIndice(i)} className={`h-16 w-16 overflow-hidden rounded-lg border-2 ${i === indice ? 'border-brand' : 'border-transparent'}`} aria-label={t('imagemDe', { n: i + 1, total: imagens.length })}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={urlFoto(caso.id, img.id, { miniatura: true })} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </section>

            {/* ficha e acoes */}
            <aside className="space-y-3">
              <section className="space-y-1 rounded-2xl border border-base-border bg-base-surface p-3 text-sm">
                <h2 className="mb-1 font-semibold text-ink">{t('fichaPaciente')}</h2>
                <p><span className="text-slate-500">{t('novo.nascimento')}:</span> <span className="text-ink">{data(caso.paciente.nascimento)}</span></p>
                <p><span className="text-slate-500">{t('novo.contato')}:</span> <span className="text-ink">{caso.paciente.contato}</span></p>
                {caso.paciente.prontuario && <p><span className="text-slate-500">{t('novo.prontuario')}:</span> <span className="text-ink">{caso.paciente.prontuario}</span></p>}
                {caso.paciente.observacoes && <p className="whitespace-pre-wrap"><span className="text-slate-500">{t('novo.outrosDados')}:</span> <span className="text-ink">{caso.paciente.observacoes}</span></p>}
                <p className="whitespace-pre-wrap"><span className="text-slate-500">{t('novo.descricao')}:</span> <span className="text-ink">{caso.descricao}</span></p>
                <p><span className="text-slate-500">{t('novo.professor')}:</span> <span className="text-ink">{caso.professor ?? t('novo.soParaMim')}</span></p>
                {caso.tratamentos.length > 0 && <p><span className="text-slate-500">{t('tratamentoNecessario')}:</span> <span className="text-ink">{caso.tratamentos.map((x) => t(`tratamentos.${x}`)).join(', ')}</span></p>}
                {caso.aluno_tratamento && <p><span className="text-slate-500">{t('emTratamentoCom')}:</span> <span className="text-ink">{caso.aluno_tratamento} ({t(`tratamentos.${caso.tratamento_escolhido}`)})</span></p>}
                {caso.nota_encaminhamento && <p className="whitespace-pre-wrap"><span className="text-slate-500">{t('notaEncaminhamento')}:</span> <span className="text-ink">{caso.nota_encaminhamento}</span></p>}
                {caso.compartilhado_com.length > 0 && <p><span className="text-slate-500">{t('compartilhadaCom')}:</span> <span className="text-ink">{caso.compartilhado_com.join(', ')}</span></p>}
                {caso.termo[0] && (
                  <a href={urlFoto(caso.id, caso.termo[0].id)} target="_blank" rel="noopener noreferrer" className="inline-block pt-1 text-sm text-brand underline"><FileText aria-hidden="true" className="mr-1 inline h-4 w-4 align-[-2px]" />{t('verTermo')}</a>
                )}
              </section>

              <section className="flex flex-wrap gap-2 rounded-2xl border border-base-border bg-base-surface p-3">
                {equipe && <Link href={`/casos/estudo?sel=${imagens.map((i) => `${caso.id}-${i.id}`).join(',')}&inicio=${indice}`} className={botaoForte}><Pencil aria-hidden="true" className="mr-1 inline h-4 w-4 align-[-2px]" />{t('acoes.revisar')}</Link>}
                <button type="button" className={botao} onClick={() => abrirPainel('editar')}>{t('acoes.editarPaciente')}</button>
                {caso.pode.compartilhar && <button type="button" className={botao} onClick={() => abrirPainel('compartilhar')}>{t('acoes.compartilhar')}</button>}
                {equipe && <button type="button" className={botao} onClick={() => abrirPainel('link')}><Mail aria-hidden="true" className="mr-1 inline h-4 w-4 align-[-2px]" />{t('acoes.email')}</button>}
                <Link href={`/casos/${caso.id}/imprimir`} className={botao}><Printer aria-hidden="true" className="mr-1 inline h-4 w-4 align-[-2px]" />{t('acoes.imprimir')}</Link>
                {atual && <a href={urlFoto(caso.id, atual.id, { baixar: true })} className={botao}><Download aria-hidden="true" className="mr-1 inline h-4 w-4 align-[-2px]" />{t('acoes.baixar')}</a>}
                {caso.pode.encaminhar_curador && <button type="button" className={botao} onClick={() => abrirPainel('curador')}>{t('acoes.encaminharCurador')}</button>}
                {caso.pode.classificar && <button type="button" className={botaoForte} onClick={() => abrirPainel('classificar')}>{t('acoes.classificar')}</button>}
                {caso.pode.encaminhar_aluno && <button type="button" className={botaoForte} onClick={() => abrirPainel('aluno')}>{t('acoes.encaminharAluno')}</button>}
                {/* 01/11/2026 (QA item 3): "Tratamento concluido" abre uma CONFIRMACAO
                    na propria tela (a janela nativa do navegador podia passar
                    despercebida); "Reabrir tratamento" desfaz */}
                {caso.pode.concluir && <button type="button" className={botao} aria-expanded={painel === 'concluir'} onClick={() => { setNota(''); abrirPainel('concluir') }}><Check aria-hidden="true" className="mr-1 inline h-4 w-4 align-[-2px]" />{t('acoes.concluir')}</button>}
                {caso.pode.reabrir_tratamento && <button type="button" className={botao} aria-expanded={painel === 'reabrir'} onClick={() => { setNota(''); abrirPainel('reabrir') }}>{t('acoes.reabrirTratamento')}</button>}
                {caso.versoes > 0 && <button type="button" className={botao} onClick={() => abrirPainel('versoes')}>{t('acoes.versoes', { n: caso.versoes })}</button>}
                {equipe && <Link href={`/casos/acessos?caso=${caso.id}`} className={botao}>{t('acoes.acessos')}</Link>}
              </section>

              {painel === 'editar' && (
                <section className="space-y-2 rounded-2xl border border-brand/40 bg-base-surface p-3">
                  <h3 className="text-sm font-semibold text-ink">{t('acoes.editarPaciente')}</h3>
                  {(['nome', 'contato', 'prontuario'] as const).map((k) => (
                    <input key={k} value={edicao[k] ?? ''} onChange={(e) => setEdicao({ ...edicao, [k]: e.target.value })} className={campo} aria-label={t(`novo.${k}`)} placeholder={t(`novo.${k}`)} />
                  ))}
                  <input type="date" value={edicao.nascimento ?? ''} onChange={(e) => setEdicao({ ...edicao, nascimento: e.target.value })} className={campo} aria-label={t('novo.nascimento')} />
                  <select value={edicao.genero ?? ''} onChange={(e) => setEdicao({ ...edicao, genero: e.target.value })} className={campo} aria-label={t('novo.genero')}>
                    {['feminino', 'masculino', 'outro', 'nao_informado'].map((g) => <option key={g} value={g}>{t(`generos.${g}`)}</option>)}
                  </select>
                  <textarea value={edicao.observacoes ?? ''} rows={2} onChange={(e) => setEdicao({ ...edicao, observacoes: e.target.value })} className={campo} aria-label={t('novo.outrosDados')} placeholder={t('novo.outrosDados')} />
                  <textarea value={edicao.descricao ?? ''} rows={3} onChange={(e) => setEdicao({ ...edicao, descricao: e.target.value })} className={campo} aria-label={t('novo.descricao')} />
                  <button type="button" className={botaoForte} onClick={() => acao(`/casos/${caso.id}/paciente`, { ...edicao, prontuario: edicao.prontuario || null, observacoes: edicao.observacoes || null }, t('dadosSalvos'))}>{t('salvar')}</button>
                  <p className="text-[11px] text-slate-500">{t('edicaoHistorico')}</p>
                </section>
              )}

              {(painel === 'compartilhar' || painel === 'link' || painel === 'aluno') && (
                <section className="space-y-2 rounded-2xl border border-brand/40 bg-base-surface p-3">
                  <h3 className="text-sm font-semibold text-ink">{painel === 'compartilhar' ? t('acoes.compartilhar') : painel === 'link' ? t('acoes.email') : t('acoes.encaminharAluno')}</h3>
                  {painel === 'link' && <p className="text-xs text-slate-500">{t('emailSoLink')}</p>}
                  <select value={destino} onChange={(e) => setDestino(e.target.value)} className={campo} aria-label={t('escolhaPessoa')}>
                    <option value="">{t('escolhaPessoa')}</option>
                    {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome} ({t(`perfis.${p.perfil}`)})</option>)}
                  </select>
                  {painel === 'aluno' && (
                    <select value={tratamentoAluno} onChange={(e) => setTratamentoAluno(e.target.value)} className={campo} aria-label={t('tratamentoEscolhido')}>
                      <option value="">{t('tratamentoEscolhido')}</option>
                      {(caso.tratamentos.length ? caso.tratamentos : listaTratamentos).map((x) => <option key={x} value={x}>{t(`tratamentos.${x}`)}</option>)}
                    </select>
                  )}
                  <button
                    type="button"
                    className={botaoForte}
                    disabled={!destino || (painel === 'aluno' && !tratamentoAluno)}
                    onClick={() =>
                      painel === 'compartilhar'
                        ? acao(`/casos/${caso.id}/compartilhar`, { para_id: Number(destino) }, t('compartilhadaOk'))
                        : painel === 'link'
                          ? acao(`/casos/${caso.id}/enviar-link`, { para_id: Number(destino) }, t('linkOk'))
                          : acao(`/casos/${caso.id}/encaminhar-aluno`, { aluno_id: Number(destino), tratamento: tratamentoAluno }, t('encaminhadaAlunoOk'))
                    }
                  >
                    {t('confirmar')}
                  </button>
                </section>
              )}

              {(painel === 'concluir' || painel === 'reabrir') && (
                <section role="alertdialog" aria-labelledby="titulo-confirmar-tratamento" className="space-y-2 rounded-2xl border border-amber-400/60 bg-base-surface p-3">
                  <h3 id="titulo-confirmar-tratamento" className="text-sm font-semibold text-ink">
                    {/* nome do paciente e do aluno: confirma QUAL pasta (sugestao do reteste) */}
                    {t(painel === 'concluir' ? 'confirmarConcluirTitulo' : 'confirmarReabrirTitulo', {
                      paciente: caso.paciente.nome,
                      aluno: caso.aluno_tratamento ?? '—',
                    })}
                  </h3>
                  <p className="text-xs text-slate-500">{painel === 'concluir' ? t('confirmarConcluir') : t('confirmarReabrir')}</p>
                  <textarea value={nota} rows={2} maxLength={2000} onChange={(e) => setNota(e.target.value)} className={campo} placeholder={t('observacaoOpcional')} disabled={enviando} />
                  <div className="flex gap-2">
                    <button type="button" className={botao} disabled={enviando} onClick={() => setPainel('')}>{t('cancelar')}</button>
                    <button
                      type="button"
                      className={botaoForte}
                      disabled={enviando}
                      aria-busy={enviando}
                      onClick={async () => {
                        if (enviando) return
                        setEnviando(true)
                        try {
                          await acao(
                            painel === 'concluir' ? `/casos/${caso.id}/concluir` : `/casos/${caso.id}/reabrir-tratamento`,
                            { nota },
                            painel === 'concluir' ? t('concluidoOk') : t('reabertoOk'),
                          )
                        } finally {
                          setEnviando(false)
                        }
                      }}
                    >
                      {enviando ? t('enviandoAcao') : painel === 'concluir' ? t('simConcluir') : t('simReabrir')}
                    </button>
                  </div>
                </section>
              )}

              {painel === 'curador' && (
                <section className="space-y-2 rounded-2xl border border-brand/40 bg-base-surface p-3">
                  <h3 className="text-sm font-semibold text-ink">{t('acoes.encaminharCurador')}</h3>
                  <p className="text-xs text-slate-500">{t('encaminharCuradorAjuda')}</p>
                  <textarea value={nota} rows={2} maxLength={2000} onChange={(e) => setNota(e.target.value)} className={campo} placeholder={t('notaOpcional')} />
                  <button type="button" className={botaoForte} onClick={() => acao(`/casos/${caso.id}/encaminhar-curador`, { nota }, t('encaminhadaCuradorOk'))}>{t('confirmar')}</button>
                </section>
              )}

              {painel === 'classificar' && (
                <section className="space-y-2 rounded-2xl border border-brand/40 bg-base-surface p-3">
                  <h3 className="text-sm font-semibold text-ink">{t('acoes.classificar')}</h3>
                  <p className="text-xs text-slate-500">{t('classificarAjuda')}</p>
                  <div className="grid grid-cols-2 gap-1">
                    {listaTratamentos.map((x) => (
                      <label key={x} className="flex items-center gap-1.5 text-sm text-ink">
                        <input type="checkbox" checked={tratamentos.includes(x)} onChange={(e) => setTratamentos(e.target.checked ? [...tratamentos, x] : tratamentos.filter((y) => y !== x))} />
                        {t(`tratamentos.${x}`)}
                      </label>
                    ))}
                  </div>
                  <button type="button" className={botaoForte} disabled={!tratamentos.length} onClick={() => acao(`/casos/${caso.id}/classificar`, { tratamentos }, t('classificadaOk'))}>{t('enviarParaFila')}</button>
                </section>
              )}

              {painel === 'versoes' && (
                <section className="space-y-2 rounded-2xl border border-base-border bg-base-surface p-3">
                  <h3 className="text-sm font-semibold text-ink">{t('historicoVersoes')}</h3>
                  {versoes.map((v) => (
                    <details key={v.versao} className="rounded-lg border border-base-border p-2 text-sm" open={v.versao === versoes[0]?.versao}>
                      <summary className="cursor-pointer text-ink">{t('versaoN', { n: v.versao })} · {v.autor} · {dataHora(v.criado_em)}</summary>
                      {v.comentario && <p className="mt-1 whitespace-pre-wrap text-ink">{v.comentario}</p>}
                      {imagens.map((img, i) => v.anotacoes[String(img.id)] && (
                        <p key={img.id} className="mt-1 text-xs text-slate-500">
                          {t('imagemDe', { n: i + 1, total: imagens.length })}: <span className="text-ink">{v.anotacoes[String(img.id)].texto || '—'}</span>
                          {v.anotacoes[String(img.id)].marcacoes.length > 0 && ` · ${t('marcacoesN', { n: v.anotacoes[String(img.id)].marcacoes.length })}`}
                        </p>
                      ))}
                    </details>
                  ))}
                </section>
              )}

              <section className="rounded-2xl border border-base-border bg-base-surface p-3">
                <h2 className="mb-2 text-sm font-semibold text-ink">{t('historico')}</h2>
                <ol className="space-y-1.5 text-xs">
                  {caso.historico.map((h, i) => (
                    <li key={i} className="border-l-2 border-brand/40 pl-2">
                      <span className="text-slate-500">{dataHora(h.quando)}</span> · <span className="font-medium text-ink">{h.quem}</span> · {t(`historicoAcoes.${h.acao}`)}
                      {h.detalhes && <span className="text-slate-500"> — {h.detalhes}</span>}
                    </li>
                  ))}
                </ol>
              </section>
            </aside>
          </div>
        </main>
      </div>
    </div>
  )
}
