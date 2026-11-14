# RESULTADO — Cobertura do frontend, Fase 3c (14/11/2026)

Tarefa: `TAREFA_claude_code_cobertura_telas_fase_3c_2026-11-14.md`.
Branch: `qualidade/cobertura-telas-fase-3c`, criada de `redesign-ui` em d01ab78 (já com o PR 75).

Regras seguidas:
- um assunto por commit (cada commit tem um arquivo só);
- em cada defeito, o teste que falha veio antes da correção;
- sem force push e sem mesclar;
- só dados inventados;
- nenhuma exclusão nova de cobertura: a lista continua sendo só os 2 motores gráficos.

## Resumo em linguagem simples

- **Linhas testadas (Vitest):** subiram de **76,58% para 83,14%** (de 7848 para 8522 de 10249). A meta era pelo menos 82%.
- **Testes:** passaram de 686 para **843**. Todos passam, e passaram em 3 rodadas seguidas.
- **Defeitos achados:** 2, os dois de acessibilidade, ambos corrigidos. Em cada um, o teste que falhava veio antes da correção.
- **Mutação:** quebrei o código de propósito em 14 pontos.
  - 12 foram pegas logo de cara.
  - 1 escapou: reforcei o teste e ela passou a ser pega.
  - 1 é "equivalente": é uma proteção dupla, que nenhum teste consegue distinguir. Explico abaixo.
- **Traduções:** em pt e en, nenhuma chave falta nas telas testadas, e nenhum valor fixo ficou sem tradução.
- **Exclusões de cobertura:** nenhuma nova. Continuam só os 2 motores gráficos, conforme a decisão de 14/11.

## Passo 1 — Antes: linhas sem teste por área (`frontend/src`)

| Área | Linhas sem teste | Total de linhas | Cobertura antes | Cobertura depois | Linhas sem teste depois |
|---|---|---|---|---|---|
| Telas (`app/`) | 818 | 3491 | 76,6% | **84,2%** | 551 |
| Componentes (`components/`) | 1304 | 4916 → 4917 | 73,5% | **79,4%** | 1015 |
| Bibliotecas (`lib/`) | 278 | 1827 | 84,8% | **91,2%** | 161 |
| Traduções (`i18n/`) | 0 | 14 | 100% | 100% | 0 |

**Observação sobre `i18n/`:** a tarefa citava "14 linhas, 0%". Esses 14 arquivos já estavam 100% cobertos desde a Fase 3b (teste `i18n.test.tsx`). Não havia nada a fazer.

A coluna de componentes mudou de 4916 para 4917 linhas porque a correção do Topbar acrescentou uma linha (`useId`).

### Os maiores sem teste no início (ordem de prioridade)

A prioridade seguiu a tarefa. Primeiro, o que mexe com:
- segurança (senha, sessões, saída);
- permissões (menu por perfil, telas só do administrador);
- dados de pessoas (meus acessos, foto do perfil);
- microfone (escuta da curadoria por voz);
- envio de imagem e compartilhamento.

| Arquivo | Linhas sem teste | % antes | Por que entrou (ou não) |
|---|---|---|---|
| app/curadoria/page.tsx | 139 | 76,1% | Ficou para depois: já tem 76% e testes próprios. |
| components/Topbar.tsx | 107 | 0% | **Entrou:** foto do perfil (dado da pessoa), sair. |
| lib/escutaContinua.ts | 106 | 0% | **Entrou:** microfone (curadoria por voz). |
| components/curadoria/ControleOrientacao.tsx | 86 | 0% | Ficou para depois: controle visual de girar e espelhar. |
| components/Sidebar.tsx | 70 | 0% | **Entrou:** o que cada perfil vê. |
| lib/vozCuradoria.ts | 60 | 91,5% | Já bem coberto. |
| app/pranchas-recebidas/page.tsx | 59 | 0% | **Entrou:** link de e-mail com volta após o login. |
| components/GradeCategoriasImagens.tsx | 59 | 0% | Ficou para depois: só mostra. |
| components/compartilhar/AnotacoesCompartilhadas.tsx | 55 | 0% | Ficou para depois. |
| components/termos/TextoTermos.tsx | 55 | 11,3% | Ficou para depois: texto fixo. |
| app/meus-acessos/page.tsx | 54 | 0% | **Entrou:** sessões abertas da pessoa. |
| app/aparelhos/page.tsx | 53 | 49,5% | Ficou para depois. |
| components/compartilhar/ResponderCompartilhamento.tsx | 53 | 0% | **Entrou:** envio de imagem a outra pessoa. |
| app/macros/page.tsx | 52 | 54,0% | Ficou para depois. |
| app/configuracoes/page.tsx | 51 | 0% | **Entrou:** tela só do administrador. |
| lib/recorteImagem.ts | 49 | 0% | Ficou para depois: recorte em canvas. |
| app/redefinir-senha/page.tsx | 43 | 0% | **Entrou:** segurança (senha). |
| components/ajuda/CentralAjuda.tsx | 40 | 0% | **Entrou** junto com o Topbar: ajuda filtrada por perfil. |
| app/confirmar-email/page.tsx | 38 | 0% | **Entrou:** segurança (cadastro). |
| app/esqueci-senha/page.tsx | 24 | 0% | **Entrou:** segurança (senha). |

