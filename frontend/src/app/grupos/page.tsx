'use client'

// GRUPOS - UMA TELA SO (pedido do video, 22/11/2026). Antes eram duas telas
// no menu ("Grupos" para quem cria e "Meus grupos" para quem participa).
// Agora:
// - quem cria grupos (professor, pesquisador, curador, administrador) ve duas
//   abas: "Grupos que criei" e "Grupos de que participo";
// - quem nao cria (estudante, suporte) ve direto os grupos de que participa
//   (com convites e, para o estudante, a busca e os pedidos).
// Cada aba e um componente (components/grupos/GruposCriados e
// GruposParticipo) com as mesmas regras de antes; quem decide de verdade e o
// servidor. O endereco antigo /meus-grupos e redirecionado para esta tela,
// na 2a aba (frontend/next.config.mjs).
// Aba inicial: ?aba=participo no endereco; senao, a primeira.

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Users } from 'lucide-react'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import GruposCriados from '../../components/grupos/GruposCriados'
import GruposParticipo from '../../components/grupos/GruposParticipo'
import { useVerificarSessao } from '../../lib/useVerificarSessao'
import AvisoSemConexao from '../../components/AvisoSemConexao'
import { fetchOuNulo } from '../../lib/fetchSeguro'

const API = process.env.NEXT_PUBLIC_API_URL
const PERFIS_QUE_CRIAM = ['professor', 'pesquisador', 'curador', 'administrador']
type Aba = 'criei' | 'participo'
type Pendencias = { pedidos: number; convites: number; imagens_novas: number }

export default function GruposPage() {
  const t = useTranslations('GruposUnico')
  const [perfil, setPerfil] = useState<string | null>(null)
  const [aba, setAba] = useState<Aba>('criei')
  const [pend, setPend] = useState<Pendencias>({ pedidos: 0, convites: 0, imagens_novas: 0 })

  // sessao (Fase 3e): 401 -> login; sem conexao -> aviso + Tentar de novo
  const { semConexao, verificando, tentarDeNovo } = useVerificarSessao((s) => {
    const cria = PERFIS_QUE_CRIAM.includes(s.perfil)
    const pedida = new URLSearchParams(window.location.search).get('aba')
    setAba(cria && pedida !== 'participo' ? 'criei' : 'participo')
    setPerfil(s.perfil)
  })

  // numeros nas abas (os mesmos do menu)
  function contar() {
    void fetchOuNulo(`${API}/grupos/pendencias`, { credentials: 'include' }).then(async (r) => {
      if (r?.ok) setPend({ pedidos: 0, convites: 0, imagens_novas: 0, ...(await r.json()) })
    })
  }
  useEffect(() => {
    if (!perfil) return
    contar()
    window.addEventListener('radix-grupos-mudou', contar)
    return () => window.removeEventListener('radix-grupos-mudou', contar)
  }, [perfil])

  if (semConexao) return <AvisoSemConexao aoTentar={tentarDeNovo} ocupado={verificando} />
  if (!perfil) {
    return <main className="flex min-h-screen items-center justify-center bg-base"><p className="text-sm text-slate-400">{t('carregando')}</p></main>
  }

  const cria = PERFIS_QUE_CRIAM.includes(perfil)
  const abas: { chave: Aba; rotulo: string; n: number }[] = [
    { chave: 'criei', rotulo: t('abaCriei'), n: pend.pedidos },
    { chave: 'participo', rotulo: t('abaParticipo'), n: pend.convites + pend.imagens_novas },
  ]

  function trocar(nova: Aba) {
    setAba(nova)
    window.history.replaceState(null, '', nova === 'participo' ? '/grupos?aba=participo' : '/grupos')
  }

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-w-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
          <h1 className="titulo-pagina tela-entra flex items-center gap-2"><Users aria-hidden="true" className="h-6 w-6" /> {t('titulo')}</h1>
          {cria && (
            <div role="tablist" aria-label={t('titulo')} className="flex flex-wrap gap-2 border-b border-base-border">
              {abas.map((a) => (
                <button
                  key={a.chave}
                  type="button"
                  role="tab"
                  id={`aba-${a.chave}`}
                  aria-selected={aba === a.chave}
                  aria-controls={`painel-${a.chave}`}
                  onClick={() => trocar(a.chave)}
                  className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition ${
                    aba === a.chave ? 'border-brand text-brand' : 'border-transparent text-ink-2 hover:text-ink'
                  }`}
                >
                  {a.rotulo}
                  {a.n > 0 && (
                    <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-black" aria-label={t('pendentes', { n: a.n })}>
                      {a.n}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          {cria && aba === 'criei' ? (
            <section role="tabpanel" id="painel-criei" aria-labelledby="aba-criei">
              <GruposCriados />
            </section>
          ) : (
            <section role={cria ? 'tabpanel' : undefined} id="painel-participo" aria-labelledby={cria ? 'aba-participo' : undefined}>
              <GruposParticipo ehEstudante={perfil === 'estudante'} />
            </section>
          )}
        </main>
      </div>
    </div>
  )
}
