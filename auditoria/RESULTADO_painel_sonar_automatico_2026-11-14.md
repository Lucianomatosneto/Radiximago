# Resultado — números do Sonar publicados automaticamente (14/11/2026)

**Tarefa:** `TAREFA_claude_code_painel_sonar_automatico_2026-11-14.md`.
**Branch / PR:** `auditoria/painel-sonar-automatico` → `redesign-ui`.
**Código do Radix alterado:** nenhum.

## 1. Em linguagem simples

- O painel de acompanhamento consegue ler o GitHub, mas não o SonarCloud.
- Agora a rotina semanal, que roda dentro do GitHub e tem acesso ao Sonar, busca os números e grava o arquivo **`sonar.json`** na branch `auditoria/resultados`, ao lado do `ultimo.md`. O painel lê esse arquivo.
- O arquivo também é guardado com data, em **`semanais/AAAA-MM-DD-sonar.json`**, para formar um histórico.
- Se o Sonar não responder, o arquivo traz o motivo no campo `"erro"` e o resto da rotina continua normalmente.
- Também corrigi o `ultimo.md`: ele mostrava "Frontend (Vitest) 11", mas o certo é **405**. O script lia só o primeiro arquivo de teste do relatório do Vitest.

## 2. O que mudou

| Arquivo | Mudança |
|---|---|
| `.github/workflows/auditoria-semanal.yml` | **passo novo** "Números do SonarCloud (sonar.json)": só leitura na API do Sonar, sem nunca imprimir o token e sem reprovar a rotina em caso de falha. **No passo de publicar:** copia `sonar.json` e a cópia datada. **Entrada nova para teste manual:** `simular_falha_sonar` (`nenhuma` / `token_invalido` / `fora_do_ar`) |
| `auditoria/scripts/consolidar.py` | soma **todas** as suítes do relatório de testes. Autorizado pelo Luciano em 14/11, porque o pedido inicial era mexer só no `.yml` |
| `auditoria/README.md` | explica o `sonar.json` e como testar a falha |

**Consultas ao Sonar** (todas só de leitura, projeto `Lucianomatosneto_Radiximago`, ramo `main`, que é como a `redesign-ui` chega ao Sonar):
- `/api/measures/component`: as 12 métricas pedidas;
- `/api/qualitygates/project_status`: a porta de qualidade, com o status, o valor real e o limite de cada condição;
- `/api/measures/component_tree`: arquivo por arquivo, de 500 em 500 páginas, somando por pasta;
- `/api/project_analyses/search`: o commit analisado (`commit`) e a data da análise (`analise_em`). Este campo é um extra, para o painel saber de quando são os números.

## 3. Aceite **[medido]**

| Item | Resultado |
|---|---|
| Execução normal (run 43586800855) | sucesso; `sonar.json` publicado na branch `auditoria/resultados` |
| Números iguais aos do Sonar | cobertura 65,9; 19.773 linhas a cobrir; 5.748 sem teste; 45.141 linhas de código; 0 bugs; 0 vulnerabilidades; 5 *code smells*; duplicação 3,3%; 0 *hotspots*; notas A/A/A; porta de qualidade ERROR por `new_coverage` 70,3 < 80. São os mesmos valores do exemplo da tarefa, tirados do Sonar |
| Conferência interna | as 5 pastas somam **19.773** linhas e **5.748** sem teste, exatamente o total do projeto |
| Cobertura por pasta | `backend/app` 89,3%; `frontend/src/app` 50,5%; `frontend/src/components` 58,5%; `frontend/src/lib` 84,7%; `frontend/src/i18n` 0% (14 linhas) |
| Token não aparece no log | o log mostra `SONAR_TOKEN: ***` e "Token do Sonar: presente (valor não exibido)". Teste local com um token falso: o valor não apareceu em nenhuma saída |
| Falha: Sonar fora do ar (run 43586164948) | rotina **sucesso**; `sonar.json` = `{"erro": "URLError: ... Name or service not known"}` |
| Falha: token inválido (run 43586496152) | rotina **sucesso**; `sonar.json` = `{"erro": "HTTPError: HTTP Error 401: "}` |
| `ultimo.md` corrigido | Backend 657, Auditoria da API 13, **Frontend (Vitest) 405** (antes: 11), lidos dos relatórios de teste |
| Teste local do código novo | servidor falso imitando o Sonar com 606 arquivos (2 páginas): somas e notas corretas |
| CI do PR | ver o PR |

A última execução foi a normal; por isso o `sonar.json` atual na branch traz os números reais.

## 4. Observações e sugestões (não alteradas)

1. **Ordem dos horários (sugestão):**
   - a rotina semanal roda segunda às 09:00 UTC; a análise do Sonar (`sonarcloud.yml`), às 10:00 UTC;
   - então, na segunda, o `sonar.json` traz a análise anterior. O campo `analise_em` mostra a data;
   - se quiser números do mesmo dia, basta passar o Sonar para antes, por exemplo 07:00 UTC. É uma linha no `sonarcloud.yml`, que ficou fora desta tarefa.
2. **Permissão do token:** a rotina só faz consultas de leitura. Mas o `SONAR_TOKEN` tem as permissões com que foi criado no SonarCloud, e o workflow não consegue reduzi-las. Se quiser o mínimo de verdade, dá para criar um token separado, só para leitura, e guardá-lo como outro segredo.
3. **Execuções de teste:** as 3 execuções manuais publicaram na `auditoria/resultados`. Ficaram 3 commits de resumo do dia 14/11, e o último é o válido.
