# Resultado: testes de telas, Fase 0 (13/11/2026)

**Ramo:** `qualidade/cobertura-telas`, PR #69 para `redesign-ui` (base `ccd5b6f`). Quem junta é o Luciano ("Create a merge commit").

## Em uma frase
As telas do frontend agora podem ser testadas automaticamente. O teste monta a tela de verdade num "navegador simulado", troca o servidor por respostas inventadas e confere o que a pessoa veria. A tela do Vocabulário foi coberta por inteiro, como modelo.

## 1. Ferramenta escolhida
**Vitest** (já usado no projeto) + **React Testing Library** + **user-event** + **jsdom**.

| Peça | Para que serve, em linguagem simples |
|---|---|
| Vitest | Roda os testes e mede a cobertura (já existia) |
| jsdom | Um "navegador de mentira" dentro do teste, sem abrir janela |
| React Testing Library | Monta a tela e acha os elementos como uma pessoa acha: pelo texto e pelo papel (botão "Promover", campo "Termo") |
| user-event | Simula clique e digitação de verdade, inclusive o Enter |

- **Servidor simulado:** um `fetch` falso de cerca de 60 linhas, em `telas/apoio/montar.tsx`. O MSW (biblioteca maior) **não foi necessário**.
- **Onde ficam os testes:** em `auditoria/ferramentas/frontend-testes/telas/`, **fora** do `frontend`.
  - As ferramentas de teste não entram no site publicado.
  - O `tsc` e o `next build` do frontend não mudam.
  - O `npm run cobertura`, o `ajustar-lcov.mjs` e o `frontend/coverage/lcov.info` (caminhos `frontend/src/...`) continuam iguais [medido: 168 arquivos no lcov, antes e depois].
- **Detalhe técnico:** o teste usa a **mesma cópia** do React e do next-intl que o frontend usa (configurado no `vitest.config.ts`). Sem isso, a tela quebraria com "dois Reacts".

## 2. Dependências novas (só de teste, versões fixas)

| Pacote | Versão | Publicada em | Licença |
|---|---|---|---|
| `@testing-library/react` | 16.3.3 | 27/08/2026 | MIT |
| `@testing-library/dom` | 10.4.2 | 13/09/2026 | MIT |
| `@testing-library/user-event` | 14.6.8 | 13/10/2026 | MIT |
| `jsdom` | 30.1.3 | 15/10/2026 | MIT |

- **Por que essas versões:** foram escolhidas as com pelo menos 4 semanas de publicadas. Ficaram de fora o user-event 14.6.9/14.6.10 (muito recentes) e o jsdom 31, que além de recente exige Node 22.22.2 ou mais.
- **Pacotes que vieram junto:** 53, somando cerca de **42 MB**. Licenças:
  - MIT: 43;
  - Apache-2.0: 2;
  - BSD-2-Clause: 2;
  - BSD-3-Clause: 1;
  - ISC: 1;
  - **MIT-0: 2, BlueOak-1.0.0: 1 e CC0-1.0: 1.** Estas três estão fora da lista citada na tarefa, mas são **ainda mais permissivas** que a MIT (não exigem nem citar o autor). Não há patente, nem cláusula restritiva.
  - Todas são só de teste e não vão para o sistema publicado.
- **`npm audit`:** **0 vulnerabilidades** [medido, depois de `npm ci` limpo].

## 3. Tela modelo: `app/vocabulario/page.tsx` [medido]

| | Linhas | Ramos (if/else) | Funções |
|---|---|---|---|
| Antes | 0 de 143 (**0%**) | 0 de 114 | 0 de 49 |
| Depois | 143 de 143 (**100%**) | 96 de 114 (**84%**) | 47 de 49 |

**29 testes** em `telas/vocabulario.test.tsx`. Cada um confere algo que a pessoa vê ou que a tela envia:

| Grupo | O que é conferido |
|---|---|
| Permissão por perfil | Sem login: vai para `/login`. Estudante: vai para "acesso negado". Nos dois casos, **nenhum** pedido do vocabulário é feito. Curador e administrador entram |
| Carregar | "Carregando..." enquanto o servidor não responde. Listas vazias com seus avisos. Lista com dados: contagens e notas ("2 ficha(s) ainda não aprovada(s)", "+1 imagem encontrada pelo texto"). Termo inativo com o botão "Reativar" |
| Erro do servidor | Erro 500 e servidor fora do ar: "Não foi possível carregar o vocabulário." |
| Promover a termo | O formulário vem preenchido. O botão só libera com 2 letras ou mais. "Cancelar" não envia nada. "Criar termo" envia exatamente o que foi digitado: os sinônimos vazios são descartados. Depois aparece o aviso, abre a conferência e só as fichas que ficaram marcadas são ligadas |
| Recusas | Com motivo: mostra o motivo do servidor. Sem motivo legível: "Não foi possível salvar." Sem conexão: "Sem conexão com o servidor. Tente de novo." Em todos os casos, o formulário ou a conferência **continua aberto** |
| Sinônimos | Enter acrescenta e limpa o campo. Só espaços não envia nada. O X remove **só depois** que o servidor confirma. Em caso de erro, o sinônimo e o texto digitado ficam |
| Editar termo | "Desativar" vira "Reativar". As caixas "Opção na Pesquisa avançada" e "Opção nas curadorias" enviam cada escolha. Em caso de erro, o termo fica como estava |

