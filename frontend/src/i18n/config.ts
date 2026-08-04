// Idiomas que o Radix Imago oferece e o idioma padrao (usado quando o
// navegador de quem acessa nao informa nenhum dos idiomas suportados).
// Pra adicionar um novo idioma no futuro: (1) acrescente o codigo aqui,
// (2) crie o arquivo messages/<codigo>.json com as mesmas chaves dos
// outros, (3) acrescente o rotulo em SeletorIdioma nos dois messages/*.json.
export const IDIOMAS_SUPORTADOS = ['pt', 'en'] as const
export type Idioma = (typeof IDIOMAS_SUPORTADOS)[number]
export const IDIOMA_PADRAO: Idioma = 'pt'

// Nome do cookie usado quando a pessoa troca o idioma manualmente (ver
// components/SeletorIdioma.tsx). Sem esse cookie, o idioma e detectado
// automaticamente pelo navegador a cada visita (ver i18n/request.ts) -
// e por isso NAO tem "path" restrito nem informacao pessoal dentro, so a
// preferencia de idioma (nenhum dado sensivel/LGPD envolvido).
export const COOKIE_IDIOMA = 'idioma'

export function ehIdiomaSuportado(valor: string | undefined | null): valor is Idioma {
  return !!valor && (IDIOMAS_SUPORTADOS as readonly string[]).includes(valor)
}
