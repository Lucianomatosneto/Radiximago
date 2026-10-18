'use client'

import { useEffect, useState } from 'react'

/**
 * Le o codigo de uso unico dos links enviados por e-mail ("esqueci minha
 * senha" e confirmacao de cadastro) - OWASP ASVS 14.2.1.
 *
 * O codigo vai DEPOIS do "#" (ex.: /redefinir-senha#token=abc). Essa parte
 * do endereco nunca sai do navegador: nao chega ao servidor, nao fica em
 * registros (logs) de servidores ou proxies e nao e repassada a outros
 * sites. Links antigos no formato "?token=" continuam funcionando.
 *
 * Assim que o codigo e lido, ele e apagado da barra de endereco (sem
 * recarregar a pagina): nao fica no historico do navegador nem aparece
 * se a pessoa copiar o endereco ou compartilhar a tela.
 */
export function useCodigoDoLink(): { codigo: string; lido: boolean } {
  const [estado, setEstado] = useState({ codigo: '', lido: false })

  useEffect(() => {
    const doFragmento = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token')
    const daConsulta = new URLSearchParams(window.location.search).get('token')
    const codigo = doFragmento || daConsulta || ''
    if (codigo) {
      window.history.replaceState(window.history.state, '', window.location.pathname)
    }
    setEstado({ codigo, lido: true })
  }, [])

  return estado
}
