# Resultado: testes de telas, Fase 1 (13/11/2026)

**Ramo:** `qualidade/cobertura-telas-fase-1`, PR #70 para `redesign-ui` (base `f794f56`, já com o #69). Quem junta é o Luciano ("Create a merge commit").

## Em uma frase
As 5 maiores telas do sistema agora têm testes automáticos: **Curadoria, Pesquisa, Usuários, Minhas imagens e Segunda opinião**. A cobertura do frontend passou de 14,77% para **33,27%** das linhas. Os testes acharam **2 defeitos reais**, que **não foram corrigidos** e aguardam a sua decisão (seção 6).

## 1. Números por arquivo [medido]

| Tela | Linhas antes | Linhas depois | Ramos (if/else) | Testes |
|---|---|---|---|---|
| `app/curadoria/page.tsx` | 0 de 581 (0%) | 442 de 581 (**76,1%**) | 339 de 513 (66%) | 34 |
| `app/pesquisa/page.tsx` | 0 de 295 (0%) | 276 de 295 (**93,6%**) | 248 de 310 (80%) | 23 |
| `app/usuarios/page.tsx` | 0 de 319 (0%) | 289 de 319 (**90,6%**) | 222 de 254 (87%) | 41 |
| `app/minhas-imagens/page.tsx` | 0 de 196 (0%) | 188 de 196 (**95,9%**) | 156 de 192 (81%) | 25 |
| `app/segunda-opiniao/page.tsx` | 0 de 209 (0%) | 196 de 209 (**93,8%**) | 183 de 217 (84%) | 25 |

- **Meta de 50% por arquivo:** atingida nas 5 telas.
- **Contagem de linhas:** o Vitest conta as linhas de um jeito um pouco diferente do Sonar (ex.: Curadoria 581 aqui, 652 no Sonar). A porcentagem fica parecida.
- **Bônus:** como as telas usam peças de verdade (filas, painéis do parecer, menus, confirmações), outros arquivos também ganharam cobertura. Exemplos:
  - `PainelParecer` 77 de 100 linhas;
  - `PainelDevolvida` 55 de 73;
  - `BuscaTermos` 48 de 71;
  - `MenuSalvar` 43 de 48;
  - `GuiaLaudo` 25 de 33.

**Frontend total [medido, Vitest]:**

| | Fase 0 | Fase 1 |
|---|---|---|
| Linhas | 14,77% | **33,27%** (3.638 de 10.934) |
| Ramos | 12,20% | 30,15% |
| Funções | 11,34% | 30,41% |

**Total do Sonar (frontend + backend):** **não medido aqui** (o sonarcloud.io é bloqueado no ambiente de trabalho). Hipótese: com cerca de 1.390 linhas a mais cobertas num total de 20.043, algo perto de **+7 pontos**, ou seja, cerca de 38–39%. Confirmar no painel depois do merge.

## 2. O que cada tela testa
Em todas as telas, cada teste confere algo visível ou o que foi enviado ao servidor:
- **Permissão por perfil:**
  - sem login: vai para o login e **não** pede dados;
  - perfil sem acesso: vai para "acesso negado";
  - perfis permitidos: entram.
- **Estados:** carregando, lista vazia, lista com dados.
- **Erros:** recusa com motivo (a mensagem do servidor aparece), recusa sem motivo (mensagem padrão), servidor fora do ar e sessão expirada (401, vai para o login).

O que é próprio de cada tela:

