# RESULTADO — Acessibilidade e sobras da Fase 3c (Fase 3d, 16/11/2026)

Tarefa: `TAREFA_claude_code_acessibilidade_fase_3d_2026-11-16.md`.
Branch: `qualidade/acessibilidade-fase-3d`, criada de `redesign-ui` em b7d7ed2 (merge do PR 76).

Regras seguidas:
- escopo fechado: só os 10 itens da tarefa;
- teste que falha antes da correção, em commit separado;
- um arquivo por commit;
- dados só inventados;
- nenhuma regra de negócio alterada;
- nenhuma exclusão nova de cobertura (continuam só os 2 motores gráficos);
- sem force push e sem mesclar.

## Resumo em linguagem simples

- **10 de 10 itens feitos.**
  - 8 itens com teste que falhava antes e passa depois: 14 testes novos, todos falhando antes da correção.
  - 2 itens são só texto (um comentário no código e um número no relatório da 3c). Para eles não existe teste automático que faça sentido.
- **Vitest:** 934 testes, todos passam, em 3 rodadas seguidas. Linhas em 85,08% (eram 85,07%).
- **Mutações:** 11 feitas. 10 foram pegas; a outra é "equivalente" (proteção dupla, explicada abaixo).
- **Traduções:** 2 chaves novas, cada uma em pt e en; 2 chaves sem uso removidas de pt e en; nenhuma chave faltando.

## Item por item

| # | Item | O que falhava (teste antes da correção) | Teste (commit) | Correção (commit) |
|---|---|---|---|---|
| 1 | Macros: "Salvar" sem trava | Dois cliques rápidos no "Salvar" mandavam duas gravações. Antes: "expected false to be true" (o botão não travava). | `macros.test.tsx` (d31a585) | `macros/page.tsx` (8de597c): trava durante o envio e ignora o pedido duplicado; depois de uma falha, volta a funcionar. |
| 2 | Macros: "Macro salva." não anunciada | Antes: "Unable to find role=status". | `macros.test.tsx` (d31a585) | `macros/page.tsx` (8de597c): `role="status"`. |
| 3 | Esqueci minha senha e Redefinir senha: sucesso não anunciado | Antes: 2 falhas, "Unable to find role=status". | `senha-e-confirmacao.test.tsx` (227438f) | `esqueci-senha/page.tsx` (05e229b) e `redefinir-senha/page.tsx` (dc7dfcd): `role="status"`, o mesmo padrão do Confirmar e-mail. |
| 4 | Solicitar acesso: sucesso não anunciado; botões de perfil sem `aria-pressed` | Antes: `aria-pressed` vinha `null` nos 4 botões, e "Unable to find role=status". | `solicitar-acesso.test.tsx` (4c1fe49) | `solicitar-acesso/page.tsx` (d44f1cd): `aria-pressed` (só o perfil escolhido fica "true") e `role="status"`. |
| 5 | Responder compartilhamento: "Resposta enviada" não anunciada; nos formatos de ícone, sucesso só como "✓" | Antes: 5 falhas ("Unable to find role=status" nos 3 formatos; o botão de ícone não mudava de nome). | `responder-compartilhamento.test.tsx` (d1adb55) | Chave nova `Compartilhar.respostaEnviadaResponderDeNovo` em pt (9c76a76) e en (73a589f). Componente (97e34c4): um aviso sempre presente para o leitor de tela (`role="status"`, nos 3 formatos). Enquanto mostra o "✓", o botão de ícone se chama "Resposta enviada para X. Responder de novo"; depois de 4 s, volta a "Responder a X". |
| 6 | Meus acessos: todos os "Encerrar" com o mesmo nome | Antes: o botão não tinha nome próprio (`aria-label` nulo). | `meus-acessos.test.tsx` (e57ff36) | Chave nova `MeusAcessos.encerrarAcesso` em pt (a56a792) e en (ac672b3). Página (d7e44b3): cada botão se chama "Encerrar o acesso de <aparelho>, endereço de rede <IP>", com os mesmos dados já mostrados na linha. O texto visível continua "Encerrar". |
| 7 | Menu lateral aberto sem nome acessível | Antes: "Unable to find … complementary and name Navegação". | `sidebar.test.tsx` (7e9a0b3) | `Sidebar.tsx` (17c6e4c): `aria-label="Navegação"` também no menu aberto. |
| 8 | Traduções sem uso no menu | O teste novo compara as chaves do menu com os itens que existem no código e confere que cada texto solto é usado. Antes: 21 chaves contra 20 itens, por causa de `pesquisaAvancada` sobrando. | `sidebar.test.tsx` (7e9a0b3) | Antes de apagar, uma busca no código (frontend e ferramentas de teste) não achou nenhum uso. Removidas `Sidebar.itens.pesquisaAvancada` e `Sidebar.menuRecolhidoDica` de pt (1bb1fbb) e en (9604fbb). |
| 9 | Comentário desatualizado em `confirmar-email/page.tsx` | Dizia que professor e pesquisador entram direto. No servidor, `PERFIS_APROVACAO_AUTOMATICA = {"estudante"}`. É só um comentário, e não há teste que faça sentido para isso. | não se aplica | 021035f: o comentário agora diz que só o estudante entra direto. O texto da tela já estava certo e não mudou. |
| 10 | Relatório da 3c: "2 defeitos" na seção Commits | Erro de digitação apontado na revisão. É documento, então não há teste. | não se aplica | f5ee179: "5 defeitos". |

