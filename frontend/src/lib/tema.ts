// TEMA CLARO / ESCURO
//
// Tres preferencias possiveis (guardadas no navegador, chave "tema"):
//   'auto'  -> segue o computador/celular da pessoa (configuracao de
//              aparencia do Windows, macOS, Android, iOS). E o PADRAO: quem
//              usa tema escuro no sistema ve o Radix escuro; quem usa claro,
//              ve claro - e muda sozinho se o sistema mudar (ex.: escuro a
//              noite). Assim a tela acompanha a luz do ambiente, o que reduz
//              o cansaco visual.
//   'dark' / 'light' -> escolha manual feita no botao do sol/lua.
//
// O mesmo calculo roda ANTES da tela aparecer (script em app/layout.tsx),
// para nao "piscar" com o tema errado - mantenha os dois iguais.

export type Tema = 'dark' | 'light'
export type PreferenciaTema = Tema | 'auto'

const CHAVE = 'tema'
const CONSULTA_CLARO = '(prefers-color-scheme: light)'

export function preferenciaSalva(): PreferenciaTema {
  try {
    const v = localStorage.getItem(CHAVE)
    return v === 'dark' || v === 'light' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function salvarPreferencia(p: PreferenciaTema) {
  try {
    if (p === 'auto') localStorage.removeItem(CHAVE)
    else localStorage.setItem(CHAVE, p)
  } catch {
    // navegador sem armazenamento: vale so ate recarregar a pagina
  }
}

/** tema do sistema operacional; sem a informacao, escuro (padrao do Radix) */
export function temaDoSistema(): Tema {
  try {
    return window.matchMedia(CONSULTA_CLARO).matches ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function temaEfetivo(p: PreferenciaTema): Tema {
  return p === 'auto' ? temaDoSistema() : p
}

export function aplicarTema(tema: Tema) {
  const html = document.documentElement
  if (html.classList.contains(tema)) return
  html.classList.remove('dark', 'light')
  html.classList.add(tema)
}

/** avisa quando o sistema troca entre claro e escuro; devolve o "desligar" */
export function aoMudarTemaDoSistema(fn: (tema: Tema) => void): () => void {
  try {
    const mq = window.matchMedia(CONSULTA_CLARO)
    const ouvinte = () => fn(mq.matches ? 'light' : 'dark')
    mq.addEventListener('change', ouvinte)
    return () => mq.removeEventListener('change', ouvinte)
  } catch {
    return () => {}
  }
}

/** ordem do botao: automatico -> o oposto do que esta na tela -> o outro -> automatico */
export function proximaPreferencia(atual: PreferenciaTema, sistema: Tema): PreferenciaTema {
  const oposto: Tema = sistema === 'dark' ? 'light' : 'dark'
  if (atual === 'auto') return oposto
  if (atual === oposto) return sistema
  return 'auto'
}

/** script que roda antes da 1a pintura da tela (app/layout.tsx) */
export const SCRIPT_TEMA_INICIAL =
  "(function(){var t='dark';try{var s=localStorage.getItem('tema');if(s==='light'||s==='dark'){t=s}else if(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches){t='light'}}catch(e){}document.documentElement.classList.add(t);})();"
