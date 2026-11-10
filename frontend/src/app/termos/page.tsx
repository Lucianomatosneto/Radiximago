'use client'

// TERMOS E PRIVACIDADE (10/11/2026) - pagina PUBLICA (sem login), como pede
// a LGPD (art. 9: acesso facilitado as informacoes). Mostra a versao
// vigente dos Termos de Uso, do anexo de cada perfil e da Politica de
// Privacidade, vindos do servidor (GET /termos). Quem esta logado ve tambem
// o proprio perfil ja selecionado e o historico dos seus aceites.
// "Imprimir ou salvar em PDF" usa a impressao do navegador.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { FileText, Printer, Shield, Users } from 'lucide-react'
import Logo from '../../components/Logo'
import TextoTermos from '../../components/termos/TextoTermos'

const API = process.env.NEXT_PUBLIC_API_URL
const PERFIS = ['estudante', 'professor', 'curador', 'pesquisador', 'suporte', 'administrador'] as const
type Documento = 'termos_uso' | 'anexos' | 'privacidade'

type Publicos = {
  versao: string
  vigencia: string
  mudancas: string
  termos_uso: string
  privacidade: string
  perfis: Record<string, string>
}
type Aceite = { versao: string; perfil: string; aceito_em: string }

export default function TermosPage() {
  const t = useTranslations('Termos')
  const [dados, setDados] = useState<Publicos | null>(null)
  const [erro, setErro] = useState(false)
  const [doc, setDoc] = useState<Documento>('termos_uso')
  const [perfil, setPerfil] = useState<string>('estudante')
  const [historico, setHistorico] = useState<Aceite[] | null>(null)

  useEffect(() => {
    const pedido = new URLSearchParams(window.location.search).get('doc')
    if (pedido === 'privacidade' || pedido === 'anexos') setDoc(pedido)
    fetch(`${API}/termos`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setDados)
      .catch(() => setErro(true))
    // logado: abre no proprio perfil e mostra os aceites
    fetch(`${API}/termos/meus`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return
        if (PERFIS.includes(d.perfil)) setPerfil(d.perfil)
        setHistorico(d.historico ?? [])
      })
      .catch(() => {
        // sem login: so os textos publicos
      })
  }, [])

  const texto = useMemo(() => {
    if (!dados) return ''
    if (doc === 'privacidade') return dados.privacidade
    if (doc === 'anexos') return dados.perfis[perfil] ?? ''
    return dados.termos_uso
  }, [dados, doc, perfil])

  const aba = (id: Documento, rotulo: string, Icone: typeof FileText) => (
    <button
      type="button"
      role="tab"
      aria-selected={doc === id}
      onClick={() => setDoc(id)}
      className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm ${
        doc === id ? 'border-brand bg-brand/10 font-semibold text-ink' : 'border-base-border text-ink-2 hover:border-brand'
      }`}
    >
      <Icone aria-hidden="true" className="h-4 w-4" /> {rotulo}
    </button>
  )

  return (
    <div className="min-h-screen bg-base text-ink">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-base-border bg-base/90 px-4 py-3 backdrop-blur print:hidden sm:px-8">
        <Link href="/login" aria-label={t('voltar')}>
          <Logo variante="escuro" />
        </Link>
        <Link href="/login" className="text-sm text-brand underline">{t('voltar')}</Link>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
        <h1 className="text-2xl font-semibold sm:text-3xl">{t('titulo')}</h1>
        {dados && (
          <p className="mt-1 text-sm text-ink-3">
            {t('versao', { versao: dados.versao, vigencia: dados.vigencia })}
          </p>
        )}
        <p className="mt-3 text-sm text-ink-2 print:hidden">{t('explica')}</p>

        <div role="tablist" aria-label={t('documentos')} className="mt-5 flex flex-wrap gap-2 print:hidden">
          {aba('termos_uso', t('abaTermos'), FileText)}
          {aba('anexos', t('abaAnexos'), Users)}
          {aba('privacidade', t('abaPrivacidade'), Shield)}
          <button
            type="button"
            onClick={() => window.print()}
            className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-lg border border-base-border px-3 text-sm text-ink-2 hover:border-brand"
            data-teste="imprimir-termos"
          >
            <Printer aria-hidden="true" className="h-4 w-4" /> {t('imprimir')}
          </button>
        </div>

        {doc === 'anexos' && (
          <div className="mt-4 print:hidden">
            <label htmlFor="perfil-anexo" className="mb-1 block text-sm font-medium">{t('escolhaPerfil')}</label>
            <select
              id="perfil-anexo"
              value={perfil}
              onChange={(e) => setPerfil(e.target.value)}
              className="min-h-11 w-full rounded-lg border border-base-border bg-base-surface px-3 text-sm sm:w-72"
            >
              {PERFIS.map((p) => (
                <option key={p} value={p}>{t(`perfis.${p}`)}</option>
              ))}
            </select>
          </div>
        )}

        <article className="mt-6 rounded-2xl border border-base-border bg-base-surface p-4 sm:p-8 print:border-0 print:p-0" data-teste="texto-termos">
          {erro && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{t('erro')}</p>}
          {!dados && !erro && <p className="text-sm text-ink-3">{t('carregando')}</p>}
          {texto && <TextoTermos markdown={texto} />}
        </article>

        {historico && (
          <section className="mt-6 rounded-2xl border border-base-border p-4 print:hidden sm:p-6">
            <h2 className="text-base font-semibold">{t('meusAceites')}</h2>
            {historico.length === 0 ? (
              <p className="mt-2 text-sm text-ink-3">{t('nenhumAceite')}</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm text-ink-2">
                {historico.map((a, i) => (
                  <li key={i}>
                    {t('aceiteLinha', {
                      versao: a.versao,
                      perfil: t(`perfis.${a.perfil}`),
                      data: new Date(a.aceito_em).toLocaleString(),
                    })}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <p className="mt-6 text-sm text-ink-3">
          {t('contato')} <a href="mailto:privacidade@radiximago.com.br" className="text-brand underline">privacidade@radiximago.com.br</a>
        </p>
      </main>
    </div>
  )
}