**Testes antigos ajustados (sem afrouxar):** dois testes da 3c procuravam os botões pelos nomes antigos, que esta fase mudou de propósito. Agora procuram pelo nome novo, que é mais específico:
- **"Responder compartilhamento", depois de enviar:** o teste continua conferindo o "✓" e agora também confere o nome do botão.
- **"Encerrar" em Meus acessos:** passou a ser localizado pelo nome com o aparelho.

São commits próprios, separados das correções: 174861c e e68be64.

## Mutações (quebrar o código de propósito; o teste precisa falhar)

| Arquivo | Mudança | Resultado |
|---|---|---|
| macros | tira a trava `if (... salvando) return` | **equivalente** (ver abaixo) |
| macros | "Salvar" não fica travado (sem `disabled`) | pega (1 falha) |
| macros | tira o `role="status"` do "Macro salva." | pega (1 falha) |
| esqueci-senha | tira o `role="status"` | pega (1 falha) |
| redefinir-senha | tira o `role="status"` | pega (1 falha) |
| solicitar-acesso | `aria-pressed` sempre falso | pega (1 falha) |
| solicitar-acesso | tira o `role="status"` | pega (1 falha) |
| ResponderCompartilhamento | o botão não muda de nome depois de enviar | pega (4 falhas) |
| ResponderCompartilhamento | o aviso perde o `role="status"` | pega (5 falhas) |
| meus-acessos | todos os "Encerrar" voltam a ter o mesmo nome | pega (3 falhas) |
| Sidebar | menu aberto sem nome | pega (1 falha) |

**Resultado: 10 de 11 pegas, mais 1 equivalente.** A tarefa pedia pelo menos 6.

**Por que uma é "equivalente":** nas Macros há duas proteções contra o pedido duplicado:
1. o botão fica travado (`disabled`);
2. a linha `if (... salvando) return` dentro da função.

Com o botão travado, nenhum clique chega à segunda proteção. Por isso, nenhum teste consegue notar quando ela some. A primeira proteção é pega pela mutação "Salvar não fica travado". É o mesmo caso de Meus acessos na Fase 3c.

## Números

| Verificação | Resultado |
|---|---|
| Vitest | 934 testes (eram 919), todos passam, em 3 rodadas seguidas |
| Cobertura (Vitest) | Linhas 85,08% (8731/10262) · Instruções 82,79% · Ramos 77,07% · Funções 79,16% |
| Catraca | Sem mudança: 85,0 / 82,7 / 77,0 / 79,1. O aumento foi pequeno e, arredondado para baixo, cai nos mesmos valores. |
| Exclusões de cobertura | Sem mudança: só os 2 motores gráficos |
| pytest | 657 passaram |
| tsc, tsx (16 arquivos) e build de produção | ok |
| ESLint | 0 erros e 2 avisos, os mesmos de antes |
| Traduções | 2 chaves novas, cada uma em pt e en; 2 chaves sem uso removidas de pt e en; a varredura de `t('…')` não acha nenhuma chave faltando |
| Sonar | Não rodado (o auditor dispara depois do merge) |

## Fora do escopo (não feito, como manda a tarefa)

- Ir ao login quando falta conexão (o padrão antigo, item 10 das sobras da 3c).
- `curadoria/page.tsx`, `ControleOrientacao` e `recorteImagem.ts`.
- Nenhuma tela de teste nova além das necessárias aos itens.

## Observação sobre os commits

Os 6 primeiros commits de teste foram refeitos **localmente, antes de qualquer envio ao GitHub**. Um nome de variável no meu terminal apagou as linhas de atribuição (Co-Authored-By e Claude-Session) da mensagem. O conteúdo dos arquivos e a ordem dos commits não mudaram. Nada tinha sido enviado, então não houve force push.

Todos os commits têm um arquivo só.
