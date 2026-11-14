# Resultado — PR 3a: correções pequenas no sistema (14/11/2026)

**Pedido:** Fase 3 da cobertura de telas, parte "3a" (decisões do Luciano de 14/11/2026).
**Branch / PR:** `qualidade/correcoes-fase-3a` → `redesign-ui`, a partir de `22d1a8c` (já com #70, #71 e #72).
**Código do sistema alterado:** sim, só o necessário (lista no item 7).

Legenda: **[medido]** = número tirado de uma execução real; **[hipótese]** = avaliação minha, não medida.

---

## 1. Resumo em linguagem simples

- **Tradução que faltava:** o botão das anotações agora mostra "Salvando..." (pt) / "Saving..." (en). Antes ele mostrava o nome técnico da chave.
- **Código sem uso apagado:** `PainelAchadosEstruturados` e `SeletorDentesQuadrante`, com as 37 chaves de tradução que só eles usavam.
- **Acessibilidade** (leitor de tela e clique no rótulo), sem mudar o visual:
  - 5 campos do editor de macros;
  - 5 filtros da auditoria;
  - o grupo "Tipo de acesso" da solicitação de acesso;
  - a janela do motivo (Descartar / Segunda opinião), que agora é anunciada como janela.
- **Erros sem tratamento:**
  - "Testar conexão" (aparelhos) agora avisa quando o servidor está fora do ar;
  - "Não aceito" (termos) não deixa mais um erro solto quando a conexão cai.
- **Testes primeiro:** cada correção tem um teste que **falhou no código antigo** e **passa no corrigido** (saídas no item 3).
- **Decisão do Luciano (14/11/2026, 00h31):** `PainelErroTecnico` e `PainelAchadosRadiografia`, que também não eram usados por nenhuma tela, foram **apagados** neste mesmo PR, com as 25 chaves de tradução só deles (item 5).

---

## 2. Busca antes de apagar (pedido do item 2) **[medido]**

Comando: busca por `PainelAchadosEstruturados` e `SeletorDentesQuadrante` em todo o repositório (código, testes, traduções, documentação, e2e), fora `node_modules`, `.next` e `.git`.

| Onde apareceu | O que é | É uso? |
|---|---|---|
| `frontend/src/components/curadoria/PainelAchadosEstruturados.tsx` | o próprio arquivo (ele importa o `SeletorDentesQuadrante`) | — (apagado) |
| `frontend/src/components/curadoria/SeletorDentesQuadrante.tsx` | o próprio arquivo | — (apagado) |
| `frontend/src/app/pesquisa/page.tsx`, linhas 331, 333 e 497 | **só comentários** antigos que citam o nome; a tela importa `SeletorDentesGrupos`, outro componente | não |
| `auditoria/RESULTADO_defeitos_telas_2026-11-13.md` e `auditoria/RESULTADO_cobertura_telas_fase_2_2026-11-13.md` | relatórios anteriores que listam o arquivo | não |
| `frontend/coverage/...` e `frontend/tsconfig.tsbuildinfo` | arquivos gerados na máquina (não estão no Git) | não |

Nenhuma importação de verdade. Nenhum teste, e2e ou documento do sistema usa os dois. Os 3 comentários em `pesquisa/page.tsx` ficaram desatualizados; não mexi neles (fora do escopo, item 6).

**Chaves de tradução removidas** (iguais em `pt.json` e `en.json`):

| Grupo | Chaves removidas | Ficou |
|---|---|---|
| `Curadoria.seletorDentes` | o grupo inteiro: `denteNaoIdentificado`, `naoIdentificadoExplicacao`, `escolherQuadrante`, `quadranteAbreviado`, `dentesDoQuadrante`, `removerDente` (6) | — |
| `Curadoria.achadosEstruturados` | `titulo`, `adicionar`, `nenhumAchado`, `carregando`, `erroCarregar`, `tipo`, `selecioneTipo`, `outro`, `regiaoAnatomica`, `selecioneRegiao`, `dentesRelacionados`, `semDentesNaFicha`, `descricao`, `descricaoPlaceholder`, `marcacoesRelacionadas`, `semMarcacoes`, `marcacaoRotulo`, `salvar`, `salvando`, `cancelar`, `editar`, `excluir`, `excluindo`, `confirmarExclusao`, `erroDescricaoObrigatoriaOutros`, `erroSalvar`, `erroExcluir`, `fichaFinalizadaSomenteLeitura`, `semRegiao`, `semDentes`, `naoIdentificadoResumo` (31) | `regioes`, usada pela Pesquisa, pela ficha da Curadoria e pelos dados sobrepostos |

Conferência depois de remover **[medido]**: uma varredura de todas as chaves fixas `t('...')` do frontend encontrou **0 chaves faltando** em pt e em en. A varredura não confere chaves montadas na hora, como `` t(`regioes.${v}`) ``. `tsc` e `next build` ok.

## 3. Testes primeiro: saída ANTES e DEPOIS **[medido]**

### 3.1 Tradução "Salvando..."

Antes (código antigo):
```
× enquanto salva, o botao mostra "Salvando..." (PR 3a: antes mostrava o nome da chave)
× toda chave existe em portugues     → expected [ 'salvando' ] to deeply equal []
× toda chave existe em ingles
× "Salvando" segue o padrao das outras telas (reticencias) → expected undefined to be 'Salvando...'
Tests  4 failed | 15 passed (19)
```
Depois:
```
Tests  19 passed (19)
```
O teste novo `traducoes-anotacoes.test.tsx` lê o `AnotacoesImagem.tsx` e junta **todas** as chaves que ele pede ao tradutor, incluindo as 6 cores. Depois confere cada uma em pt e em en. Uma chave nova esquecida num idioma também será percebida.

### 3.2 Acessibilidade e erros sem tratamento

Antes (código antigo):
```
× curadoria  "Descartar" abre uma janela (dialog) com o nome do titulo...     → Unable to find role "dialog" name "Descartar ficha"
× curadoria  "Solicitar segunda opinião" abre uma janela (dialog)...          → Unable to find role "dialog"
× aparelhos  avisa "Sem conexão" e o botao volta a ficar disponivel           → Unable to find role="alert"
× aceite-termos  ...nao deixa erro sem tratamento...                          → expected [ TypeError: Failed to fetch ] to deeply equal []
× solicitar-acesso  os 4 perfis ficam num grupo chamado "Tipo de acesso"      → Unable to find role "group"
× macros  cada campo e encontrado pelo seu rotulo...                          → Found a label ... however no form control was found
× auditoria  os 5 filtros sao achados pelo rotulo...                          → Found a label "Ação", however no form control was found
Tests  7 failed | 1 passed
```
Depois:
```
Tests  8 passed
```
O teste que já passava antes ("com o servidor no ar, o resultado do teste continua aparecendo") protege o caminho normal de "Testar conexão".

## 4. Verificações **[medido]**

| Verificação | Resultado |
|---|---|
| Vitest | **405 testes**, todos passam (eram 391) |
| Cobertura do frontend (linhas) | 56,17% → **59,43%**. Sobe pelos testes novos e porque os 4 componentes sem uso saíram da conta |
| Instruções / ramos / funções | 57,72% / 55,50% / 56,74% |
| Catraca nova | 59,4 / 57,7 / 55,5 / 56,7 |
| pytest | 657 passed |
| tsc / next build | ok / ok |
| tsx (16 arquivos) | 0 falhas |
| ESLint | 2 avisos (igual a antes) |
| Ruff / Mypy | sem mudança no backend |
| e2e (16) e CI | ver o PR no GitHub |
| Dependências novas | nenhuma |

## 5. `PainelErroTecnico` e `PainelAchadosRadiografia`: apagados por decisão do Luciano

Na primeira versão deste PR os dois foram só apontados: nenhuma tela os importava e a instrução era não apagar sem decisão. O Luciano decidiu **apagar os dois** (14/11/2026, 00h31). Por isso os 4 rótulos sem ligação que eles tinham deixam de existir.

**Busca antes de apagar [medido]** (mesmo comando do item 2):

| Onde apareceu | O que é | É uso? |
|---|---|---|
| os próprios arquivos | — | — (apagados) |
| `components/curadoria/FichaCuradoriaForm.tsx`, linhas 73, 98 e 125 | comentários que citam o `PainelAchadosRadiografia` | não |
| `app/pesquisa/page.tsx` (linha 249), `lib/achados.ts` (linha 19), `lib/alteracoesObservadas.ts` (linha 7) | comentários | não |
| relatórios em `auditoria/` | listam os arquivos | não |

**Chaves de tradução removidas** (iguais em pt e en; ninguém mais usa esses grupos):

| Grupo | Chaves |
|---|---|
| `Curadoria.erroTecnico` (grupo inteiro) | `titulo`, `pergunta`, `nao`, `sim`, `adicionar`, `tipo`, `selecioneTipo`, `descricao`, `descricaoPlaceholder`, `salvar`, `salvando`, `cancelar`, `excluir`, `excluindo`, `confirmarExclusao`, `nenhumErro`, `carregando`, `erroCarregar`, `erroSalvar`, `erroExcluir`, `fichaFinalizadaSomenteLeitura`, e `tipos` (8 tipos antigos de erro: `movimento`, `corte_apice`, `corte_coroa`, `angulacao_inadequada`, `exposicao_inadequada`, `posicionamento_inadequado`, `artefato`, `processamento_inadequado`) |
| `Curadoria.achados` (grupo inteiro) | `alteracoesObservadas`, `outrosAchados`, `placeholderOutros` |

Conferência depois de apagar **[medido]**:
- varredura das chaves fixas: 0 faltando em pt e en;
- tsc e next build: ok;
- Vitest: 405 testes, todos passam;
- pytest: 657.

Cobertura do frontend: **59,43%** das linhas. Catraca: 59,4 / 57,7 / 55,5 / 56,7.

## 6. Achados fora do escopo (NÃO corrigidos, só listados)

| Onde | O que | Prioridade |
|---|---|---|
| `components/TermoCiencia.tsx`, função `recusar` | **mesmo problema** do "Não aceito" dos termos: sem `catch`, deixa erro solto sem conexão | baixa |
| `app/solicitar-acesso/page.tsx` | os botões de perfil não dizem qual está escolhido para o leitor de tela (faltaria `aria-pressed`); só a cor muda | baixa |
| `app/pesquisa/page.tsx`, linhas 331, 333 e 497; `FichaCuradoriaForm.tsx` e `lib/` | comentários que citam componentes apagados | cosmético |
| `lib/achados.ts`: `TIPOS_ERRO_TECNICO` e o tipo `ErroTecnico` | ficaram sem uso depois de apagar o `PainelErroTecnico` (código do `lib`, fora do pedido) | baixa: candidato à próxima limpeza |
| `app/pesquisa/page.tsx`, linha 811 | rótulo "Erro técnico" do filtro sem `htmlFor` (mesmo problema dos rótulos, em outra tela) | média |

## 7. Arquivos do PR

| Arquivo | Mudança |
|---|---|
| `frontend/messages/pt.json`, `en.json` | + `Visualizador.anotacoes.salvando`; − 37 chaves (painel de achados estruturados e seletor) e − 2 grupos (`Curadoria.erroTecnico`, `Curadoria.achados`) sem uso |
| `frontend/src/components/curadoria/PainelAchadosEstruturados.tsx` | apagado |
| `frontend/src/components/curadoria/SeletorDentesQuadrante.tsx` | apagado |
| `frontend/src/components/curadoria/PainelErroTecnico.tsx` | apagado (decisão de 14/11, 00h31) |
| `frontend/src/components/curadoria/PainelAchadosRadiografia.tsx` | apagado (decisão de 14/11, 00h31) |
| `frontend/src/components/curadoria/ModalMotivo.tsx` | `role="dialog"`, `aria-modal`, `aria-labelledby` |
| `frontend/src/app/macros/page.tsx` | 5 rótulos ligados (`useId` + `htmlFor`/`id`) |
| `frontend/src/app/auditoria/page.tsx` | 5 rótulos ligados |
| `frontend/src/app/solicitar-acesso/page.tsx` | grupo com nome (`role="group"` + `aria-labelledby`) |
| `frontend/src/app/aparelhos/page.tsx` | `catch` com "Sem conexão com o servidor" no "Testar conexão" |
| `frontend/src/components/termos/AceiteTermosUso.tsx` | `catch` no "Não aceito" |
| `auditoria/ferramentas/frontend-testes/telas/` | 6 arquivos de teste novos + 2 testes acrescentados (anotações e curadoria) |
| `auditoria/ferramentas/frontend-testes/vitest.config.ts` | catraca |

Visual mantido: as mesmas classes de estilo. O título "Tipo de acesso" passou de `<label>` para `<p>` com as mesmas classes, porque um rótulo precisa de um campo e ali só há botões.

O PR 3b (testes das telas restantes) só começa depois deste ser aprovado e juntado.
