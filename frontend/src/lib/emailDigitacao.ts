/**
 * PROVAVEIS ERROS DE DIGITACAO NO E-MAIL (01/11/2026 - QA: "hotmai.com").
 * So AVISA ("voce quis dizer hotmail.com?"), nunca bloqueia: o dominio pode
 * existir. Copia de backend/app/core/email_digitacao.py (um teste confere
 * que as duas listas sao iguais).
 */
export const DOMINIOS_TROCADOS: Record<string, string> = {
  'hotmai.com': 'hotmail.com',
  'hotmal.com': 'hotmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmil.com': 'hotmail.com',
  'hotamil.com': 'hotmail.com',
  'hotmail.co': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'hotmail.com.b': 'hotmail.com.br',
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com',
  'outlok.com': 'outlook.com',
  'outllok.com': 'outlook.com',
  'outlook.co': 'outlook.com',
  'outlook.con': 'outlook.com',
  'yaho.com': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'yahoo.com.b': 'yahoo.com.br',
  'yaho.com.br': 'yahoo.com.br',
  'ufsc.b': 'ufsc.br',
  'ufcs.br': 'ufsc.br',
}

/** 'gabi@hotmai.com' -> 'gabi@hotmail.com'; null quando nao ha suspeita */
export function sugestaoDeEmail(email: string | null | undefined): string | null {
  if (!email || !email.includes('@')) return null
  const i = email.trim().lastIndexOf('@')
  const usuario = email.trim().slice(0, i)
  const certo = DOMINIOS_TROCADOS[email.trim().slice(i + 1).toLowerCase()]
  return certo ? `${usuario}@${certo}` : null
}