**O que não foi coberto (18 ramos, 2 funções):**
- o aviso verde some sozinho depois de 4 segundos;
- a atualização silenciosa dos termos livres quando ela falha;
- alguns valores "se vier vazio, usar 0".

São detalhes sem efeito visível importante.

**Nenhum defeito real foi encontrado nesta tela.**

## 4. Prova de que os testes falham quando devem (mutação) [medido]
Cada regra foi quebrada de propósito, o teste rodou e a mudança foi desfeita com `git checkout`.

| Regra quebrada | Testes que falharam |
|---|---|
| Estudante passa a entrar na tela | 1 ("estudante: vai para acesso negado") |
| Termo de 1 letra passa a ser aceito | 1 |
| A tela esconde o motivo que o servidor deu | 5 |
| "Ligar" leva também as fichas desmarcadas | 1 |
| Envia sinônimo vazio | 1 |
| O sinônimo removido continua na tela | 1 |

**Resultado: 6 de 6 mutações detectadas.**

## 5. Catraca de cobertura (não pode cair sem o GitHub avisar)
- **Mínimos no `vitest.config.ts`** (`coverage.thresholds`), iguais ao valor medido agora: linhas 14,7%, comandos 15,2%, ramos 12,1%, funções 11,3%.
- **Prova:** com o teste da tela retirado, a cobertura voltou a 13,43%, o Vitest acusou "does not meet global threshold" e terminou com **erro (código 1)**. Com o teste de volta, terminou com 0.
- **Mudança de workflow (aviso):** em `testes-frontend.yml`, o passo do Vitest passou a rodar com `--coverage`. Sem isso, a catraca nunca seria conferida nos PRs. Nada mais desse workflow mudou.
- **`sonarcloud.yml` não foi alterado.** Lá o passo de cobertura já é `continue-on-error`, então a catraca não bloqueia o Sonar. Quem bloqueia o PR é o "Testes do frontend".
- **Regra para as próximas fases:** a cada PR que acrescentar testes, subir esses mínimos para o novo valor medido.

## 6. Frontend total [medido, Vitest local e GitHub]

| | Antes | Depois |
|---|---|---|
| Linhas | 13,43% (1.469 de 10.934) | **14,77%** (1.616 de 10.934) |
| Ramos | 11,21% | 12,20% |
| Funções | 9,76% | 11,34% |

- O teste também cobriu mais de `lib/sessao.ts` (de 6 para 10 de 11 linhas), porque a tela consulta o login de verdade, com o servidor simulado.
- **Total do SonarCloud (frontend + backend):** só aparece depois da análise da `redesign-ui` com este PR juntado. **Não medido aqui**: o sonarcloud.io é bloqueado no ambiente de trabalho.
- **Hipótese (não medido):** o Vocabulário tem 161 linhas sem teste no Sonar, de um total de 20.043. Por isso deve somar **cerca de 0,8 ponto**: de 31,0% para perto de 31,8%.

## 7. Verificação [medido]
- **Local:**
  - Vitest com 3 arquivos e 56 testes (27 de antes + 29 novos), em cerca de 7 s com a cobertura;
  - `pytest` 657 passed;
  - `tsc` ok;
  - `npx tsx testes/*.teste.ts` 16 de 16;
  - `next build` ok;
  - ESLint com 2 avisos (os mesmos de antes).
- **GitHub, PR #69: todos os checks verdes.**
  - Testes no navegador: **16 passed** (25,3 s);
  - Testes do backend: ok;
  - Qualidade: Ruff com **4**, Mypy com **72** (nenhum arquivo Python mudou);
  - Segurança: ok.
- **Tempo do CI:**
  - passo do Vitest: **3 s → 7 s** (+4 s, com a cobertura e os testes de tela);
  - job "Testes do frontend": 1 min 14 s no PR #67 e 1 min 05 s agora. A diferença fica dentro da variação normal do GitHub.
  - **Aumento efetivo: cerca de 4 segundos.**

## 8. Arquivos
- `auditoria/ferramentas/frontend-testes/package.json` e `package-lock.json`: as 4 dependências, com versões fixas.
- `auditoria/ferramentas/frontend-testes/vitest.config.ts`: jsdom para `telas/`, cópia única do React/next-intl, endereço fictício do servidor e catraca.
- `auditoria/ferramentas/frontend-testes/telas/apoio/montar.tsx`: `montarTela` (traduções reais em português) e `servidorFalso` (anota cada pedido).
- `auditoria/ferramentas/frontend-testes/telas/vocabulario.test.tsx`: os 29 testes.
- `frontend/testes/LEIA-ME.md`: guia curto do padrão.
- `.github/workflows/testes-frontend.yml`: `--coverage` no passo do Vitest.
- **Não alterados:** `matriz_asvs.csv`, código de produção (nenhuma linha de `frontend/src` mudou), `sonarcloud.yml`.

## 9. Próximo passo (aguarda aprovação do Luciano)
**Fase 1**, as 5 maiores telas, na ordem:
1. `curadoria`;
2. `pesquisa`;
3. `usuarios`;
4. `minhas-imagens`;
5. `segunda-opiniao`.

**Ponto de atenção [hipótese]:** a `curadoria` e a `pesquisa` usam componentes grandes (pintura, voz, visualizador). Na Fase 1 esses componentes serão simulados, e o teste deles fica para a Fase 2. A meta de 50% por tela continua possível.
