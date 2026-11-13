// Proporcao da imagem (largura / altura), usada para alinhar as camadas de
// marcacoes e de pintura sobre a miniatura.
//
// SonarCloud S6439 (12/11/2026): na tela, `{x && proporcao && <Camada/>}`
// mostra um "0" solto quando proporcao vale 0 (o React desenha numeros).
// Esta funcao responde sim/nao, e o TypeScript passa a saber que,
// dentro do bloco, proporcao e um numero valido.
export function proporcaoValida(proporcao: number | null | undefined | false): proporcao is number {
  return typeof proporcao === 'number' && Number.isFinite(proporcao) && proporcao > 0
}