| Tela | Principais regras conferidas |
|---|---|
| **Curadoria** | A 1ª imagem da fila abre sozinha e cria a ficha. "Salvar" grava e passa para a próxima. **Conferência antes de aprovar:** sem anonimização validada, a aprovação fica **bloqueada**. Só com avisos, "Aprovar mesmo assim" salva e depois aprova. Descartar e pedir segunda opinião exigem **motivo**. Erro 422 mostra o campo recusado. **Professor:** só a fila dele, "Enviar ao curador" no lugar de Aprovar, sem ver as segundas opiniões dos curadores. "Aguardando sua decisão": aprovar só depois de confirmar a anonimização; descartar com motivo. O guia "Como laudar" abre sozinho só na 1ª vez |
| **Pesquisa** | Os filtros escolhidos viram o **endereço exato** da pesquisa (gênero, tipo, qualidade, idades, dentes e modo "todos/qualquer um"). Com 1 dente só, o modo não vai. Busca por termos acha **sinônimo** do vocabulário. Servidor ocupado (503): a tela **repete sozinha 2 vezes** e oferece "Tentar de novo". Filtros vindos no endereço (links do Banco de imagens, inclusive os antigos) pesquisam sozinhos. "Salvar em Minhas imagens" avisa falha parcial |
| **Usuários** | Só o **administrador** entra. Na própria linha **não** há Bloquear/Excluir. Filtros e cartões por perfil. Pedido de quem já tem conta **não** pode ser aprovado. Rejeitar exige motivo. Senha curta é recusada pela tela. Bloquear pede confirmação com nome e e-mail. **Redefinir as 2 etapas só libera com DOIS meios de conferência e a confirmação do procedimento (ASVS 6.4.4).** Excluir pede confirmação |
| **Minhas imagens** | Qualquer pessoa logada entra; a seção de envios muda para equipe. Tirar da lista pede confirmação; se o servidor recusar no meio, só as já apagadas saem. **E-mail:** confirmação antes de enviar, teto de **10** imagens (o mesmo do servidor) e tomografia (série de cortes) não vai por e-mail |
| **Segunda opinião** | Só curador e administrador entram. Revisor: avalia item por item; a anotação só libera com explicação; o envio leva exatamente o valor proposto e a nota. **Servidor falhou (500): avisa que NÃO foi enviado e "Tentar de novo" reenvia o mesmo parecer, sem repetir sozinho.** Pedido feito por mim mesmo: só leitura. Quem pediu: acrescentar/dispensar cada anotação, aprovar (só depois de conferir a anonimização) ou descartar com motivo. O endereço `?review=&aba=devolvidas` abre direto |

## 3. Prova de que os testes falham quando devem (mutação) [medido]
Cada regra foi quebrada de propósito, o teste rodou e a mudança foi desfeita com `git checkout`.

| Tela | Regra quebrada | Testes que falharam |
|---|---|---|
| Segunda opinião | Estudante passa a entrar | 1 |
| Segunda opinião | Erro 500 deixa de oferecer "Tentar de novo" | 1 |
| Minhas imagens | Teto de e-mail sobe de 10 para 20 | 1 |
| Minhas imagens | "Cancelar" na confirmação passa a enviar | 1 |
| Usuários | Redefinir 2 etapas libera com 1 meio só | 2 |
| Usuários | Curador passa a entrar | 2 |
| Usuários | A própria linha ganha Bloquear/Excluir | 1 |
| Pesquisa | Modo dos dentes vai com 1 dente só | 1 |
| Pesquisa | Servidor ocupado: repete só 1 vez (em `lib/repetir.ts`) | 1 |
| Curadoria | Aprovar pula a conferência | 4 |
| Curadoria | Descartar/2ª opinião sem motivo | 2 |
| Curadoria | Professor passa a ver as segundas opiniões dos curadores | 1 |

**Resultado: 12 de 12 mutações detectadas.** Uma 13ª tentativa foi um controle mal montado (arquivo errado). Não chegou a ser aplicada e não conta.

**Estabilidade:** 3 rodadas seguidas, 204/204 em todas. Nenhum aviso nem erro solto no log.

## 4. O que foi simulado e o que NÃO foi coberto (e por quê)

**Simulados**, isto é, trocados por um substituto simples (ficam para a Fase 2 ou para o teste de navegador):
- visualizador OHIF (moldura de outro site);
- marcação e pintura (desenho em *canvas*);
- voz (microfone);
- giro da imagem;
- miniaturas (imagem real do servidor);
- visualizador em sequência;
- Sidebar e Topbar;
- seção "Meus envios";
- **na Curadoria, a coluna da ficha** (`ColunaFichaCuradoria`), trocada por uma ficha simplificada com os campos que a conferência usa. A lista da conferência é a de verdade.

**Não coberto:**

| Tela | O que ficou de fora | Por quê |
|---|---|---|
| Curadoria (24%) | Tela cheia de verdade; teclas ← → Enter na etapa "Aprovar"; tecla M; giro gravado; macros pela voz; banner da segunda opinião | Dependem do navegador de verdade, da voz ou dos componentes simulados; ficam para a Fase 2 e para o Playwright |
| Pesquisa (6%) | Cálculo do tamanho dos quadrados e barra que "gruda" ao rolar | Medidas de tela que o navegador simulado não tem |
| Usuários (9%) | Cartão "Solicitações pendentes" rolando até a lista; alguns caminhos "sem conexão" | Alguns deles são o **defeito 1** (abaixo) |
| Minhas imagens e Segunda opinião (4–6%) | "Sair" e tela cheia | O navegador simulado não troca de página nem entra em tela cheia |

