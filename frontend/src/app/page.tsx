import { redirect } from 'next/navigation'

// A primeira tela do sistema e o login: quem abre o RADIX IMAGO quer entrar,
// e uma pagina intermediaria so acrescentaria um clique. A antiga
// apresentacao continua disponivel em /conheca (link na tela de entrada).
export default function Raiz() {
  redirect('/login')
}
