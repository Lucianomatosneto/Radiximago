'use client'

// TERMO DE CIENCIA APOS O LOGIN (10/11/2026, decisoes do Luciano)
// A cada login, antes de usar o sistema, a pessoa marca que esta ciente de
// que as imagens sao EXCLUSIVAMENTE para ensino e pesquisa, sem validade
// para diagnostico. "Nao aceito" encerra a sessao e volta ao login.
// Quem garante a regra e o SERVIDOR (sem o aceite tudo responde 403); esta
// janela so mostra o termo. Ela confere a situacao a cada troca de tela.
//
// TERMOS DE USO E PRIVACIDADE (10/11/2026): antes do termo de ciencia,
// se faltar o aceite da versao atual dos Termos de Uso + anexo do perfil +
// Politica de Privacidade (primeiro acesso, nova versao ou novo perfil),
// aparece a janela <AceiteTermosUso>. A caixa "Li e concordo" so libera
// depois de rolar os textos ate o fim.

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ShieldCheck } from 'lucide-react'
import AceiteTermosUso, { type MeusTermos } from './termos/AceiteTermosUso'

const API = process.env.NEXT_PUBLIC_API_URL
// telas sem login: nao ha o que perguntar
const TELAS_PUBLICAS = ['/login', '/termos', '/conheca', '/esqueci-senha', '/redefinir-senha', '/confirmar-email', '/solicitar-acesso']

export default function TermoCiencia() {
  const t = useTranslations('TermoCiencia')
  const caminho = usePathname()
  const router = useRouter()
  const [pendente, setPendente] = useState(false)
  const [termosUso, setTermosUso] = useState<MeusTermos | null>(null)
  const [versao, setVersao] = useState('')
  const [ciente, setCiente] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const caixa = useRef<HTMLInputElement>(null)

  const conferir = useCallback(async () => {
    try {
      // 1o os Termos de Uso (primeiro acesso / nova versao)
      const rt = await fetch(`${API}/termos/meus`, { credentials: 'include' })
      if (!rt.ok) {
        setTermosUso(null)
        setPendente(false) // sem login: nada a mostrar
        return
      }
      const termos: MeusTermos = await rt.json()
      if (termos.pendente) {
        setTermosUso(termos)
        setPendente(false)
        return
      }
      setTermosUso(null)
      // 2o o termo de ciencia desta sessao
      const r = await fetch(`${API}/auth/termo-ciencia`, { credentials: 'include' })
      if (!r.ok) {
        setPendente(false) // sem login: nada a mostrar
        return
      }
      const d = await r.json()
      setVersao(d.versao)
      setPendente(Boolean(d.pendente))
    } catch {
      // sem conexao: o servidor continua barrando sem o aceite
    }
  }, [])

  useEffect(() => {
    if (TELAS_PUBLICAS.some((p) => caminho === p || caminho?.startsWith(`${p}/`)) || caminho === '/') {
      setPendente(false)
      setTermosUso(null)
      return
    }
    void conferir()
  }, [caminho, conferir])

  useEffect(() => {
    if (pendente) caixa.current?.focus()
  }, [pendente])

  async function aceitar() {
    if (!ciente) {
      setErro(t('marqueACaixa'))
      return
    }
    setEnviando(true)
    setErro('')
    try {
      const r = await fetch(`${API}/auth/termo-ciencia/aceitar`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versao, ciente: true }),
      })
      if (r.ok) {
        setPendente(false)
        router.refresh()
        window.location.reload() // as telas abertas carregam os dados de novo
      } else if (r.status === 409) {
        await conferir()
        setErro(t('textoMudou'))
      } else {
        setErro(t('erro'))
      }
    } catch {
      setErro(t('erro'))
    } finally {
      setEnviando(false)
    }
  }

  async function recusar() {
    setEnviando(true)
    try {
      await fetch(`${API}/auth/termo-ciencia/recusar`, { method: 'POST', credentials: 'include' })
    } catch {
      // sem conexao: a recusa nao chega ao servidor, mas a pessoa sai do mesmo
      // jeito (o termo continua pendente e volta no proximo login)
    } finally {
      window.location.href = '/login?termo=recusado'
    }
  }

  if (termosUso) return <AceiteTermosUso termos={termosUso} onAceito={conferir} />
  if (!pendente) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="termo-titulo"
        aria-describedby="termo-texto"
        data-teste="termo-ciencia"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-base-border bg-base-surface p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-center gap-3">
          <ShieldCheck aria-hidden="true" className="h-7 w-7 shrink-0 text-brand" />
          <h2 id="termo-titulo" className="text-lg font-semibold text-ink">{t('titulo')}</h2>
        </div>
        <div id="termo-texto" className="mt-4 space-y-2 text-sm leading-relaxed text-ink-2">
          <p>{t('paragrafo1')}</p>
          <p>{t('paragrafo2')}</p>
          <p>{t('paragrafo3')}</p>
        </div>
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-brand/40 bg-brand/5 p-3">
          <input
            ref={caixa}
            type="checkbox"
            checked={ciente}
            onChange={(e) => setCiente(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0"
            data-teste="termo-caixa"
          />
          <span className="text-sm font-medium text-ink">{t('caixa')}</span>
        </label>
        {erro && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-300">{erro}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={recusar}
            disabled={enviando}
            className="min-h-11 rounded-lg border border-base-border px-4 text-sm text-ink hover:border-red-400 disabled:opacity-50"
            data-teste="termo-recusar"
          >
            {t('naoAceito')}
          </button>
          <button
            type="button"
            onClick={aceitar}
            disabled={enviando || !ciente}
            className="min-h-11 rounded-lg bg-brand px-5 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
            data-teste="termo-aceitar"
          >
            {t('continuar')}
          </button>
        </div>
        <p className="mt-3 text-xs text-ink-3">{t('cadaLogin')}</p>
      </div>
    </div>
  )
}