## Passo 2 — Testes novos (10 arquivos em `auditoria/ferramentas/frontend-testes/telas/`)

| Arquivo de teste | O que cobre | Linhas sem teste: antes → depois |
|---|---|---|
| topbar.test.tsx | Barra do topo, trilha de navegação e Central de ajuda | Topbar 107 → 0 · CentralAjuda 40 → 0 · TrilhaNavegacao 20 → 0 |
| sidebar.test.tsx | Menu lateral | 70 → 1 |
| escuta-continua.test.tsx | Microfone da curadoria por voz | 106 → 0 |
| senha-e-confirmacao.test.tsx | Esqueci minha senha, Redefinir senha, Confirme seu e-mail e o leitor do código do link | 24 → 0 · 43 → 2 · 38 → 0 · codigoDoLink 10 → 0 |
| meus-acessos.test.tsx | Meus acessos | 54 → 0 |
| pranchas-recebidas.test.tsx | Pranchas recebidas | 59 → 0 |
| configuracoes.test.tsx | Configurações | 51 → 0 |
| responder-compartilhamento.test.tsx | Responder a quem compartilhou | 53 → 0 |

O que os testes conferem:
- **Estados:** carregando, vazio, erro do servidor (com e sem motivo) e sem conexão.
- **Sessão vencida (401):** a tela leva ao login.
- **Envio:** os botões ficam travados enquanto o pedido está em andamento. Os testes seguram a resposta do servidor para conferir e provam que um segundo clique ou Enter não manda um pedido duplo.
- **Acessibilidade:**
  - mensagens de erro anunciadas (`role="alert"`);
  - campos achados pelo rótulo;
  - janelas com papel de janela (`dialog`) e com nome;
  - `aria-expanded` e `aria-current` corretos.
- **Permissões por perfil:**
  - menu lateral: o item certo para cada um dos 6 perfis;
  - antes de saber o perfil, nada restrito aparece;
  - Central de ajuda: o estudante não vê ajuda de curadoria;
  - Configurações: só o administrador entra.
- **Segurança:**
  - o código dos links de e-mail sai da barra de endereço assim que é lido (`#token=` e o antigo `?token=`);
  - "Pranchas recebidas" só aceita número no `?abrir=` ao montar o endereço de volta do login;
  - "Sair" sempre recarrega a página no login, mesmo sem conexão;
  - abrir o link de confirmação não confirma nada sem a senha.
- **Microfone:** o módulo de escuta não manda nada pela rede (só entrega o trecho de áudio à tela) e, ao parar, fecha o microfone.

Peças simuladas, com o motivo:
- **menu, topo e login em duas etapas:** cada um já tem teste próprio;
- **microfone, gravador e medidor de volume:** o navegador de teste não tem áudio;
- **`window.location.replace`:** o navegador de teste não navega.

## Defeitos achados e corrigidos (o teste que falha veio antes)

