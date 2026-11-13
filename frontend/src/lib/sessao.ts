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
export async function obterSessaoAtual(): Promise<SessaoUsuario | null> {
  try {
    const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/me`, {
      credentials: 'include',
    })
    if (!resposta.ok) return null
    return await resposta.json()
  } catch {
    return null
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
