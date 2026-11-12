// Pequenas funcoes de texto sem expressao regular "gulosa" (SonarCloud
// S8786, 12/11/2026). Uma regex ancorada no fim, como /[.!?]+$/, e testada
// a partir de CADA posicao do texto: num texto longo cheio de pontos ela
// fica muito lenta (tempo cresce com o quadrado do tamanho). Aqui o texto
// e lido uma vez so, de tras para a frente - mesmo resultado, tempo linear.

const ESPACO = /^\s$/ // um caractere so: nao ha como "voltar atras"

/** Remove do FIM do texto os caracteres de `lista` (e espacos, se `espacos`). */
export function aparaFim(texto: string, lista: string, espacos = false): string {
  let fim = texto.length
  while (fim > 0) {
    const c = texto[fim - 1]
    if (lista.includes(c) || (espacos && ESPACO.test(c))) fim--
    else break
  }
  return texto.slice(0, fim)
}
