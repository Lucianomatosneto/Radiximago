# RESULTADO — Sessão x falta de conexão (Fase 3e, 16–17/11/2026)

**Tarefa:** `TAREFA_claude_code_sessao_offline_fase_3e_2026-11-16.md`.
**Branch:** `qualidade/sessao-offline-fase-3e`, criada de `redesign-ui` em 595ccec (merge do PR 77).

**Regras seguidas:**
- teste que falha antes da correção, em commit separado;
- um arquivo por commit;
- só dados inventados;
- nenhuma exclusão nova de cobertura (continuam só os 2 motores gráficos);
- a catraca subiu;
- sem force push e sem mesclar;
- Sonar não rodado.

**Fora do escopo, e não feito:**
- modo offline (nada é guardado no navegador: nem localStorage nem IndexedDB);
- backend;
- renovação de token;
- service worker.

## Resumo em linguagem simples

**Antes:** quando o Wi-Fi oscilava, várias telas mandavam a pessoa para o login, mesmo com a sessão válida. O motivo: a função que pergunta "quem está logado?" dava a mesma resposta ("ninguém") quando o servidor recusava e quando a pergunta nem chegava ao servidor.

**Agora (o padrão dos grandes sistemas):**
1. **Só o servidor desloga.** O login aparece apenas quando o servidor recusa a sessão (401, ou outra recusa 4xx, exatamente como antes).
2. **Sem conexão, ou erro 5xx do servidor:** a pessoa **fica na tela** e vê o aviso padrão "Sem conexão com o servidor. Tente de novo.", anunciado ao leitor de tela, com o botão **"Tentar de novo"**. Nada restrito aparece e nada restrito é pedido ao servidor.
3. **Reconexão automática:** quando o navegador avisa que a internet voltou (evento `online`), a tela confere de novo sozinha. O "ouvinte" desse aviso é removido quando a tela fecha, para não ficar perguntando ao servidor depois.

**Segurança intocada:**
- O 401 continua levando ao login em todas as telas. O 403 continua indo ao "acesso negado" onde já ia.
- Nenhum caso em que hoje o acesso é negado passou a ser permitido.
- Ficou mais restrito em 3 pontos (os defeitos extras abaixo), que hoje pediam ou mostravam coisas antes de confirmar a sessão.

## Números

| Verificação | Resultado |
|---|---|
| Vitest | **1094 testes** (eram 934), todos passam. 3 rodadas com cobertura e 4 sem, depois do último ajuste. |
| Cobertura | Linhas **86,46%** (era 85,08%) · Instruções 84,13% · Ramos 78,02% · Funções 80,31% |
| Catraca (0418491) | Subiu para 86,4 / 84,1 / 78,0 / 80,3 (era 85,0 / 82,7 / 77,0 / 79,1). Nunca baixou. |
| Exclusões de cobertura | Sem mudança: só os 2 motores gráficos |
| pytest | 657 passaram |
| tsc, tsx (16 arquivos) e build de produção | ok |
| ESLint | 0 erros e 2 avisos (os mesmos de antes) |
| Traduções | 1 chave nova, `Comum.tentarDeNovo`: "Tentar de novo" (pt, e44db58) e "Try again" (en, c6d2641). A varredura não acha nenhuma chave faltando. |

## Passo 1 — A função central

| Peça | O que faz | Commit |
|---|---|---|
| `lib/sessao.ts` → `obterSessaoAtual` | Devolve `{ estado: 'valida', sessao }` (200), `{ estado: 'invalida' }` (401 ou outra recusa 4xx, como antes) ou `{ estado: 'sem_conexao' }` (o pedido nem chegou, erro 5xx ou resposta ilegível). | 2156fff |
| (mesmo arquivo) | Uma resposta 200 sem o formato de sessão (sem `id` numérico e `perfil` em texto) também conta como `sem_conexao`. Nada restrito abre e ninguém é deslogado. Isso foi achado pelo próprio teste novo (ex.: um proxy no caminho que devolve uma página qualquer). | c140500 |
| `lib/useVerificarSessao.ts` → `useVerificarSessao` | Peça única usada pelas telas. Faz: `invalida` → login (ou o destino próprio da tela); `sem_conexao` → aviso, "Tentar de novo" e escuta do `online`; trava contra pergunta dupla (clique e volta da internet ao mesmo tempo); ignora a resposta se a tela já fechou. A tela só recebe a sessão depois que o servidor confirma. A tela pode pedir o mesmo aviso quando os DADOS dela não chegam. | 455e917 |
| (mesmo arquivo) → `useSessaoAtual` | Para peças que só mostram ou escondem opções (menu, barra do topo, botões). Devolve a sessão só quando o servidor confirma. Não manda ao login (quem decide é a tela). Sem conexão, confere de novo no `online`, inclusive se a internet voltar enquanto a primeira pergunta ainda está no ar. | 455e917 + efb50c2 |
| `components/AvisoSemConexao.tsx` | O aviso padrão (`role="alert"`) e o botão "Tentar de novo", travado enquanto confere. | a4b79fa |