| # | Arquivo | O que falhava | Teste que provou (commit) | Correção (commit) |
|---|---|---|---|---|
| 1 | `frontend/src/components/Topbar.tsx` | A janela "Meu perfil" era só uma caixa desenhada (`div`). O leitor de tela não sabia que uma janela tinha aberto, nem o nome dela. | `topbar.test.tsx`, "e uma janela de verdade para o leitor de tela" (7ece222). Antes: 1 falha, "Unable to find role dialog name Meu perfil". | ca142c0: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` no título. Depois: 32 de 32 passam. |
| 2 | `frontend/src/components/compartilhar/ResponderCompartilhamento.tsx` | O erro ao responder (429, outro erro, sem conexão) aparecia só como texto vermelho. O leitor de tela não anunciava. | `responder-compartilhamento.test.tsx`, "falha (…): o erro e anunciado" (29ace78). Antes: 3 falhas, "Unable to find role=alert". | 312b0d0: `role="alert"`. Depois: 16 de 16 passam, e a tela "Compartilhadas comigo" continua passando. |

Nenhuma regra de negócio foi alterada. Os dois defeitos foram corrigidos só com atributos de acessibilidade.

## Mutações (quebrar o código de propósito; o teste precisa falhar)

Cada mudança foi aplicada, o teste foi rodado e o arquivo foi restaurado com `git checkout`.

| Arquivo | Mudança | Resultado |
|---|---|---|
| Topbar.tsx | limite da foto de 5 MB vira 10 MB | pega (1 falha) |
| Topbar.tsx | "Salvar foto" não trava durante o envio | pega (1 falha) |
| Sidebar.tsx | "Auditoria" aparece também para o curador | pega (1 falha) |
| Sidebar.tsx | itens restritos aparecem antes de saber o perfil | pega (1 falha) |
| escutaContinua.ts | fala mínima de 150 ms vira 50 ms | **escapou**; teste reforçado (663c8b3) → pega (1 falha) |
| escutaContinua.ts | pausa deixa de bloquear o envio | pega (1 falha) |
| codigoDoLink.ts | o código não é apagado da barra de endereço | pega (3 falhas) |
| redefinir-senha | não confere se as senhas são iguais | pega (1 falha) |
| confirmar-email | link bloqueado mantém o formulário | pega (1 falha) |
| meus-acessos | "Encerrar" aparece também no aparelho atual | pega (2 falhas) |
| meus-acessos | tira a trava `if (ocupado) return` | **equivalente** (ver abaixo) |
| pranchas-recebidas | aceita texto, e não só número, no `?abrir=` | pega (2 falhas) |
| configuracoes | aviso de ambiente só em "development" | pega (1 falha) |
| ResponderCompartilhamento | resposta enviada sem tirar os espaços | pega (2 falhas) |

**Resultado: 13 de 14 pegas** (12 de primeira, mais 1 depois de reforçar o teste). A tarefa pedia pelo menos 10.

**Mutação equivalente:** em Meus acessos existem duas proteções contra o pedido duplo:
1. os botões ficam travados durante o pedido (isso o teste confere);
2. a linha `if (ocupado) return` dentro da função.

Com os botões travados, nenhuma ação da pessoa chega à segunda proteção. Por isso, tirar essa linha não muda nada que um teste consiga observar. Mantive a linha: é proteção extra e não faz mal.

## Passo 3 — Catraca e verificação

| Verificação | Resultado |
|---|---|
| Vitest | 843 testes, todos passam, em 3 rodadas seguidas |
| Cobertura (Vitest) | Linhas **83,14%** (8522/10249) · Instruções 80,92% · Ramos 74,66% · Funções 77,35% |
| Catraca (`vitest.config.ts`, f7751c6) | 83,1 / 80,9 / 74,6 / 77,3 (antes: 76,5 / 74,7 / 69,6 / 72,2). Arredondada para baixo; nunca baixou. |
| Exclusões de cobertura | Sem mudança: só `motorCenaLogin.ts` e `motorMapaMundi.ts` |
| pytest | 657 passaram |
| tsc, tsx (16 arquivos) e build de produção | ok |
| ESLint | 0 erros e 2 avisos, os mesmos de antes |
| Traduções pt/en | Nenhuma chave faltando: varredura do `t('…')` no código + comparação das seções das telas testadas |
| Sonar | Não rodado (o auditor dispara depois do merge) |

**Observação sobre as instruções:** a cobertura de instruções varia 0,01 ponto entre uma rodada e outra (80,93% / 80,92%). A causa é um trecho que depende de tempo. A catraca em 80,9 cobre essa variação.

## O que ficou de fora e por quê

- **Ficaram para a próxima fase:**
  - `curadoria/page.tsx` (já está em 76%);
  - `ControleOrientacao`, `GradeCategoriasImagens`, `TextoTermos`, `MiniaturaImagem` e `SeletorLayout` (só mostram coisas, sem regra de negócio);
  - `recorteImagem.ts` (desenho em canvas);
  - os restos de `aparelhos`, `macros`, `auditoria` e `solicitar-acesso`;
  - `AnotacoesCompartilhadas`.

  A meta foi atingida com folga. Preferi priorizar segurança, permissões, dados de pessoas e microfone.
- **Sobras novas** (listadas, não corrigidas, porque não é defeito comprovado de regra de negócio, ou porque está fora do escopo):
  1. **Esqueci minha senha e Redefinir senha:** a mensagem de sucesso não tem `role="status"` (o leitor de tela não anuncia). Confirmar e-mail já tem.
  2. **Responder compartilhamento:** "Resposta enviada" também não é anunciada. Nos formatos de ícone, o sucesso aparece só como "✓", e o nome do botão não muda.
  3. **Meus acessos:** todos os botões "Encerrar" têm o mesmo nome. Para quem usa leitor de tela, não dá para saber qual aparelho cada um encerra.
  4. **Menu lateral aberto:** o `<aside>` não tem nome acessível (o recolhido tem: "Navegação").
  5. **Traduções sem uso:** `Sidebar.itens.pesquisaAvancada` e `Sidebar.menuRecolhidoDica` não são usadas no código.
  6. **Comentário desatualizado em `confirmar-email/page.tsx`:** diz que "professor e pesquisador já entram". No servidor, só o estudante entra direto (`PERFIS_APROVACAO_AUTOMATICA = {"estudante"}`). O texto mostrado na tela está correto; só o comentário está errado.
  7. **Várias telas** (Meus acessos, Configurações e outras) mandam ao login também quando o problema é falta de conexão. O motivo: `obterSessaoAtual` devolve "sem sessão" nos dois casos. É um padrão antigo, comum a todo o sistema.

## Commits

Todos os commits têm um arquivo só. Os 2 defeitos estão em pares "teste que falha" → "correção".