## 5. Mudanças nesta fase
- **Arquivos novos de teste:**
  - `telas/curadoria.test.tsx`;
  - `telas/pesquisa.test.tsx`;
  - `telas/usuarios.test.tsx`;
  - `telas/minhas-imagens.test.tsx`;
  - `telas/segunda-opiniao.test.tsx`.
- **`telas/apoio/preparar.ts` (novo):** peças só visuais que o navegador simulado não tem (rolar, tema, tela cheia, "está visível?"), preparadas para todos os testes. As miniaturas não pedem imagens.
- **`telas/apoio/montar.tsx`:** a rota terminada em `*` vale para todo endereço que começa igual (usado nas pesquisas com filtros).
- **`vitest.config.ts`:** usa o `preparar.ts`, e a **catraca subiu**: linhas 33,2%, comandos 32,7%, ramos 30,1%, funções 30,4%.
- **`frontend/testes/LEIA-ME.md`:** o guia ganhou essas novidades.
- **Não mudaram:**
  - nenhuma linha de `frontend/src` (código de produção);
  - nenhuma dependência nova;
  - workflows;
  - `matriz_asvs.csv`.

## 6. Defeitos reais encontrados — NÃO corrigidos, aguardam decisão do Luciano

**Defeito 1. Usuários, servidor fora do ar sem aviso.**
- **Onde:** em 5 ações:
  - Excluir;
  - Aprovar pedido;
  - Rejeitar pedido;
  - "Ver usuários excluídos";
  - a busca dos pedidos de acesso ao abrir a tela.
- **O que acontece:** se o servidor não responde, **nenhuma mensagem aparece**. O botão volta ao normal e o erro "escapa" (promessa sem tratamento). Confirmado num teste de diagnóstico, não incluído no PR.
- **Comparação:** nas outras ações da mesma tela (bloquear, editar, criar, redefinir 2 etapas) o aviso aparece.
- **Correção sugerida:** pequena, só no frontend, no mesmo padrão já usado na tela: `catch` com a mensagem de erro. Os testes desses caminhos entrariam junto.

**Defeito 2. Acessibilidade (WCAG 1.3.1 / 4.1.2).**
- **Onde:** nas janelas "Editar usuário" e "Novo usuário" (Usuários) e na janela de **Motivo** (Curadoria: descartar e segunda opinião).
- **O que acontece:** os rótulos ("Nome", "E-mail", "Senha", "Motivo"...) **não estão ligados** aos campos, porque falta `htmlFor`/`id`. Quem usa leitor de tela ouve "caixa de texto" sem saber qual é.
- **Também:** as janelas de Usuários não têm nome acessível.
- **Hoje nos testes:** eles acham esses campos pela ordem, com um comentário explicando.
- **Correção sugerida:** pequena, só atributos, sem mudança visual.

**Observação (não é defeito):** a grade mostra "0 marcação do curador" no singular. É a regra do português no padrão internacional (CLDR), que trata 0 como singular. Mudar exigiria uma frase própria para zero. Fica a seu critério.

## 7. Verificação [medido]
- **Local:**
  - Vitest 8 arquivos e 204 testes, cerca de 34 s (com a cobertura, cerca de 35 s);
  - `pytest` 657 passed;
  - `tsc` ok;
  - `npx tsx testes/*.teste.ts` 16 de 16;
  - `next build` ok;
  - ESLint 2 avisos (os mesmos de antes).
- **GitHub, PR #70: 5 de 5 checks verdes.**
  - Testes no navegador: **16 passed** (33,1 s);
  - Qualidade: Ruff **4**, Mypy **72**;
  - backend e segurança: ok.
- **Tempo do CI:**
  - passo do Vitest: **7 s → 19 s** (+12 s);
  - job "Testes do frontend": 1 min 02 s (PR #69) → 1 min 11 s (+9 s, dentro da variação normal do GitHub).

## 8. Próximo passo (aguarda aprovação)
1. **Decisão do Luciano sobre os defeitos 1 e 2.** Sugestão: corrigir num PR pequeno separado, com os testes dos caminhos que hoje faltam.
2. **Fase 2:** os componentes grandes, começando pela `ColunaFichaCuradoria` (simulada nesta fase). Elementos de *canvas*, câmera e microfone serão simulados, e o relatório dirá o que fica só para o Playwright.
