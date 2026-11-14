# DECISÃO — Motores gráficos fora da conta da cobertura de testes (14/11/2026)

**Quem decidiu:** Luciano de Matos Neto, em 14/11/2026 às 08h47.
**Onde foi aplicado:** PR #75, branch `qualidade/cobertura-telas-fase-3b`.

## O que foi decidido

Dois arquivos **continuam no sistema e funcionando**. Eles só deixam de entrar na **conta** da cobertura de testes, que é a porcentagem do código exercitada por testes automáticos.

| Arquivo | O que faz | Linhas medidas |
|---|---|---|
| `frontend/src/components/login/motorCenaLogin.ts` | Desenha a cena animada da tela de login: um globo em pontos (WebGL, com a biblioteca Three.js) e o ponto de luz (canvas 2D). | 210 |
| `frontend/src/components/fundo/motorMapaMundi.ts` | Desenha o mapa-mundi animado do fundo das telas (canvas 2D). | 275 |

## Por quê

1. **São puramente decorativos.** Só desenham na tela, em canvas 2D e WebGL.
2. **Não têm regra de negócio.**
   - Não leem nem gravam dados de pessoas.
   - Não tocam em dados de pacientes.
   - Não decidem permissões.
   - Não conversam com o servidor.
3. **Não dá para testá-los de forma útil com teste automático.**
   - O navegador de mentira usado nos testes (jsdom) não desenha nada.
   - Seria preciso simular o canvas inteiro, e um teste assim só provaria que o código chamou as funções de desenho. Não provaria que o desenho saiu certo.
4. **São conferidos visualmente.** A pessoa olha a tela de login e o fundo e vê se a animação aparece.
5. **As telas que usam os motores continuam testadas.** Os testes da tela de login trocam a cena animada (`CenaLogin`, que usa o motor) por uma versão simulada e conferem o resto da tela.

## Limites da exclusão (para ninguém esconder código real por engano)

- **A lista é nomeada, arquivo por arquivo, sem curinga.** Não existe `motor*` nem `**/fundo/**`. Um arquivo novo nunca sai da conta por acaso.
- **Nenhum outro arquivo foi excluído.**
- **No Sonar, a exclusão vale SÓ para a cobertura.** O nome do ajuste é `sonar.coverage.exclusions`. Os dois arquivos continuam sendo analisados para bugs, vulnerabilidades e code smells, que são os sinais de código mal escrito.
- **Acrescentar qualquer arquivo a essa lista exige uma nova decisão registrada em `auditoria/`.**

## Onde está configurado

| Ferramenta | Arquivo | Ajuste |
|---|---|---|
| Vitest | `auditoria/ferramentas/frontend-testes/vitest.config.ts` | `coverage.exclude`, com a justificativa em comentário |
| SonarCloud (o que roda de fato) | `.github/workflows/sonarcloud.yml` | `-Dsonar.coverage.exclusions=...` |
| SonarCloud (cópia de referência) | `auditoria/config/sonar-project.properties` | `sonar.coverage.exclusions=...` |

**Observação:** hoje o painel do SonarCloud pode estar na "análise automática", que não usa o workflow. Nesse modo, a cobertura do frontend não é enviada, e a exclusão só passa a valer quando a análise for feita pelo workflow. Se o painel continuar mostrando a cobertura desses arquivos, o mesmo ajuste também pode ser feito no próprio painel: Administration → Analysis Scope → Coverage Exclusions.

## Efeito nos números (Vitest, 14/11/2026, 686 testes)

| Medida | Com os motores | Sem os motores |
|---|---|---|
| Linhas | 73,12% (7848/10733) | **76,58% (7848/10248)** |
| Instruções | 70,52% | **74,72%** |
| Ramos | 68,14% | **69,67%** |
| Funções | 70,39% | **72,29%** |

O número de linhas testadas não mudou (7848). Só saíram da conta as 485 linhas que nenhum teste automático consegue exercitar de forma útil.
A catraca (o mínimo que o CI exige) foi para 76,5 / 74,7 / 69,6 / 72,2, arredondada para baixo.

## Para a dissertação

Excluir da métrica um código que não pode ser verificado por teste automático, e que não carrega risco funcional nem de dados, é uma prática comum de engenharia de software.
A condição é que a exclusão seja:

- **explícita:** lista nomeada;
- **justificada:** o motivo está registrado;
- **rastreável:** este documento, o comentário no código e o histórico do PR;
- **verificável de outra forma:** conferência visual.

Isso evita que a porcentagem de cobertura fique artificialmente baixa por causa de código decorativo. Também evita o erro oposto: inflar a porcentagem com testes que só simulam o canvas e não provam nada.
Os dois números, com e sem os motores, ficam registrados acima, para transparência.