## Passo 2 — Antes e depois em cada lugar

Foram encontrados **29 pontos** que usavam `obterSessaoAtual`, e mais **2 telas que repetiam o padrão por conta própria**, numa segunda busca de dados.

### Telas (23)

**Antes**, todas faziam: sem resposta da sessão (401 **ou** falta de conexão) → login.
**Depois**, todas fazem: 401 → login, como antes; sem conexão ou 5xx → aviso + "Tentar de novo" + reconexão no `online`; nada restrito na tela enquanto isso.

| Tela | Detalhe | Commit |
|---|---|---|
| Acesso negado | — | 93cb248 |
| Aparelhos da rede | — | 2891c98 |
| Auditoria | — | f5fa1e7 |
| Banco de imagens | Também: as contagens só são pedidas com a sessão confirmada (defeito extra 1) | 62ac98e, 373d6f9 |
| Compartilhadas comigo | — | 800d6f5 |
| Configurações | — | daa621b |
| Curadoria | — | c186db9 |
| Início (dashboard) | Também a busca dos números (defeito extra 2) | 730fd4f |
| Enviar imagem | — | ded304a |
| Grupos | — | 1a0452c |
| Imagens recebidas | — | 30620a7 |
| Integrações | — | aac736e |
| Macros | — | 899daa1 |
| Meus acessos | — | d304fba |
| Minhas imagens | — | 0af7ecc |
| Painel administrativo | — | 60840b2 |
| Pesquisa | — | 7de469d |
| Pranchas recebidas | O 401 continua indo ao login com a volta para a mesma prancha (só número no `?abrir=`) | 58ec357 |
| Relatórios | — | ae7d9ea |
| Segunda opinião | — | 9cce2c0 |
| Sugestões | — | 5214977 |
| Usuários | Também a busca da lista (defeito extra 2) | 42b9c81 |
| Detalhes da imagem | Também: nada restrito montado antes da sessão confirmada (defeito extra 3) | 27d487a |

### Componentes que só mostram ou escondem opções (6)

**Antes:** sem resposta da sessão, escondiam as opções restritas. Isso era seguro, mas eles nunca conferiam de novo.
**Depois:** continuam escondendo (`useSessaoAtual`) e conferem de novo quando a internet volta.

| Componente | Commit |
|---|---|
| Barra do topo (fica "Visitante") | 35110d8 |
| Menu lateral (só os itens de todos) | 0efba59 |
| Grade de categorias (percentual) | 373d6f9 |
| Visualizador sequencial (salvar o giro) | a9b65d1 |
| "Editar depois do envio" | 0bb0f28 |
| Seletor de pessoas (grupos) | 9cd9fff |

## Defeitos extras achados

1. **Banco de imagens pedia as contagens antes de confirmar a sessão.** O pedido saía ao abrir a tela, mesmo sem sessão ou sem conexão. Agora só sai depois da sessão confirmada.
   - Teste que provou: "nada restrito … nem é pedido".
   - Correção: 373d6f9 e 62ac98e.
2. **Duas telas mandavam ao login por conta própria quando a REDE falhava**, numa segunda busca:
   - **Início (dashboard), nos números:** a falha de rede levava ao login; o 5xx também.
   - **Usuários, na lista:** a falha de rede levava ao login; o 5xx dava "acesso negado".

   Agora sem conexão ou 5xx mostram o aviso. O 401 continua indo ao login, e o 403 ao acesso negado. O termo pendente segue o fluxo de antes.
   - Testes: no arquivo de telas, "telas que mandavam ao login por conta própria".
   - Correção: 730fd4f e 42b9c81.
3. **Detalhes da imagem montava partes restritas (anexos, "Editar") antes de confirmar a sessão.** Os anexos da imagem eram pedidos já ao abrir a tela. Agora a tela mostra só "Carregando..." até o servidor confirmar.
   - Teste que provou: "nada restrito … nem é pedido".
   - Correção: 27d487a.
4. **Uma resposta 200 sem formato de sessão era aceita como sessão** (ver Passo 1).
   - Teste: `sessao.test.tsx`.
   - Correção: c140500.

