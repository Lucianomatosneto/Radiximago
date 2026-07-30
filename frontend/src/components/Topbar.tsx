'use client'

import { useEffect, useRef, useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Logo from './Logo'
import ThemeToggle from './ThemeToggle'

const ICONE_PERFIL: Record<string, string> = {
  administrador: '⚙️',
  curador: '🛡️',
  professor: '📘',
  estudante: '🎓',
  pesquisador: '🔬',
  suporte: '🛠️',
}

const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp']
const TAMANHO_MAXIMO_BYTES = 5 * 1024 * 1024

function urlCompleta(caminho: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL}${caminho}`
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

export default function Topbar() {
  const router = useRouter()
  const [nome, setNome] = useState('')
  const [perfil, setPerfil] = useState('')
  const [fotoPerfilUrl, setFotoPerfilUrl] = useState('')
  const [menuAberto, setMenuAberto] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const [modalPerfilAberto, setModalPerfilAberto] = useState(false)
  const [arquivoSelecionado, setArquivoSelecionado] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erroFoto, setErroFoto] = useState('')

  useEffect(() => {
    setNome(localStorage.getItem('nome') ?? '')
    setPerfil(localStorage.getItem('perfil') ?? '')
    setFotoPerfilUrl(localStorage.getItem('foto_perfil_url') ?? '')
  }, [])

  useEffect(() => {
    function aoClicarFora(evento: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(evento.target as Node)) {
        setMenuAberto(false)
      }
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [])

  function handleSair() {
    localStorage.removeItem('access_token')
    localStorage.removeItem('perfil')
    localStorage.removeItem('nome')
    localStorage.removeItem('foto_perfil_url')
    router.push('/login')
  }

  function abrirModalPerfil() {
    setMenuAberto(false)
    setErroFoto('')
    setArquivoSelecionado(null)
    setPreview('')
    setModalPerfilAberto(true)
  }

  function fecharModalPerfil() {
    if (enviando) return
    setModalPerfilAberto(false)
  }

  function selecionarArquivo(event: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0]
    if (!arquivo) return

    if (!TIPOS_ACEITOS.includes(arquivo.type)) {
      setErroFoto('Formato não suportado. Envie um JPEG, PNG ou WEBP.')
      return
    }
    if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
      setErroFoto('A imagem deve ter no máximo 5 MB.')
      return
    }

    setErroFoto('')
    setArquivoSelecionado(arquivo)
    setPreview(URL.createObjectURL(arquivo))
  }

  async function enviarFoto(event: FormEvent) {
    event.preventDefault()
    const token = localStorage.getItem('access_token')
    if (!arquivoSelecionado || !token) return

    setEnviando(true)
    setErroFoto('')

    try {
      const formData = new FormData()
      formData.append('arquivo', arquivoSelecionado)

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/me/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })

      if (response.status === 401) {
        router.push('/login')
        return
      }
      if (!response.ok) {
        setErroFoto(await extrairErro(response, 'Não foi possível enviar a foto.'))
        return
      }

      const dados = await response.json()
      localStorage.setItem('foto_perfil_url', dados.foto_perfil_url)
      setFotoPerfilUrl(dados.foto_perfil_url)
      setModalPerfilAberto(false)
    } catch {
      setErroFoto('Não foi possível enviar a foto. Tente novamente.')
    } finally {
      setEnviando(false)
    }
  }

  async function removerFoto() {
    const token = localStorage.getItem('access_token')
    if (!token) return

    setEnviando(true)
    setErroFoto('')

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/me/avatar`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.status === 401) {
        router.push('/login')
        return
      }
      if (!response.ok) {
        setErroFoto(await extrairErro(response, 'Não foi possível remover a foto.'))
        return
      }

      localStorage.removeItem('foto_perfil_url')
      setFotoPerfilUrl('')
      setArquivoSelecionado(null)
      setPreview('')
    } catch {
      setErroFoto('Não foi possível remover a foto. Tente novamente.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <header className="flex h-20 items-center justify-between border-b border-base-border bg-base px-6">
      <Logo variante="navbar" />

      <div className="flex items-center gap-6">
        <ThemeToggle />

        <button
          type="button"
          className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-ink"
        >
          <span aria-hidden="true">❓</span> Ajuda
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuAberto((v) => !v)}
            className="flex items-center gap-2 rounded-full border border-base-border bg-base-surface py-1.5 pl-2 pr-3 text-sm hover:border-brand/50"
          >
            <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-brand/20 text-sm">
              {fotoPerfilUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urlCompleta(fotoPerfilUrl)} alt="" className="h-full w-full object-cover" />
              ) : (
                (ICONE_PERFIL[perfil] ?? '👤')
              )}
            </span>
            <span className="text-left leading-tight">
              <span className="block text-[11px] text-slate-400">{nome || 'visitante'}</span>
              <span className="block font-medium capitalize text-ink">{perfil || '—'}</span>
            </span>
            <span className="text-slate-500" aria-hidden="true">
              {menuAberto ? '▲' : '▼'}
            </span>
          </button>

          {menuAberto && (
            <div className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-glow">
              <button
                type="button"
                onClick={abrirModalPerfil}
                className="w-full px-4 py-3 text-left text-sm text-slate-200 hover:bg-brand/10 hover:text-brand-300"
              >
                Meu perfil
              </button>
              <button
                type="button"
                onClick={handleSair}
                className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-red-950/40"
              >
                Sair
              </button>
            </div>
          )}
        </div>
      </div>

      {modalPerfilAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-base-border bg-base-surface p-6 shadow-2xl">
            <h2 className="mb-1 text-lg font-semibold text-ink">Meu perfil</h2>
            <p className="mb-5 text-sm text-slate-400">Escolha uma foto para o seu perfil.</p>

            <div className="mb-5 flex justify-center">
              <span className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-base-border bg-base-surface2 text-3xl">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="" className="h-full w-full object-cover" />
                ) : fotoPerfilUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urlCompleta(fotoPerfilUrl)} alt="" className="h-full w-full object-cover" />
                ) : (
                  (ICONE_PERFIL[perfil] ?? '👤')
                )}
              </span>
            </div>

            <form onSubmit={enviarFoto} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-400">
                  Foto (JPEG, PNG ou WEBP, até 5 MB)
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={selecionarArquivo}
                  className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-brand/15 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-300 hover:file:bg-brand/25"
                />
              </label>

              {erroFoto && (
                <p className="text-sm text-red-400" role="alert">
                  {erroFoto}
                </p>
              )}

              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="submit"
                  disabled={!arquivoSelecionado || enviando}
                  className="rounded-lg bg-brand hover:bg-brand-hover px-4 py-2 text-sm font-medium text-white shadow-glow transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {enviando ? 'Enviando...' : 'Salvar foto'}
                </button>
                {fotoPerfilUrl && (
                  <button
                    type="button"
                    onClick={removerFoto}
                    disabled={enviando}
                    className="rounded-lg border border-red-800/60 px-4 py-2 text-sm text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                  >
                    Remover foto atual
                  </button>
                )}
                <button
                  type="button"
                  onClick={fecharModalPerfil}
                  disabled={enviando}
                  className="rounded-lg border border-base-border px-4 py-2 text-sm text-slate-300 hover:border-slate-500 disabled:opacity-50"
                >
                  Fechar
                </button>
              </div>
            </form>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={fecharModalPerfil}
            className="fixed inset-0 -z-10"
          />
        </div>
      )}
    </header>
  )
}
