'use client'

// "Login em duas etapas" dentro de Meus acessos (backend: /auth/mfa*).
// - perfil OPCIONAL (estudante, professor, pesquisador): ligar e desligar;
// - perfil OBRIGATORIO (administrador, suporte, curadoria): ja vem ligado
//   desde o 1o login; aqui so gera novos codigos de recuperacao.

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CadastroAplicativo, CampoCodigo, CodigosRecuperacao, type DadosCadastro } from './PartesSegundoFator'

const API = process.env.NEXT_PUBLIC_API_URL

interface Situacao {
  ativo: boolean
  obrigatorio: boolean
  codigos_recuperacao_restantes: number
}

type Modo = 'nada' | 'ligando' | 'desligando' | 'novosCodigos'

async function postar(caminho: string, corpo?: unknown) {
  return fetch(`${API}${caminho}`, {
    method: 'POST',
    credentials: 'include',
    headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
}

export default function SecaoSegundoFator() {
  const t = useTranslations('SegundoFator')
  const [situacao, setSituacao] = useState<Situacao | null>(null)
  const [modo, setModo] = useState<Modo>('nada')
  const [cadastro, setCadastro] = useState<DadosCadastro | null>(null)
  const [codigo, setCodigo] = useState('')
  const [senha, setSenha] = useState('')
  const [codigos, setCodigos] = useState<string[] | null>(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function carregar() {
    const r = await fetch(`${API}/auth/mfa`, { credentials: 'include' })
    if (r.ok) setSituacao(await r.json())
  }

  useEffect(() => {
    carregar()
  }, [])

  function cancelar() {
    setModo('nada')
    setCadastro(null)
    setCodigo('')
    setSenha('')
    setErro('')
  }

  async function ligar() {
    setErro('')
    setAviso('')
    const r = await postar('/auth/mfa/iniciar')
    if (!r.ok) {
      setErro(t('erroGenerico'))
      return
    }
    setCadastro(await r.json())
    setModo('ligando')
  }

  async function confirmar() {
    if (ocupado || !codigo.trim()) return
    setOcupado(true)
    setErro('')
    try {
      const caminho = modo === 'ligando' ? '/auth/mfa/confirmar' : modo === 'novosCodigos' ? '/auth/mfa/novos-codigos' : '/auth/mfa/desativar'
      const corpo = modo === 'desligando' ? { senha, codigo: codigo.trim() } : { codigo: codigo.trim() }
      const r = await postar(caminho, corpo)
      if (r.status === 401) {
        setErro(t('erroCodigo'))
        setCodigo('')
        return
      }
      if (!r.ok) {
        setErro(t('erroGenerico'))
        return
      }
      const dados = await r.json()
      const ligou = modo === 'ligando'
      cancelar()
      if (Array.isArray(dados.codigos_recuperacao)) setCodigos(dados.codigos_recuperacao)
      setAviso(ligou ? t('ligado') : modo === 'desligando' ? t('desligado') : '')
      await carregar()
    } finally {
      setOcupado(false)
    }
  }

  if (!situacao) return null

  const botao = 'rounded-lg border px-3 py-1.5 text-sm transition disabled:opacity-50'

  return (
    <section className="mt-8 max-w-2xl rounded-xl border border-base-border bg-base-surface p-5" aria-labelledby="titulo-segundo-fator">
      <h2 id="titulo-segundo-fator" className="text-base font-semibold text-slate-100">
        {t('secaoTitulo')}
      </h2>
      <p className="mt-1 text-sm text-slate-400">{t('explicacaoOpcional')}</p>
      <p className={`mt-3 text-sm font-medium ${situacao.ativo ? 'text-emerald-300' : 'text-slate-300'}`}>
        {situacao.ativo ? t('statusAtivo') : t('statusInativo')}
        {situacao.obrigatorio && <span className="ml-2 text-xs text-amber-300">{t('obrigatorioPerfil')}</span>}
      </p>
      {situacao.ativo && (
        <p className="mt-1 text-xs text-slate-400">{t('codigosRestantes', { total: situacao.codigos_recuperacao_restantes })}</p>
      )}

      {aviso && (
        <p className="mt-3 text-sm text-emerald-300" role="status">
          {aviso}
        </p>
      )}

      {codigos ? (
        <div className="mt-4">
          <CodigosRecuperacao codigos={codigos} aoContinuar={() => setCodigos(null)} />
        </div>
      ) : modo === 'nada' ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {!situacao.ativo && (
            <button type="button" onClick={ligar} className={`${botao} border-brand/60 text-brand-300 hover:bg-brand/10`}>
              {t('ligar')}
            </button>
          )}
          {situacao.ativo && (
            <button type="button" onClick={() => setModo('novosCodigos')} className={`${botao} border-base-border text-slate-300 hover:border-brand`}>
              {t('novosCodigos')}
            </button>
          )}
          {situacao.ativo && !situacao.obrigatorio && (
            <button type="button" onClick={() => setModo('desligando')} className={`${botao} border-red-800/60 text-red-300 hover:bg-red-950/40`}>
              {t('desligar')}
            </button>
          )}
        </div>
      ) : (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            confirmar()
          }}
        >
          {modo === 'ligando' && cadastro && <CadastroAplicativo dados={cadastro} />}
          {modo !== 'ligando' && (
            <p className="text-sm text-slate-300">{modo === 'desligando' ? t('pedirSenhaCodigo') : t('pedirCodigo')}</p>
          )}
          {modo === 'desligando' && (
            <div>
              <label htmlFor="senha-segundo-fator" className="block text-[13px] font-medium text-slate-300">
                {t('campoSenha')}
              </label>
              <input
                id="senha-segundo-fator"
                type="password"
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="mt-1 w-64 rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-slate-100 outline-hidden focus:border-brand"
              />
            </div>
          )}
          <CampoCodigo valor={codigo} aoMudar={setCodigo} autoFocus={modo !== 'desligando'} />
          {erro && (
            <p className="text-sm text-red-400" role="alert">
              {erro}
            </p>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={ocupado || !codigo.trim()} className={`${botao} border-brand bg-brand text-white hover:bg-brand-hover`}>
              {ocupado ? t('confirmando') : t('confirmar')}
            </button>
            <button type="button" onClick={cancelar} className={`${botao} border-base-border text-slate-300`}>
              {t('cancelar')}
            </button>
          </div>
        </form>
      )}
      {erro && modo === 'nada' && (
        <p className="mt-3 text-sm text-red-400" role="alert">
          {erro}
        </p>
      )}
    </section>
  )
}
