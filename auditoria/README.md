# Central de Auditoria do Radix Imago

Pasta da auditoria técnica contínua. É **independente** da aplicação: nada aqui é carregado pelo sistema.
Inventário e validação de cada ferramenta: [`INVENTARIO.md`](INVENTARIO.md).

## O que há aqui

| Caminho | Para que serve |
|---|---|
| `../.github/workflows/` | 9 workflows separados (tabela abaixo) |
| `../.github/actions/subir-radix-isolado/` | Peça reutilizável: sobe API + site isolados, com banco descartável |
| `../.github/dependabot.yml` | Aviso semanal de bibliotecas desatualizadas ou com falha |
| `config/` | Regras do Ruff, Mypy e SonarCloud |
| `ferramentas/` | ESLint, Vitest, Playwright, Lighthouse, k6 (instaladas à parte; **não alteram** o frontend) |
| `testes_api/` | Testes de auditoria da API (toda rota exige login? cabeçalhos? CORS?) |
| `scripts/consolidar.py` | Junta os relatórios num resumo único |
| `relatorios/` | Um relatório por auditoria |
| `historico.md` | Linha do tempo: problemas novos, recorrentes, resolvidos e agravados |
| `docs/AVALIACAO_SENTRY_E_MCP.md` | Decisões sobre Sentry e MCP |

## Workflows

| Arquivo | O que faz | Quando roda | Bloqueia? |
|---|---|---|---|
| `testes-backend.yml` | Suíte do projeto (pytest) + auditoria da API | PR, manual | **Sim** |
| `testes-frontend.yml` | Testes do projeto, Vitest, build de produção | PR, manual | **Sim** |
| `testes-e2e.yml` | Playwright (navegador real, telas públicas) | PR, manual | **Sim** |
| `qualidade.yml` | Ruff, Mypy, ESLint, TypeScript | PR, manual | Só o TypeScript |
| `seguranca.yml` | Gitleaks, pip-audit, npm audit, Semgrep | PR, manual | Não (por enquanto) |
| `desempenho.yml` | k6 (carga gradual) e Lighthouse | manual | Não |
| `zap-passivo.yml` | OWASP ZAP, só observação | **só manual** | Não |
| `sonarcloud.yml` | SonarCloud (opcional) | manual, semanal | Não |
| `auditoria-semanal.yml` | Roda tudo, consolida e publica o resumo | segunda 06h, manual | — |

Os workflows usam banco descartável e senhas inventadas na hora. **Nunca** dados clínicos reais nem credenciais reais.
Testes de carga e ZAP rodam só contra um Radix criado dentro do GitHub, nunca contra produção.

## Onde ficam os resultados

- Aba **Actions** do GitHub: resumo de cada execução e *Artifacts* (90 dias).
- Branch **`auditoria/resultados`**: um `.md` por semana (`semanais/AAAA-MM-DD.md`) e `ultimo.md`. **Só relatórios, nunca código.** É dali que o Claude lê os resultados das automações.
  - `sonar.json` (e a cópia `semanais/AAAA-MM-DD-sonar.json`): os números do SonarCloud lidos pela rotina semanal, para quem não consegue acessar o SonarCloud (o painel de acompanhamento). Traz cobertura, linhas sem teste, bugs, vulnerabilidades, *code smells*, duplicação, *hotspots*, notas (A–E), a porta de qualidade com cada condição e a cobertura por pasta (`backend/app`, `frontend/src/app`, `components`, `lib`, `i18n`). O campo `commit` é o commit que o Sonar analisou e `analise_em` é quando. Se o Sonar não responder, o arquivo traz só `data`, `commit` e `erro`, e a rotina segue normalmente.
  - Para testar o caso de falha: Actions → *Auditoria semanal* → *Run workflow* → `simular_falha_sonar` = `token_invalido` ou `fora_do_ar`.

## Como pedir uma auditoria pelo chat

Neste chat, escreva o pedido com o escopo. Exemplos:

- "Faça a auditoria completa do commit mais recente."
- "Audite só a autenticação e as permissões."
- "Reteste os itens A-01 e M-02 do último relatório."
- "Compare a semana atual com a anterior."

O Claude então: identifica o escopo → confere o estado do repositório → vê o que mudou desde a última auditoria → roda os testes autorizados em ambiente isolado → classifica (CRÍTICO / ALTO / MÉDIO / BAIXO, separando **confirmado**, **suspeita** e **não verificável**) → apresenta evidências e recomendações → **aguarda sua autorização antes de qualquer alteração**.

Para o Claude enxergar o trabalho mais recente, faça `git push` antes. O GitHub é a fonte da verdade.
Para auditar o Docker/Orthanc/OHIF em execução, deixe o Docker Desktop ligado e a pasta do projeto conectada ao app.

## Regras

1. A auditoria não altera código da aplicação, banco de dados nem regras de negócio.
2. Correções vão em branches isoladas, com revisão humana. Nada é publicado automaticamente.
3. Uma falha só é considerada resolvida depois de um novo teste (reteste) que a confirme.
4. Nenhum teste invasivo ou de carga contra produção sem autorização expressa.

## Ativar o SonarCloud (opcional, gratuito para repositório público)

1. Acesse https://sonarcloud.io e entre com a sua conta do GitHub.
2. Importe o repositório `Radiximago` e anote o **nome da organização** e a **chave do projeto**.
3. No SonarCloud, gere um token (*My Account → Security*).
4. No GitHub: *Settings → Secrets and variables → Actions → New repository secret* com o nome `SONAR_TOKEN`.
5. Edite `auditoria/config/sonar-project.properties` trocando os dois `COLOQUE_AQUI`.
6. Rode o workflow `SonarCloud` na aba Actions.

## Rodar localmente (com Docker ligado)

```
docker compose exec radix-api python scripts/rodar_testes.py
```
