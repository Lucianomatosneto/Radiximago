import { getRequestConfig } from 'next-intl/server'
import { cookies, headers } from 'next/headers'
import { COOKIE_IDIOMA, IDIOMA_PADRAO, ehIdiomaSuportado, type Idioma } from './config'

// Descobre em que idioma mostrar a pagina PARA ESTA VISITA, nesta ordem
// de prioridade:
//
// 1) A pessoa ja trocou o idioma na mao antes, usando o seletor PT/EN
//    (fica guardado num cookie - ver components/SeletorIdioma.tsx). Se
//    ela escolheu, a escolha dela sempre vale, mesmo que o navegador
//    esteja configurado noutro idioma.
// 2) Senao, olha o idioma configurado no PROPRIO NAVEGADOR de quem
//    acessa (cabecalho HTTP "Accept-Language" - o mesmo dado que o
//    Chrome/Firefox/Safari usam pra decidir em que idioma mostrar os
//    proprios menus deles. Nao usamos geolocalizacao por IP de proposito:
//    o navegador ja manda essa informacao sozinho, sem precisar descobrir
//    "de que pais" a pessoa esta acessando (que seria um dado mais
//    sensivel, de localizacao, e exigiria um aviso de privacidade).
// 3) Se nenhum idioma do navegador bater com um dos que oferecemos
//    (hoje: portugues e ingles), usa portugues como padrao.
function detectarIdioma(): Idioma {
  const cookieIdioma = cookies().get(COOKIE_IDIOMA)?.value
  if (ehIdiomaSuportado(cookieIdioma)) return cookieIdioma

  const aceitaIdioma = headers().get('accept-language') ?? ''
  for (const item of aceitaIdioma.split(',')) {
    // Cada item vem como "pt-BR;q=0.9" - pegamos so o codigo de 2 letras
    // antes do "-" ou ";" (ex.: "pt-BR" -> "pt", "en-US" -> "en").
    const codigo = item.trim().split(';')[0].split('-')[0].toLowerCase()
    if (ehIdiomaSuportado(codigo)) return codigo
  }

  return IDIOMA_PADRAO
}

export default getRequestConfig(async () => {
  const locale = detectarIdioma()
  const messages = (await import(`../../messages/${locale}.json`)).default
  return { locale, messages }
})
