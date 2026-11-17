'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { obterSessaoAtual, type SessaoUsuario } from './sessao'

/**
 * SESSAO NAS TELAS, NO PADRAO DOS GRANDES SISTEMAS (Fase 3e, 16/11/2026).
 *
 * So o SERVIDOR desloga: a tela vai ao login apenas quando o servidor
 * recusa a sessao (401). Quando a pergunta nem chega (Wi-Fi oscilou) ou o
 * servidor falha (5xx), a pessoa FICA na tela, ve o aviso "Sem conexao" com
 * o botao "Tentar de novo", e a verificacao e refeita sozinha quando o
 * navegador avisa que a internet voltou (evento "online").
 *
 * Enquanto a sessao nao e confirmada, nada restrito aparece: a tela so
 * recebe a sessao (aoValida) depois que o servidor confirma. Nada e
 * guardado no navegador (sem localStorage/IndexedDB).
 *
 * Uso nas telas:
 *   const { semConexao, verificando, tentarDeNovo } = useVerificarSessao((sessao, { semConexao }) => {
 *     ... o que a tela fazia com a sessao (perfil, carregar dados) ...
 *   })
 *   ...
 *   if (semConexao) return <AvisoSemConexao aoTentar={tentarDeNovo} ocupado={verificando} />
 *
 * Se os DADOS da tela tambem nao chegarem por falta de conexao, a tela chama
 * semConexao() e mostra o mesmo aviso (e o "Tentar de novo" refaz tudo).
 */
export function useVerificarSessao(
  aoValida: (sessao: SessaoUsuario, ajuda: { semConexao: () => void }) => unknown,
  opcoes?: { aoInvalida?: () => void }
): { semConexao: boolean; verificando: boolean; tentarDeNovo: () => void } {
  const router = useRouter()
  const [semConexao, setSemConexao] = useState(false)
  const [verificando, setVerificando] = useState(false)
  // sempre a versao mais recente do que a tela passou (sem refazer a verificacao a cada desenho)
  const aoValidaRef = useRef(aoValida)
  const aoInvalidaRef = useRef(opcoes?.aoInvalida)
  aoValidaRef.current = aoValida
  aoInvalidaRef.current = opcoes?.aoInvalida
  const ativo = useRef(true)
  const emAndamento = useRef(false)

  const verificar = useCallback(async () => {
    if (emAndamento.current) return // ja esta conferindo: nao pergunta duas vezes
    emAndamento.current = true
    setVerificando(true)
    try {
      const resultado = await obterSessaoAtual()
      if (!ativo.current) return // a tela ja foi fechada
      if (resultado.estado === 'valida') {
        setSemConexao(false)
        aoValidaRef.current(resultado.sessao, { semConexao: () => ativo.current && setSemConexao(true) })
      } else if (resultado.estado === 'invalida') {
        if (aoInvalidaRef.current) aoInvalidaRef.current()
        else router.push('/login')
      } else {
        setSemConexao(true)
      }
    } finally {
      emAndamento.current = false
      if (ativo.current) setVerificando(false)
    }
  }, [router])

  useEffect(() => {
    ativo.current = true
    void verificar()
    return () => {
      ativo.current = false
    }
  }, [verificar])

  // a internet voltou: confere de novo sozinha (so enquanto o aviso esta na tela)
  useEffect(() => {
    if (!semConexao) return
    const aoVoltar = () => void verificar()
    window.addEventListener('online', aoVoltar)
    return () => window.removeEventListener('online', aoVoltar)
  }, [semConexao, verificar])

  return { semConexao, verificando, tentarDeNovo: () => void verificar() }
}

/**
 * Para pecas que so MOSTRAM ou ESCONDEM opcoes conforme o perfil (menu,
 * barra do topo, botoes): devolve a sessao apenas quando o servidor confirma;
 * em qualquer outro caso, nada (e nada restrito aparece). Nao manda ao login
 * (isso e da tela). Sem conexao, confere de novo quando a internet volta.
 */
export function useSessaoAtual(): SessaoUsuario | null {
  const [sessao, setSessao] = useState<SessaoUsuario | null>(null)
  // 'conferindo' tambem escuta o "online": se a internet volta enquanto a
  // primeira pergunta ainda esta no ar, a volta nao se perde
  const [estado, setEstado] = useState<'conferindo' | 'valida' | 'invalida' | 'sem_conexao'>('conferindo')

  const verificar = useCallback(() => {
    let ativo = true
    void obterSessaoAtual().then((resultado) => {
      if (!ativo) return
      setSessao(resultado.estado === 'valida' ? resultado.sessao : null)
      setEstado(resultado.estado)
    })
    return () => {
      ativo = false
    }
  }, [])

  useEffect(() => verificar(), [verificar])

  const escutarVolta = estado === 'conferindo' || estado === 'sem_conexao'
  useEffect(() => {
    if (!escutarVolta) return
    let cancelar: (() => void) | undefined
    const aoVoltar = () => {
      cancelar?.()
      cancelar = verificar()
    }
    window.addEventListener('online', aoVoltar)
    return () => {
      window.removeEventListener('online', aoVoltar)
      cancelar?.()
    }
  }, [escutarVolta, verificar])

  return sessao
}
