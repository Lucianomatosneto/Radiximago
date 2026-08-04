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
