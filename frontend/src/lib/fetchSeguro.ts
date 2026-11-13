// Chamada de rede que NAO estoura quando o servidor esta fora do ar.
//
// O `fetch` comum "rejeita" (da erro) quando nao ha conexao; se a tela nao
// trata isso, o botao fica travado e a pessoa nao ve nenhum aviso. Esta funcao
// devolve `null` nesse caso, para a tela mostrar UM aviso simples ("sem
// conexao") em vez de uma mensagem tecnica.

export async function fetchOuNulo(input: RequestInfo | URL, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(input, init)
  } catch {
    return null
  }
}
