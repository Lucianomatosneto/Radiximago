// Nome (chave de traducao em "Login") da regiao do mundo voltada para a
// frente, a partir da longitude central em graus (-180 a 180). Usado pelo
// globo da tela de entrada e pelo mapa-mundi do Banco de imagens.
export type ChaveRegiao =
  | 'regiaoPacifico'
  | 'regiaoAmericas'
  | 'regiaoAtlantico'
  | 'regiaoEuropaAfrica'
  | 'regiaoAsia'

export function regiaoDe(lon: number): ChaveRegiao {
  if (lon < -170 || lon >= 150) return 'regiaoPacifico'
  if (lon < -30) return 'regiaoAmericas'
  if (lon < -10) return 'regiaoAtlantico'
  if (lon < 60) return 'regiaoEuropaAfrica'
  return 'regiaoAsia'
}
