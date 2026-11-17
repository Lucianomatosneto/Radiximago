export interface SessaoUsuario {
  id: number
  nome: string
  email: string
  perfil: string
  foto_perfil_url: string | null
}

// Migracao de localStorage pra cookie httpOnly (2026-08): o token do JWT
// agora vive num cookie que o JS nao consegue ler (httpOnly - mitiga
// roubo via XSS, o que localStorage nunca protegia). Por isso nao da mais
// pra saber "quem esta logado" so lendo uma chave local - cada tela
// pergunta pro backend via GET /auth/me, que le o cookie enviado
// automaticamente pelo navegador (credentials: 'include').
//
// TRES RESULTADOS (Fase 3e, 16/11/2026), no padrao dos grandes sistemas:
// so o SERVIDOR desloga. Antes, "sem conexao" e "sessao invalida" davam a
// mesma resposta e o Wi-Fi oscilando mandava a pessoa para o login.
// - "valida": o servidor respondeu 200 com quem esta logado;
// - "invalida": o servidor RECUSOU (401, ou outra recusa 4xx, como era
//   antes) - a tela vai ao login;
// - "sem_conexao": o pedido nem chegou, ou o servidor falhou (5xx) ou
//   respondeu algo ilegivel - nao e motivo para deslogar: a tela avisa e
//   deixa tentar de novo. Nada restrito aparece enquanto isso.
export type ResultadoSessao =
  | { estado: 'valida'; sessao: SessaoUsuario }
  | { estado: 'invalida' }
  | { estado: 'sem_conexao' }

export async function obterSessaoAtual(): Promise<ResultadoSessao> {
  let resposta: Response
  try {
    resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/me`, {
      credentials: 'include',
    })
  } catch {
    return { estado: 'sem_conexao' }
  }
  if (resposta.status >= 500) return { estado: 'sem_conexao' }
  if (!resposta.ok) return { estado: 'invalida' }
  try {
    const dados = await resposta.json()
    // so e sessao se tiver o formato esperado; resposta estranha (ex.: um
    // proxy no caminho) nao abre nada restrito e nao desloga
    if (dados && typeof dados === 'object' && typeof dados.perfil === 'string' && typeof dados.id === 'number') {
      return { estado: 'valida', sessao: dados as SessaoUsuario }
    }
    return { estado: 'sem_conexao' }
  } catch {
    return { estado: 'sem_conexao' }
  }
}

// Codigos que o servidor manda (403) enquanto a pessoa LOGADA ainda nao
// aceitou o termo de ciencia desta sessao ou a versao atual dos Termos de
// Uso (backend: termo_ciencia.py e termos_uso.py, CODIGO_PENDENTE).
export const CODIGOS_TERMO_PENDENTE = ['termo_ciencia_pendente', 'termos_uso_pendentes']

/** A recusa (403) e so "falta aceitar o termo"? Nesse caso a pessoa continua
 * logada: a janela do termo aparece e a tela nao deve mandar para o login. */
export async function termoPendente(resposta: Response): Promise<boolean> {
  if (resposta.status !== 403) return false
  try {
    const dados = await resposta.clone().json()
    return CODIGOS_TERMO_PENDENTE.includes(dados?.detail)
  } catch {
    return false
  }
}