## Testes

| Arquivo | O que confere | Commits |
|---|---|---|
| `sessao.test.tsx` (novo, 31 testes) | Os 3 resultados (200; 401, 403 e 404; rede, 500, 502, 503 e resposta quebrada), o aviso e o botão, a tela de teste com o mesmo caminho das telas reais (200, 401, destino próprio, sem conexão, 503, "Tentar de novo", `online`, nenhum `online` com a sessão já confirmada, ouvinte removido ao fechar, botão travado, clique junto com o `online`, falha nos dados) e o `useSessaoAtual`. | ddccc20 (falhava antes), 0834890, e3d9e64 |
| `sessao-sem-conexao-telas.test.tsx` (novo, 128 testes) | Nas 23 telas: sem conexão e 503 (aviso, fica na tela, nada restrito visível nem pedido), "Tentar de novo", `online` e 401 (login, como antes). Também as 2 telas com busca própria e os componentes. | 7c7be64 (falhava antes), a89af60 |

**O "antes":** os testes do comportamento novo falhavam em todas as telas, e os de 401 já passavam, porque esse é o comportamento de hoje.

**Testes antigos atualizados** (exigiam o comportamento antigo, que mudou de propósito):
- **`usuarios.test.tsx`:** "servidor fora do ar → login" passou a ser "aviso, sem login". O 401 → login continua testado. Commit 6f47ceb.
- **`visualizador-sequencial.test.tsx`:** a simulação de `obterSessaoAtual` passou para o formato novo, sem mudar os testes do giro. Commit fef8eda.

**Ajuste do teste novo** (a89af60): conferir de novo passou a significar "uma pergunta NOVA à sessão", e não "exatamente 2". Depois que a tela abre, peças dela (como o "Editar") também conferem a sessão. O dashboard ganhou uma resposta para os números; sem ela, o teste caía num 404, que, como antes, leva ao login.

**Teste instável corrigido** (e3d9e64): com a cobertura ligada, um teste disparava o `online` antes de a resposta 401 ser processada. Agora ele espera a resposta. Depois disso, 6 rodadas do arquivo e 3 da suíte com cobertura passaram sem falha.

## Mutações (quebrar o código de propósito; o teste precisa falhar)

| Arquivo | Mudança | Resultado |
|---|---|---|
| sessao.ts | falha de rede vira "invalida" (deslogaria) | pega (7 falhas) |
| sessao.ts | 5xx deixa de ser "sem_conexao" | pega (4) |
| sessao.ts | só o 401 vira "invalida" (403 e 404 passariam) | pega (2) |
| sessao.ts | aceita qualquer resposta 200 como sessão | pega (1) |
| useVerificarSessao.ts | sem conexão manda ao login | pega (8) |
| useVerificarSessao.ts | não escuta o `online` | pega (2) |
| useVerificarSessao.ts | não remove o ouvinte ao fechar a tela | pega (4) |
| useVerificarSessao.ts | escuta o `online` mesmo com a sessão confirmada | pega (1) |
| useVerificarSessao.ts | tira a trava contra pergunta dupla | **escapou**; teste novo do "clique + `online` ao mesmo tempo" (0834890) → pega (1) |
| useVerificarSessao.ts | troca a condição do `setSessao` | **equivalente** (ver abaixo) |
| AvisoSemConexao.tsx | aviso sem `role="alert"` | pega (9) |
| macros/page.tsx | tira o aviso da tela | pega (4) |
| dashboard/page.tsx | falha de rede nos números volta a ir ao login | pega (1) |
| GradeCategoriasImagens.tsx | contagens pedidas antes da sessão | pega (2) |
| visualizar/page.tsx | monta as partes restritas antes da sessão | pega (2) |
| pranchas-recebidas/page.tsx | 401 sem o login de volta para a prancha | pega (1) |

**Resultado: 15 de 16 pegas** (14 de primeira, mais 1 depois do teste novo), **mais 1 equivalente**. A tarefa pedia pelo menos 8.

**Por que uma é equivalente:** o resultado "sem conexão" nunca traz sessão. Por isso, trocar a condição de "é válida?" para "não é inválida?" dá exatamente o mesmo efeito, e nenhum teste consegue distinguir as duas.

## Observação sobre os commits

Todos os commits têm um arquivo só. Entre a troca da função central (2156fff) e a migração da última tela (fef8eda), o código **intermediário não compila**. A função mudou de formato antes de cada tela ser adaptada, e a regra de um arquivo por commit não permite mudar tudo de uma vez. O PR final compila (tsc e build ok), e o CI roda sobre ele.
